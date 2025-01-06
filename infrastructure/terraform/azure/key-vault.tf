# Azure Key Vault configuration for CrimeMiner DR environment
# Provider version: hashicorp/azurerm ~> 3.75.0

# Random string for unique Key Vault naming
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  key_vault_name = format("%s-kv-%s-%s", var.project_name, var.environment, random_string.suffix.result)
  
  compliance_tags = {
    fedramp_level       = "High"
    cjis_compliance     = "Enabled"
    data_classification = "Confidential"
    disaster_recovery   = "Secondary"
  }

  network_acls = {
    bypass                     = var.key_vault_config.network_acls.bypass
    default_action            = var.key_vault_config.network_acls.default_action
    ip_rules                  = var.key_vault_config.network_acls.ip_rules
    virtual_network_subnet_ids = var.key_vault_config.network_acls.virtual_network_subnet_ids
  }
}

# Key Vault resource with FedRAMP High compliance settings
resource "azurerm_key_vault" "vault" {
  name                            = local.key_vault_name
  location                        = var.location
  resource_group_name             = data.azurerm_resource_group.main.name
  tenant_id                       = var.tenant_id
  sku_name                       = var.key_vault_config.sku_name
  soft_delete_retention_days     = var.key_vault_config.soft_delete_retention_days
  purge_protection_enabled       = var.key_vault_config.purge_protection
  enabled_for_disk_encryption    = true
  enabled_for_deployment         = true
  enabled_for_template_deployment = true
  enable_rbac_authorization      = true

  network_acls {
    bypass                     = local.network_acls.bypass
    default_action            = local.network_acls.default_action
    ip_rules                  = local.network_acls.ip_rules
    virtual_network_subnet_ids = local.network_acls.virtual_network_subnet_ids
  }

  tags = merge(var.resource_tags, local.compliance_tags)
}

# HSM-protected master encryption key
resource "azurerm_key_vault_key" "master_key" {
  name         = "master-key"
  key_vault_id = azurerm_key_vault.vault.id
  key_type     = "RSA-HSM"
  key_size     = 4096
  key_opts     = [
    "decrypt",
    "encrypt",
    "sign",
    "unwrapKey",
    "verify",
    "wrapKey"
  ]

  rotation_policy {
    automatic {
      time_before_expiry = "P30D"
      time_after_create  = "P90D"
    }
    expire_after         = "P365D"
    notify_before_expiry = "P30D"
  }

  depends_on = [azurerm_key_vault.vault]
}

# CJIS-compliant diagnostic settings
resource "azurerm_monitor_diagnostic_setting" "vault_diagnostics" {
  name                       = "${local.key_vault_name}-diagnostics"
  target_resource_id        = azurerm_key_vault.vault.id
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id

  log {
    category = "AuditEvent"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "AzurePolicyEvaluationDetails"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }
}

# Export Key Vault information for other services
output "key_vault_id" {
  value       = azurerm_key_vault.vault.id
  description = "The ID of the Key Vault"
  sensitive   = false
}

output "key_vault_uri" {
  value       = azurerm_key_vault.vault.vault_uri
  description = "The URI of the Key Vault"
  sensitive   = false
}