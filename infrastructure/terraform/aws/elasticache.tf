# AWS ElastiCache Redis configuration for CrimeMiner platform
# AWS Provider version ~> 5.0

# Subnet group for Redis cluster deployment in private subnets
resource "aws_elasticache_subnet_group" "main" {
  name        = "crimeminer-redis-${var.environment}"
  subnet_ids  = var.private_data_subnet_ids
  
  tags = {
    Name                = "crimeminer-redis-subnet-${var.environment}"
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High"
    DataClassification = "Sensitive"
    CreatedBy          = "Terraform"
    Project            = "CrimeMiner"
  }
}

# Parameter group with FedRAMP High compliance and performance optimizations
resource "aws_elasticache_parameter_group" "main" {
  family      = "redis6.x"
  name        = "crimeminer-redis-params-${var.environment}"
  description = "FedRAMP High compliant Redis parameters for CrimeMiner platform"

  # Security parameters
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "reserved-memory-percent"
    value = "25"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  tags = {
    Name               = "crimeminer-redis-params-${var.environment}"
    Environment        = var.environment
    SecurityCompliance = "FedRAMP-High"
    CreatedBy         = "Terraform"
    Project           = "CrimeMiner"
  }
}

# Security group for Redis cluster
resource "aws_security_group" "redis" {
  name        = "crimeminer-redis-${var.environment}"
  description = "Security group for Redis cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
    description     = "Allow Redis traffic from application security group"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outbound traffic"
  }

  tags = {
    Name               = "crimeminer-redis-sg-${var.environment}"
    Environment        = var.environment
    SecurityCompliance = "FedRAMP-High"
    CreatedBy         = "Terraform"
    Project           = "CrimeMiner"
  }
}

# Redis replication group for high availability
resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = "crimeminer-redis-${var.environment}"
  replication_group_description = "Redis cluster for CrimeMiner platform"
  node_type                     = "cache.r5.xlarge"
  port                          = 6379
  parameter_group_name          = aws_elasticache_parameter_group.main.name
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  
  # High availability configuration
  automatic_failover_enabled    = true
  multi_az_enabled             = true
  num_cache_clusters           = 2
  
  # Engine configuration
  engine                       = "redis"
  engine_version              = "6.x"
  
  # Maintenance and backup
  maintenance_window           = "sun:05:00-sun:09:00"
  snapshot_window             = "00:00-04:00"
  snapshot_retention_limit    = 7
  auto_minor_version_upgrade  = true
  
  # Security configuration
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                 = random_password.redis_auth_token.result
  
  # Notification configuration
  notification_topic_arn      = aws_sns_topic.redis_alerts.arn
  
  tags = {
    Name                = "crimeminer-redis-${var.environment}"
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High"
    DataClassification = "Sensitive"
    Backup             = "Required"
    Encryption         = "Required"
    CreatedBy          = "Terraform"
    Project            = "CrimeMiner"
  }
}

# Generate secure auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# SNS topic for Redis alerts
resource "aws_sns_topic" "redis_alerts" {
  name = "crimeminer-redis-alerts-${var.environment}"
  
  tags = {
    Name        = "crimeminer-redis-alerts-${var.environment}"
    Environment = var.environment
    CreatedBy   = "Terraform"
    Project     = "CrimeMiner"
  }
}

# CloudWatch alarms for Redis monitoring
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "crimeminer-redis-cpu-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Redis cluster CPU utilization"
  alarm_actions       = [aws_sns_topic.redis_alerts.arn]
  
  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.main.id
  }
}

# Outputs
output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_security_group_id" {
  description = "Redis security group ID"
  value       = aws_security_group.redis.id
}