# AWS KMS configuration for CrimeMiner platform
# Implements encryption key management with FedRAMP High and CJIS compliance

# Evidence encryption KMS key
resource "aws_kms_key" "evidence_encryption" {
  description             = "KMS key for evidence data encryption with FedRAMP High compliance"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = {
    Name                = "${local.project_name}-evidence-encryption"
    Purpose            = "Evidence Data Encryption"
    Compliance         = "FedRAMP-High,CJIS"
    CostCenter         = "Security-Encryption"
    DataClassification = "Sensitive-Law-Enforcement"
    KeyAdministrators  = "Security-Team"
    BackupRequired     = "true"
  }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM Root User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = [
          "kms:Create*",
          "kms:Describe*",
          "kms:Enable*",
          "kms:List*",
          "kms:Put*"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow Evidence Service Access"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Enable CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.amazonaws.com"
        }
        Action   = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })
}

# Database encryption KMS key
resource "aws_kms_key" "database_encryption" {
  description             = "KMS key for RDS database encryption with FedRAMP High compliance"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = {
    Name                = "${local.project_name}-database-encryption"
    Purpose            = "Database Encryption"
    Compliance         = "FedRAMP-High,CJIS"
    CostCenter         = "Security-Encryption"
    DataClassification = "Sensitive-Law-Enforcement"
    KeyAdministrators  = "Database-Team"
    BackupRequired     = "true"
  }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM Root User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = [
          "kms:Create*",
          "kms:Describe*",
          "kms:Enable*",
          "kms:List*",
          "kms:Put*"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service Access"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action   = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# Secrets encryption KMS key
resource "aws_kms_key" "secret_encryption" {
  description             = "KMS key for secrets and credentials encryption with FedRAMP High compliance"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = {
    Name                = "${local.project_name}-secret-encryption"
    Purpose            = "Secrets Encryption"
    Compliance         = "FedRAMP-High,CJIS"
    CostCenter         = "Security-Encryption"
    DataClassification = "Sensitive-Law-Enforcement"
    KeyAdministrators  = "Security-Team"
    BackupRequired     = "true"
  }

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM Root User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = [
          "kms:Create*",
          "kms:Describe*",
          "kms:Enable*",
          "kms:List*",
          "kms:Put*"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow Secrets Manager Access"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action   = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# KMS key aliases
resource "aws_kms_alias" "evidence_encryption" {
  name          = "alias/${local.project_name}-evidence-encryption"
  target_key_id = aws_kms_key.evidence_encryption.key_id
}

resource "aws_kms_alias" "database_encryption" {
  name          = "alias/${local.project_name}-database-encryption"
  target_key_id = aws_kms_key.database_encryption.key_id
}

resource "aws_kms_alias" "secret_encryption" {
  name          = "alias/${local.project_name}-secret-encryption"
  target_key_id = aws_kms_key.secret_encryption.key_id
}

# Outputs for key ARNs
output "evidence_encryption_key_arn" {
  description = "ARN of evidence encryption KMS key"
  value       = aws_kms_key.evidence_encryption.arn
}

output "database_encryption_key_arn" {
  description = "ARN of database encryption KMS key"
  value       = aws_kms_key.database_encryption.arn
}

output "secret_encryption_key_arn" {
  description = "ARN of secrets encryption KMS key"
  value       = aws_kms_key.secret_encryption.arn
}