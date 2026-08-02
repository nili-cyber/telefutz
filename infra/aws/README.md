# Deploying to AWS

This is real, applyable Terraform - not a mockup - but it can't be run from
inside this conversation (no AWS credentials or network access here). You
run it yourself, from your own machine, with your own AWS account.

## What this creates

Everything from the architecture diagrams earlier in this conversation:

- A VPC with public subnets (for the load balancer) and private subnets
  (for everything else), across 2 availability zones, with a NAT gateway
  so private-subnet tasks can reach the internet (ECR, Stripe, PayPal)
- ECR repositories for all 6 services
- ECS Fargate services for all 6, on Cloud Map service discovery so they
  can find each other the same way they do via Docker's DNS in
  `docker-compose.yml` - just with `service-name.telefutz.internal` instead of
  `service-name`
- RDS Postgres (one instance, four logical databases - same
  database-per-service pattern as local dev)
- ElastiCache Redis
- An Application Load Balancer in front of `api-gateway` only - every other
  service is reachable exclusively through Cloud Map, never directly from
  the internet
- Secrets Manager holding JWT/Stripe/PayPal secrets and the generated DB
  password
- S3 + CloudFront for `apps/app`'s web build

## Prerequisites

- An AWS account and the AWS CLI, configured with credentials that can
  create the resources above
- Terraform >= 1.5
- Docker Desktop, for building and pushing the service images
- Python 3 (used by `scripts/build-and-push.sh` to parse Terraform's JSON
  output)

### On a Mac

The easiest path is [Homebrew](https://brew.sh):

```bash
brew install awscli terraform
aws configure   # paste in your AWS access key, secret key, and default region
```

Docker Desktop isn't available via a simple `brew install` formula in a way
that's reliably up to date - grab it directly from
[docker.com](https://www.docker.com/products/docker-desktop/), install it,
and make sure it's actually running (the whale icon in the menu bar) before
you build anything. Python 3 already ships with macOS, so nothing to
install there.

**If your Mac has Apple Silicon (M1/M2/M3/M4 - true of most MacBook Pros
since late 2020):** `scripts/build-and-push.sh` already builds with
`--platform linux/amd64` for exactly this reason - Fargate runs x86_64 by
default, but Docker on an ARM Mac builds arm64 images unless told
otherwise. Without that flag, the image builds and pushes without any
error, and then every task crash-loops on ECS with `exec format error` -
confusing to debug if you don't know to look for it. Nothing you need to do
here, just worth knowing why that flag is there if you ever touch the
script.

## Cost warning

None of this is free-tier-only. **If you want something closer to free,
see `../aws-starter` instead** - a single EC2 instance running the same
`docker-compose.yml`, no ECS/RDS/ElastiCache/ALB/NAT gateway involved.
Roughly, running this (the ECS setup) continuously: NAT gateway
(~$32/mo + data), RDS `db.t4g.micro` (~$12/mo), ElastiCache
`cache.t4g.micro` (~$12/mo), 6 Fargate tasks at the smallest size (~$30-40/mo
total), ALB (~$16/mo + data). Call it **$100-130/month** baseline before any
real traffic. `terraform destroy` when you're done experimenting.

## Steps

### 1. Apply the infrastructure

```bash
cd infra/aws
terraform init
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with real values, or leave placeholders for now
# and come back to this after you have real Stripe/PayPal credentials
terraform plan   # review what it's about to create
terraform apply
```

This takes 10-15 minutes, mostly waiting on RDS and the NAT gateway.

### 2. Create the four databases

Terraform provisions the RDS *instance*, but not the individual databases -
same as locally, where `infra/init-db.sql` handles that via
docker-compose's Postgres init hook, which has no equivalent on RDS. From a
machine that can reach the VPC (see note below):

```bash
psql "postgresql://telefutz:$(terraform output -raw db_master_password)@$(terraform output -raw db_endpoint):5432/postgres" \
  -c "CREATE DATABASE authdb; CREATE DATABASE catalogdb; CREATE DATABASE playbackdb; CREATE DATABASE billingdb;"
```

RDS sits in a private subnet, so this won't reach it directly from your
Mac. The simplest one-time path, no extra EC2 instance needed: temporarily
open the RDS security group to your current IP, run the command, then close
it again.

```bash
brew install libpq && brew link --force libpq   # gives you the `psql` command

# find your current public IP and the RDS security group ID
MY_IP=$(curl -s https://checkip.amazonaws.com)
SG_ID=$(cd infra/aws && terraform output -raw rds_security_group_id)

# open it just to you, temporarily
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 5432 --cidr "${MY_IP}/32"

psql "postgresql://telefutz:$(cd infra/aws && terraform output -raw db_master_password)@$(cd infra/aws && terraform output -raw db_endpoint):5432/postgres" \
  -c "CREATE DATABASE authdb; CREATE DATABASE catalogdb; CREATE DATABASE playbackdb; CREATE DATABASE billingdb;"

# close it back up - don't leave this open
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 5432 --cidr "${MY_IP}/32"
```

### 3. Build and push the images, deploy the web app

```bash
./scripts/build-and-push.sh   # builds all 6 services, pushes to ECR, redeploys on ECS
./scripts/deploy-web.sh       # builds apps/app for web, syncs to S3, invalidates CloudFront
```

### 4. Point the mobile app and web app at the real backend

```bash
cd infra/aws && terraform output -raw alb_dns_name
```

Use `http://<that value>` as `EXPO_PUBLIC_API_URL` in `apps/app` going
forward (both for local dev against the real backend, and baked into any
future EAS mobile builds).

### 5. Register the real Stripe and PayPal webhooks

Both were pointed at `localhost` during local development. Now that there's
a real public URL:

- **Stripe**: dashboard → Developers → Webhooks → Add endpoint →
  `http://<alb-dns-name>/api/billing/stripe/webhook`
- **PayPal**: developer dashboard → your app → Add Webhook →
  `http://<alb-dns-name>/api/billing/paypal/webhook`

If you changed `terraform.tfvars` after the first apply (new webhook
secrets, etc.), run `terraform apply` again - it updates the Secrets
Manager entry and you just need `aws ecs update-service --force-new-deployment`
on the affected service to pick up the change (or re-run
`build-and-push.sh`, which does that for everything).

## Making it production-grade

This is deliberately the *minimum* to be real and working, not the ceiling.
Natural next steps, roughly in priority order:

1. **HTTPS.** Get a domain, request a cert in ACM, add a 443 listener to
   the ALB, and do the same for the CloudFront distribution. Everything
   right now is plain HTTP.
2. **A second NAT gateway** in the other AZ, so a single-AZ outage doesn't
   take down every private-subnet task's internet access.
3. **CI/CD** - wire `scripts/build-and-push.sh`'s logic into a GitHub
   Actions workflow that runs on push to `main`, instead of running it by
   hand.
4. **Autoscaling** on the ECS services (currently fixed at `desired_count = 1`
   each) and Multi-AZ on RDS (currently single-AZ).
5. Real video storage - none of this touches the S3-for-video / CDN piece
   from the earlier architecture diagram, since `playback-service` is still
   returning a placeholder manifest URL. That's the next big infrastructure
   addition once real video is ready to go in.
