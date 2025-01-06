# Azure RBAC Configuration for CrimeMiner DR Environment
# Provider version: hashicorp/azurerm ~> 3.75.0
# Provider version: hashicorp/azuread ~> 2.45.0

# Local variables for role configuration
locals {
  role_prefix = "${var.project_name}-${var.environment}"
  compliance_tags = {
    fedramp_level       = "high"
    cjis_compliance     = "true"
    data_classification = "sensitive"
  }
}

# Custom role definition for AKS operators with enhanced monitoring
resource "azurerm_role_definition" "aks_operator" {
  name        = "${local.role_prefix}-aks-operator"
  scope       = data.azurerm_resource_group.main.id
  description = "Custom role for AKS operators with FedRAMP High compliance controls"

  permissions {
    actions = [
      "Microsoft.ContainerService/managedClusters/read",
      "Microsoft.ContainerService/managedClusters/metrics/read",
      "Microsoft.ContainerService/managedClusters/listClusterUserCredential/action",
      "Microsoft.ContainerService/managedClusters/upgradeProfiles/read",
      "Microsoft.ContainerService/managedClusters/diagnostic/read"
    ]
    not_actions = [
      "Microsoft.ContainerService/managedClusters/delete",
      "Microsoft.ContainerService/managedClusters/write"
    ]
    data_actions = []
  }

  assignable_scopes = [
    data.azurerm_resource_group.main.id
  ]
}

# Custom role for Key Vault operators with audit requirements
resource "azurerm_role_definition" "key_vault_operator" {
  name        = "${local.role_prefix}-keyvault-operator"
  scope       = data.azurerm_resource_group.main.id
  description = "Custom role for Key Vault operations with CJIS compliance controls"

  permissions {
    actions = [
      "Microsoft.KeyVault/vaults/read",
      "Microsoft.KeyVault/vaults/secrets/read",
      "Microsoft.KeyVault/vaults/secrets/getSecret/action",
      "Microsoft.KeyVault/vaults/metrics/read",
      "Microsoft.KeyVault/vaults/eventGridFilters/read"
    ]
    not_actions = [
      "Microsoft.KeyVault/vaults/delete",
      "Microsoft.KeyVault/vaults/write",
      "Microsoft.KeyVault/vaults/secrets/write"
    ]
    data_actions = [
      "Microsoft.KeyVault/vaults/secrets/readMetadata/action"
    ]
  }

  assignable_scopes = [
    data.azurerm_resource_group.main.id
  ]
}

# Custom role for monitoring service with enhanced permissions
resource "azurerm_role_definition" "monitoring_operator" {
  name        = "${local.role_prefix}-monitoring-operator"
  scope       = data.azurerm_resource_group.main.id
  description = "Custom role for security monitoring with compliance requirements"

  permissions {
    actions = [
      "Microsoft.Insights/metrics/read",
      "Microsoft.Insights/diagnosticSettings/read",
      "Microsoft.Insights/logProfiles/read",
      "Microsoft.Insights/alertRules/read",
      "Microsoft.Insights/activityLogAlerts/read",
      "Microsoft.OperationalInsights/workspaces/read",
      "Microsoft.OperationalInsights/workspaces/query/read"
    ]
    not_actions = []
    data_actions = [
      "Microsoft.OperationalInsights/workspaces/analytics/query/action"
    ]
  }

  assignable_scopes = [
    data.azurerm_resource_group.main.id
  ]
}

# Role assignment for AKS managed identity
resource "azurerm_role_assignment" "aks_identity" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_kubernetes_cluster.main.identity[0].principal_id

  condition = <<CONDITION
@Resource[Microsoft.ContainerService/managedClusters:name] StringEquals '${local.role_prefix}-aks'
CONDITION
  condition_version = "2.0"
}

# Role assignment for AKS kubelet identity with monitoring
resource "azurerm_role_assignment" "aks_kubelet_monitoring" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_id   = azurerm_role_definition.monitoring_operator.role_definition_resource_id
  principal_id         = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}

# Role assignment for Key Vault access
resource "azurerm_role_assignment" "key_vault_access" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_id   = azurerm_role_definition.key_vault_operator.role_definition_resource_id
  principal_id         = azurerm_kubernetes_cluster.main.identity[0].principal_id
}

# Cross-region backup operator role assignment
resource "azurerm_role_assignment" "backup_operator" {
  scope                = data.azurerm_resource_group.main.id
  role_definition_name = "Backup Operator"
  principal_id         = azurerm_kubernetes_cluster.main.identity[0].principal_id
}

# Export custom role IDs and permissions
output "custom_role_ids" {
  description = "Map of custom role IDs for reference"
  value = {
    aks_operator        = azurerm_role_definition.aks_operator.id
    key_vault_operator  = azurerm_role_definition.key_vault_operator.id
    monitoring_operator = azurerm_role_definition.monitoring_operator.id
  }
}

# Export role assignments and audit configurations
output "role_assignments" {
  description = "Map of role assignments and audit configurations"
  value = {
    assignments = {
      aks_identity         = azurerm_role_assignment.aks_identity.id
      aks_monitoring      = azurerm_role_assignment.aks_kubelet_monitoring.id
      key_vault_access    = azurerm_role_assignment.key_vault_access.id
      backup_operator     = azurerm_role_assignment.backup_operator.id
    }
    audit_configs = {
      compliance_level = "FedRAMP-High"
      audit_retention = var.compliance_config.audit_retention_days
      monitoring_enabled = true
    }
  }
  sensitive = true
}