#!/usr/bin/env bash
# Builds and pushes every service's image to its ECR repo, then forces a
# fresh deployment so ECS actually picks up the new ":latest" tag (ECS
# doesn't auto-redeploy just because you overwrote the tag).
#
# Prerequisites: `terraform apply` already run in infra/aws, AWS CLI
# configured, Docker running.
set -euo pipefail

cd "$(dirname "$0")/.."

AWS_REGION=$(cd infra/aws && terraform output -raw aws_region)
PROJECT_NAME=$(cd infra/aws && terraform output -raw project_name)
ECR_REPOS_JSON=$(cd infra/aws && terraform output -json ecr_repository_urls)

REGISTRY_HOST=$(python3 -c "import json; d=json.loads('''${ECR_REPOS_JSON}'''); print(list(d.values())[0].split('/')[0])")
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${REGISTRY_HOST}"

SERVICES=(api-gateway auth-service catalog-service recommendation-service playback-service billing-service)

for service in "${SERVICES[@]}"; do
  repo_url=$(python3 -c "import json; d=json.loads('''${ECR_REPOS_JSON}'''); print(d['${service}'])")
  echo "Building ${service}..."
  # --platform linux/amd64: Fargate's default runtime is x86_64, but Docker
  # on an Apple Silicon Mac (M1/M2/M3/M4) builds arm64 images by default.
  # Without this, the image builds and pushes fine but every task crash-loops
  # on ECS with "exec format error." Harmless to include on an Intel Mac too.
  docker build --platform linux/amd64 -t "${repo_url}:latest" "./services/${service}"
  echo "Pushing ${service}..."
  docker push "${repo_url}:latest"
  echo "Redeploying ${service} on ECS..."
  aws ecs update-service \
    --cluster "${PROJECT_NAME}-cluster" \
    --service "${PROJECT_NAME}-${service}" \
    --force-new-deployment \
    --region "${AWS_REGION}" > /dev/null
done

echo "Done. Check rollout status with: aws ecs describe-services --cluster ${PROJECT_NAME}-cluster --services ${PROJECT_NAME}-api-gateway --region ${AWS_REGION}"
