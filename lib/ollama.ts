/**
 * lib/ollama.ts — AI RECOMMENDATION MODULE.
 *
 * Everything about talking to the Ollama model lives here:
 *   - the tool-calling loop (streams tokens, runs web_search / web_fetch /
 *     start_career_grid / add_career_path through the registry in lib/tools)
 *   - the streaming chat call
 *
 * The Ollama client itself is built in lib/ollamaClient.ts, which this module
 * and the tools both import (that indirection avoids an import cycle).
 *
 * ---------------------------------------------------------------------------
 * THE LOOP, AND WHY IT TERMINATES
 * ---------------------------------------------------------------------------
 *   1. Stream a round. If the model emits no tool_calls, that round IS the
 *      final answer — it already reached the user token by token.
 *   2. If it does emit tool_calls, append the assistant's request (including
 *      `tool_calls`, which the API requires to pair with the results), run
 *      every call, and append one `role: "tool"` message per call. Then loop.
 *   3. Terminate early — every tool result is a compact digest, so rounds are
 *      cheap, but a model can still fixate on one query. Two guards:
 *        • an identical call is never executed twice (the repeat gets a short
 *          pointer back to the digest already in context), and
 *        • a round where EVERY call was a repeat ends the loop immediately.
 *   4. Whatever ends the loop, the function finishes by streaming a real
 *      answer with tools switched OFF. The user always gets prose after a
 *      tool call — never a dangling tool badge.
 *
 * This file is SERVER-ONLY. Never import it from a "use client" component —
 * the browser must go through app/api/chat/route.ts instead.
 *
 * Quick connectivity check: `node --env-file=.env.local scripts/ollama-smoke-test.mjs`
 */

import type { Message, ToolCall } from "ollama";
import { client, OLLAMA_MODEL } from "@/lib/ollamaClient";
import { toolSchemas, executeToolCall, describeToolResult } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/prompts";

export { OLLAMA_MODEL };

/**
 * Safety valve: tool-call rounds before we force a final answer.
 *
 * A normal turn needs about 4-6: a round or two of research searches, one for
 * start_career_grid, one or two for the add_career_path calls, then the
 * summary. 20 leaves a lot of headroom for broad questions that trigger many
 * searches and a 5-track grid.
 *
 * Raising this does NOT make turns longer in practice — the duplicate guard
 * below ends the loop as soon as the model re-requests work it already has.
 * What actually caps a turn in production is the hosting timeout, not this
 * number: on Vercel the function is killed at its `maxDuration` regardless.
 */
const MAX_TOOL_ROUNDS = 20;

/** How many times one identical call may be re-requested before we stop running it. */
const MAX_IDENTICAL_CALLS = 1;

/** Shown when a stream delivers neither tool calls nor text. */
const EMPTY_REPLY_FALLBACK =
  "Sorry — I didn't manage to produce a reply there. Could you ask again, or narrow the question down a little?";

/** A tool the model asked for, addressed by a stable `id` the UI can match on. */
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result reported back to the caller after a tool finishes. */
export interface ToolResultInfo extends ToolCallInfo {
  /** Short human-readable outcome, e.g. "Read 4 pages · 4 sources summarized". */
  summary: string;
  ok: boolean;
  durationMs: number;
}

/** Token accounting for a whole turn, reported by the model. */
export interface TurnUsage {
  /**
   * Size of the context on the final round — not a sum. Every round re-sends
   * the whole conversation, so adding them up would count the history once per
   * round and wildly overstate it.
   */
  promptTokens: number | null;
  /** Tokens actually generated, summed across every round of the turn. */
  completionTokens: number | null;
}

export interface GenerateResult {
  /** The final assistant text (also streamed live through onToken). */
  text: string;
  usage: TurnUsage;
}

export interface GenerateOptions {
  /** Called with each chunk of the model's reply as it is produced (live tokens). */
  onToken?: (text: string) => void;
  /** Called when the model requests a tool, before it is executed. */
  onTool?: (info: ToolCallInfo) => void;
  /** Called when a tool finishes, with a compact summary of what it returned. */
  onToolResult?: (info: ToolResultInfo) => void;
  /**
   * "What we already know" block from the user's saved profile, so the intake
   * doesn't re-ask what they've already entered. See lib/profile.ts.
   */
  profileContext?: string | null;
}

/** Stable identity for a call, so identical requests can be spotted. */
function callSignature(call: ToolCall): string {
  const name = call.function?.name ?? "unknown";
  let args = "";
  try {
    args = JSON.stringify(call.function?.arguments ?? {});
  } catch {
    args = String(call.function?.arguments);
  }
  return `${name}:${args}`;
}

/**
 * Accumulates token counts across the rounds of one turn. Ollama reports
 * `prompt_eval_count` / `eval_count` on the final chunk of each stream.
 */
class UsageMeter {
  private completion = 0;
  private lastPrompt: number | null = null;
  private finished = false;

  /** Feed every chunk; only the terminating one carries the counts. */
  record(chunk: { prompt_eval_count?: number; eval_count?: number }): void {
    if (typeof chunk.prompt_eval_count === "number") {
      this.lastPrompt = chunk.prompt_eval_count;
    }
    if (typeof chunk.eval_count === "number") {
      this.completion += chunk.eval_count;
    }
  }

  finish(): void {
    this.finished = true;
  }

  snapshot(): TurnUsage {
    return {
      promptTokens: this.lastPrompt,
      completionTokens: this.finished || this.completion > 0 ? this.completion : null,
    };
  }
}

