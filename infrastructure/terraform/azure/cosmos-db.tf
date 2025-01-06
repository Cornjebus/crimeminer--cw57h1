# Azure Cosmos DB configuration for CrimeMiner DR environment
# Provider version: ~> 3.75.0

# Primary Cosmos DB Account with enhanced security and compliance features
resource "azurerm_cosmosdb_account" "crimeminer_cosmos" {
  name                = "${var.project_name}-cosmos-${var.environment}"
  resource_group_name = data.azurerm_resource_group.main.name
  location           = var.location
  offer_type         = "Standard"
  kind               = "MongoDB"

  # Enable multi-region writes and automatic failover
  enable_automatic_failover = true
  enable_multiple_write_locations = true

  # Enhanced security configuration
  public_network_access_enabled = false
  is_virtual_network_filter_enabled = true
  key_vault_key_id = "${var.key_vault_id}/keys/cosmos-encryption-key"
  
  # Network security rules
  ip_range_filter = join(",", var.allowed_ip_ranges)

  # Virtual network integration
  virtual_network_rule {
    id = azurerm_subnet.cosmos_subnet.id
    ignore_missing_vnet_service_endpoint = false
  }

  # CJIS-compliant consistency configuration
  consistency_policy {
    consistency_level       = "Strong"
    max_interval_in_seconds = 5
    max_staleness_prefix   = 100
  }

  # Geo-replication configuration
  geo_location {
    location          = var.location
    failover_priority = 0
    zone_redundant    = true
  }

  geo_location {
    location          = "centralus"
    failover_priority = 1
    zone_redundant    = true
  }

  # Enhanced backup policy for compliance
  backup {
    type                = "Continuous"
    interval_in_minutes = 240
    retention_in_hours  = 8760 # 365 days
    storage_redundancy  = "Geo"
  }

  # Capabilities
  capabilities {
    name = "EnableMongo"
  }

  capabilities {
    name = "EnableServerless"
  }

  capabilities {
    name = "EnableAnalyticalStorage"
  }

  # Compliance and security tags
  tags = merge(var.resource_tags, {
    "CJISCompliance"    = "Enabled"
    "DataClassification" = "Sensitive"
    "EncryptionType"    = "CustomerManaged"
    "BackupRetention"   = "365Days"
  })
}

# MongoDB database configuration
resource "azurerm_cosmosdb_mongo_database" "crimeminer_db" {
  name                = "${var.project_name}-db"
  resource_group_name = data.azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.crimeminer_cosmos.name

  # Autoscale throughput settings
  autoscale_settings {
    max_throughput = 4000
  }
}

# Enhanced diagnostic settings for CJIS compliance
resource "azurerm_monitor_diagnostic_setting" "cosmos_diagnostics" {
  name                       = "${var.project_name}-cosmos-diag"
  target_resource_id         = azurerm_cosmosdb_account.crimeminer_cosmos.id
  log_analytics_workspace_id = data.azurerm_log_analytics_workspace.main.id

  log {
    category = "DataPlaneRequests"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "QueryRuntimeStatistics"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "PartitionKeyStatistics"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  log {
    category = "PartitionKeyRUConsumption"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }

  metric {
    category = "Requests"
    enabled  = true
    retention_policy {
      enabled = true
      days    = 365
    }
  }
}

# Export Cosmos DB connection information
output "cosmos_db_endpoint" {
  description = "The endpoint used to connect to the Cosmos DB account"
  value       = azurerm_cosmosdb_account.crimeminer_cosmos.endpoint
  sensitive   = true
}

output "cosmos_db_connection_strings" {
  description = "The connection strings for the Cosmos DB account"
  value       = azurerm_cosmosdb_account.crimeminer_cosmos.connection_strings
  sensitive   = true
}