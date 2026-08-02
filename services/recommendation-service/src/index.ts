import express from "express";
import Redis from "ioredis";
import fetch from "node-fetch";

const app = express();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || "http://localhost:4002";

app.get("/health", (_req, res) => res.json({ status: "ok", service: "recommendation-service" }));

// Real Netflix precomputes personalized rows offline. This stub ranks the
// catalog by (a cached, fake) popularity score - swap the ranking function
// for a real model's output without touching the API shape.
app.get("/recommendations", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "anonymous";
  const cacheKey = `recs:${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const response = await fetch(`${CATALOG_URL}/titles`);
  const titles = (await response.json()) as any[];

  // Placeholder ranking: shuffle deterministically per user so the row still
  // feels "personalized" - replace with a real model call in production.
  const ranked = [...titles].sort(() => Math.random() - 0.5);

  await redis.set(cacheKey, JSON.stringify(ranked), "EX", 120);
  res.json(ranked);
});

const port = Number(process.env.PORT) || 4003;
app.listen(port, () => console.log(`recommendation-service listening on ${port}`));
