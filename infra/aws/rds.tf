resource "random_password" "db" {
  length  = 24
  special = false # simplifies embedding it in a connection-string URL cleanly
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
}

# One Postgres instance, four logical databases (created manually post-apply
# - see infra/aws/README.md) - mirrors the database-per-service pattern from
# docker-compose.yml exactly, just on managed infrastructure instead of a
# container.
resource "aws_db_instance" "main" {
  identifier             = "${var.project_name}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  storage_type           = "gp3"
  db_name                = "postgres"
  username               = var.project_name
  password               = random_password.db.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false
  backup_retention_period = 7
  tags = { Name = "${var.project_name}-db" }
}
