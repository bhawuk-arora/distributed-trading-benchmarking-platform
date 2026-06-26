output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "The endpoint for your EKS Kubernetes API server"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster control plane"
  value       = module.eks.cluster_security_group_id
}

output "rds_endpoint" {
  description = "The endpoint of the RDS PostgreSQL instance"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "The hostname address of the RDS PostgreSQL instance"
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "The endpoint of the ElastiCache Redis cluster"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

# -------------------------------------------------------------
# AWS ECR Repositories Outputs
# -------------------------------------------------------------
output "ecr_repository_matching_engine" {
  description = "ECR Repository URL for Matching Engine"
  value       = aws_ecr_repository.matching_engine.repository_url
}

output "ecr_repository_leaderboard_service" {
  description = "ECR Repository URL for Leaderboard Service"
  value       = aws_ecr_repository.leaderboard_service.repository_url
}

output "ecr_repository_submission_service" {
  description = "ECR Repository URL for Submission Service"
  value       = aws_ecr_repository.submission_service.repository_url
}

output "ecr_repository_load_generator" {
  description = "ECR Repository URL for Load Generator"
  value       = aws_ecr_repository.load_generator.repository_url
}

output "ecr_repository_telemetry_aggregator" {
  description = "ECR Repository URL for Telemetry Aggregator"
  value       = aws_ecr_repository.telemetry_aggregator.repository_url
}