/**
 * Run the full chat loop against Ollama.
 *
 * @returns the final assistant text (also streamed live through onToken) plus
 *          the turn's token usage, for the `messages` table.
 */
export async function generateRecommendation(
  messages: { role: string; content: string }[],
  { onToken, onTool, onToolResult, profileContext }: GenerateOptions = {}
): Promise<GenerateResult> {
  const working: Message[] = [
    { role: "system", content: buildSystemPrompt(profileContext) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  /** signature → times requested, so repeats are answered from context. */
  const seen = new Map<string, number>();
  const usage = new UsageMeter();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // stream: true → chunks arrive as tokens; tool_calls arrive on the last chunk
    const response = await client.chat({
      model: OLLAMA_MODEL,
      messages: working,
      tools: toolSchemas,
      stream: true,
    });

    let content = "";
    let toolCalls: ToolCall[] = [];

    for await (const chunk of response) {
      const piece = chunk.message?.content ?? "";
      if (piece) {
        content += piece;
        onToken?.(piece);
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls = chunk.message.tool_calls;
      }
      usage.record(chunk);
    }

    if (toolCalls.length === 0) {
      // Final answer — already streamed token by token.
      if (content.trim()) {
        usage.finish();
        return { text: content, usage: usage.snapshot() };
      }
      // The model returned nothing at all; say so rather than leaving the
      // user with an empty bubble.
      onToken?.(EMPTY_REPLY_FALLBACK);
      usage.finish();
      return { text: EMPTY_REPLY_FALLBACK, usage: usage.snapshot() };
    }

    // The model asked for tools. Its request message MUST be recorded with the
    // tool_calls intact, otherwise the API has nothing to attach the results to.
    working.push({ role: "assistant", content: content || "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      onTool?.({
        id: callSignature(call),
        name: call.function?.name ?? "unknown",
        arguments: (call.function?.arguments ?? {}) as Record<string, unknown>,
      });
    }

    // Execute every call in this round concurrently. Each result becomes one
    // `role: "tool"` message carrying `tool_name` — the shape the API pairs
    // with the assistant's tool_calls above.
    let freshCalls = 0;

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const signature = callSignature(call);
        const timesSeen = seen.get(signature) ?? 0;
        seen.set(signature, timesSeen + 1);

        const name = call.function?.name ?? "unknown";
        const args = (call.function?.arguments ?? {}) as Record<string, unknown>;
        const started = Date.now();

        // Repeat guard: an identical call already ran this turn, and its result
        // is sitting in the conversation. Point the model at it instead of
        // paying for the same search twice (or looping forever).
        if (timesSeen >= MAX_IDENTICAL_CALLS) {
          onToolResult?.({
            id: signature,
            name,
            arguments: args,
            summary: "Already ran — reusing the earlier result",
            ok: true,
            durationMs: 0,
          });
          return {
            role: "tool" as const,
            content: JSON.stringify({
              duplicate: true,
              note:
                "You already made this exact call in this turn. Its result is earlier in this " +
                "conversation and has NOT changed. Use that result now — do not call it again.",
            }),
            tool_name: name,
          };
        }

        freshCalls++;

        try {
          const result = await executeToolCall(call);
          onToolResult?.({
            id: signature,
            name,
            arguments: args,
            summary: describeToolResult(name, result),
            ok: true,
            durationMs: Date.now() - started,
          });
          return {
            role: "tool" as const,
            content: typeof result === "string" ? result : JSON.stringify(result),
            tool_name: name,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[tools] ${name} failed:`, message);
          onToolResult?.({
            id: signature,
            name,
            arguments: args,
            summary: `Failed: ${message}`,
            ok: false,
            durationMs: Date.now() - started,
          });
          return {
            role: "tool" as const,
            content: JSON.stringify({
              error: message,
              note: "This tool failed. Continue without it rather than retrying the same call.",
            }),
            tool_name: name,
          };
        }
      })
    );

    // Send every result back to the model, in the order the calls were made.
    working.push(...results);

    // Every call this round was a repeat → another round can't teach the model
    // anything. Stop and make it answer with what it has.
    if (freshCalls === 0) {
      console.warn("[chat] all tool calls were repeats — forcing a final answer");
      break;
    }
  }

  const text = await streamFinalAnswer(working, onToken, usage);
  usage.finish();
  return { text, usage: usage.snapshot() };
}

/**
 * Produce the user-facing answer with tools disabled. Used when the loop ends
 * without the model volunteering text, so a tool-only turn is never a dead end.
 */
async function streamFinalAnswer(
  working: Message[],
  onToken: ((text: string) => void) | undefined,
  usage: UsageMeter
): Promise<string> {
  let content = "";

  try {
    const response = await client.chat({
      model: OLLAMA_MODEL,
      messages: [
        ...working,
        {
          role: "system",
          content:
            "You have finished using tools. Answer the user now, in prose, using the results above. " +
            "Do not request any more tools.",
        },
      ],
      stream: true,
    });

    for await (const chunk of response) {
      const piece = chunk.message?.content ?? "";
      if (piece) {
        content += piece;
        onToken?.(piece);
      }
      usage.record(chunk);
    }
  } catch (err) {
    console.error("[chat] final answer failed:", err);
  }

  if (!content.trim()) {
    onToken?.(EMPTY_REPLY_FALLBACK);
    return EMPTY_REPLY_FALLBACK;
  }

  return content;
}
