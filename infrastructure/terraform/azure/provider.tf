# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    # Azure Resource Manager provider v3.75.0
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.75.0"
    }
    
    # Azure Active Directory provider v2.45.0
    azuread = {
      source  = "hashicorp/azuread" 
      version = "~> 2.45.0"
    }
  }
}

# Configure Azure Resource Manager provider with FedRAMP High compliance settings
provider "azurerm" {
  features {
    # Key Vault compliance features
    key_vault {
      purge_soft_delete_on_destroy               = false # Maintain compliance audit trail
      recover_soft_deleted_key_vaults            = true  # Enable recovery of deleted vaults
      purge_soft_deleted_secrets_on_destroy      = false # Maintain secrets audit trail
    }

    # Log Analytics compliance features
    log_analytics_workspace {
      permanently_delete_on_destroy = false # Maintain audit logs
    }

    # Resource protection features
    resource_group {
      prevent_deletion_if_contains_resources = true # Prevent accidental deletions
    }

    # VM protection features
    virtual_machine {
      delete_os_disk_on_deletion = false # Maintain disk for compliance
      graceful_shutdown         = true  # Ensure proper shutdown sequence
    }

    # Cognitive services compliance
    cognitive_account {
      purge_soft_delete_on_destroy = false # Maintain data trail
    }
  }

  # Use variables from variables.tf
  location    = var.location
  environment = var.environment
}

# Configure Azure Active Directory provider with CJIS compliance settings
provider "azuread" {
  tenant_id    = var.tenant_id
  environment  = var.environment
}

# Data source for current Azure configuration
data "azurerm_client_config" "current" {}