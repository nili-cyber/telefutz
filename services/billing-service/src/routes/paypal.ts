import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured");

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// --- Create subscription -----------------------------------------------
// Uses PayPal's real Subscriptions API (auto-renewing), not a one-time
// Order. This requires a Billing Plan to exist ahead of time - see
// services/README.md for the one-time setup (create a Product, then a Plan
// with a monthly billing cycle). PAYPAL_PLAN_ID points at that plan.

const createSubscriptionSchema = z.object({
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/paypal/create-subscription", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string") return res.status(401).json({ error: "Missing user" });

  const parsed = createSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const planId = process.env.PAYPAL_PLAN_ID;
  if (!planId) return res.status(500).json({ error: "PAYPAL_PLAN_ID is not configured" });

  try {
    const accessToken = await getAccessToken();
    const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: userId, // carried through to every webhook event for this subscription
        application_context: {
          return_url: parsed.data.returnUrl,
          cancel_url: parsed.data.cancelUrl,
          user_action: "SUBSCRIBE_NOW",
        },
      }),
    });

    const subscription = await subRes.json();
    if (!subRes.ok) return res.status(502).json({ error: "PayPal subscription creation failed", details: subscription });

    // Track it as pending immediately - the webhook (or the confirm step
    // below) flips it to "active" once the user actually approves it.
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, status: "inactive", provider: "paypal", paypalSubscriptionId: subscription.id },
      update: { provider: "paypal", paypalSubscriptionId: subscription.id },
    });

    const approvalUrl = subscription.links?.find((l: any) => l.rel === "approve")?.href;
    res.json({ subscriptionId: subscription.id, approvalUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "PayPal error" });
  }
});

// --- Confirm after approval ---------------------------------------------
// Called by the app right after the user is redirected back from PayPal's
// approval page. This is a fast-path so the UI doesn't have to wait on
// webhook delivery, which can lag by a few seconds - the webhook below is
// still the source of truth for renewals and cancellations after this point.

const confirmSchema = z.object({
  subscriptionId: z.string().min(1),
});

router.post("/paypal/confirm-subscription", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string") return res.status(401).json({ error: "Missing user" });

  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const accessToken = await getAccessToken();
    const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${parsed.data.subscriptionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const subscription = await subRes.json();
    if (!subRes.ok) return res.status(502).json({ error: "Could not look up subscription", details: subscription });

    if (subscription.status !== "ACTIVE") {
      return res.status(402).json({ error: `Subscription is not active yet (status: ${subscription.status})` });
    }

    await prisma.subscription.updateMany({
      where: { userId, paypalSubscriptionId: parsed.data.subscriptionId },
      data: {
        status: "active",
        currentPeriodEnd: subscription.billing_info?.next_billing_time
          ? new Date(subscription.billing_info.next_billing_time)
          : null,
      },
    });

    res.json({ status: "active" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "PayPal error" });
  }
});

// --- Webhook: renewals, cancellations, payment failures ------------------
// PayPal doesn't sign webhooks the same way Stripe does (no single HMAC
// secret) - verification is a live API call using the headers PayPal sends
// plus your registered PAYPAL_WEBHOOK_ID. This can use express.json() like
// the rest of billing-service, unlike Stripe's webhook, because PayPal's
// verify-webhook-signature call takes the already-parsed event object
// rather than needing the raw byte stream.
router.post("/paypal/webhook", async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("PAYPAL_WEBHOOK_ID is not configured - rejecting webhook");
    return res.status(500).send("Webhook not configured");
  }

  try {
    const accessToken = await getAccessToken();
    const verifyRes = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: req.headers["paypal-auth-algo"],
        cert_url: req.headers["paypal-cert-url"],
        transmission_id: req.headers["paypal-transmission-id"],
        transmission_sig: req.headers["paypal-transmission-sig"],
        transmission_time: req.headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: req.body,
      }),
    });
    const verification = await verifyRes.json();
    if (verification.verification_status !== "SUCCESS") {
      console.error("PayPal webhook signature verification failed");
      return res.status(400).send("Signature verification failed");
    }
  } catch (err) {
    console.error("PayPal webhook verification error:", err);
    return res.status(500).send("Verification error");
  }

  const event = req.body;
  const subscriptionId: string | undefined = event.resource?.id;

  if (subscriptionId) {
    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "PAYMENT.SALE.COMPLETED": {
        // A renewal payment landing is exactly this event on a recurring
        // subscription - re-fetch the subscription to get the new
        // next_billing_time rather than guessing at +30 days from here.
        const accessToken = await getAccessToken();
        const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const subscription = await subRes.json();
        await prisma.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: {
            status: "active",
            currentPeriodEnd: subscription.billing_info?.next_billing_time
              ? new Date(subscription.billing_info.next_billing_time)
              : undefined,
          },
        });
        break;
      }
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        await prisma.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: { status: "canceled" },
        });
        break;
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        await prisma.subscription.updateMany({
          where: { paypalSubscriptionId: subscriptionId },
          data: { status: "past_due" },
        });
        break;
    }
  }

  res.json({ received: true });
});

export default router;
