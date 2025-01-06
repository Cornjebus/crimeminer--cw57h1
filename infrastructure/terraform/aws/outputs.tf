# VPC and Network Outputs
output "vpc_id" {
  description = "ID of the FedRAMP High compliant VPC"
  value       = aws_vpc.main.id
  sensitive   = false
}

output "public_subnet_ids" {
  description = "IDs of public subnets in the DMZ tier"
  value       = aws_subnet.public[*].id
  sensitive   = false
}

output "private_app_subnet_ids" {
  description = "IDs of private application subnets for EKS and application resources"
  value       = aws_subnet.private_app[*].id
  sensitive   = false
}

output "private_data_subnet_ids" {
  description = "IDs of private data subnets for database and storage resources"
  value       = aws_subnet.private_data[*].id
  sensitive   = false
}

# EKS Cluster Outputs
output "eks_cluster_name" {
  description = "Name of the FedRAMP High compliant EKS cluster"
  value       = aws_eks_cluster.main.name
  sensitive   = false
}

output "eks_cluster_endpoint" {
  description = "Endpoint URL for the EKS cluster API server"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = true
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = aws_security_group.eks_cluster.id
  sensitive   = false
}

output "eks_cluster_certificate_authority" {
  description = "Certificate authority data for the EKS cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "eks_node_group_role_arn" {
  description = "IAM role ARN for EKS node groups"
  value       = aws_iam_role.eks_node.arn
  sensitive   = false
}

# Security and Compliance Outputs
output "eks_encryption_key_arn" {
  description = "ARN of KMS key used for EKS cluster encryption"
  value       = aws_kms_key.eks.arn
  sensitive   = true
}

output "vpc_flow_logs_group" {
  description = "CloudWatch log group for VPC flow logs"
  value       = aws_vpc.main.arn
  sensitive   = false
}

# Network Configuration Outputs
output "nat_gateway_ips" {
  description = "Elastic IP addresses of NAT Gateways"
  value       = aws_eip.nat[*].public_ip
  sensitive   = false
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
  sensitive   = false
}

# Environment Information
output "deployment_environment" {
  description = "Current deployment environment"
  value       = var.environment
  sensitive   = false
}

output "aws_region" {
  description = "AWS region of deployment"
  value       = var.aws_region
  sensitive   = false
}

# Tags and Compliance Information
output "compliance_tags" {
  description = "Compliance-related tags applied to resources"
  value = {
    SecurityCompliance = "FedRAMP-High"
    CJIS-Compliant    = "true"
    Environment       = var.environment
    ManagedBy        = "terraform"
  }
  sensitive = false
}

# Resource Counts
output "availability_zone_count" {
  description = "Number of availability zones in use"
  value       = length(var.availability_zones)
  sensitive   = false
}

output "eks_node_count" {
  description = "Current desired count of EKS nodes"
  value       = var.eks_min_nodes
  sensitive   = false
}