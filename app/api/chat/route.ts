/**
 * app/api/chat/route.ts — Chat endpoint.
 *
 * The ONLY place the browser talks to the AI. It:
 *   1. Rate-limits each client IP (see lib/rateLimit.ts).
 *   2. Validates + sanitizes the incoming messages.
 *   3. Streams the model's reply back as Server-Sent Events (SSE).
 *   4. Re-assembles the career grid from the model's `start_career_grid` /
 *      `add_career_path` tool calls and streams it as it grows.
 *
 * SSE contract for the UI:
 *   Each event is a line:  `data: <json>\n\n`
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
import { generateRecommendation } from "@/lib/ollama";
import { rateLimit } from "@/lib/rateLimit";
import type { CareerGridData, CareerPath, CareerRole } from "@/lib/types/career";

export const runtime = "nodejs"; // Ollama needs Node, not the Edge runtime

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

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP
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

  // 2. Parse + validate the body
  let body: { messages?: unknown };
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

  // 3. Stream the reply as SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      // Career grid, assembled across tool calls for this request.
      const gridId = crypto.randomUUID();
      let grid: CareerGridData | null = null;

      /** Emit the grid as it currently stands (same id → UI replaces in place). */
      const emitGrid = (final: boolean) => {
        if (!grid || grid.paths.length === 0) return;
        send({ type: "grid", gridId, data: grid, final });
      };

      try {
        send({ type: "start" });
        await generateRecommendation(messages, {
          onToken: (text) => send({ type: "token", text }),

          onTool: (info) => {
            if (info.name === "start_career_grid") {
              // Opens the grid. The UI shows an empty frame until tracks arrive.
              const args = info.arguments as Record<string, unknown>;
              grid = {
                title: str(args.title, "Career Paths for You"),
                startingPoint: {
                  label: str(args.startingLabel, "You"),
                  description: str(args.startingDescription, "Your starting point"),
                },
                // Models often emit add_career_path in the SAME batch as the
                // header, so those tracks can already be here — keep them.
                paths: grid?.paths ?? [],
              };
              send({ type: "tool", id: info.id, name: info.name, arguments: info.arguments });
              emitGrid(false);
              return;
            }

            if (info.name === "add_career_path") {
              if (!grid) {
                // Model skipped start_career_grid — open the grid on the fly.
                grid = {
                  title: "Career Paths for You",
                  startingPoint: { label: "You", description: "Your starting point" },
                  paths: [],
                };
              }
              if (grid.paths.length < MAX_GRID_PATHS) {
                grid.paths.push(normalizeCareerPath(info.arguments));
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

        // Final grid — marks the map complete (no more tracks coming).
        emitGrid(true);
        send({ type: "done" });
      } catch (err) {
        // Give the UI a friendly error instead of dropping the connection.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[chat] error:", message);
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
