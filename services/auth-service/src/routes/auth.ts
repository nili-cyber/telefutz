import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

type UserRow = { id: string; email: string | null; phone: string | null; displayName: string; role: string };

function signToken(user: UserRow) {
  // role travels in the token itself - the gateway decodes it once and
  // forwards it as x-user-role, so downstream services (and requireAdmin
  // in api-gateway) never have to look the user back up to check it.
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function userResponse(user: UserRow) {
  return { id: user.id, email: user.email, phone: user.phone, displayName: user.displayName, role: user.role };
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  // Optional - if provided here, the account is linked to both identifiers
  // from the start, so logging in with either one resolves to this same row.
  phone: z.string().min(7).optional(),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, displayName, phone } = parsed.data;
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) return res.status(409).json({ error: "Email already registered" });

  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) return res.status(409).json({ error: "Phone number already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName, phone },
  });

  res.status(201).json({ token: signToken(user), user: userResponse(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  // passwordHash is nullable now (phone-only accounts have none) - treat
  // that the same as a wrong password rather than letting it throw.
  if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  res.json({ token: signToken(user), user: userResponse(user) });
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(userResponse(user));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return the same response whether or not the email exists -
  // otherwise this endpoint becomes a way to check who has an account.
  const genericResponse = { message: "If that email is registered, reset instructions have been sent." };

  if (!user) return res.json(genericResponse);

  const resetToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  // There's no real email provider wired up in this scaffold. In production,
  // send `resetToken` via a transactional email service (SES, SendGrid, etc.)
  // as a link like https://yourapp.com/reset-password?token=... - never
  // return it in the API response. It's echoed back here only so the reset
  // flow is testable end-to-end without email infrastructure.
  console.log(`[dev only] Password reset token for ${email}: ${resetToken}`);

  res.json({
    ...genericResponse,
    ...(process.env.NODE_ENV !== "production" ? { devResetToken: resetToken } : {}),
  });
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { token, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { resetToken: token } });

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return res.status(400).json({ error: "Reset link is invalid or has expired" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  });

  res.json({ message: "Password updated - you can now sign in with your new password." });
});

export default router;
