/**
 * GET /api/sessions/:id — one conversation with its full transcript.
 *
 * Returns the stored turns in `seq` order, with each message's tool calls and
 * career grid, shaped exactly like the client-side `Message[]` so the chat page
 * can drop them straight into state.
 *
 * `getSessionForUser` puts userId in the WHERE clause, so another account's
 * session id returns 404 rather than their conversation.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSessionForUser, toClientMessages } from "@/lib/chatStore";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const session = await getSessionForUser(user.id, params.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title ?? "New chat",
      createdAt: session.createdAt.getTime(),
    },
    messages: toClientMessages(session),
  });
}
