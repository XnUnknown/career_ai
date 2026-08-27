/**
 * lib/tools/index.ts — TOOL REGISTRY (Member 3 owns this file).
 *
 * Defines the two tools the AI can call (web_search, web_fetch), exposes their
 * Ollama function-calling schemas, and dispatches calls to the implementations.
 *
 * The schemas + dispatch below are the CONTRACT the AI module (lib/ollama.ts)
 * depends on. The stub bodies are placeholders — Member 3 replaces them with
 * the real Tavily/SerpAPI/Brave (webSearch) and Cheerio+Undici (webFetch) code.
 * Keep the exported names + return shapes unchanged so the AI module keeps working.
 */

import type { Tool, ToolCall } from "ollama";

// ---------------------------------------------------------------------------
// Ollama function-calling schemas — the tools the model is allowed to request.
// These get passed to client.chat({ tools }) in lib/ollama.ts.
// ---------------------------------------------------------------------------
export const toolSchemas: Tool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current, factual information (job outlook, salary ranges, courses, certifications). Use when you need up-to-date data about careers or the job market.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query, e.g. 'data analyst salary India 2026'",
          },
          maxResults: {
            type: "number",
            description: "Optional. How many results to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch the text content of a specific URL (course pages, career pages, articles). Use after web_search to read a promising result.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Dispatch — run a tool call the model requested (called by lib/ollama.ts).
// ---------------------------------------------------------------------------
export async function executeToolCall(call: ToolCall): Promise<unknown> {
  const name = call.function.name;
  const args = call.function.arguments ?? {};

  switch (name) {
    case "web_search":
      return webSearch(args.query, args.maxResults);
    case "web_fetch":
      return webFetch(args.url);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// STUB IMPLEMENTATIONS — Member 3 replaces these bodies (not the signatures).
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** TODO(Member 3): call Tavily / SerpAPI / Brave Search with args.query */
async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  return [
    {
      title: "Web search not implemented yet",
      url: "",
      snippet: `Member 3 still needs to wire up web_search for: "${query}" (max ${maxResults} results).`,
    },
  ];
}

/** TODO(Member 3): fetch args.url with Undici, parse the HTML with Cheerio */
async function webFetch(url: string): Promise<{ title?: string; content: string }> {
  return {
    title: "Web fetch not implemented yet",
    content: `Member 3 still needs to wire up web_fetch for: ${url}`,
  };
}
