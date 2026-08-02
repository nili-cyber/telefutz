import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requireAuth, requireAdmin } from "./auth-middleware";
import { requireSubscription } from "./require-subscription";

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "api-gateway" }));

const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://localhost:4001";
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || "http://localhost:4002";
const RECS_URL = process.env.RECOMMENDATION_SERVICE_URL || "http://localhost:4003";
const PLAYBACK_URL = process.env.PLAYBACK_SERVICE_URL || "http://localhost:4004";
const BILLING_URL = process.env.BILLING_SERVICE_URL || "http://localhost:4005";

// Public: signup/login don't require a token yet.
app.use("/api/auth", createProxyMiddleware({ target: AUTH_URL, changeOrigin: true, pathRewrite: { "^/api/auth": "" } }));

// Public: Stripe calls this directly, with no user JWT - it authenticates
// itself via the Stripe-Signature header instead (verified in
// billing-service). This must be registered before the general, JWT-guarded
// /api/billing proxy below, since Express matches prefix routes in order.
app.use("/api/billing/stripe/webhook", createProxyMiddleware({ target: BILLING_URL, changeOrigin: true, pathRewrite: { "^/api/billing/stripe/webhook": "/stripe/webhook" } }));

// Same reasoning for PayPal's webhook - PayPal calls this directly and
// authenticates the call via signed headers, verified in billing-service.
app.use("/api/billing/paypal/webhook", createProxyMiddleware({ target: BILLING_URL, changeOrigin: true, pathRewrite: { "^/api/billing/paypal/webhook": "/paypal/webhook" } }));

// Admin-only writes - must be registered before the general /api/catalog
// proxy below, since Express matches these more specific method+path routes
// first. Reads (GET /api/catalog/*) stay open to any authenticated user.
const catalogProxy = createProxyMiddleware({ target: CATALOG_URL, changeOrigin: true, pathRewrite: { "^/api/catalog": "" } });
app.post("/api/catalog/titles", requireAuth, requireAdmin, catalogProxy);
app.put("/api/catalog/titles/:id", requireAuth, requireAdmin, catalogProxy);
app.delete("/api/catalog/titles/:id", requireAuth, requireAdmin, catalogProxy);

// Everything past this point requires a valid JWT.
app.use("/api/catalog", requireAuth, catalogProxy);
app.use("/api/recommendations", requireAuth, createProxyMiddleware({ target: RECS_URL, changeOrigin: true, pathRewrite: { "^/api/recommendations": "/recommendations" } }));
app.use("/api/billing", requireAuth, createProxyMiddleware({ target: BILLING_URL, changeOrigin: true, pathRewrite: { "^/api/billing": "" } }));

// Requires a JWT AND an active subscription - this is the actual paywall.
app.use("/api/playback", requireAuth, requireSubscription, createProxyMiddleware({ target: PLAYBACK_URL, changeOrigin: true, pathRewrite: { "^/api/playback": "/playback" } }));

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`api-gateway listening on ${port}`));
