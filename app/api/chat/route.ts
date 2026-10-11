/**
 * app/api/chat/route.ts — Chat endpoint.
 *
 * The ONLY place the browser talks to the AI. It:
 *   1. Requires a signed-in user (login is mandatory now — see SCHEMA_DRAFT §6 D3).
 *   2. Rate-limits each client IP (see lib/rateLimit.ts).
 *   3. Validates + sanitizes the incoming messages.
 *   4. Persists the user's turn, streams the reply as Server-Sent Events, then
 *      persists the assistant's turn along with its tool calls and any career
 *      grid it produced.
 *
 * SSE contract for the UI:
 *   Each event is a line:  `data: <json>\n\n`
 *   { "type": "start", "sessionId" }                        → stream opened
 *   { "type": "token", "text": "..." }                      → a piece of the answer
 *   { "type": "tool", "id", "name", "arguments" }           → a tool was called
 *   { "type": "tool_result", "id", "summary", "ok" }        → it finished (matched by id)
 *   { "type": "grid", "gridId", "data": {...}, "final" }    → render/refresh the career grid
 *   { "type": "done" }                                      → stream finished
 *   { "type": "error", "message": "..." }                   → something failed
 *
 * A grid event is sent every time a track is added (same `gridId` each time),
 * so the UI can replace the grid in place and the map draws itself while the
 * model is still working.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateRecommendation, OLLAMA_MODEL } from "@/lib/ollama";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionUser } from "@/lib/auth";
import {
  appendMessage,
  createChatSession,
  persistGrid,
  persistToolCalls,
  titleFrom,
  type ToolCallRecord,
} from "@/lib/chatStore";
import { prisma } from "@/lib/db";
import { formatProfileForPrompt } from "@/lib/profile";
import type { CareerGridData, CareerPath, CareerRole } from "@/lib/types/career";

export const runtime = "nodejs"; // Ollama + Prisma need Node, not the Edge runtime

/**
 * Vercel kills a function at this many seconds. A real research turn measures
 * ~30-40s locally (several searches, each fetching and summarizing pages, then
 * the grid), which is well past the 10s Hobby default, so this must be raised
 * or the stream dies mid-answer.
 *
 * 60 is the documented Hobby ceiling. If a turn ever needs more than that, the
 * fix is to shorten the work (fewer searches per turn) rather than raise this —
 * above 60 needs a paid plan.
 */
export const maxDuration = 60;

const MAX_MESSAGES = 20; // longer window for guided question flow
const MAX_CONTENT = 4000; // per-message char cap
const ALLOWED_ROLES = new Set(["user", "assistant", "system"]);

/** Hard cap so a model that keeps adding tracks can't run away. */
const MAX_GRID_PATHS = 6;

/** Best-effort client IP (works locally and behind a proxy). */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * Turn `add_career_path` arguments into a CareerPath the UI can render without
 * crashing. The model is usually well-behaved, but a missing `skills` array
 * would throw inside CareerNode (`role.skills.slice(...)`).
 */
function normalizeCareerPath(args: Record<string, unknown>): CareerPath {
  const rawRoles = Array.isArray(args.roles) ? args.roles : [];
  const roles: CareerRole[] = rawRoles.slice(0, 4).map((r) => {
    const role = (r ?? {}) as Record<string, unknown>;
    return {
      title: str(role.title, "Untitled role"),
      yearsFromStart: str(role.yearsFromStart, "—"),
      salaryRange: str(role.salaryRange, "—"),
      skills: strList(role.skills),
      description: str(role.description, "No description provided."),
      entryPath: str(role.entryPath, "—"),
      outlook: str(role.outlook, "—"),
    };
  });

  return {
    pathName: str(args.pathName, "Career track"),
    recommended: args.recommended === true,
    roles,
  };
}

/**
 * At most one track may be recommended — a partial unique index in the
 * database enforces this, so a model that marks two would make the grid
 * insert fail. Keep the first, clear the rest.
 */
function enforceSingleRecommended(paths: CareerPath[]): void {
  let seen = false;
  for (const path of paths) {
    if (!path.recommended) continue;
    if (seen) path.recommended = false;
    else seen = true;
  }
}

