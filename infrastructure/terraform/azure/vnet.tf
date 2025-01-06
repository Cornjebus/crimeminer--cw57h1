# Azure Virtual Network Configuration for CrimeMiner DR Environment
# Provider version: hashicorp/azurerm ~> 3.75.0

# Configure DDoS Protection Plan for FedRAMP High compliance
resource "azurerm_network_ddos_protection_plan" "main" {
  name                = "${var.project_name}-${var.environment}-ddos-plan"
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = var.resource_tags
}

# Primary Virtual Network with enhanced security features
resource "azurerm_virtual_network" "main" {
  name                = local.vnet_name
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  address_space       = var.vnet_config.address_space
  dns_servers         = var.vnet_config.dns_servers
  tags                = var.resource_tags

  ddos_protection_plan {
    id     = azurerm_network_ddos_protection_plan.main.id
    enable = var.vnet_config.ddos_protection
  }

  # Enable diagnostic settings for network monitoring
  lifecycle {
    ignore_changes = [tags["CreatedDate"]]
  }
}

# DMZ Subnet for external-facing services
resource "azurerm_subnet" "dmz" {
  name                 = local.subnet_names.dmz
  resource_group_name  = data.azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.subnet_config.dmz.address_prefix]

  service_endpoints = var.subnet_config.dmz.service_endpoints

  private_endpoint_network_policies_enabled     = false
  private_link_service_network_policies_enabled = false
}

# Application Subnet for core services
resource "azurerm_subnet" "application" {
  name                 = local.subnet_names.application
  resource_group_name  = data.azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.1.1.0/24"]

  service_endpoints = [
    "Microsoft.KeyVault",
    "Microsoft.ContainerRegistry",
    "Microsoft.AzureActiveDirectory"
  ]

  delegation {
    name = "aks-delegation"
    service_delegation {
      name    = "Microsoft.ContainerService/managedClusters"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# Data Subnet for databases and storage
resource "azurerm_subnet" "data" {
  name                 = local.subnet_names.data
  resource_group_name  = data.azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.1.2.0/24"]

  service_endpoints = [
    "Microsoft.Storage",
    "Microsoft.Sql",
    "Microsoft.KeyVault",
    "Microsoft.AzureCosmosDB"
  ]

  private_endpoint_network_policies_enabled     = true
  private_link_service_network_policies_enabled = true
}

# Network Watcher for traffic analysis and security monitoring
resource "azurerm_network_watcher" "main" {
  name                = "${var.project_name}-${var.environment}-nw"
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = var.resource_tags
}

# Flow logs for network security analysis
resource "azurerm_network_watcher_flow_log" "main" {
  network_watcher_name = azurerm_network_watcher.main.name
  resource_group_name  = data.azurerm_resource_group.main.name
  name                = "${var.project_name}-${var.environment}-flow-log"

  network_security_group_id = azurerm_network_security_group.dmz.id
  storage_account_id        = data.azurerm_storage_account.logs.id
  enabled                   = true
  version                   = 2

  retention_policy {
    enabled = true
    days    = var.compliance_config.log_retention_days
  }

  traffic_analytics {
    enabled               = true
    workspace_id          = data.azurerm_log_analytics_workspace.main.workspace_id
    workspace_region      = var.location
    workspace_resource_id = data.azurerm_log_analytics_workspace.main.id
    interval_in_minutes   = 10
  }
}

# Export Virtual Network ID
output "vnet_id" {
  description = "ID of the created virtual network"
  value       = azurerm_virtual_network.main.id
}

# Export Subnet IDs
output "subnet_ids" {
  description = "Map of subnet names to their IDs"
  value = {
    dmz         = azurerm_subnet.dmz.id
    application = azurerm_subnet.application.id
    data        = azurerm_subnet.data.id
  }
}

# Data source for existing resource group
data "azurerm_resource_group" "main" {
  name = "${var.project_name}-${var.environment}-rg"
}

# Data source for existing storage account (for logs)
data "azurerm_storage_account" "logs" {
  name                = "${var.project_name}${var.environment}logs"
  resource_group_name = data.azurerm_resource_group.main.name
}

# Data source for existing Log Analytics workspace
data "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-${var.environment}-law"
  resource_group_name = data.azurerm_resource_group.main.name
}