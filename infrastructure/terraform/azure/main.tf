# Provider configuration with required version constraints
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.75.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.45.0"
    }
  }
}

# Resource group for DR environment with FedRAMP High and CJIS compliance
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}-dr"
  location = var.location
  tags     = merge(var.resource_tags, {
    FedRAMPLevel     = "High"
    CJISCompliance   = "Enabled"
    DisasterRecovery = "Secondary"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Lock the resource group to prevent accidental deletion
resource "azurerm_management_lock" "resource_group" {
  name       = "resource-group-lock"
  scope      = azurerm_resource_group.main.id
  lock_level = "CanNotDelete"
  notes      = "Protected resource group for DR environment"
}

# CJIS-compliant Log Analytics workspace with FedRAMP High controls
resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${var.project_name}-${var.environment}-dr"
  resource_group_name = azurerm_resource_group.main.name
  location           = var.location
  sku                = "PerGB2018"
  retention_in_days  = var.compliance_config.log_retention_days

  # FedRAMP High and CJIS compliance settings
  daily_quota_gb                    = 100
  internet_ingestion_enabled        = false
  internet_query_enabled            = false
  reservation_capacity_in_gb_per_day = 100
  
  tags = merge(var.resource_tags, {
    WorkspaceType    = "CJIS-Compliant"
    DataRetention    = "365-Days"
    EncryptionType   = "CustomerManaged"
  })
}

# Diagnostic settings for resource group auditing
resource "azurerm_monitor_diagnostic_setting" "resource_group" {
  name                       = "diag-rg-${var.project_name}-${var.environment}-dr"
  target_resource_id         = azurerm_resource_group.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  log {
    category = "Administrative"
    enabled  = true
    retention_policy {
      enabled = true
      days    = var.compliance_config.audit_retention_days
    }
  }

  log {
    category = "Security"
    enabled  = true
    retention_policy {
      enabled = true
      days    = var.compliance_config.audit_retention_days
    }
  }

  log {
    category = "Alert"
    enabled  = true
    retention_policy {
      enabled = true
      days    = var.compliance_config.audit_retention_days
    }
  }
}

# Advanced Threat Protection for the resource group
resource "azurerm_advanced_threat_protection" "resource_group" {
  target_resource_id = azurerm_resource_group.main.id
  enabled           = true
}

# Log Analytics solutions for FedRAMP High compliance
resource "azurerm_log_analytics_solution" "security" {
  solution_name         = "Security"
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name
  resource_group_name   = azurerm_resource_group.main.name
  location             = var.location

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/Security"
  }
}

resource "azurerm_log_analytics_solution" "securitycenter" {
  solution_name         = "SecurityCenterFree"
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name
  resource_group_name   = azurerm_resource_group.main.name
  location             = var.location

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/SecurityCenterFree"
  }
}

# Output values for reference by other configurations
output "resource_group_name" {
  value = {
    name     = azurerm_resource_group.main.name
    id       = azurerm_resource_group.main.id
    location = azurerm_resource_group.main.location
  }
  description = "Resource group details for DR environment"
}

output "log_analytics_workspace_id" {
  value = {
    id                  = azurerm_log_analytics_workspace.main.id
    primary_shared_key  = azurerm_log_analytics_workspace.main.primary_shared_key
    secondary_shared_key = azurerm_log_analytics_workspace.main.secondary_shared_key
  }
  description = "Log Analytics workspace details for monitoring configuration"
  sensitive   = true
}