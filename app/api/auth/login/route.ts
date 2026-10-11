/**
 * POST /api/auth/login — verify credentials and start a session.
 *
 * On a wrong password we return one generic message for both "no such account"
 * and "bad password", so the endpoint can't be used to enumerate which emails
 * are registered.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createAuthSession,
  normalizeEmail,
  pruneExpiredAuthSessions,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  const valid =
    user && !user.deletedAt ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }

  const { token, expiresAt } = await createAuthSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  setSessionCookie(token, expiresAt);

  // Housekeeping — cheap, and keeps auth_sessions from growing forever.
  await Promise.all([
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
    pruneExpiredAuthSessions(user.id),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? null,
    },
  });
}
