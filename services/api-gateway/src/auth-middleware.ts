import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Verify the token at the edge (like Netflix's Zuul) so downstream services
// never have to duplicate auth logic - they just trust x-user-id/x-user-role.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string; role?: string };
    req.headers["x-user-id"] = payload.sub;
    req.headers["x-user-role"] = payload.role || "user";
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Must run after requireAuth (needs x-user-role already set). Enforced here
// rather than in catalog-service, same reasoning as requireSubscription -
// one place decides who's allowed to do what, and it can't be bypassed by
// calling a service's API directly.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-user-role"] !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
