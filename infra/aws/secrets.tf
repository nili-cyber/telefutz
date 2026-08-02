# One JSON secret holding everything sensitive - referenced by individual
# key from each task definition (ECS supports "secretArn:jsonKey::" syntax),
# rather than one Secrets Manager secret per value. Terraform fills in the
# database URLs itself (it already knows the RDS endpoint and generated
# password); the payment provider keys come from the sensitive variables in
# variables.tf, which default to the same harmless placeholders
# docker-compose.yml uses.
resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project_name}/app-secrets"
  recovery_window_in_days = 0 # allows immediate re-creation if you tear down and re-apply during setup
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET             = var.jwt_secret
    STRIPE_SECRET_KEY      = var.stripe_secret_key
    STRIPE_PRICE_ID        = var.stripe_price_id
    STRIPE_WEBHOOK_SECRET  = var.stripe_webhook_secret
    PAYPAL_CLIENT_ID       = var.paypal_client_id
    PAYPAL_CLIENT_SECRET   = var.paypal_client_secret
    PAYPAL_PLAN_ID         = var.paypal_plan_id
    PAYPAL_WEBHOOK_ID      = var.paypal_webhook_id
    AUTH_DATABASE_URL      = "postgresql://${var.project_name}:${random_password.db.result}@${aws_db_instance.main.address}:5432/authdb"
    CATALOG_DATABASE_URL   = "postgresql://${var.project_name}:${random_password.db.result}@${aws_db_instance.main.address}:5432/catalogdb"
    PLAYBACK_DATABASE_URL  = "postgresql://${var.project_name}:${random_password.db.result}@${aws_db_instance.main.address}:5432/playbackdb"
    BILLING_DATABASE_URL   = "postgresql://${var.project_name}:${random_password.db.result}@${aws_db_instance.main.address}:5432/billingdb"
  })
}
