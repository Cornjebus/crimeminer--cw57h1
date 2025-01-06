# Configure AWS S3 buckets for CrimeMiner evidence storage
# Version: AWS Provider ~> 5.0

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Primary evidence storage bucket with WORM capabilities
resource "aws_s3_bucket" "evidence" {
  bucket              = "crimeminer-evidence-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy       = false
  object_lock_enabled = true

  tags = {
    Name               = "crimeminer-evidence-${var.environment}"
    Environment        = var.environment
    Project           = "CrimeMiner"
    ManagedBy         = "Terraform"
    ComplianceLevel   = "FedRAMP-High"
    DataClassification = "CJI"
    RetentionRequired = "True"
  }
}

# Enable versioning for evidence integrity
resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure KMS encryption for evidence data
resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Configure lifecycle rules for evidence retention
resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "active_evidence_tier"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "archived_evidence_tier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "deep_archive_tier"
    status = "Enabled"

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
  }
}

# Block all public access to evidence bucket
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Create logging bucket for evidence access logs
resource "aws_s3_bucket" "evidence_logs" {
  bucket        = "crimeminer-evidence-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = {
    Name               = "crimeminer-evidence-logs-${var.environment}"
    Environment        = var.environment
    Project           = "CrimeMiner"
    ManagedBy         = "Terraform"
    ComplianceLevel   = "FedRAMP-High"
    DataClassification = "CJI"
    RetentionRequired = "True"
  }
}

# Enable access logging for audit trail
resource "aws_s3_bucket_logging" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  target_bucket = aws_s3_bucket.evidence_logs.id
  target_prefix = "access-logs/"
}

# Configure WORM policy for evidence preservation
resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    default_retention {
      mode = "COMPLIANCE"
      years = 7
    }
  }
}

# Output evidence bucket ID and ARN
output "evidence_bucket_id" {
  description = "Evidence bucket ID for use by other services"
  value       = aws_s3_bucket.evidence.id
}

output "evidence_bucket_arn" {
  description = "Evidence bucket ARN for IAM policies"
  value       = aws_s3_bucket.evidence.arn
}