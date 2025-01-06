# Azure Kubernetes Service (AKS) Configuration for CrimeMiner DR Environment
# Provider version: hashicorp/azurerm ~> 3.75.0

# Create managed identity for AKS cluster
resource "azurerm_user_assigned_identity" "aks" {
  name                = local.identity_name
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  tags                = var.resource_tags
}

# AKS cluster configuration with FedRAMP High and CJIS compliance
resource "azurerm_kubernetes_cluster" "main" {
  name                = local.aks_name
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  dns_prefix          = local.aks_name
  kubernetes_version  = var.aks_config.version
  sku_tier            = "Paid" # Required for FedRAMP High compliance

  # System node pool configuration
  default_node_pool {
    name                = "system"
    vm_size            = var.aks_config.node_pools.system.vm_size
    node_count         = var.aks_config.node_pools.system.node_count
    max_pods           = var.aks_config.node_pools.system.max_pods
    zones              = var.aks_config.node_pools.system.availability_zones
    vnet_subnet_id     = var.subnet_ids.application
    os_disk_size_gb    = 128
    os_disk_type       = "Managed"
    type               = "VirtualMachineScaleSets"
    enable_auto_scaling = true
    min_count          = 3
    max_count          = 5
    node_labels = {
      "nodepool-type" = "system"
      "environment"   = var.environment
      "compliance"    = "fedramp-high"
    }
  }

  # User node pool for application workloads
  resource "azurerm_kubernetes_cluster_node_pool" "user" {
    name                = "user"
    kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
    vm_size            = var.aks_config.node_pools.user.vm_size
    node_count         = var.aks_config.node_pools.user.node_count
    max_pods           = var.aks_config.node_pools.user.max_pods
    zones              = var.aks_config.node_pools.user.availability_zones
    vnet_subnet_id     = var.subnet_ids.application
    os_disk_size_gb    = 256
    os_disk_type       = "Managed"
    enable_auto_scaling = true
    min_count          = 3
    max_count          = 10
    node_labels = {
      "nodepool-type" = "user"
      "environment"   = var.environment
      "compliance"    = "fedramp-high"
    }
  }

  # Managed identity configuration
  identity {
    type = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.aks.id]
  }

  # Network configuration
  network_profile {
    network_plugin     = var.aks_config.network_plugin
    network_policy     = var.aks_config.network_policy
    dns_service_ip     = "10.2.0.10"
    service_cidr       = "10.2.0.0/16"
    docker_bridge_cidr = "172.17.0.1/16"
    outbound_type      = "userDefinedRouting"
    load_balancer_sku  = "standard"
  }

  # Azure AD RBAC configuration
  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled    = true
    tenant_id             = data.azurerm_client_config.current.tenant_id
    admin_group_object_ids = ["${data.azurerm_client_config.current.object_id}"]
  }

  # Key Vault integration for secrets
  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  # Monitoring configuration
  oms_agent {
    log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id
    msi_auth_for_monitoring_enabled = true
  }

  # Security features for compliance
  azure_policy_enabled = true
  
  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [2, 3, 4]
    }
  }

  auto_scaler_profile {
    balance_similar_node_groups = true
    expander                   = "random"
    max_graceful_termination_sec = 600
    scale_down_delay_after_add = "10m"
    scale_down_delay_after_delete = "10s"
    scale_down_delay_after_failure = "3m"
    scan_interval             = "10s"
    scale_down_unneeded      = "10m"
    scale_down_unready       = "20m"
    scale_down_utilization_threshold = "0.5"
  }

  tags = merge(var.resource_tags, {
    "KubernetesVersion" = var.aks_config.version
    "DisasterRecovery"  = "Secondary"
  })

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      kubernetes_version,
      default_node_pool[0].node_count
    ]
  }
}

# Data sources
data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "main" {
  name = "${var.project_name}-${var.environment}-rg"
}

data "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-${var.environment}-law"
  resource_group_name = data.azurerm_resource_group.main.name
}

# Outputs
output "aks_id" {
  description = "The ID of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.id
}

output "aks_fqdn" {
  description = "The FQDN of the AKS cluster"
  value       = azurerm_kubernetes_cluster.main.fqdn
}

output "aks_identity" {
  description = "The managed identity of the AKS cluster"
  value       = azurerm_user_assigned_identity.aks
  sensitive   = true
}