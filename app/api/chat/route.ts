/**
 * app/api/chat/route.ts — Chat endpoint (Member 2: AI module).
 *
 * The ONLY place the browser talks to the AI. It:
 *   1. Rate-limits each client IP (see lib/rateLimit.ts).
 *   2. Validates + sanitizes the incoming messages.
 *   3. Streams the model's reply back as Server-Sent Events (SSE).
 *
 * SSE contract for the UI (Member 1 builds against this):
 *   Each event is a line:  `data: <json>\n\n`
 *   { "type": "token", "text": "..." }      → a piece of the answer (append to bubble)
 *   { "type": "tool", "name": "...", "arguments": {...} }   → a tool was called
 *   { "type": "done" }                      → stream finished, close the reader
 *   { "type": "error", "message": "..." }   → something failed
 */

import { NextRequest, NextResponse } from "next/server";
import { generateRecommendation } from "@/lib/ollama";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs"; // Ollama needs Node, not the Edge runtime

const MAX_MESSAGES = 12; // keep the prompt window small for a local model
const MAX_CONTENT = 4000; // per-message char cap
const ALLOWED_ROLES = new Set(["user", "assistant", "system"]);

/** Best-effort client IP (works locally and behind a proxy). */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
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

      try {
        send({ type: "start" });
        await generateRecommendation(messages, {
          onToken: (text) => send({ type: "token", text }),
          onTool: (call) =>
            send({ type: "tool", name: call.function.name, arguments: call.function.arguments }),
        });
        send({ type: "done" });
      } catch (err) {
        // Give the UI a friendly error instead of dropping the connection.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[chat] error:", message);
        const friendly = /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)
          ? "Can't reach the local Ollama server. Start it with `ollama serve` and make sure a model is pulled (e.g. `ollama pull llama3.1`)."
          : `Something went wrong: ${message}`;
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
