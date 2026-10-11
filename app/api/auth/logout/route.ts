/**
 * POST /api/auth/logout — revoke the current session.
 *
 * Revokes the row (rather than deleting it) and clears the cookie. Revoking on
 * the server means the token is dead even if a copy of the cookie leaked.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentAuthSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await destroyCurrentAuthSession();
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
