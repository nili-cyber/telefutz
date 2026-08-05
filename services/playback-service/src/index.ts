import express from "express";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const app = express();
app.use(express.json());
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || "http://localhost:4002";

app.get("/health", (_req, res) => res.json({ status: "ok", service: "playback-service" }));

// In production this returns a signed CDN URL (CloudFront/Fastly signed
// cookie or query string) pointing at the HLS/DASH manifest for this title.
// The manifest itself lives on the CDN, not in this service.
app.get("/playback/:titleId/manifest-url", (req, res) => {
  const { titleId } = req.params;
  const cdnBase = process.env.CDN_BASE_URL || "https://cdn.example.com";
  res.json({
    manifestUrl: `${cdnBase}/videos/${titleId}/master.m3u8`,
    expiresInSeconds: 3600,
  });
});

// Public (no auth, no subscription) - but only for titles actually marked
// free. This service verifies that itself by asking catalog-service,
// rather than trusting the caller's claim that a title is free - otherwise
// this route would be a way to bypass the paywall entirely for any title.
app.get("/playback/free/:titleId/manifest-url", async (req, res) => {
  const { titleId } = req.params;
  try {
    const titleRes = await fetch(`${CATALOG_URL}/titles/${titleId}`);
    if (!titleRes.ok) return res.status(404).json({ error: "Title not found" });
    const title = await titleRes.json();
    if (!title.isFree) return res.status(403).json({ error: "This title requires a subscription" });

    const cdnBase = process.env.CDN_BASE_URL || "https://cdn.example.com";
    res.json({
      manifestUrl: `${cdnBase}/videos/${titleId}/master.m3u8`,
      expiresInSeconds: 3600,
    });
  } catch {
    res.status(502).json({ error: "Could not verify title" });
  }
});

app.post("/playback/:titleId/progress", async (req, res) => {
  const { titleId } = req.params;
  const { userId, positionSeconds } = req.body as { userId: string; positionSeconds: number };
  if (!userId || positionSeconds === undefined) {
    return res.status(400).json({ error: "userId and positionSeconds are required" });
  }

  // Write-behind: cache immediately for fast "continue watching" reads,
  // persist to Postgres for durability. A real system batches the DB writes.
  await redis.set(`progress:${userId}:${titleId}`, positionSeconds, "EX", 3600);
  await prisma.watchProgress.upsert({
    where: { userId_titleId: { userId, titleId } },
    update: { positionSeconds },
    create: { userId, titleId, positionSeconds },
  });

  res.json({ status: "ok" });
});

app.get("/playback/:titleId/progress", async (req, res) => {
  const { titleId } = req.params;
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  if (!userId) return res.status(400).json({ error: "userId query param required" });

  const cached = await redis.get(`progress:${userId}:${titleId}`);
  if (cached) return res.json({ positionSeconds: Number(cached) });

  const row = await prisma.watchProgress.findUnique({
    where: { userId_titleId: { userId, titleId } },
  });
  res.json({ positionSeconds: row?.positionSeconds ?? 0 });
});

const port = Number(process.env.PORT) || 4004;
app.listen(port, () => console.log(`playback-service listening on ${port}`));
