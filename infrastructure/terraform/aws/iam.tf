# AWS Provider configuration with required version
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Import current AWS account ID for use in policies
data "aws_caller_identity" "current" {}

# EKS Cluster IAM Role
resource "aws_iam_role" "eks_cluster" {
  name = "crimeminer-eks-cluster-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount": data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
    "arn:aws:iam::aws:policy/AWSCloudTrailFullAccess"
  ]

  tags = {
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High,CJIS"
    ManagedBy          = "terraform"
    DataClassification = "SENSITIVE"
    AuditEnabled       = "true"
  }
}

# EKS Node Group IAM Role
resource "aws_iam_role" "eks_node" {
  name = "crimeminer-eks-node-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount": data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  ]

  tags = {
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High,CJIS"
    ManagedBy          = "terraform"
    DataClassification = "SENSITIVE"
    AuditEnabled       = "true"
  }
}

# Custom S3 Evidence Access Policy
resource "aws_iam_policy" "s3_evidence_access" {
  name        = "crimeminer-s3-evidence-access-${var.environment}"
  path        = "/"
  description = "Policy for accessing evidence storage bucket with strict encryption and compliance requirements"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "arn:aws:s3:::crimeminer-evidence-${var.environment}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-server-side-encryption": "aws:kms",
            "aws:RequestTag/SecurityCompliance": "FedRAMP-High,CJIS"
          }
        }
      }
    ]
  })

  tags = {
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High,CJIS"
    ManagedBy          = "terraform"
    DataClassification = "SENSITIVE"
    AuditEnabled       = "true"
  }
}

# Outputs for cross-stack references
output "eks_cluster_role_arn" {
  description = "ARN of EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.arn
}

output "eks_node_role_arn" {
  description = "ARN of EKS node IAM role"
  value       = aws_iam_role.eks_node.arn
}

output "s3_evidence_policy_arn" {
  description = "ARN of S3 evidence access policy"
  value       = aws_iam_policy.s3_evidence_access.arn
}