terraform {
  required_version = ">= 1.5.0"
}

# Project Information
variable "project_name" {
  description = "Name of the CrimeMiner project"
  type        = string
  default     = "crimeminer"

  validation {
    condition     = length(var.project_name) <= 24
    error_message = "Project name must be 24 characters or less"
  }
}

variable "environment" {
  description = "Deployment environment (production, staging, development)"
  type        = string

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development"
  }
}

variable "location" {
  description = "Azure region for disaster recovery deployment (must be FedRAMP High certified)"
  type        = string
  default     = "eastus2"

  validation {
    condition     = contains(["eastus2", "centralus", "westus2"], var.location)
    error_message = "Location must be a FedRAMP High certified region"
  }
}

# Resource Tagging
variable "resource_tags" {
  description = "Mandatory tags for compliance and resource management"
  type        = map(string)
  default = {
    Project             = "CrimeMiner"
    Environment         = "DR"
    SecurityCompliance  = "FedRAMP-High"
    DataClassification = "CJIS"
    CostCenter         = "DR-Operations"
    DisasterRecovery   = "Secondary"
  }
}

# Network Configuration
variable "vnet_config" {
  description = "Virtual network configuration including address space and security settings"
  type = object({
    address_space    = list(string)
    ddos_protection = bool
    dns_servers     = list(string)
  })
  default = {
    address_space    = ["10.1.0.0/16"]
    ddos_protection = true
    dns_servers     = ["168.63.129.16"]
  }

  validation {
    condition     = can(cidrhost(var.vnet_config.address_space[0], 0))
    error_message = "Virtual network address space must be valid CIDR notation"
  }
}

variable "subnet_config" {
  description = "Detailed subnet configuration for network segmentation"
  type = map(object({
    address_prefix    = string
    service_endpoints = list(string)
    delegation        = string
    nsg_rules = map(object({
      priority                   = number
      direction                  = string
      access                    = string
      protocol                  = string
      source_port_range         = string
      destination_port_range    = string
      source_address_prefix     = string
      destination_address_prefix = string
    }))
  }))
  default = {
    dmz = {
      address_prefix    = "10.1.0.0/24"
      service_endpoints = ["Microsoft.Web"]
      delegation        = null
      nsg_rules = {
        allow_https = {
          priority                   = 100
          direction                  = "Inbound"
          access                    = "Allow"
          protocol                  = "Tcp"
          source_port_range         = "*"
          destination_port_range    = "443"
          source_address_prefix     = "Internet"
          destination_address_prefix = "VirtualNetwork"
        }
      }
    }
  }
}

# AKS Configuration
variable "aks_config" {
  description = "AKS cluster configuration for DR environment"
  type = object({
    version      = string
    node_pools = map(object({
      vm_size           = string
      node_count        = number
      max_pods          = number
      availability_zones = list(string)
    }))
    network_plugin = string
    network_policy = string
    monitoring = object({
      log_analytics_workspace_retention = number
      metrics_retention                = number
    })
  })
  default = {
    version = "1.27"
    node_pools = {
      system = {
        vm_size           = "Standard_D4s_v3"
        node_count        = 3
        max_pods          = 30
        availability_zones = ["1", "2", "3"]
      }
      user = {
        vm_size           = "Standard_D8s_v3"
        node_count        = 3
        max_pods          = 50
        availability_zones = ["1", "2", "3"]
      }
    }
    network_plugin = "azure"
    network_policy = "calico"
    monitoring = {
      log_analytics_workspace_retention = 365
      metrics_retention                = 365
    }
  }
}

# Key Vault Configuration
variable "key_vault_config" {
  description = "Key Vault configuration for secrets management"
  type = object({
    sku_name                  = string
    soft_delete_retention_days = number
    purge_protection          = bool
    network_acls = object({
      default_action             = string
      bypass                     = string
      ip_rules                  = list(string)
      virtual_network_subnet_ids = list(string)
    })
  })
  default = {
    sku_name                  = "premium"
    soft_delete_retention_days = 90
    purge_protection          = true
    network_acls = {
      default_action             = "Deny"
      bypass                     = "AzureServices"
      ip_rules                  = []
      virtual_network_subnet_ids = []
    }
  }
}

# Compliance Configuration
variable "compliance_config" {
  description = "Compliance-related configurations"
  type = object({
    log_retention_days           = number
    audit_retention_days         = number
    encryption_key_rotation_days = number
    backup_retention_days        = number
  })
  default = {
    log_retention_days           = 365
    audit_retention_days         = 365
    encryption_key_rotation_days = 90
    backup_retention_days        = 365
  }

  validation {
    condition     = var.compliance_config.log_retention_days >= 365 && var.compliance_config.audit_retention_days >= 365
    error_message = "Retention periods must meet CJIS compliance requirements (minimum 365 days)"
  }
}