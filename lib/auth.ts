/**
 * lib/auth.ts — email + password authentication.
 *
 * Design notes:
 *   - Passwords are hashed with Node's built-in scrypt (no bcrypt/argon2 native
 *     build to go wrong on Windows). The stored string is self-describing:
 *     `scrypt$N$r$p$salt$hash`, so the cost parameters can be raised later
 *     without invalidating existing hashes.
 *   - The session cookie holds a random 32-byte token. The database stores only
 *     its SHA-256 hash, so a leaked dump can't be replayed as a login.
 *   - Sessions are rows in `auth_sessions`, which means logout is a real
 *     revocation (not just clearing a cookie) and "sign out everywhere" is one
 *     UPDATE away.
 *
 * SERVER-ONLY — uses next/headers, so never import it from a client component.
 */

import { cookies } from "next/headers";
import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import type { Prisma, User } from "@prisma/client";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

/** scrypt cost. N=16384,r=8 needs 16MB, comfortably under Node's 32MB default. */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;

const COOKIE_NAME = "cc_session";

/**
 * How long a sign-in lasts: 4 hours.
 *
 * This one value governs both the cookie's `expires` and the matching
 * `auth_sessions.expires_at` row, so the cookie and the database can't drift
 * apart. After this, the request is treated as signed out and the user is sent
 * back to /login.
 */
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  // NFKC so the same visually-identical password always hashes the same way.
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null
): Promise<boolean> {
  if (!stored) return false; // OAuth-only account, or no password set

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Only the hash is ever persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export async function createAuthSession(
  userId: string,
  meta: SessionMeta = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export type SessionUser = User & {
  profile: Prisma.UserProfileGetPayload<object> | null;
};

/**
 * The signed-in user for the current request, or null.
 *
 * Every query filters on the account still existing and not being soft-deleted;
 * an expired row is treated as no session at all.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.deletedAt) return null;

  return session.user;
}

export async function destroyCurrentAuthSession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    // Revoke rather than delete: keeps an audit trail of when the session ended.
    await prisma.authSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Drop expired rows for one user. Called on login so the table self-cleans. */
export async function pruneExpiredAuthSessions(userId: string): Promise<void> {
  await prisma.authSession.deleteMany({
    where: { userId, expiresAt: { lte: new Date() } },
  });
}

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

export function setSessionCookie(token: string, expiresAt: Date): void {
  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true, // not readable from JS, so XSS can't exfiltrate it
    sameSite: "lax", // survives top-level navigation, blocks cross-site POSTs
    secure: process.env.NODE_ENV === "production", // http://localhost in dev
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8;

/** Deliberately loose — this is a real address check, not an RFC 5322 parser. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(
  email: string,
  password: string
): { ok: true; email: string } | { ok: false; error: string } {
  const normalized = normalizeEmail(email);

  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (normalized.length > 254) {
    return { ok: false, error: "That email address is too long." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password.length > 200) {
    return { ok: false, error: "Password must be under 200 characters." };
  }

  return { ok: true, email: normalized };
}
