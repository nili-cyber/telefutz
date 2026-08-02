#!/usr/bin/env bash
# Builds apps/app for web and syncs it to the S3 bucket CloudFront serves,
# then invalidates the CloudFront cache so the new build shows up
# immediately instead of after the default cache TTL.
set -euo pipefail

cd "$(dirname "$0")/.."

BUCKET=$(cd infra/aws && terraform output -raw web_bucket_name)
DISTRIBUTION_DOMAIN=$(cd infra/aws && terraform output -raw web_url)

echo "Building web export..."
(cd apps/app && npm run build:web)

echo "Syncing to s3://${BUCKET}..."
aws s3 sync apps/app/dist "s3://${BUCKET}" --delete

DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(DomainName, '$(echo "$DISTRIBUTION_DOMAIN" | sed 's|https://||')')].Id" \
  --output text)

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/*" > /dev/null

echo "Live at: ${DISTRIBUTION_DOMAIN}"
