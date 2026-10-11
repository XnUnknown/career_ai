/**
 * GET  /api/sessions — the signed-in user's recent conversations.
 * POST /api/sessions — start a new conversation.
 *
 * POST is what the "New chat" button calls. It returns a session that already
 * contains the static welcome message, so the UI has something concrete to
 * render and the greeting is part of the saved history from the outset.
 *
 * If the newest conversation is still untouched (nothing but the welcome), it's
 * returned instead of creating another one — otherwise tapping "New chat" a few
 * times would litter the sidebar with identical empty conversations.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createChatSession,
  findReusableEmptySession,
  getSessionForUser,
  listSessions,
  toClientMessages,
} from "@/lib/chatStore";
import { OLLAMA_MODEL } from "@/lib/ollamaClient";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const sessions = await listSessions(user.id);

  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title ?? "New chat",
      messageCount: session.messageCount,
      lastMessageAt: (session.lastMessageAt ?? session.createdAt).getTime(),
    })),
  });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  const reusableId = await findReusableEmptySession(user.id);
  const sessionId =
    reusableId ?? (await createChatSession(user.id, { model: OLLAMA_MODEL })).id;

  // Read it back through the same path the client uses, so a "new chat"
  // response and a session reload are byte-for-byte the same shape.
  const session = await getSessionForUser(user.id, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Could not open a chat." }, { status: 500 });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title ?? "New chat",
      createdAt: session.createdAt.getTime(),
      reused: Boolean(reusableId),
    },
    messages: toClientMessages(session),
  });
}
