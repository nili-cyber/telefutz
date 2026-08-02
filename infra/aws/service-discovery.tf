# docker-compose relies on Docker's built-in DNS - "http://auth-service:4001"
# just works because Compose names the container that. ECS has no built-in
# equivalent, so Cloud Map provides the same thing: each service registers
# under <name>.<namespace>, and the env vars below point at those instead of
# bare container names - everything else about how the services talk to each
# other is unchanged.
resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "${var.project_name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "services" {
  for_each = toset(local.service_names)
  name     = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}
