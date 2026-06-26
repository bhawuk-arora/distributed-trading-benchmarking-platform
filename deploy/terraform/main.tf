terraform {
  required_version = ">= 1.3.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# -------------------------------------------------------------
# Data Sources
# -------------------------------------------------------------
data "aws_availability_zones" "available" {
  state = "available"
}

# -------------------------------------------------------------
# VPC - Minimal Setup with Single NAT Gateway to minimize cost
# -------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true # Save NAT Gateway hourly charges

  public_subnet_tags = {
    "kubernetes.io/role/elb"                                = "1"
    "kubernetes.io/cluster/${var.project_name}-cluster"     = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"                       = "1"
    "kubernetes.io/cluster/${var.project_name}-cluster"     = "shared"
  }
}

# -------------------------------------------------------------
# EKS Cluster - Minimal t3.medium EKS Managed Node Group
# -------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${var.project_name}-cluster"
  cluster_version = "1.30"

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  eks_managed_node_groups = {
    default = {
      min_size     = 2
      max_size     = 3
      desired_size = 2

      instance_types = [var.eks_node_instance_type]
      capacity_type  = "ON_DEMAND"
    }
  }

  # Enable cluster creator admin permissions automatically
  enable_cluster_creator_admin_permissions = true
}

# -------------------------------------------------------------
# Security Groups for Database Tier
# -------------------------------------------------------------
resource "aws_security_group" "db_sg" {
  name        = "${var.project_name}-db-sg"
  description = "Allow EKS nodes to communicate with RDS and Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Allow PostgreSQL access from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  ingress {
    description     = "Allow Redis access from EKS nodes"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.project_name}-db-sg"
  }
}

# -------------------------------------------------------------
# RDS PostgreSQL - Minimal t4g.micro Single-AZ Instance
# -------------------------------------------------------------
resource "aws_db_subnet_group" "rds" {
  name       = "${var.project_name}-rds-subnet-group"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier           = "${var.project_name}-postgres"
  allocated_storage    = 20
  max_allocated_storage = 50
  db_name              = var.db_name
  engine               = "postgres"
  engine_version       = "15.7"
  instance_class       = "db.t4g.micro" # Cheapest Graviton2 instance
  username             = var.db_username
  password             = var.db_password
  db_subnet_group_name = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  skip_final_snapshot  = true
  publicly_accessible  = false
  multi_az             = false # Disable multi-AZ to keep it cheap
  storage_type         = "gp3"

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

# -------------------------------------------------------------
# ElastiCache Redis - Minimal t4g.micro Single-Node Cache
# -------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project_name}-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro" # Cheapest Graviton2 node
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.db_sg.id]

  tags = {
    Name = "${var.project_name}-redis"
  }
}
