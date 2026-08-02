resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

resource "aws_cloudwatch_log_group" "services" {
  for_each          = toset(local.service_names)
  name              = "/ecs/${var.project_name}/${each.key}"
  retention_in_days = 14
}

# --- IAM ------------------------------------------------------------------
# Execution role: what Fargate itself uses to pull the image and write logs.
# Task role: what your application code could use to call other AWS APIs -
# empty here since none of these services call AWS APIs directly today, but
# defined so it's easy to attach a policy later (e.g. once playback-service
# talks to S3 for real video storage).

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.project_name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The managed policy above covers ECR/logs but not Secrets Manager - add
# that explicitly so the execution role can resolve the "secrets" block in
# each task definition below.
data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "${var.project_name}-read-app-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${var.project_name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# --- Per-service environment/secrets --------------------------------------
# Same values docker-compose.yml sets per service, translated to ECS's
# {name, value} / {name, valueFrom} shape. Internal URLs use the Cloud Map
# namespace instead of bare container names - that's the only structural
# difference from the docker-compose version.

locals {
  internal = aws_service_discovery_private_dns_namespace.internal.name
  redis_endpoint = "${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.cache_nodes[0].port}"
  secret_arn = aws_secretsmanager_secret.app.arn

  service_ports = {
    api-gateway             = 8080
    auth-service             = 4001
    catalog-service           = 4002
    recommendation-service     = 4003
    playback-service            = 4004
    billing-service               = 4005
  }

  service_env = {
    api-gateway = [
      { name = "PORT", value = "8080" },
      { name = "AUTH_SERVICE_URL", value = "http://auth-service.${local.internal}:4001" },
      { name = "CATALOG_SERVICE_URL", value = "http://catalog-service.${local.internal}:4002" },
      { name = "RECOMMENDATION_SERVICE_URL", value = "http://recommendation-service.${local.internal}:4003" },
      { name = "PLAYBACK_SERVICE_URL", value = "http://playback-service.${local.internal}:4004" },
      { name = "BILLING_SERVICE_URL", value = "http://billing-service.${local.internal}:4005" },
    ]
    auth-service = [
      { name = "PORT", value = "4001" },
    ]
    catalog-service = [
      { name = "PORT", value = "4002" },
      { name = "REDIS_URL", value = "redis://${local.redis_endpoint}" },
    ]
    recommendation-service = [
      { name = "PORT", value = "4003" },
      { name = "REDIS_URL", value = "redis://${local.redis_endpoint}" },
      { name = "CATALOG_SERVICE_URL", value = "http://catalog-service.${local.internal}:4002" },
    ]
    playback-service = [
      { name = "PORT", value = "4004" },
      { name = "REDIS_URL", value = "redis://${local.redis_endpoint}" },
    ]
    billing-service = [
      { name = "PORT", value = "4005" },
      { name = "PAYPAL_API_BASE", value = var.paypal_api_base },
    ]
  }

  service_secrets = {
    api-gateway             = [{ name = "JWT_SECRET", valueFrom = "${local.secret_arn}:JWT_SECRET::" }]
    auth-service = [
      { name = "JWT_SECRET", valueFrom = "${local.secret_arn}:JWT_SECRET::" },
      { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:AUTH_DATABASE_URL::" },
    ]
    catalog-service = [
      { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:CATALOG_DATABASE_URL::" },
    ]
    recommendation-service = []
    playback-service = [
      { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:PLAYBACK_DATABASE_URL::" },
    ]
    billing-service = [
      { name = "DATABASE_URL", valueFrom = "${local.secret_arn}:BILLING_DATABASE_URL::" },
      { name = "STRIPE_SECRET_KEY", valueFrom = "${local.secret_arn}:STRIPE_SECRET_KEY::" },
      { name = "STRIPE_PRICE_ID", valueFrom = "${local.secret_arn}:STRIPE_PRICE_ID::" },
      { name = "STRIPE_WEBHOOK_SECRET", valueFrom = "${local.secret_arn}:STRIPE_WEBHOOK_SECRET::" },
      { name = "PAYPAL_CLIENT_ID", valueFrom = "${local.secret_arn}:PAYPAL_CLIENT_ID::" },
      { name = "PAYPAL_CLIENT_SECRET", valueFrom = "${local.secret_arn}:PAYPAL_CLIENT_SECRET::" },
      { name = "PAYPAL_PLAN_ID", valueFrom = "${local.secret_arn}:PAYPAL_PLAN_ID::" },
      { name = "PAYPAL_WEBHOOK_ID", valueFrom = "${local.secret_arn}:PAYPAL_WEBHOOK_ID::" },
    ]
  }
}

resource "aws_ecs_task_definition" "services" {
  for_each                 = toset(local.service_names)
  family                   = "${var.project_name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${aws_ecr_repository.services[each.key].repository_url}:latest"
      essential = true
      portMappings = [{ containerPort = local.service_ports[each.key], protocol = "tcp" }]
      environment = local.service_env[each.key]
      secrets     = local.service_secrets[each.key]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services[each.key].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = each.key
        }
      }
    }
  ])
}

resource "aws_ecs_service" "services" {
  for_each        = toset(local.service_names)
  name            = "${var.project_name}-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.services[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services[each.key].arn
  }

  # Only api-gateway is reachable from outside the VPC - everything else is
  # found via Cloud Map (service_registries above) and never touches the ALB.
  dynamic "load_balancer" {
    for_each = each.key == "api-gateway" ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.gateway.arn
      container_name    = "api-gateway"
      container_port    = 8080
    }
  }

  depends_on = [aws_lb_listener.http]
}