export async function POST(req: NextRequest) {
  // 1. Login is required — without a user there is nobody to attach the
  //    conversation to.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in to chat.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  // 2. Rate limit by IP
  const ip = clientIp(req);
  const rl = rateLimit(ip);
  const rateHeaders = {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
  };

  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { ...rateHeaders, "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // 3. Parse + validate the body
  let body: { messages?: unknown; sessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "A non-empty 'messages' array is required." },
      { status: 400 }
    );
  }

  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: ALLOWED_ROLES.has(m?.role as string) ? m.role : "user",
      content: String(m?.content ?? "").slice(0, MAX_CONTENT),
    }))
    .filter((m) => m.content.length > 0);

  // 4. Resolve the conversation. A supplied id must belong to this user —
  //    scoping by userId in the WHERE is the ownership check.
  let sessionId = typeof body.sessionId === "string" ? body.sessionId : null;

  if (sessionId) {
    const owned = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    if (!owned) sessionId = null; // stale or someone else's id → start fresh
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!sessionId) {
    const created = await createChatSession(user.id, {
      model: OLLAMA_MODEL,
      title: lastUserMessage ? titleFrom(lastUserMessage.content) : "New chat",
    });
    sessionId = created.id;
  }

  // Persist the user's turn BEFORE calling the model, so their message isn't
  // lost if the provider errors or the stream dies mid-flight.
  if (lastUserMessage) {
    await appendMessage({
      sessionId,
      role: "user",
      content: lastUserMessage.content,
    });
  }

  const turnStartedAt = Date.now();

  // 5. Stream the reply as SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      // Career grid, assembled across tool calls for this request.
      const gridId = crypto.randomUUID();
      let grid: CareerGridData | null = null;

      // `grid` is only ever assigned inside the tool callbacks below, which
      // TypeScript's control-flow analysis can't see — it narrows `grid` to
      // `null` and treats every read as unreachable. Reading through these two
      // typed accessors keeps the declared union type at the call sites.
      const currentGrid = (): CareerGridData | null => grid;
      const setGrid = (next: CareerGridData | null): void => {
        grid = next;
      };

      // Tool calls made this turn, collected for persistence.
      const toolCalls: ToolCallRecord[] = [];
      const byId = new Map<string, ToolCallRecord>();

      /** Emit the grid as it currently stands (same id → UI replaces in place). */
      const emitGrid = (final: boolean) => {
        const built = currentGrid();
        if (!built || built.paths.length === 0) return;
        send({ type: "grid", gridId, data: built, final });
      };

      /** Open the grid if the model hasn't called start_career_grid yet. */
      const ensureGrid = (): CareerGridData => {
        const existing = currentGrid();
        if (existing) return existing;
        const created: CareerGridData = {
          title: "Career Paths for You",
          startingPoint: { label: "You", description: "Your starting point" },
          paths: [],
        };
        setGrid(created);
        return created;
      };

      try {
        // The client needs the session id immediately: a brand-new chat only
        // learns its id from here.
        send({ type: "start", sessionId });

        const result = await generateRecommendation(messages, {
          profileContext: formatProfileForPrompt(user.profile),
          onToken: (text) => send({ type: "token", text }),

          onTool: (info) => {
            const record: ToolCallRecord = {
              callId: info.id,
              name: info.name,
              arguments: info.arguments,
              ok: true,
            };
            toolCalls.push(record);
            byId.set(info.id, record);

            if (info.name === "start_career_grid") {
              // Opens the grid. The UI shows an empty frame until tracks arrive.
              const args = info.arguments as Record<string, unknown>;
              const next = ensureGrid();
              next.title = str(args.title, "Career Paths for You");
              next.startingPoint = {
                label: str(args.startingLabel, "You"),
                description: str(args.startingDescription, "Your starting point"),
              };
              // Models often emit add_career_path in the SAME batch as the
              // header, so those tracks may already be here — keep them.
              setGrid(next);

              send({ type: "tool", id: info.id, name: info.name, arguments: info.arguments });
              emitGrid(false);
              return;
            }

            if (info.name === "add_career_path") {
              const next = ensureGrid();
              if (next.paths.length < MAX_GRID_PATHS) {
                next.paths.push(normalizeCareerPath(info.arguments));
                setGrid(next);
                emitGrid(false);
              } else {
                console.warn("[chat] add_career_path beyond MAX_GRID_PATHS — ignored");
              }
              // No badge for each track — the grid drawing itself is the feedback.
              return;
            }

            send({ type: "tool", id: info.id, name: info.name, arguments: info.arguments });
          },

          onToolResult: (info) => {
            // Fold the outcome into the record so it survives a page reload.
            const record = byId.get(info.id);
            if (record) {
              record.ok = info.ok;
              record.resultSummary = info.summary;
              record.durationMs = info.durationMs;
            }

            // Lets the badge flip from "Searching…" to what actually came back.
            send({
              type: "tool_result",
              id: info.id,
              name: info.name,
              summary: info.summary,
              ok: info.ok,
              durationMs: info.durationMs,
            });
          },
        });

        const built = currentGrid();
        if (built && built.paths.length > 0) {
          enforceSingleRecommended(built.paths);
          emitGrid(true);
        }

        // 6. Persist the assistant's turn. A failure here must not break the
        //    stream the user already received, so it's caught separately.
        try {
          const assistantMessage = await appendMessage({
            sessionId,
            role: "assistant",
            content: result.text,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            durationMs: Date.now() - turnStartedAt,
          });

          await persistToolCalls(assistantMessage.id, toolCalls);

          const gridToSave = currentGrid();
          if (gridToSave && gridToSave.paths.length > 0) {
            await persistGrid({
              gridId,
              sessionId,
              messageId: assistantMessage.id,
              userId: user.id,
              grid: gridToSave,
            });
          }
        } catch (err) {
          console.error("[chat] failed to persist the turn:", err);
        }

        send({ type: "done" });
      } catch (err) {
        // Give the UI a friendly error instead of dropping the connection.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[chat] error:", message);

        // Record the failure so the transcript shows what went wrong.
        try {
          await appendMessage({
            sessionId: sessionId as string,
            role: "assistant",
            content: "",
            durationMs: Date.now() - turnStartedAt,
            error: message.slice(0, 500),
          });
        } catch (persistErr) {
          console.error("[chat] failed to record the error turn:", persistErr);
        }

        const friendly = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)
          ? "Can't reach the local Ollama server. Start it with `ollama serve` and make sure a model is pulled (e.g. `ollama pull llama3.1`)."
          : /401|unauthorized|api key/i.test(message)
            ? "Ollama rejected the request — check that OLLAMA_API_KEY in .env.local is valid (https://ollama.com/settings/keys)."
            : `Something went wrong: ${message}`;
        // Keep whatever grid we managed to assemble.
        emitGrid(true);
        send({ type: "error", message: friendly });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable proxy buffering so tokens arrive live
      ...rateHeaders,
    },
  });
}
