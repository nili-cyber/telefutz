import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { redis, CACHE_TTL_SECONDS } from "../redis";

const prisma = new PrismaClient();
const router = Router();

// Genre-keyed cache entries get stale the moment a title is created, edited,
// or removed - clear the specific genre(s) touched plus the "all" row so
// the admin's changes show up immediately instead of waiting out the TTL.
async function invalidateTitleCaches(...genres: (string | null | undefined)[]) {
  const keys = new Set(["titles:all"]);
  for (const genre of genres) if (genre) keys.add(`titles:${genre}`);
  await Promise.all([...keys].map((key) => redis.del(key)));
}

// Browse/homepage rows - cached in Redis since this is the hottest read path.
router.get("/titles", async (req, res) => {
  const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
  const cacheKey = `titles:${genre ?? "all"}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  const titles = await prisma.title.findMany({
    where: genre ? { genre } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await redis.set(cacheKey, JSON.stringify(titles), "EX", CACHE_TTL_SECONDS);
  res.json(titles);
});

router.get("/titles/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q) return res.json([]);

  const titles = await prisma.title.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 20,
  });
  res.json(titles);
});

// Category browsing - the list of genres currently represented in the
// catalog, so the app can render one chip per genre instead of a
// hardcoded list that drifts out of sync with what's actually there.
router.get("/genres", async (_req, res) => {
  const rows = await prisma.title.findMany({
    select: { genre: true },
    distinct: ["genre"],
    orderBy: { genre: "asc" },
  });
  res.json(rows.map((r) => r.genre));
});

router.get("/titles/:id", async (req, res) => {
  const title = await prisma.title.findUnique({ where: { id: req.params.id } });
  if (!title) return res.status(404).json({ error: "Not found" });
  res.json(title);
});

const titleInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  genre: z.string().min(1),
  releaseYear: z.number().int().min(1888).max(2100),
  posterUrl: z.string().min(1),
  videoId: z.string().min(1),
});

// Admin-only - enforced by api-gateway's requireAdmin before this is ever
// reached, not re-checked here (same trust model as x-user-id elsewhere).
router.post("/titles", async (req, res) => {
  const parsed = titleInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const title = await prisma.title.create({ data: parsed.data });
  await invalidateTitleCaches(title.genre);
  res.status(201).json(title);
});

router.put("/titles/:id", async (req, res) => {
  const parsed = titleInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.title.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const title = await prisma.title.update({ where: { id: req.params.id }, data: parsed.data });
  await invalidateTitleCaches(existing.genre, title.genre);
  res.json(title);
});

router.delete("/titles/:id", async (req, res) => {
  const existing = await prisma.title.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.title.delete({ where: { id: req.params.id } });
  await invalidateTitleCaches(existing.genre);
  res.status(204).send();
});

export default router;
