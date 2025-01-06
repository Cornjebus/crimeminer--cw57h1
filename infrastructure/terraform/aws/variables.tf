# AWS region configuration
variable "aws_region" {
  type        = string
  description = "AWS region for infrastructure deployment"
  default     = "us-east-1"

  validation {
    condition     = can(regex("^us-(east|west|gov)-[1-2]$", var.aws_region))
    error_message = "Region must be a valid US region supporting FedRAMP High workloads"
  }
}

# Environment configuration
variable "environment" {
  type        = string
  description = "Deployment environment (production, staging, development)"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development"
  }
}

# VPC configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Availability zones configuration
variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for multi-AZ deployment"

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones required for high availability"
  }
}

# EKS node group configuration
variable "eks_node_instance_types" {
  type        = list(string)
  description = "List of EC2 instance types for EKS node groups"
  default     = ["m5.xlarge", "m5.2xlarge"]

  validation {
    condition     = length(var.eks_node_instance_types) > 0
    error_message = "At least one instance type must be specified"
  }
}

variable "eks_min_nodes" {
  type        = number
  description = "Minimum number of nodes in EKS node groups"
  default     = 2

  validation {
    condition     = var.eks_min_nodes >= 2
    error_message = "Minimum node count must be at least 2 for high availability"
  }
}

variable "eks_max_nodes" {
  type        = number
  description = "Maximum number of nodes in EKS node groups"
  default     = 10

  validation {
    condition     = var.eks_max_nodes >= var.eks_min_nodes
    error_message = "Maximum node count must be greater than or equal to minimum node count"
  }
}

# RDS configuration
variable "rds_instance_class" {
  type        = string
  description = "RDS instance class for PostgreSQL database"
  default     = "db.r5.xlarge"

  validation {
    condition     = can(regex("^db\\.(r5|r6g)\\.(large|xlarge|2xlarge|4xlarge)$", var.rds_instance_class))
    error_message = "Must be a valid RDS instance class supporting high performance workloads"
  }
}

# Backup configuration
variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain backups"
  default     = 30

  validation {
    condition     = var.backup_retention_days >= 30
    error_message = "Backup retention must be at least 30 days for compliance"
  }
}