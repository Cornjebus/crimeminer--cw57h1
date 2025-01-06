# Provider configuration for AWS
# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Main VPC resource
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  enable_dns_security  = true
  instance_tenancy     = "dedicated"

  tags = {
    Name                = "crimeminer-vpc-${var.environment}"
    Environment         = var.environment
    SecurityCompliance  = "FedRAMP-High"
    CJIS-Compliance    = "true"
    DataClassification = "Sensitive"
    CreatedBy          = "Terraform"
    Project            = "CrimeMiner"
  }
}

# Public subnets for DMZ components
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                = "crimeminer-public-${count.index + 1}"
    Environment         = var.environment
    Tier               = "DMZ"
    SecurityZone       = "Public"
    AutoScaling        = "true"
    CJIS-Compliance    = "true"
    DataClassification = "Public"
  }
}

# Private subnets for application components
resource "aws_subnet" "private_app" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name                = "crimeminer-private-app-${count.index + 1}"
    Environment         = var.environment
    Tier               = "Application"
    SecurityZone       = "Private"
    AutoScaling        = "true"
    CJIS-Compliance    = "true"
    DataClassification = "Sensitive"
  }
}

# Private subnets for data components
resource "aws_subnet" "private_data" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 2 * length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name                = "crimeminer-private-data-${count.index + 1}"
    Environment         = var.environment
    Tier               = "Data"
    SecurityZone       = "HighSecurity"
    AutoScaling        = "true"
    CJIS-Compliance    = "true"
    DataClassification = "HighlySensitive"
  }
}

# Internet Gateway for public subnets
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name         = "crimeminer-igw-${var.environment}"
    Environment  = var.environment
    CreatedBy    = "Terraform"
    Project      = "CrimeMiner"
  }
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"

  tags = {
    Name         = "crimeminer-nat-eip-${count.index + 1}"
    Environment  = var.environment
    CreatedBy    = "Terraform"
  }
}

# NAT Gateways for private subnets
resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name         = "crimeminer-nat-${count.index + 1}"
    Environment  = var.environment
    CreatedBy    = "Terraform"
  }

  depends_on = [aws_internet_gateway.main]
}

# Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name         = "crimeminer-public-rt"
    Environment  = var.environment
    Tier         = "Public"
    CreatedBy    = "Terraform"
  }
}

# Route tables for private application subnets
resource "aws_route_table" "private_app" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = {
    Name         = "crimeminer-private-app-rt-${count.index + 1}"
    Environment  = var.environment
    Tier         = "Application"
    CreatedBy    = "Terraform"
  }
}

# Route tables for private data subnets
resource "aws_route_table" "private_data" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = {
    Name         = "crimeminer-private-data-rt-${count.index + 1}"
    Environment  = var.environment
    Tier         = "Data"
    CreatedBy    = "Terraform"
  }
}

# Route table associations for public subnets
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route table associations for private application subnets
resource "aws_route_table_association" "private_app" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

# Route table associations for private data subnets
resource "aws_route_table_association" "private_data" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private_data[count.index].id
  route_table_id = aws_route_table.private_data[count.index].id
}

# Outputs
output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "IDs of private application subnets"
  value       = aws_subnet.private_app[*].id
}

output "private_data_subnet_ids" {
  description = "IDs of private data subnets"
  value       = aws_subnet.private_data[*].id
}