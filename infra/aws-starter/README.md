# AWS starter deployment (cheap/free path)

The full setup in `../aws` (ECS, RDS, ElastiCache, ALB, NAT gateway) is the
production-grade version, but genuinely cannot be free - Fargate, the ALB,
and the NAT gateway have no free tier at all. This is the alternative: one
EC2 instance running the exact same `docker-compose.yml` you already run
locally. Same containers, same architecture, just on one box instead of
spread across managed AWS services.

## What you're trading away

- **No redundancy** - one instance, one point of failure. If it goes down,
  everything's down until you fix it.
- **No auto-scaling** - fixed capacity, whatever the instance size gives you.
- **Manual deploys** - `git pull && docker compose up -d --build` over SSH,
  not `git push` triggering anything automatically.
- **No managed database backups** - Postgres and Redis are containers on
  this same instance, not RDS/ElastiCache, so there's no automated backup
  unless you set one up yourself.

That's a completely reasonable trade for getting something real online
cheaply while you're early. Move to `../aws` when any of the above starts
actually mattering.

## Cost

With a **new** AWS account (first 12 months): close to $0 - `t3.micro`
(750 free hours/month) and the 30GB EBS volume (30GB free tier) are both
covered. After 12 months, or on an existing account: roughly **$8-10/month**
for the instance plus a couple dollars for storage.

One honest caveat on `t3.micro`: it only has 1GB of RAM, and running
Postgres + Redis + all 6 Node services at once is genuinely tight,
especially while `npm install` runs inside each container on first build.
If containers start getting OOM-killed, resize to `t3.small` (2GB RAM,
~$15/month, not free) - see the resize note at the bottom.

## Steps

### 1. Generate an SSH key if you don't already have one

```bash
ssh-keygen -t ed25519 -C "telefutz-deploy"
cat ~/.ssh/id_ed25519.pub
```

### 2. Apply

```bash
cd infra/aws-starter
terraform init
terraform apply \
  -var="ssh_cidr=$(curl -s https://checkip.amazonaws.com)/32" \
  -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)"
```

Takes about a minute - this is a single instance, not a VPC full of managed
services.

### 3. SSH in and get the code onto the instance

```bash
ssh ubuntu@$(terraform output -raw instance_public_ip)
```
Docker's already installed (via the instance's startup script) - check with
`docker --version`. If it's not there yet, the startup script is still
running; wait 30 seconds and try again.

From inside that SSH session:
```bash
git clone https://github.com/nili-cyber/telefutz.git
cd telefutz
```

### 4. Fill in real secrets (optional for now)

`docker-compose.yml` ships with the same placeholder values
(`sk_test_replace_me`, etc.) as always - edit it directly on the instance
if you have real Stripe/PayPal credentials ready, or leave the placeholders
and come back to this later. Same file, same env vars documented in
`services/README.md`.

### 5. Bring it up

```bash
docker compose up -d --build
```

First build takes a few minutes (installing dependencies inside each
container). `infra/init-db.sql` runs automatically on Postgres's first
boot, same as locally - no manual database-creation step needed here,
unlike the RDS path in `../aws`.

### 6. Check it's actually up

From your own machine (not the SSH session):
```bash
curl http://$(terraform output -raw instance_public_ip):8080/health
```

### 7. Point the app at it

Set `EXPO_PUBLIC_API_URL` (in `apps/app/.env`, or wherever you're building
from) to `terraform output -raw gateway_url`.

## Redeploying after a code change

```bash
ssh ubuntu@$(terraform output -raw instance_public_ip)
cd telefutz && git pull && docker compose up -d --build
```

## Resizing to `t3.small` if `t3.micro` runs out of memory

```bash
terraform apply -var="instance_type=t3.small" -var="ssh_cidr=..." -var="ssh_public_key=..."
```
This replaces the instance, so you'll need to redo step 3 onward
afterward - your Elastic IP stays the same, but the instance itself (and
anything on its disk) doesn't survive a resize.

## This is HTTP, not HTTPS

Same caveat as the ECS path - no TLS here either. Fine for testing, not
for real users entering card details. A domain + a reverse proxy like Caddy
or nginx with Let's Encrypt (both trivial to add to this instance) is the
next step once you're ready for real traffic - ask if you want help setting
that up.
