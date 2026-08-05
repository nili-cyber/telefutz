# Telefutz app (web + iOS + Android)

One codebase, three targets: web, iOS, and Android — built with Expo Router
(React Native + React Native Web). This is `apps/app` inside the `telefutz`
monorepo - the backend lives in `../../services` and `../../docker-compose.yml`
at the repo root; see the root README for how the two fit together.

## Page structure

| Route | Auth required? | What it is |
|---|---|---|
| `/` | No | Public landing page - nav bar (Free Movies tab, Login/Sign up buttons top-right), browses the full catalog. This is what a first-time visitor sees. |
| `/login` | No | Login/signup, both by email+password and phone+OTP. Reached via the landing page's Login/Sign up buttons (which pass `?mode=login` or `?mode=signup` to open the right tab). |
| `/dashboard` | Yes | The real app - genre filtering, recommendations, subscribe banner, admin link if applicable. Redirects to `/` if you're not signed in; login/signup redirect here on success. |
| `/watch/[id]` | Only for paid titles | Free titles (`isFree: true`) play without an account - verified server-side by `playback-service` against `catalog-service`, not just a client-side check. Paid titles still require login + an active subscription (see `services/README.md`). |
| `/subscribe`, `/checkout-result` | Yes | Stripe/PayPal checkout flow. |
| `/forgot-password`, `/reset-password` | No | Password reset flow. |
| `/admin/titles` | Yes (admin role) | Add/edit/remove catalog titles. |

## What's actually shared vs. platform-specific

Shared (one file, runs everywhere): all routes in `app/`, the API client,
auth context, theme, and `TitleCard`.

Platform-specific (Metro picks the right file automatically by filename —
same import path everywhere, e.g. `import VideoPlayer from "./VideoPlayer"`):

| Concern         | Native (`.native.tsx`)      | Web (`.web.tsx`)                  | Why they differ |
|------------------|------------------------------|-------------------------------------|------------------|
| Video playback   | `expo-av`'s `<Video>` (AVPlayer / ExoPlayer) | HTML5 `<video>` + `hls.js`        | Browsers other than Safari can't play `.m3u8` natively |
| Token storage    | `expo-secure-store`          | `window.localStorage`               | SecureStore doesn't exist in a browser |

Everything else — screens, layout, navigation, styling — is one file used by
all three platforms.

## Running it

From the **repo root** (recommended - one install for the whole monorepo):
```bash
npm install
npm run app:web      # or: npm run app:start
```

Or from inside this folder directly - works the same either way since this
is an npm workspace:
```bash
cd apps/app
npx expo install --fix
cp .env.example .env   # set EXPO_PUBLIC_API_URL
```

**Web:**
```bash
npm run web
```
Opens in your browser at `localhost:8081` (or similar) - a real website, not
a preview.

**Mobile (Expo Go, fastest for dev):**
```bash
npm start
```
Scan the QR code with the Expo Go app. Remember phones can't reach
`localhost` on your laptop - use your LAN IP in `.env`.

## Shipping it

**Web deployment:**
```bash
npm run build:web
```
Outputs a static site to `dist/` - deploy it to S3 + CloudFront, Vercel,
Netlify, or Cloudflare Pages like any static site.

**Mobile store submission:**
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios      # or android, or both
eas submit --platform ios     # or android
```
Same as before: Apple Developer account ($99/yr), Google Play Developer
account ($25 one-time). Update `ios.bundleIdentifier` / `android.package` in
`app.json` to your own identifier before submitting.

## What's real vs. still a placeholder

Same as the previous versions - auth (including signup, login, logout, and
a full forgot-password/reset-password flow with expiring tokens), routing,
caching, and video playback are all real and functional. There's no email
provider wired up on the backend yet, so `/forgot-password` currently logs
the reset link server-side and echoes it back to the app in dev mode instead
of emailing it - see `telefutz-backend`'s README for what to change before
production. `playback-service` still returns a placeholder manifest URL
until real video storage/transcoding exists; once that's wired up, nothing
in this app needs to change - it already expects a genuine `.m3u8` URL.
