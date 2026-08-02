import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
export const CACHE_TTL_SECONDS = 60;
