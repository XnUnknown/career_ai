/**
 * lib/chatStore.ts — reading and writing conversations.
 *
 * Keeps every Prisma query for chat in one place so the route handlers stay
 * about HTTP. Two things to note:
 *
 *   - `messages.seq` is assigned here. It's an explicit per-session counter
 *     (not `created_at`) because several messages can land in the same
 *     millisecond, and the transcript must replay in the order it was spoken.
 *   - Ownership is enforced by putting `userId` in the WHERE clause of every
 *     read, so a guessed session id returns nothing rather than someone else's
 *     conversation.
 *
 * SERVER-ONLY.
 */

import { prisma } from "@/lib/db";
import { WELCOME_MESSAGE } from "@/lib/prompts";
import type { CareerGridData } from "@/lib/types/career";
import type { Message as DbMessage } from "@prisma/client";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** A session title derived from the first thing the user typed. */
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/**
 * Create a conversation and seed it with the static welcome message.
 *
 * The welcome is a real row in `messages` (seq 1), not a UI decoration — so it
 * survives a reload, shows up in the transcript, and is part of the history the
 * model is given on the next turn.
 */
export async function createChatSession(
  userId: string,
  opts: { model?: string | null; title?: string | null } = {}
) {
  const session = await prisma.chatSession.create({
    data: {
      userId,
      model: opts.model ?? null,
      title: opts.title ?? null,
    },
  });

  await appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: WELCOME_MESSAGE,
  });

  return session;
}

/**
 * The newest conversation, but only if it's still untouched (nothing in it
 * except the welcome). Used so repeatedly hitting "New chat" reuses the empty
 * one instead of filling the sidebar with identical blank conversations.
 */
export async function findReusableEmptySession(userId: string) {
  const newest = await prisma.chatSession.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true, messageCount: true },
  });

  return newest && newest.messageCount <= 1 ? newest.id : null;
}

export interface AppendMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  error?: string | null;
}

/**
 * Append one turn, assigning the next `seq`.
 *
 * The read-then-write runs in a transaction so two concurrent turns in the same
 * session can't both claim the same seq (which the unique constraint would
 * reject).
 */
export async function appendMessage(input: AppendMessageInput): Promise<DbMessage> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.message.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    const seq = (last?.seq ?? 0) + 1;

    const message = await tx.message.create({
      data: {
        sessionId: input.sessionId,
        seq,
        role: input.role,
        content: input.content,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        durationMs: input.durationMs ?? null,
        error: input.error ?? null,
      },
    });

    // Keep the session's denormalized counters in step with its messages.
    // The first user turn also names the conversation.
    await tx.chatSession.update({
      where: { id: input.sessionId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        ...(input.role === "user" && seq === 1
          ? { title: titleFrom(input.content) }
          : {}),
      },
    });

    return message;
  });
}

export interface ToolCallRecord {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  resultSummary?: string | null;
  ok: boolean;
  durationMs?: number | null;
}

export async function persistToolCalls(
  messageId: string,
  calls: ToolCallRecord[]
): Promise<void> {
  if (calls.length === 0) return;

  await prisma.messageToolCall.createMany({
    data: calls.map((call, index) => ({
      messageId,
      callId: call.callId,
      name: call.name,
      arguments: call.arguments as object,
      resultSummary: call.resultSummary ?? null,
      ok: call.ok,
      durationMs: call.durationMs ?? null,
      position: index,
    })),
  });
}

/**
 * Save a career grid and its paths/roles.
 *
 * `gridId` is the same UUID that was streamed to the browser as the SSE
 * `gridId`, so a later replay produces identical ids and the UI can keep
 * updating that message in place.
 */
