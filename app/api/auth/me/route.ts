/**
 * GET /api/auth/me — who is signed in, or 401.
 *
 * The client calls this on mount to decide whether to render the chat or
 * redirect to /login.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? null,
    },
  });
}
