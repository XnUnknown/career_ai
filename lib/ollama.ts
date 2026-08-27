/**
 * lib/ollama.ts — AI RECOMMENDATION MODULE (Member 2).
 *
 * Everything about talking to the Ollama model lives here:
 *   - the Ollama client (host from env, defaults to localhost:11434)
 *   - the tool-calling loop (streams tokens, executes web_search / web_fetch
 *     through the registry in lib/tools when the model asks for them)
 *   - the streaming chat call
 *
 * LOCAL vs CLOUD:
 *   - Local Ollama  → OLLAMA_HOST=http://localhost:11434, no key needed.
 *   - Ollama Cloud   → OLLAMA_HOST=https://ollama.com + OLLAMA_API_KEY.
 *     Cloud requires `Authorization: Bearer <key>`, so we attach it whenever
 *     a key is present. Cloud model names DON'T use the `-cloud` suffix
 *     (e.g. llama3.1, gpt-oss:120b).
 *
 * This file is SERVER-ONLY. Never import it from a "use client" component —
 * the browser must go through app/api/chat/route.ts instead.
 *
 * Quick connectivity check: `node --env-file=.env.local scripts/ollama-smoke-test.mjs`
 */

import { Ollama, type Message, type ToolCall } from "ollama";
import { toolSchemas, executeToolCall } from "@/lib/tools";
import { buildSystemPrompt } from "@/lib/prompts";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;

const client = new Ollama({
  host: OLLAMA_HOST,
  // Only attach auth when a key exists — local Ollama needs none.
  ...(OLLAMA_API_KEY ? { headers: { Authorization: `Bearer ${OLLAMA_API_KEY}` } } : {}),
});

export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

/** Safety valve: how many tool-call rounds before giving up (prevents infinite loops). */
const MAX_TOOL_ROUNDS = 3;

export interface GenerateOptions {
  /** Called with each chunk of the model's reply as it is produced (live tokens). */
  onToken?: (text: string) => void;
  /** Called when the model requests a tool, before it is executed. */
  onTool?: (call: ToolCall) => void;
}

/**
 * Run the full chat loop against Ollama:
 *   1. Prepend the system prompt (persona) to the conversation.
 *   2. Stream the model's reply. If it emits tool_calls, execute each one,
 *      append the results, and let the model continue (up to MAX_TOOL_ROUNDS).
 *   3. When the model stops requesting tools, the accumulated text IS the
 *      final answer — it was already delivered token-by-token via onToken.
 *
 * @returns the final assistant text (also streamed live through onToken).
 */
export async function generateRecommendation(
  messages: { role: string; content: string }[],
  { onToken, onTool }: GenerateOptions = {}
): Promise<string> {
  const working: Message[] = [
    { role: "system", content: buildSystemPrompt() },
    ...messages.map((m) => ({ role: m.role as Message["role"], content: m.content })),
  ];

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
    }

    if (toolCalls.length === 0) {
      // Final answer — already streamed.
      return content;
    }

    // The model asked for tools. Record its message, run each tool, feed the
    // results back, then loop so it can produce the real answer.
    working.push({ role: "assistant", content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      onTool?.(call);
      const result = await executeToolCall(call);
      working.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_name: call.function.name,
      });
    }
  }

  // Loop exhausted — the model kept calling tools. Bail out gracefully.
  const bailout = "\n\n⚠️ I hit my tool-call limit. Try asking in simpler steps.";
  onToken?.(bailout);
  return bailout;
}