export async function persistGrid(input: {
  gridId: string;
  sessionId: string;
  messageId: string;
  userId: string;
  grid: CareerGridData;
}): Promise<void> {
  const { grid } = input;

  await prisma.careerGrid.create({
    data: {
      id: input.gridId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      userId: input.userId,
      title: grid.title,
      startingLabel: grid.startingPoint.label,
      startingDescription: grid.startingPoint.description,
      paths: {
        create: grid.paths.map((path, pathIndex) => ({
          name: path.pathName,
          recommended: path.recommended,
          position: pathIndex,
          roles: {
            create: path.roles.map((role, roleIndex) => ({
              position: roleIndex,
              title: role.title,
              yearsFromStart: role.yearsFromStart,
              salaryRange: role.salaryRange,
              skills: role.skills,
              description: role.description,
              entryPath: role.entryPath,
              outlook: role.outlook,
            })),
          },
        })),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSessions(userId: string, limit = 30) {
  return prisma.chatSession.findMany({
    where: { userId, status: "active" },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      messageCount: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });
}

/**
 * One session with its full transcript, or null if it isn't this user's.
 * `userId` in the WHERE clause is the ownership check — a guessed id from
 * another account matches nothing.
 */
export async function getSessionForUser(userId: string, sessionId: string) {
  return prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: {
        orderBy: { seq: "asc" },
        include: {
          toolCalls: { orderBy: { position: "asc" } },
          careerGrid: {
            include: {
              paths: {
                orderBy: { position: "asc" },
                include: { roles: { orderBy: { position: "asc" } } },
              },
            },
          },
        },
      },
    },
  });
}

type SessionWithMessages = NonNullable<
  Awaited<ReturnType<typeof getSessionForUser>>
>;

/** Shape the frontend's `Message[]` expects (see lib/types.ts). */
export interface ClientMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status: "done" | "error";
    summary?: string | null;
    durationMs?: number | null;
  }[];
  gridData?: CareerGridData;
}

/** Convert a stored session into what `app/chat/page.tsx` renders. */
export function toClientMessages(session: SessionWithMessages): ClientMessage[] {
  const out: ClientMessage[] = [];

  for (const message of session.messages) {
    const client: ClientMessage = {
      id: message.id,
      role: message.role as ClientMessage["role"],
      content: message.content,
      createdAt: message.createdAt.getTime(),
    };

    if (message.toolCalls.length > 0) {
      client.toolCalls = message.toolCalls.map((call) => ({
        id: call.callId,
        name: call.name,
        arguments: (call.arguments ?? {}) as Record<string, unknown>,
        status: call.ok ? ("done" as const) : ("error" as const),
        summary: call.resultSummary,
        durationMs: call.durationMs,
      }));
    }

    out.push(client);

    // A grid is its own client message, keyed by the GRID's id — the same UUID
    // the SSE `grid` event carried live. That keeps the right-hand panel's
    // selection stable whether the map arrived over the stream or from a reload.
    if (message.careerGrid) {
      out.push({
        id: message.careerGrid.id,
        role: "assistant",
        content: "",
        createdAt: message.careerGrid.createdAt.getTime(),
        gridData: toGridData(message.careerGrid),
      });
    }
  }

  return out;
}

function toGridData(
  grid: SessionWithMessages["messages"][number]["careerGrid"] & object
): CareerGridData {
  return {
    title: grid.title,
    startingPoint: {
      label: grid.startingLabel,
      description: grid.startingDescription,
    },
    paths: grid.paths.map((path) => ({
      pathName: path.name,
      recommended: path.recommended,
      roles: path.roles.map((role) => ({
        title: role.title,
        yearsFromStart: role.yearsFromStart,
        salaryRange: role.salaryRange,
        skills: role.skills,
        description: role.description,
        entryPath: role.entryPath,
        outlook: role.outlook,
      })),
    })),
  };
}

/** The grid UUID the browser already knows, so replay reuses the same id. */
export function gridIdOf(session: SessionWithMessages): Map<string, string> {
  const map = new Map<string, string>();
  for (const message of session.messages) {
    if (message.careerGrid) map.set(message.id, message.careerGrid.id);
  }
  return map;
}
