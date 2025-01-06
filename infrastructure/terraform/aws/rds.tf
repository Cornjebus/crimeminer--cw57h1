# Provider configuration for AWS
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption - CrimeMiner ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  multi_region           = true
  
  tags = {
    Name                = "crimeminer-rds-kms-${var.environment}"
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High"
    DataClassification = "Sensitive"
  }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "kms:*"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:PrincipalOrgID": data.aws_organizations_organization.current.id
          }
        }
      }
    ]
  })
}

# RDS monitoring role
resource "aws_iam_role" "rds_monitoring" {
  name = "crimeminer-rds-monitoring-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
}

# DB subnet group
resource "aws_db_subnet_group" "main" {
  name        = "crimeminer-db-${var.environment}"
  description = "Subnet group for CrimeMiner RDS instances"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Name               = "crimeminer-db-subnet-group"
    Environment        = var.environment
    SecurityCompliance = "FedRAMP-High"
  }
}

# DB parameter group
resource "aws_db_parameter_group" "main" {
  family = "postgres14"
  name   = "crimeminer-db-params-${var.environment}"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "password_encryption"
    value = "scram-sha-256"
  }

  tags = {
    Name               = "crimeminer-db-params"
    Environment        = var.environment
    SecurityCompliance = "FedRAMP-High"
  }
}

# Main RDS instance
resource "aws_db_instance" "main" {
  identifier     = "crimeminer-db-${var.environment}"
  engine         = "postgres"
  engine_version = "14.7"
  instance_class = var.rds_instance_class
  
  # Storage configuration
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds.arn

  # High availability configuration
  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_security_group_id]
  parameter_group_name   = aws_db_parameter_group.main.name

  # Backup configuration
  backup_retention_period   = var.backup_retention_days
  backup_window            = "03:00-04:00"
  maintenance_window       = "Mon:04:00-Mon:05:00"
  auto_minor_version_upgrade = true
  
  # Protection settings
  deletion_protection      = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "crimeminer-db-${var.environment}-final"
  copy_tags_to_snapshot   = true

  # Monitoring configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports      = ["postgresql", "upgrade", "audit"]

  # Security settings
  iam_database_authentication_enabled = true
  
  tags = {
    Name                = "crimeminer-db"
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High"
    DataClassification = "Sensitive"
    CJIS-Compliance    = "true"
  }
}

# Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}