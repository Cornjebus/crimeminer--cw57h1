# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Configure remote state with encryption and state locking
  backend "s3" {
    bucket = "crimeminer-terraform-state-${var.environment}"
    key    = "terraform.tfstate"
    region = var.aws_region

    # Security configurations
    encrypt        = true
    kms_key_id    = "aws/s3"
    dynamodb_table = "crimeminer-terraform-locks"
    acl           = "private"

    # Enable versioning
    versioning = true

    # Server-side encryption configuration
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm     = "aws:kms"
          kms_master_key_id = "aws/s3"
        }
      }
    }

    # Block all public access
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
}

# Define local values
locals {
  project_name = "crimeminer-${var.environment}"
  
  # Common tags for all resources
  common_tags = {
    Project              = "CrimeMiner"
    Environment          = var.environment
    ManagedBy           = "Terraform"
    SecurityCompliance   = "FedRAMP-High"
    DataClassification  = "Sensitive"
    CJIS-Compliance     = "Required"
    BackupFrequency     = "Daily"
    DisasterRecovery    = "Enabled"
    EncryptionRequired  = "True"
    SecurityAuditEnabled = "True"
  }
}

# Configure AWS Provider with secure defaults
provider "aws" {
  region = var.aws_region
  
  # Apply common tags to all resources
  default_tags = local.common_tags

  # Configure service endpoints
  endpoints {
    s3        = "https://s3.${var.aws_region}.amazonaws.com"
    dynamodb  = "https://dynamodb.${var.aws_region}.amazonaws.com"
    kms       = "https://kms.${var.aws_region}.amazonaws.com"
    sts       = "https://sts.${var.aws_region}.amazonaws.com"
  }

  # Assume role configuration for secure access
  assume_role {
    role_arn     = "arn:aws:iam::ACCOUNT_ID:role/TerraformExecutionRole"
    session_name = "TerraformSession"
    external_id  = "CrimeMinerTerraform"
  }
}

# Configure random provider for secure resource naming
provider "random" {}

# Data source for current AWS region
data "aws_region" "current" {}

# Data source for current AWS caller identity
data "aws_caller_identity" "current" {}

# Data source for available availability zones
data "aws_availability_zones" "available" {
  state = "available"
  
  filter {
    name   = "opt-in-status"
    values = ["opted-in"]
  }
}

# Create KMS key for encryption
resource "aws_kms_key" "main" {
  description             = "KMS key for ${local.project_name}"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  
  tags = merge(local.common_tags, {
    Name = "${local.project_name}-kms-key"
  })

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })
}

# Create S3 bucket for storing application data
resource "aws_s3_bucket" "app_data" {
  bucket = "${local.project_name}-app-data"
  
  # Enable versioning
  versioning {
    enabled = true
  }

  # Enable server-side encryption
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.main.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  # Block all public access
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-app-data"
  })
}

# Create DynamoDB table for Terraform state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "crimeminer-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-terraform-locks"
  })
}

# Output important resource information
output "aws_region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.main.arn
}

output "app_data_bucket" {
  description = "Application data S3 bucket name"
  value       = aws_s3_bucket.app_data.id
}