variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Used as a prefix on every resource name and in the Cloud Map namespace"
  type        = string
  default     = "telefutz"
}

variable "environment" {
  description = "e.g. production, staging"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance size. db.t4g.micro is Free Tier eligible for the first 12 months."
  type        = string
  default     = "db.t4g.micro"
}

variable "redis_node_type" {
  description = "ElastiCache node size. cache.t4g.micro is the cheapest option."
  type        = string
  default     = "cache.t4g.micro"
}

# --- Application secrets -----------------------------------------------
# Every one of these has a working placeholder default so `terraform apply`
# succeeds out of the box - exactly like docker-compose.yml's
# "sk_test_replace_me" style placeholders. Override real values via
# terraform.tfvars (see terraform.tfvars.example) or TF_VAR_ environment
# variables - never commit real secrets into a .tf file.

variable "jwt_secret" {
  type      = string
  default   = "dev-secret-change-me"
  sensitive = true
}

variable "stripe_secret_key" {
  type      = string
  default   = "sk_test_replace_me"
  sensitive = true
}

variable "stripe_price_id" {
  type      = string
  default   = "price_replace_me"
  sensitive = true
}

variable "stripe_webhook_secret" {
  type      = string
  default   = "whsec_replace_me"
  sensitive = true
}

variable "paypal_client_id" {
  type      = string
  default   = "replace_me"
  sensitive = true
}

variable "paypal_client_secret" {
  type      = string
  default   = "replace_me"
  sensitive = true
}

variable "paypal_api_base" {
  type    = string
  default = "https://api-m.sandbox.paypal.com"
}

variable "paypal_plan_id" {
  type      = string
  default   = "replace_me"
  sensitive = true
}

variable "paypal_webhook_id" {
  type      = string
  default   = "replace_me"
  sensitive = true
}
