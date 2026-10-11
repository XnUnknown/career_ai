/**
 * lib/ollamaClient.ts — the ONE place the Ollama client is built.
 *
 * Both the chat loop (lib/ollama.ts) and the web tools (lib/tools/index.ts)
 * need the same client. Importing the client from lib/ollama.ts into the tools
 * would create a cycle (ollama → tools → ollama), so it lives here instead.
 *
 * LOCAL vs CLOUD:
 *   - Local Ollama  → OLLAMA_HOST=http://localhost:11434, no key needed.
 *   - Ollama Cloud  → OLLAMA_HOST=https://ollama.com + OLLAMA_API_KEY.
 *     Cloud requires `Authorization: Bearer <key>`, so we attach it whenever
 *     a key is present. Cloud model names DON'T use the `-cloud` suffix.
 *
 * WEB TOOLS (web_search / web_fetch) are CLOUD-ONLY. The Ollama SDK always
 * posts them to https://ollama.com/api/*, so they need OLLAMA_API_KEY even
 * when chat itself runs against a local server.
 *
 * This file is SERVER-ONLY. Never import it from a "use client" component.
 */

import { Ollama } from "ollama";

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "https://ollama.com";
export const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

export const client = new Ollama({
  host: OLLAMA_HOST,
  // Only attach auth when a key exists — local Ollama needs none.
  ...(OLLAMA_API_KEY ? { headers: { Authorization: `Bearer ${OLLAMA_API_KEY}` } } : {}),
});

/** Web search/fetch hit the hosted API and require a key. */
export const webToolsAvailable = Boolean(OLLAMA_API_KEY);

/** Human-readable reason the web tools can't run, or null when they can. */
export function webToolsUnavailableReason(): string | null {
  if (webToolsAvailable) return null;
  return (
    "Web search is unavailable: OLLAMA_API_KEY is not set. Ollama's web_search/web_fetch " +
    "endpoints are cloud services — add OLLAMA_API_KEY to .env.local " +
    "(get one at https://ollama.com/settings/keys)."
  );
}
