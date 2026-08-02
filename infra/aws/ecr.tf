locals {
  service_names = [
    "api-gateway",
    "auth-service",
    "catalog-service",
    "recommendation-service",
    "playback-service",
    "billing-service",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each             = toset(local.service_names)
  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # convenient for a dev/scaffold account; drop this before real production use

  image_scanning_configuration {
    scan_on_push = true
  }
}
