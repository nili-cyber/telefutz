output "alb_dns_name" {
  description = "Point your app's EXPO_PUBLIC_API_URL / the web app's API base at this"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_urls" {
  description = "Push each service's image here - used by scripts/build-and-push.sh"
  value       = { for name, repo in aws_ecr_repository.services : name => repo.repository_url }
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "rds_security_group_id" {
  description = "Used for the one-time step of temporarily opening RDS to your IP to create the four databases - see infra/aws/README.md"
  value       = aws_security_group.rds.id
}

output "db_master_password" {
  value     = random_password.db.result
  sensitive = true
}

output "redis_endpoint" {
  value = local.redis_endpoint
}

output "secrets_manager_secret_arn" {
  description = "Where JWT/Stripe/PayPal secrets live - update values here (or via terraform.tfvars + re-apply) rather than editing task definitions directly"
  value       = aws_secretsmanager_secret.app.arn
}

output "web_bucket_name" {
  description = "Sync `apps/app`'s web export here - used by scripts/deploy-web.sh"
  value       = aws_s3_bucket.web.id
}

output "web_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "aws_region" {
  value = var.aws_region
}

output "project_name" {
  value = var.project_name
}
