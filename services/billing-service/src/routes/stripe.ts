import { Router, raw } from "express";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

// Stripe Checkout is one flow that covers card, Apple Pay, AND Google Pay -
// Stripe automatically shows whichever wallet is available on the visiting
// device/browser inside the same hosted page. There's no separate "Apple
// Pay integration" to build; you get it by using Checkout at all, once
// Apple Pay domain verification is done in the Stripe dashboard for
// production (test mode works with no extra setup).
const createSessionSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

router.post("/stripe/create-checkout-session", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string") return res.status(401).json({ error: "Missing user" });

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { successUrl, cancelUrl } = parsed.data;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return res.status(500).json({ error: "STRIPE_PRICE_ID is not configured" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Lets the webhook know which of our users this checkout belongs to -
    // Stripe echoes this back on every event for the session/subscription.
    client_reference_id: userId,
  });

  res.json({ url: session.url });
});

// Raw body is required here - Stripe signs the exact bytes it sent, so this
// route must NOT go through express.json() like everything else in this
// service does (see index.ts, where this router is mounted before the
// global json() middleware for that reason).
router.post("/stripe/webhook", raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    if (!webhookSecret || typeof signature !== "string") throw new Error("Webhook secret not configured");
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return res.status(400).send("Webhook signature verification failed");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (userId && typeof session.subscription === "string") {
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            status: "active",
            provider: "stripe",
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId: session.subscription,
          },
          update: {
            status: "active",
            provider: "stripe",
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId: session.subscription,
          },
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const existing = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (existing) {
        const status = subscription.status === "active" ? "active"
          : subscription.status === "past_due" ? "past_due"
          : "canceled";
        await prisma.subscription.update({
          where: { userId: existing.userId },
          data: {
            status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;
