# Backend services

Run everything from the **repo root** (`telefutz/`), not from inside this
folder — `docker-compose.yml` lives one level up:

```bash
npm run backend:up
# same as: docker compose up --build
```

The catalog service auto-seeds five sample titles on first boot so
`apps/app`'s homepage isn't empty. `apps/app` (Expo Router, in `../apps/app`)
is the frontend for all of this - web, iOS, and Android from one codebase -
see its own README for how to run it.

## Services

| Service | Port | Responsibility |
|---|---|---|
| `api-gateway` | 8080 | Single entry point, JWT verification, routing to everything below |
| `auth-service` | 4001 | Signup/login/logout/password-reset, issues JWTs (own `authdb`) |
| `catalog-service` | 4002 | Titles, search, browse rows (own `catalogdb` + Redis cache) |
| `recommendation-service` | 4003 | Personalized rows (stub ranking, reads catalog + Redis) |
| `playback-service` | 4004 | Signed manifest URLs, watch progress (own `playbackdb` + Redis) |
| `billing-service` | 4005 | Subscription status, Stripe + PayPal checkout (own `billingdb`) |
| `postgres` / `redis` | 5432 / 6379 | Shared infra containers |

Each Postgres-backed service owns its own database (database-per-service
pattern) and syncs its Prisma schema with `prisma db push` on container
start - there's no formal migration history yet, which is fine for this
stage but worth switching to `prisma migrate` once this has real users.

## Catalog (`catalog-service`, reachable via `/api/catalog/*` through the gateway)

| Route | Auth | Notes |
|---|---|---|
| `GET /titles` | **public** | Optional `?genre=` query param for category browsing |
| `GET /titles/free` | **public** | Only titles with `isFree: true` - what the landing page's "Free Movies" tab reads from |
| `GET /titles/search` | **public** | `?q=` |
| `GET /titles/:id` | **public** | |
| `GET /genres` | **public** | Distinct genres currently in the catalog - what the app's genre chips render from |
| `POST /titles` | **admin only** | Enforced by `api-gateway`'s `requireAdmin`, not by this service - a request that skips the gateway never reaches here with permission. Accepts an `isFree` boolean (default `false`). |
| `PUT /titles/:id` | **admin only** | Same enforcement |
| `DELETE /titles/:id` | **admin only** | Same enforcement |

Reads are genuinely public - no token required - because the app's public
landing page (`apps/app/app/index.tsx`, before login) shows the catalog to
anyone. Writes stay admin-gated regardless.

Watching a free title works without an account too:
`GET /api/playback/free/:titleId/manifest-url` (through the gateway, public,
no JWT) - `playback-service` itself verifies the title is actually marked
`isFree` by asking `catalog-service` before returning a manifest URL, so
this route can't be used to bypass the paywall on a paid title just by
knowing its ID.

### Making a user an admin

There's no self-service way to become an admin, on purpose. `User.role`
defaults to `"user"` for everyone, including signups made through the app's
own admin screen's write endpoints (which check for admin *before* anything
gets created, so a non-admin can't grant themselves the role). Promote
someone by hand:

```sql
UPDATE "User" SET role = 'admin' WHERE email = 'you@example.com';
```

Run that against the `authdb` database (`docker exec -it <postgres container> psql -U telefutz -d authdb`).
They'll see the role on their *next* login/token refresh - existing tokens
already in circulation carry whatever role was true when they signed in.

## Billing (`billing-service`, reachable via `/api/billing/*` through the gateway)

