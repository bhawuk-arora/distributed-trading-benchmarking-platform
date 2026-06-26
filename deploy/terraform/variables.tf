variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix name for all resources in this deployment"
  type        = string
  default     = "trading-bench"
}

variable "eks_node_instance_type" {
  description = "EC2 instance type for EKS worker nodes"
  type        = string
  default     = "t3.medium"
}

variable "db_username" {
  description = "Master username for the PostgreSQL database"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Master password for the PostgreSQL database (must be at least 8 characters)"
  type        = string
  sensitive   = true
  default     = "SuperSecurePassword123!"
}

variable "db_name" {
  description = "Database name inside PostgreSQL"
  type        = string
  default     = "benchmark"
}
