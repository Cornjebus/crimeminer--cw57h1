# Azure Network Security Groups for CrimeMiner DR Environment
# Provider version: hashicorp/azurerm ~> 3.75.0

locals {
  dmz_nsg_name = "${var.project_name}-${var.environment}-dmz-nsg"
  app_nsg_name = "${var.project_name}-${var.environment}-app-nsg"
  data_nsg_name = "${var.project_name}-${var.environment}-data-nsg"
  diagnostic_setting_name = "${var.project_name}-${var.environment}-nsg-diag"
  default_deny_priority = 4096
}

# DMZ Network Security Group
resource "azurerm_network_security_group" "dmz" {
  name                = local.dmz_nsg_name
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = merge(var.resource_tags, {
    NetworkZone = "DMZ"
    SecurityLevel = "External"
  })
}

# Application Network Security Group
resource "azurerm_network_security_group" "app" {
  name                = local.app_nsg_name
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = merge(var.resource_tags, {
    NetworkZone = "Application"
    SecurityLevel = "Internal"
  })
}

# Data Network Security Group
resource "azurerm_network_security_group" "data" {
  name                = local.data_nsg_name
  location            = var.location
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = merge(var.resource_tags, {
    NetworkZone = "Data"
    SecurityLevel = "Restricted"
  })
}

# DMZ NSG Rules
resource "azurerm_network_security_rule" "dmz_inbound_https" {
  name                        = "AllowInboundHTTPS"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range          = "*"
  destination_port_range     = "443"
  source_address_prefix      = "Internet"
  destination_address_prefix = "VirtualNetwork"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.dmz.name
}

resource "azurerm_network_security_rule" "dmz_inbound_healthprobe" {
  name                        = "AllowHealthProbe"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range          = "*"
  destination_port_range     = "65200-65535"
  source_address_prefix      = "AzureLoadBalancer"
  destination_address_prefix = "VirtualNetwork"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.dmz.name
}

# Application NSG Rules
resource "azurerm_network_security_rule" "app_inbound_dmz" {
  name                        = "AllowDMZInbound"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range          = "*"
  destination_port_ranges    = ["8080", "8443"]
  source_address_prefix      = var.subnet_config.dmz.address_prefix
  destination_address_prefix = "VirtualNetwork"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.app.name
}

resource "azurerm_network_security_rule" "app_inbound_aks" {
  name                        = "AllowAKSInbound"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "*"
  source_port_range          = "*"
  destination_port_range     = "*"
  source_address_prefix      = "AzureCloud"
  destination_address_prefix = "VirtualNetwork"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.app.name
}

# Data NSG Rules
resource "azurerm_network_security_rule" "data_inbound_app" {
  name                        = "AllowAppInbound"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range          = "*"
  destination_port_ranges    = ["1433", "5432", "6379", "27017"]
  source_address_prefix      = "10.1.1.0/24"  # Application subnet
  destination_address_prefix = "VirtualNetwork"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.data.name
}

# Default Deny Rules
resource "azurerm_network_security_rule" "dmz_deny_all" {
  name                        = "DenyAllInbound"
  priority                    = local.default_deny_priority
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range          = "*"
  destination_port_range     = "*"
  source_address_prefix      = "*"
  destination_address_prefix = "*"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.dmz.name
}

resource "azurerm_network_security_rule" "app_deny_all" {
  name                        = "DenyAllInbound"
  priority                    = local.default_deny_priority
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range          = "*"
  destination_port_range     = "*"
  source_address_prefix      = "*"
  destination_address_prefix = "*"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.app.name
}

resource "azurerm_network_security_rule" "data_deny_all" {
  name                        = "DenyAllInbound"
  priority                    = local.default_deny_priority
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range          = "*"
  destination_port_range     = "*"
  source_address_prefix      = "*"
  destination_address_prefix = "*"
  resource_group_name         = data.azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.data.name
}

# NSG Diagnostic Settings
resource "azurerm_monitor_diagnostic_setting" "dmz_nsg" {
  name                       = "${local.diagnostic_setting_name}-dmz"
  target_resource_id         = azurerm_network_security_group.dmz.id
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id

  log {
    category = "NetworkSecurityGroupEvent"
    enabled  = true
    retention_policy {
      enabled = true
      days    = var.compliance_config.log_retention_days
    }
  }

  log {
    category = "NetworkSecurityGroupRuleCounter"
    enabled  = true
    retention_policy {
      enabled = true
      days    = var.compliance_config.log_retention_days
    }
  }
}

# NSG Subnet Associations
resource "azurerm_subnet_network_security_group_association" "dmz" {
  subnet_id                 = var.subnet_ids.dmz
  network_security_group_id = azurerm_network_security_group.dmz.id
}

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = var.subnet_ids.application
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_subnet_network_security_group_association" "data" {
  subnet_id                 = var.subnet_ids.data
  network_security_group_id = azurerm_network_security_group.data.id
}

# Outputs
output "nsg_ids" {
  description = "Map of NSG names to their IDs"
  value = {
    dmz_nsg_id  = azurerm_network_security_group.dmz.id
    app_nsg_id  = azurerm_network_security_group.app.id
    data_nsg_id = azurerm_network_security_group.data.id
  }
}

output "nsg_diagnostic_settings" {
  description = "Map of NSG diagnostic setting IDs"
  value = {
    dmz = azurerm_monitor_diagnostic_setting.dmz_nsg.id
  }
}