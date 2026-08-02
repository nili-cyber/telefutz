import { Request, Response, NextFunction } from "express";

const BILLING_URL = process.env.BILLING_SERVICE_URL || "http://localhost:4005";

// Enforced here, at the edge, rather than trusting each service to check for
// itself - the same reasoning as requireAuth. This is what makes "only paid
// people can access movies" actually true: playback-service is never even
// reached by an unpaid user's request, regardless of what the client sends.
export async function requireSubscription(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string") return res.status(401).json({ error: "Missing user" });

  try {
    const statusRes = await fetch(`${BILLING_URL}/status`, { headers: { "x-user-id": userId } });
    const data = await statusRes.json();
    if (!data.active) {
      return res.status(402).json({ error: "An active subscription is required to watch", code: "SUBSCRIPTION_REQUIRED" });
    }
    next();
  } catch {
    res.status(502).json({ error: "Could not verify subscription status" });
  }
}
