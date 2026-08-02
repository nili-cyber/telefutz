import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function signToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

const requestOtpSchema = z.object({
  phone: z.string().min(7),
});

router.post("/phone/request-otp", async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { phone } = parsed.data;
  const code = crypto.randomInt(100000, 999999).toString();
  const codeHash = await bcrypt.hash(code, 10);

  await prisma.otpCode.create({
    data: { phone, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  // No real SMS provider is wired up in this scaffold (Twilio, SNS, etc.
  // would go here in production). The code is logged server-side and
  // echoed back as `devOtpCode` outside production so the flow is testable
  // without SMS infrastructure - same pattern as /forgot-password.
  console.log(`[dev only] OTP for ${phone}: ${code}`);

  res.json({
    message: "If that number can receive SMS, a code has been sent.",
    ...(process.env.NODE_ENV !== "production" ? { devOtpCode: code } : {}),
  });
});

const verifyOtpSchema = z.object({
  phone: z.string().min(7),
  code: z.string().length(6),
  // Only used the first time a phone signs in with no existing account.
  // Ignored if the phone already resolves to a user.
  displayName: z.string().min(1).optional(),
});

router.post("/phone/verify-otp", async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { phone, code, displayName } = parsed.data;

  const candidate = await prisma.otpCode.findFirst({
    where: { phone, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate) return res.status(400).json({ error: "Code expired or not found - request a new one" });

  const valid = await bcrypt.compare(code, candidate.codeHash);
  if (!valid) return res.status(400).json({ error: "Incorrect code" });

  // One-time use - burn every outstanding code for this phone once one succeeds.
  await prisma.otpCode.deleteMany({ where: { phone } });

  // The core "same person" guarantee: look up by phone first. If this
  // number was already linked to an account (e.g. provided at signup
  // alongside an email+password), that existing user is returned and
  // logged in - not a new, separate account.
  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        displayName: displayName?.trim() || `User ${phone.slice(-4)}`,
      },
    });
  }

  res.json({
    token: signToken(user.id, user.role),
    user: { id: user.id, email: user.email, phone: user.phone, displayName: user.displayName, role: user.role },
  });
});

export default router;
