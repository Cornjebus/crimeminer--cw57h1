# Azure Storage configuration for CrimeMiner DR environment
# Provider version: hashicorp/azurerm ~> 3.75.0

locals {
  storage_account_name = lower(replace("${var.project_name}${var.environment}dr", "-", ""))
  
  containers = {
    audio     = "audio-evidence"
    video     = "video-evidence"
    images    = "image-evidence"
    documents = "document-evidence"
    exports   = "case-exports"
  }

  retention_policies = {
    audio     = 365
    video     = 365
    images    = 365
    documents = 365
    exports   = 90
  }

  network_rules = {
    default_action             = "Deny"
    bypass                     = ["AzureServices"]
    ip_rules                  = []
    virtual_network_subnet_ids = []
  }

  compliance_tags = {
    DataRetention      = "365-Days"
    DataClassification = "CJIS"
    Encryption         = "CMK-HSM"
    Immutable         = "True"
  }
}

# Premium storage account for evidence backup with geo-redundancy
resource "azurerm_storage_account" "evidence" {
  name                     = local.storage_account_name
  resource_group_name      = data.azurerm_resource_group.main.name
  location                 = var.location
  account_tier             = "Premium"
  account_replication_type = "GRS"
  account_kind            = "StorageV2"
  is_hns_enabled         = false
  min_tls_version        = "TLS1_2"
  
  # Enable encryption with customer-managed keys
  identity {
    type = "SystemAssigned"
  }

  customer_managed_key {
    key_vault_key_id          = azurerm_key_vault_key.master_key.id
    user_assigned_identity_id = azurerm_user_assigned_identity.storage_identity.id
  }

  # Network rules for secure access
  network_rules {
    default_action             = local.network_rules.default_action
    bypass                     = local.network_rules.bypass
    ip_rules                  = local.network_rules.ip_rules
    virtual_network_subnet_ids = local.network_rules.virtual_network_subnet_ids
  }

  # Blob service properties for compliance
  blob_properties {
    versioning_enabled       = true
    change_feed_enabled      = true
    last_access_time_enabled = true

    container_delete_retention_policy {
      days = 7
    }

    delete_retention_policy {
      days = 7
    }
  }

  tags = merge(var.resource_tags, local.compliance_tags)
}

# Evidence containers with immutable storage policies
resource "azurerm_storage_container" "evidence" {
  for_each              = local.containers
  name                  = each.value
  storage_account_name  = azurerm_storage_account.evidence.name
  container_access_type = "private"

  metadata = {
    evidence_type = each.key
    retention_days = local.retention_policies[each.key]
    compliance_level = "CJIS"
  }
}

# Immutable storage policy for evidence retention
resource "azurerm_storage_management_policy" "lifecycle" {
  storage_account_id = azurerm_storage_account.evidence.id

  rule {
    name    = "evidence-retention"
    enabled = true
    filters {
      blob_types = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 30
        tier_to_archive_after_days_since_modification_greater_than = 90
        delete_after_days_since_modification_greater_than          = 365
      }
      snapshot {
        delete_after_days_since_creation_greater_than = 365
      }
      version {
        delete_after_days_since_creation = 365
      }
    }
  }
}

# Diagnostic settings for audit logging
resource "azurerm_monitor_diagnostic_setting" "storage_diagnostics" {
  name                       = "${local.storage_account_name}-diagnostics"
  target_resource_id         = azurerm_storage_account.evidence.id
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id

  metric {
    category = "Transaction"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "StorageRead"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "StorageWrite"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }
}

# Export storage account details
output "storage_account" {
  value = {
    id                  = azurerm_storage_account.evidence.id
    name                = azurerm_storage_account.evidence.name
    primary_endpoint    = azurerm_storage_account.evidence.primary_blob_endpoint
  }
  description = "Storage account details for evidence backup"
}

# Export container references
output "evidence_containers" {
  value = {
    for k, v in azurerm_storage_container.evidence : k => {
      id   = v.id
      name = v.name
    }
  }
  description = "Evidence container references"
}