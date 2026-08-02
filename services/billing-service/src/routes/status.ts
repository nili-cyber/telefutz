import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// Trusts the x-user-id header the API gateway sets after verifying the JWT -
// same trust model the other services already use (see auth-middleware.ts
// in api-gateway). This is the endpoint the gateway itself calls to decide
// whether to let a request through to playback-service.
router.get("/status", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string") return res.status(401).json({ error: "Missing user" });

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const active = sub?.status === "active" && (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());

  res.json({
    active,
    status: sub?.status ?? "inactive",
    provider: sub?.provider ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  });
});

export default router;
