# Telefutz

One repo, one codebase, everything included: backend microservices, and a
single frontend that ships to web, iOS, and Android. This replaces every
earlier separate zip from this conversation - there's no more splitting
frontend and backend into different downloads.

```
telefutz/
├── docker-compose.yml       # backend orchestration: postgres, redis, gateway, 4 services
├── infra/
│   └── init-db.sql          # creates authdb / catalogdb / playbackdb
├── services/                 # backend - Node/TypeScript, one folder per service
│   ├── api-gateway/           # JWT verification + routing, entry point on :8080
│   ├── auth-service/           # signup/login/logout/password-reset
│   ├── catalog-service/         # titles, search, browse rows
│   ├── recommendation-service/   # personalized rows (stub ranking)
│   ├── playback-service/          # manifest URLs, watch progress
│   ├── billing-service/            # subscription status, Stripe + PayPal checkout
│   └── README.md                   # full service/endpoint reference
└── apps/
    └── app/                  # Expo Router - web + iOS + Android from one codebase
        └── README.md          # full run/build/submit reference
```

It's wired together with **npm workspaces** (see the root `package.json`) -
one `npm install` at the root installs every service and the app together,
and there's one `package-lock.json` for the whole thing instead of five
separate ones.

## Quick start

```bash
npm install

# Backend: postgres, redis, api-gateway, and all 4 services
npm run backend:up

# Frontend, in a second terminal - pick one:
npm run app:web       # opens in your browser
npm run app:start     # scan the QR with Expo Go for iOS/Android
```

That's the whole stack running from one `npm install`.

## Why the app isn't in docker-compose too

Everything backend-shaped (stateless services, Postgres, Redis) containerizes
cleanly. A mobile app can't be "containerized" in any meaningful sense - you
still need Expo Go, a simulator, or a real device to actually run it - so
`apps/app` is started with its own npm scripts instead. `docker-compose.yml`
only covers the backend; that's normal for this kind of split, not a gap.

## Where to look for more detail

- **AWS deployment**: `infra/aws/README.md` - real, applyable Terraform for
  everything (VPC, ECS Fargate, RDS, ElastiCache, ALB, S3+CloudFront). Not
  run automatically - you apply it yourself with your own AWS credentials.
  For a much cheaper way to get something real online first, see
  `infra/aws-starter/README.md` instead - one EC2 instance running the same
  `docker-compose.yml` you already use locally, close to free on a new AWS
  account.

- **Backend specifics** (endpoints, ports, what's real vs. stubbed):
  `services/README.md`
- **App specifics** (how the web/iOS/Android split works, building for the
  App Store/Play Store): `apps/app/README.md`

## What's real vs. still a placeholder

- **Real**: full auth (signup, login, logout, password reset with expiring
  tokens, and phone/OTP login-or-signup that resolves to the same account as
  email login when a phone number is linked), role-based admin access for
  managing the catalog (add/edit/remove titles, gated at the API gateway -
  not just hidden in the UI), category browsing by genre, a real paywall
  with recurring billing on both providers (Stripe subscriptions for
  card/Apple Pay/Google Pay, PayPal's Subscriptions API for auto-renewing
  PayPal payments) - both genuinely enforced at the API gateway rather than
  just hidden in the UI, database-per-service Postgres, Redis caching on hot
  paths, a gateway that verifies JWTs once at the edge, and genuine HLS
  video playback on every platform (AVPlayer/ExoPlayer natively on mobile,
  `hls.js` on non-Safari browsers).
- **Stubbed**: recommendation ranking (random shuffle - swap in a real
  model), and video storage/transcoding/CDN (`playback-service` returns a
  placeholder manifest URL - wire up S3 + FFmpeg + a real CDN when you're
  ready to handle actual video, at which point nothing in `apps/app` needs
  to change since it already expects a genuine `.m3u8` URL). No email or SMS
  provider is wired up for password reset / phone login yet, and payments
  are running on Stripe test keys / PayPal sandbox until you set real
  credentials - see `services/README.md` for exactly what to swap in before
  production.