**The paywall itself lives in the API gateway, not in this service or the
client apps.** `api-gateway`'s `requireSubscription` middleware calls this
service's `/status` before ever proxying a request to `playback-service`.
An unpaid user's request to `/api/playback/*` gets rejected with `402
Payment Required` at the edge - `playback-service` never even sees it. That's
what makes "only paid users can access movies" actually enforced rather than
just a UI check that a raw API call could skip past.

| Route | Body | Notes |
|---|---|---|
| `GET /status` | — | Trusts `x-user-id` like the other services. Returns `{ active, status, provider, currentPeriodEnd }`. |
| `POST /stripe/create-checkout-session` | `successUrl, cancelUrl` | Returns a Stripe-hosted Checkout URL. One flow covers card, Apple Pay, *and* Google Pay - Stripe shows whichever the visiting device/browser supports, no separate integration needed for each. |
| `POST /stripe/webhook` | (raw, signed by Stripe) | Activates/updates the subscription on `checkout.session.completed` and `customer.subscription.updated/deleted`. Must receive the *raw* request body - see the ordering comment in `billing-service/src/index.ts` if you're touching this. |
| `POST /paypal/create-subscription` | `returnUrl, cancelUrl` | Creates a real, auto-renewing PayPal subscription against `PAYPAL_PLAN_ID` (see setup below) and returns an approval link. |
| `POST /paypal/confirm-subscription` | `subscriptionId` | Fast-path confirmation called right after the user is redirected back from PayPal's approval page - the webhook is still the real source of truth for renewals afterward. |
| `POST /paypal/webhook` | (signed by PayPal) | Handles `BILLING.SUBSCRIPTION.ACTIVATED`, renewal payments (`PAYMENT.SALE.COMPLETED`), and cancellation/suspension/failure events - this is what keeps the subscription's status current between checkouts, exactly the role Stripe's webhook plays. |

### Setting this up for real

None of the four payment methods work out of the box - `docker-compose.yml`
ships with obvious placeholder values (`sk_test_replace_me`, etc.). To make
checkout genuinely work:

1. **Stripe** (covers card + Apple Pay + Google Pay): create a
   [Stripe account](https://dashboard.stripe.com/register), grab your test
   **secret key**, create a recurring **Price** for your plan and use its ID
   as `STRIPE_PRICE_ID`. For webhooks locally, install the
   [Stripe CLI](https://docs.stripe.com/stripe-cli) and run
   `stripe listen --forward-to localhost:8080/api/billing/stripe/webhook` -
   it prints a webhook signing secret, use that as `STRIPE_WEBHOOK_SECRET`.
   Apple Pay specifically needs one extra step before it'll show up in
   production: verify your domain in the Stripe dashboard under
   Settings → Payment methods → Apple Pay. Google Pay needs no extra setup.
2. **PayPal**: create an app at
   [developer.paypal.com](https://developer.paypal.com/dashboard/applications)
   to get a sandbox `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`. Recurring
   billing needs a **Product** and a **Billing Plan** created once ahead of
   time (there's no per-checkout equivalent - same idea as Stripe's Price):
   ```bash
   # 1) get an access token
   curl -s https://api-m.sandbox.paypal.com/v1/oauth2/token \
     -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" \
     -d "grant_type=client_credentials"

   # 2) create a product
   curl -s https://api-m.sandbox.paypal.com/v1/catalogs/products \
     -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{"name":"Telefutz","type":"SERVICE","category":"SOFTWARE"}'

   # 3) create a monthly plan against that product's id
   curl -s https://api-m.sandbox.paypal.com/v1/billing/plans \
     -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{
       "product_id": "PROD-...",
       "name": "Telefutz Monthly",
       "billing_cycles": [{
         "frequency": {"interval_unit": "MONTH", "interval_count": 1},
         "tenure_type": "REGULAR",
         "sequence": 1,
         "total_cycles": 0,
         "pricing_scheme": {"fixed_price": {"value": "12.99", "currency_code": "USD"}}
       }],
       "payment_preferences": {"auto_bill_outstanding": true}
     }'
   ```
   Use the returned plan id as `PAYPAL_PLAN_ID`. Then register a webhook
   (Apps & Credentials → your app → Add Webhook, pointed at
   `.../api/billing/paypal/webhook`, subscribed to at least
   `BILLING.SUBSCRIPTION.ACTIVATED`, `PAYMENT.SALE.COMPLETED`,
   `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, and
   `BILLING.SUBSCRIPTION.PAYMENT.FAILED`) and use its id as
   `PAYPAL_WEBHOOK_ID`. Test with a PayPal sandbox buyer account (also
   created in that same dashboard). Switch `PAYPAL_API_BASE` to
   `https://api-m.paypal.com` and use live credentials/plan/webhook when
   you're ready for real payments.

## Auth endpoints (`auth-service`, reachable via `/api/auth/*` through the gateway)

| Route | Body | Notes |
|---|---|---|
| `POST /signup` | `email, password, displayName` | Returns a JWT |
| `POST /login` | `email, password` | Returns a JWT |
| `GET /me` | — (Bearer token) | Returns the current user |
| `POST /forgot-password` | `email` | Always returns a generic success message, whether or not the email exists. No real email provider is wired up yet - the reset token is logged server-side and echoed back as `devResetToken` when `NODE_ENV !== "production"`, so the flow is testable without email infra. Wire up SES/SendGrid/etc. and remove `devResetToken` before production. |
| `POST /reset-password` | `token, newPassword` | Token expires after 1 hour |
| `POST /phone/request-otp` | `phone` | No real SMS provider is wired up yet - the code is logged server-side and echoed back as `devOtpCode` when `NODE_ENV !== "production"`. Wire up Twilio/SNS/etc. and remove `devOtpCode` before production. |
| `POST /phone/verify-otp` | `phone, code, displayName?` | **Resolves to the same user** if this phone is already linked to an account (e.g. it was provided at signup alongside email+password); otherwise creates a new account. `displayName` is only used the first time a phone signs in. Code expires after 10 minutes and is single-use. |

`POST /signup` also accepts an optional `phone` field - if provided, that
number is linked to the account immediately, so it can log in via either
email+password or phone+OTP from then on and always resolves to the same
`User` row (same `id`, same JWT `sub` claim either way).

## Troubleshooting

**A Prisma-using service (auth, catalog, playback, billing) crash-loops
with `Error: Could not parse schema engine response` and a mention of
OpenSSL in the logs.** Prisma's engine needs OpenSSL, and the plain
`node:20-alpine` base image doesn't ship a version it can detect - its own
error message about this ends up mangling the JSON response instead of
printing cleanly, which is what makes the real error easy to miss. Each of
those four Dockerfiles installs it explicitly (`RUN apk add --no-cache
openssl` right after the `FROM` line) for exactly this reason - if you ever
strip that line back out while editing a Dockerfile, this is what comes
back.

**A service gets `Killed` mid-build, or the whole instance goes
unresponsive during `docker compose up --build`.** Memory, not a bug -
building all 6 services' `npm install` steps in parallel needs more RAM
than a small instance (e.g. AWS `t3.micro`, 1GB) has. Add swap space, or
build one service at a time instead of all at once:
```bash
for s in api-gateway auth-service catalog-service recommendation-service playback-service billing-service; do
  docker compose build "$s"
done
```
See `infra/aws-starter/README.md` for the full swap-space + sequential-build
walkthrough if you're on a memory-constrained instance.

## What's real vs. stubbed

- **Real**: JWT auth, password hashing, full password reset flow,
  database-per-service, Redis caching on the hot read paths, an API gateway
  that verifies tokens once at the edge, Docker Compose orchestration
  mirroring the architecture diagrams from earlier in this conversation.
- **Stubbed**: recommendation ranking (random shuffle — swap in a real
  model), video storage/transcoding/CDN (`playback-service` returns a fake
  manifest URL — wire this up to S3 + FFmpeg + CloudFront/Fastly when you're
  ready to handle real video).
