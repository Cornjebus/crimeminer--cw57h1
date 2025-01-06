# Provider configuration for AWS
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name        = "crimeminer-alb-${var.environment}"
  description = "Security group for Application Load Balancer with FedRAMP High compliance"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name                = "crimeminer-alb-sg"
    Environment         = var.environment
    SecurityZone        = "DMZ"
    SecurityCompliance  = "FedRAMP-High,CJIS"
    DataClassification = "Public"
  }
}

# ALB Security Group Rules
resource "aws_security_group_rule" "alb_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS inbound with TLS 1.3 requirement"
}

resource "aws_security_group_rule" "alb_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"]
  security_group_id = aws_security_group.alb.id
  description       = "Restricted HTTPS outbound to internal VPC"
}

# EKS Cluster Security Group
resource "aws_security_group" "eks" {
  name        = "crimeminer-eks-${var.environment}"
  description = "Security group for EKS cluster and node groups with FedRAMP High compliance"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name                = "crimeminer-eks-sg"
    Environment         = var.environment
    SecurityZone        = "Application"
    SecurityCompliance  = "FedRAMP-High,CJIS"
    DataClassification = "Sensitive"
  }
}

# EKS Security Group Rules
resource "aws_security_group_rule" "eks_ingress_https" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.eks.id
  description              = "HTTPS from ALB with encryption requirement"
}

resource "aws_security_group_rule" "eks_ingress_kubelet" {
  type              = "ingress"
  from_port         = 10250
  to_port           = 10250
  protocol          = "tcp"
  self              = true
  security_group_id = aws_security_group.eks.id
  description       = "Kubernetes API server to kubelet communication"
}

resource "aws_security_group_rule" "eks_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"]
  security_group_id = aws_security_group.eks.id
  description       = "HTTPS outbound to internal services"
}

resource "aws_security_group_rule" "eks_egress_postgres" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  security_group_id        = aws_security_group.eks.id
  description              = "PostgreSQL access"
}

resource "aws_security_group_rule" "eks_egress_redis" {
  type                     = "egress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.elasticache.id
  security_group_id        = aws_security_group.eks.id
  description              = "Redis access"
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name        = "crimeminer-rds-${var.environment}"
  description = "Security group for RDS PostgreSQL instances with FedRAMP High compliance"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name                = "crimeminer-rds-sg"
    Environment         = var.environment
    SecurityZone        = "Data"
    SecurityCompliance  = "FedRAMP-High,CJIS"
    DataClassification = "Restricted"
  }
}

# RDS Security Group Rules
resource "aws_security_group_rule" "rds_ingress_postgres" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks.id
  security_group_id        = aws_security_group.rds.id
  description              = "PostgreSQL with TLS encryption requirement"
}

resource "aws_security_group_rule" "rds_egress_all_internal" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["10.0.0.0/8"]
  security_group_id = aws_security_group.rds.id
  description       = "Internal VPC communication only"
}

# Elasticache Security Group
resource "aws_security_group" "elasticache" {
  name        = "crimeminer-elasticache-${var.environment}"
  description = "Security group for Elasticache Redis clusters with FedRAMP High compliance"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name                = "crimeminer-elasticache-sg"
    Environment         = var.environment
    SecurityZone        = "Data"
    SecurityCompliance  = "FedRAMP-High,CJIS"
    DataClassification = "Restricted"
  }
}

# Elasticache Security Group Rules
resource "aws_security_group_rule" "elasticache_ingress_redis" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks.id
  security_group_id        = aws_security_group.elasticache.id
  description              = "Redis with encryption in-transit requirement"
}

resource "aws_security_group_rule" "elasticache_egress_all_internal" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["10.0.0.0/8"]
  security_group_id = aws_security_group.elasticache.id
  description       = "Internal VPC communication only"
}

# Outputs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "eks_security_group_id" {
  description = "ID of the EKS security group"
  value       = aws_security_group.eks.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  description = "ID of the Elasticache security group"
  value       = aws_security_group.elasticache.id
}