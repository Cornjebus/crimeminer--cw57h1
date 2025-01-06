# Configure Terraform settings and required providers
terraform {
  # Require Terraform version 1.5.0 or higher for FedRAMP compliance features
  required_version = ">= 1.5.0"

  # Define required providers with specific versions
  required_providers {
    # AWS provider v5.0+ for FedRAMP High compliance features
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # Random provider for secure resource naming
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Configure remote state storage in S3 with encryption and locking
  backend "s3" {
    bucket = "crimeminer-terraform-state-${var.environment}"
    key    = "terraform.tfstate"
    region = "${var.aws_region}"
    
    # Enable encryption and versioning for FedRAMP compliance
    encrypt = true
    kms_key_id = "aws/s3"
    versioning = true
    
    # DynamoDB table for state locking
    dynamodb_table = "crimeminer-terraform-locks"
    
    # Server-side encryption configuration
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm = "aws:kms"
        }
      }
    }
  }
}

# Configure AWS provider with security and compliance settings
provider "aws" {
  region = var.aws_region

  # Default tags for all resources
  default_tags = {
    Project              = "CrimeMiner"
    Environment          = var.environment
    ManagedBy           = "Terraform"
    SecurityCompliance   = "FedRAMP-High"
    DataClassification  = "Sensitive"
    SecurityZone        = "HighSecurity"
    ComplianceFramework = "CJIS"
    BackupRetention     = "7Years"
  }

  # Assume role configuration for secure access
  assume_role {
    role_arn     = "arn:aws:iam::${var.aws_account_id}:role/TerraformExecutionRole"
    session_name = "TerraformProviderSession"
    external_id  = "CrimeMinerTerraform"
  }

  # Service endpoints for FedRAMP-compliant regions
  endpoints {
    s3         = "https://s3.${var.aws_region}.amazonaws.com"
    dynamodb   = "https://dynamodb.${var.aws_region}.amazonaws.com"
    kms        = "https://kms.${var.aws_region}.amazonaws.com"
    eks        = "https://eks.${var.aws_region}.amazonaws.com"
    rds        = "https://rds.${var.aws_region}.amazonaws.com"
    opensearch = "https://opensearch.${var.aws_region}.amazonaws.com"
    sagemaker  = "https://sagemaker.${var.aws_region}.amazonaws.com"
    cloudfront = "https://cloudfront.amazonaws.com"
  }
}