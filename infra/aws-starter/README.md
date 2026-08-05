# AWS starter deployment (cheap/free path)

The full setup in `../aws` (ECS, RDS, ElastiCache, ALB, NAT gateway) is the
production-grade version, but genuinely cannot be free - Fargate, the ALB,
and the NAT gateway have no free tier at all. This is the alternative: one
EC2 instance running the exact same `docker-compose.yml` you already run
locally, with a GitHub Actions pipeline that deploys to it automatically -
close to free on a new AWS account.

## What you're trading away

- **No redundancy** - one instance, one point of failure.
- **No auto-scaling** - fixed capacity, whatever the instance size gives you.
- **No managed database backups** - Postgres and Redis are containers on
  this same instance, not RDS/ElastiCache.

That's a completely reasonable trade for getting something real online
cheaply while you're early. Move to `../aws` when any of the above starts
actually mattering.

## The pipeline: what happens automatically vs. what's a one-time step

**On demand, whenever you trigger it** (via `.github/workflows/deploy.yml`,
GitHub's Actions tab → "Deploy to AWS" → "Run workflow" - manual by default,
not on every push, so a half-finished commit can't accidentally deploy
itself): Docker images rebuild on the instance (one at a time - a small
instance genuinely runs out of memory building all six at once), containers
restart, the web app rebuilds fresh in GitHub's CI (not on the small
instance - no memory constraints there), and the new build gets copied
over. Want it to redeploy automatically on every push instead? Add a
`push: branches: [main]` trigger back under `on:` in the workflow file.

**One-time, per instance** (`terraform apply` + a few GitHub secrets):
Provisioning the instance itself. `user_data` fully configures a brand new
instance on first boot - Docker, permanent swap space, Caddy with automatic
HTTPS if you give it a domain, and the file permission Caddy needs to serve
your app's files. None of that needs a manual SSH session anymore; it used
to, and every one of those manual steps is now baked into `main.tf` because
it caused a real debugging session the first time around.

## Step 1: Apply the infrastructure

```bash
ssh-keygen -t ed25519 -C "telefutz-deploy"   # skip if you already have a key

cd infra/aws-starter
terraform init
terraform apply \
  -var="ssh_cidr=$(curl -s https://checkip.amazonaws.com)/32" \
  -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)" \
  -var="domain_name=yourdomain.com" \
  -var="route53_zone_id=YOUR_ZONE_ID"
```

The last two `-var` flags are optional:
- Omit `domain_name` entirely to skip HTTPS setup and just get plain HTTP
  on port 3000/8080 (you can add a domain later by re-applying with it set).
- Omit `route53_zone_id` if your domain isn't managed in Route 53, or if
  you'd rather point DNS at the instance yourself - `terraform output
  instance_public_ip` gives you the IP for a manual A record. Find your
  zone ID with `aws route53 list-hosted-zones` if you do want this
  automated.

Takes about a minute for the instance to launch; give it another minute or
two after that for `user_data` to finish installing everything before it's
actually ready.

## Step 2: Create the four databases (one-time per instance)

Same as before - Postgres needs `authdb`, `catalogdb`, `playbackdb`, and
`billingdb` created before the services can start cleanly:

```bash
ssh ubuntu@$(terraform output -raw instance_public_ip)
git clone https://github.com/YOUR_USERNAME/telefutz.git
cd telefutz
docker compose up -d postgres
docker compose exec postgres psql -U telefutz -d postgres -c \
  "CREATE DATABASE authdb; CREATE DATABASE catalogdb; CREATE DATABASE playbackdb; CREATE DATABASE billingdb;"
```

(This is simpler than the RDS path's version in `../aws/README.md` -
Postgres is a local container here, so no security-group juggling needed to
reach it.)

## Step 3: Set up the GitHub Actions secrets (one-time per instance)

In your repo on GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Add three:

| Secret | Value |
|---|---|
| `EC2_HOST` | `terraform output -raw instance_public_ip` (or your domain, once DNS has propagated) |
| `EC2_SSH_KEY` | The **private** key matching what you gave Terraform - `cat ~/.ssh/id_ed25519` (the one *without* `.pub`) |
| `WEB_API_URL` | `terraform output -raw site_url` - the URL the web app's API calls should point at |

## Step 4: Run the pipeline

**Actions tab → Deploy to AWS → Run workflow**. Watch it run - two jobs,
`deploy-backend` then `deploy-web`. When both go green, visit
`terraform output -raw site_url`.

From here on, redeploying is just re-running the workflow from the Actions
tab whenever you're ready - it won't fire on its own from a `git push`.

## Deploying to a brand new instance later

This is the part that used to be the most manual and is now mostly not:

```bash
cd infra/aws-starter
terraform apply -var="..." # same as Step 1 - creates a fresh, fully-configured instance
```

Then just update the `EC2_HOST` secret in GitHub (new instance = new IP,
unless you're using `route53_zone_id`, in which case DNS updates
automatically and `EC2_HOST` can just stay as your domain name). Run the
pipeline once manually (Actions tab → Run workflow) to get the first
deployment onto it, and Step 2's database creation still needs doing once
per instance. Everything else - Docker, swap, Caddy, HTTPS - the new
instance already has, from `user_data`.

## Troubleshooting / how it works under the hood

If you're debugging something the pipeline doesn't cover, or want to
understand what `user_data` actually automated:

- **Docker builds getting `Killed` mid-build**: memory - the pipeline
  already builds one service at a time for exactly this reason, and
  `user_data` sets up 2GB of permanent swap space as a safety net. If you're
  running `docker compose build` by hand and skip the one-at-a-time
  approach, you can still hit this.
- **A Prisma-using service (auth/catalog/playback/billing) crash-loops
  mentioning OpenSSL**: already fixed in each service's Dockerfile
  (`RUN apk add --no-cache openssl`) - `node:20-alpine` doesn't ship it by
  default and Prisma's engine needs it.
- **Caddy returns 403 for everything**: Caddy runs as its own system user
  and can't traverse into `/home/ubuntu` without `chmod o+x /home/ubuntu` -
  already applied by `user_data` on a fresh instance. If you're seeing this
  anyway, that fix may not have run (check `user_data` actually completed:
  `sudo cloud-init status`).
- **`git push` to the pipeline fails / SSH errors in the Actions log**:
  almost always `EC2_SSH_KEY` being the wrong key (public instead of
  private), or `EC2_HOST` being stale after replacing the instance - both
  are the first two things to check.
