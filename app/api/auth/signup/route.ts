/**
 * POST /api/auth/signup — create an account and sign in.
 *
 * Also creates the empty profile row, so the guided intake has somewhere to
 * write from the very first question.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createAuthSession,
  hashPassword,
  setSessionCookie,
  validateCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const check = validateCredentials(
    String(body.email ?? ""),
    String(body.password ?? "")
  );
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const displayName = String(body.displayName ?? "").trim().slice(0, 80) || null;

  const existing = await prisma.user.findUnique({ where: { email: check.email } });
  if (existing) {
    // Deliberately explicit: signup is the one place where "already registered"
    // is genuinely useful to the user rather than a leak.
    return NextResponse.json(
      { error: "That email is already registered. Try signing in instead." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(String(body.password));

  const user = await prisma.user.create({
    data: {
      email: check.email,
      passwordHash,
      // One profile row per user, created empty for the intake to fill in.
      profile: { create: { displayName } },
    },
  });

  const { token, expiresAt } = await createAuthSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  setSessionCookie(token, expiresAt);

  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName },
  });
}
