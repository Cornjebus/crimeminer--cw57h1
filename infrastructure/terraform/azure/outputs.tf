# Output variables for Azure infrastructure resources in CrimeMiner's DR environment

# Resource Group outputs
output "resource_group_name" {
  description = "Name of the Azure resource group for DR environment"
  value       = resource_group.name
}

output "resource_group_location" {
  description = "Azure region location of the resource group"
  value       = resource_group.location
}

# Virtual Network outputs
output "vnet_id" {
  description = "ID of the virtual network in DR environment"
  value       = virtual_network.id
}

output "subnet_ids" {
  description = "Map of subnet names to their IDs for service deployment"
  value       = virtual_network.subnet_ids
}

# AKS Cluster outputs
output "aks_cluster_id" {
  description = "ID of the AKS cluster in DR environment"
  value       = kubernetes_cluster.id
}

output "aks_cluster_endpoint" {
  description = "FQDN of the AKS cluster API server endpoint"
  value       = kubernetes_cluster.fqdn
}

output "aks_credentials" {
  description = "Kubeconfig credentials for AKS cluster access"
  value       = kubernetes_cluster.kube_config_raw
  sensitive   = true
}

# Metadata outputs for operational use
output "dr_environment_metadata" {
  description = "Metadata about the DR environment deployment"
  value = {
    environment      = "disaster_recovery"
    deployment_type  = "secondary"
    compliance_level = "fedramp_high"
    cjis_compliant  = true
    region          = resource_group.location
  }
}

# Network security outputs
output "network_security_config" {
  description = "Network security configuration details"
  value = {
    vnet_address_space = virtual_network.address_space
    subnet_ranges      = virtual_network.subnet_ids
    service_endpoints  = true
    network_policies  = "enabled"
  }
}

# Cluster monitoring outputs
output "monitoring_config" {
  description = "Monitoring configuration for the DR environment"
  value = {
    log_analytics_enabled = true
    metrics_enabled      = true
    diagnostic_settings  = "enabled"
    compliance_logging   = "fedramp_high"
  }
}