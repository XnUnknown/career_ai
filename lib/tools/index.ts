/**
 * lib/tools/index.ts — TOOL REGISTRY.
 *
 * Defines the tools the model may call, exposes their Ollama function-calling
 * schemas, and dispatches the calls.
 *
 * ---------------------------------------------------------------------------
 * WEB RESEARCH PIPELINE (all of it runs on Ollama — no third-party services)
 * ---------------------------------------------------------------------------
 * The model only ever sees a SHORT digest. Raw pages never reach the chat
 * context. When the model calls `web_search`:
 *
 *   1. SEARCH   → client.webSearch()  (POST https://ollama.com/api/web_search)
 *   2. FETCH    → client.webFetch() for EVERY link the search returned,
 *                 concurrently and fault-tolerantly. A page that 404s or times
 *                 out falls back to the text the search API already returned,
 *                 so one dead link can't sink the whole search.
 *   3. SUMMARIZE→ one extra LLM call that compresses all fetched pages into a
 *                 compact, career-focused digest (salary, entry paths, skills,
 *                 outlook, courses, caveats) — with exact numbers preserved.
 *   4. RETURN   → { query, sources, digest } is handed back to the main model
 *                 as the tool result. A single search returns ~40k chars of raw
 *                 page text; the digest is a few hundred words, which is what
 *                 keeps the conversation from blowing past the model's context.
 *
 * `web_fetch` (the model fetching one specific URL) goes through the same
 * fetch + summarize path, so its result is compact too.
 *
 * Caching: search/fetch results are memoised in-process for a few minutes.
 * Models routinely re-issue near-identical searches, and the cache turns those
 * repeats into instant, free answers (and helps the model actually converge).
 *
 * Requires OLLAMA_API_KEY — the web endpoints are hosted at ollama.com.
 */

import type { Tool, ToolCall } from "ollama";
import {
  client,
  OLLAMA_MODEL,
  webToolsUnavailableReason,
} from "@/lib/ollamaClient";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** How many links to ask the search API for (and then fetch). API max is 10. */
const DEFAULT_MAX_RESULTS = 4;
const MAX_RESULTS_LIMIT = 5;

/** Concurrent web_fetch calls across the whole process. */
const FETCH_CONCURRENCY = 4;
/** Concurrent summarize LLM calls — kept low so we don't trip provider limits. */
const SUMMARY_CONCURRENCY = 2;

const SEARCH_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 20_000;
const SUMMARY_TIMEOUT_MS = 90_000;

/** Per-page and total character budgets fed to the summarizer. */
const MAX_PAGE_CHARS = 3_500;
const MAX_CORPUS_CHARS = 16_000;

/** In-process memo cache. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 120;

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
        "Search the web for current, factual information (job outlook, salary ranges, courses, certifications). " +
        "The server automatically reads every page the search returns and hands you back a compact summarized digest — " +
        "so you do NOT need to call web_fetch on search result URLs. " +
        "Do not repeat a search you have already run; use the digest you already have and move on.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query, e.g. 'data analyst salary India 2026'",
          },
          maxResults: {
            type: "number",
            description: `Optional. How many results to search and read (default ${DEFAULT_MAX_RESULTS}, max ${MAX_RESULTS_LIMIT}).`,
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
        "Fetch and summarize ONE specific URL you already know (e.g. a course page or article found earlier). " +
        "Use this only for URLs that are NOT from a previous web_search — those pages were already fetched and summarized for you.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_career_grid",
      description:
        "Begin the user's career grid. Call this ONCE before any add_career_path calls, after you have finished your research. " +
        "It sets the grid title, the user's starting point, and the names of the tracks you are about to add. " +
        "Then add each track with add_career_path.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the career grid, e.g. 'Career Paths for You'",
          },
          startingLabel: {
            type: "string",
            description: "Short label for the user's current position, e.g. 'You (CS Graduate, Age 22)'",
          },
          startingDescription: {
            type: "string",
            description: "One sentence describing the user's current situation.",
          },
          pathNames: {
            type: "array",
            items: { type: "string" },
            description:
              "The 3-5 career track names you are about to add, in the order you will add them.",
          },
        },
        required: ["title", "startingLabel", "startingDescription", "pathNames"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_career_path",
      description:
        "Add ONE career track to the grid: a path name and 3 roles in progression (entry → mid → senior). " +
        "Call this once per track — several times in a row, one call per track. " +
        "The frontend draws the grid as these arrive, so each call must be complete on its own. " +
        "Set recommended=true on exactly ONE track in the whole grid.",
      parameters: {
        type: "object",
        properties: {
          pathName: {
            type: "string",
            description: "Name of this career track, e.g. 'Software Engineering'",
          },
          recommended: {
            type: "boolean",
            description:
              "True for the SINGLE track you recommend most highly for this user. False for all others.",
          },
          roles: {
            type: "array",
            description:
              "Exactly 3 roles in this track, from entry-level to senior. Keep each field short and factual.",
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Role title, e.g. 'Junior Software Developer'",
                },
                yearsFromStart: {
                  type: "string",
                  description: "Typical time to reach this role, e.g. '0-1 years'",
                },
                salaryRange: {
                  type: "string",
                  description: "Salary range, e.g. '₹4-8 LPA' or '$50K-$75K'",
                },
                skills: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key skills for this role (3-5 short items).",
                },
                description: {
                  type: "string",
                  description: "What this role involves — max 2 sentences.",
                },
                entryPath: {
                  type: "string",
                  description: "How to get into this role — degrees, certifications, bootcamps. Max 1 sentence.",
                },
                outlook: {
                  type: "string",
                  description: "Job market outlook for this role — max 1 sentence.",
                },
              },
              required: [
                "title",
                "yearsFromStart",
                "salaryRange",
                "skills",
                "description",
                "entryPath",
                "outlook",
              ],
            },
          },
        },
        required: ["pathName", "recommended", "roles"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

/** Coerce whatever the model passed as `maxResults` into a usable integer. */
function normalizeMaxResults(requested: unknown): number {
  const value = typeof requested === "number" ? requested : Number(requested);
  if (!Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
  return Math.trunc(value as number);
}

/** Reject a promise that takes too long, so one slow host can't hang the chat. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Bounded-concurrency map — preserves input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Simple counting semaphore, shared process-wide via the singletons below. */
class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

const fetchSemaphore = new Semaphore(FETCH_CONCURRENCY);
const summarySemaphore = new Semaphore(SUMMARY_CONCURRENCY);

/** Memoise expensive async work (search / fetch / summarize) with a TTL. */
const cache = new Map<string, { value: unknown; expires: number }>();

async function cached<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const value = await produce();

  // Drop expired entries first, then the oldest, if we're at capacity.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
    while (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// ---------------------------------------------------------------------------
// Dispatch — run a tool call the model requested (called by lib/ollama.ts).
// ---------------------------------------------------------------------------
export async function executeToolCall(call: ToolCall): Promise<unknown> {
  const name = call.function.name;
  const args = (call.function.arguments ?? {}) as Record<string, any>;

  switch (name) {
    case "web_search":
      return webSearch(String(args.query ?? ""), Number(args.maxResults));
    case "web_fetch":
      return webFetch(String(args.url ?? ""));
    case "start_career_grid":
      return startCareerGrid(args);
    case "add_career_path":
      return addCareerPath(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// web_search — search, read every result, summarize, return the digest.
// ---------------------------------------------------------------------------

/** One page we successfully read (or recovered from the search payload). */
interface FetchedPage {
  title: string;
  url: string;
  content: string;
  /** true when the live fetch failed and we used the search API's own text. */
  fromSearchFallback: boolean;
}

interface SearchDigest {
  query: string;
  /** Compact career-focused summary of every page that was read. */
  digest: string;
  /** Where the facts came from — cite these, or web_fetch one for more depth. */
  sources: { title: string; url: string }[];
  pagesRead: number;
  /** Present only when something went wrong. */
  error?: string;
}

async function webSearch(query: string, requested?: number): Promise<SearchDigest | { error: string }> {  const trimmed = query.trim();
  if (!trimmed) return { error: "web_search requires a non-empty 'query'." };

  const unavailable = webToolsUnavailableReason();
  if (unavailable) return { error: unavailable };

  const maxResults = Math.min(Math.max(1, normalizeMaxResults(requested)), MAX_RESULTS_LIMIT);

  return cached(`search:${maxResults}:${trimmed.toLowerCase()}`, () =>
    runSearchPipeline(trimmed, maxResults)
  );
}

async function runSearchPipeline(query: string, maxResults: number): Promise<SearchDigest> {
  // 1. SEARCH -----------------------------------------------------------------
  let hits: { title: string; url: string; content: string }[];
  try {
    const response = await withTimeout(
      // The SDK's WebSearchResult type only declares `content`, but the API
      // also returns `title` and `url` — hence the cast.
      client.webSearch({ query, maxResults }),
      SEARCH_TIMEOUT_MS,
      "Ollama web search"
    );
    hits = (response?.results ?? []) as unknown as typeof hits;
  } catch (err) {
    return {
      query,
      digest: "",
      sources: [],
      pagesRead: 0,
      error: `Web search failed: ${(err as Error).message}`,
    };
  }

  const usable = hits.filter((h) => h && typeof h.url === "string" && h.url.startsWith("http"));
  if (usable.length === 0) {
    return {
      query,
      digest: "",
      sources: [],
      pagesRead: 0,
      error: `Web search returned no usable results for "${query}".`,
    };
  }

  // 2. FETCH every result link (concurrently, tolerating individual failures).
  //    A failed fetch falls back to the page text the search API already gave
  //    us — so a dead link degrades quality instead of losing the search.
  const pages = await mapLimit(usable, FETCH_CONCURRENCY, async (hit) => {
    const fetched = await fetchPage(hit.url);
    if (fetched) {
      return {
        title: fetched.title || hit.title || hit.url,
        url: hit.url,
        content: fetched.content,
        fromSearchFallback: false,
      } satisfies FetchedPage;
    }
    return {
      title: hit.title || hit.url,
      url: hit.url,
      content: hit.content ?? "",
      fromSearchFallback: true,
    } satisfies FetchedPage;
  });

  const withText = pages.filter((p) => p.content.trim().length > 0);

  // 3. SUMMARIZE --------------------------------------------------------------
  let digest: string;
  let error: string | undefined;

  if (withText.length === 0) {
    return {
      query,
      digest: "",
      sources: pages.map(({ title, url }) => ({ title, url })),
      pagesRead: 0,
      error: `Found ${usable.length} result(s) for "${query}" but none could be read.`,
    };
  }

  try {
    digest = await summarizeForCareer(
      query,
      withText.map((p) => ({ url: p.url, title: p.title, content: p.content }))
    );
  } catch (err) {
    // Summarizer down? Still hand the model something compact rather than
    // dumping raw pages into the context.
    error = `Summarization failed (${(err as Error).message}); returning trimmed excerpts.`;
    digest = withText
      .map((p) => `**${p.title}** (${p.url})\n${truncate(p.content.replace(/\s+/g, " "), 600)}`)
      .join("\n\n");
  }

  return {
    query,
    digest,
    sources: pages.map(({ title, url }) => ({ title, url })),
    pagesRead: withText.length,
    ...(error ? { error } : {}),
  };
}

// ---------------------------------------------------------------------------
// web_fetch — read + summarize one specific URL the model asked for.
// ---------------------------------------------------------------------------
interface FetchDigest {
  url: string;
  title?: string;
  digest: string;
  error?: string;
}

async function webFetch(url: string): Promise<FetchDigest> {
  const target = url.trim();
  if (!target) return { url: "", digest: "", error: "web_fetch requires a non-empty 'url'." };
  if (!/^https?:\/\//i.test(target)) {
    return { url: target, digest: "", error: `Not a valid http(s) URL: ${target}` };
  }

  const unavailable = webToolsUnavailableReason();
  if (unavailable) return { url: target, digest: "", error: unavailable };

  return cached(`fetch:${target.toLowerCase()}`, async () => {
    const page = await fetchPage(target);
    if (!page) {
      return { url: target, digest: "", error: `Could not read ${target} (fetch failed or page was empty).` };
    }

    try {
      const digest = await summarizeForCareer(
        `Details from ${target}`,
        [{ url: target, title: page.title, content: page.content }]
      );
      return { url: target, title: page.title, digest };
    } catch (err) {
      return {
        url: target,
        title: page.title,
        digest: truncate(page.content.replace(/\s+/g, " "), 1_500),
        error: `Summarization failed (${(err as Error).message}); returning a trimmed excerpt.`,
      };
    }
  });
}

/** Raw Ollama web_fetch. Returns null on any failure — callers decide the fallback. */
async function fetchPage(
  url: string
): Promise<{ title: string; content: string } | null> {
  try {
    return await fetchSemaphore.run(() =>
      withTimeout(client.webFetch({ url }), FETCH_TIMEOUT_MS, `Fetch of ${url}`).then(
        (res) => {
          const content = (res?.content ?? "").trim();
          if (!content) return null;
          return { title: (res?.title ?? "").trim(), content };
        }
      )
    );
  } catch (err) {
    console.warn(`[web_fetch] ${url} → ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Summarizer — the extra LLM call that keeps raw pages out of the chat context.
// ---------------------------------------------------------------------------

const SUMMARIZER_SYSTEM_PROMPT = `You are the research digest engine inside a career-guidance app.
You receive web pages that were fetched for a single search query, and you compress them into one compact digest that a career advisor can act on.

Extract ONLY what helps someone make a career decision:
- Salary / pay: exact figures, currency, region, seniority and the year the data is from
- Entry paths: degrees, certifications, exams, bootcamps, portfolios
- Skills and tools employers actually ask for
- Demand signals: growth, hiring volume, saturation, layoffs
- Named courses, programmes, universities or employers worth knowing
- Caveats: automation risk, licensing, regional limits

Rules:
- Bullet points only. No preamble, no "based on the sources", no conclusion.
- Hard limit ~250 words. Compress hard.
- Keep concrete numbers, names and dates. Drop marketing copy, menus, cookie banners and navigation text.
- If the pages disagree, report the range rather than picking one.
- Omit any category with no data. NEVER invent or extrapolate facts.
- Do not add a "Sources" list — URLs are tracked separately.`;

async function summarizeForCareer(
  query: string,
  pages: { url: string; title: string; content: string }[]
): Promise<string> {
  const corpus = pages
    .map(
      (p) =>
        `SOURCE: ${p.url}\nTITLE: ${p.title || "(untitled)"}\n${truncate(
          p.content.replace(/\s+/g, " "),
          MAX_PAGE_CHARS
        )}`
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_CORPUS_CHARS);

  const response = await summarySemaphore.run(() =>
    withTimeout(
      client.chat({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
          { role: "user", content: `Search query: ${query}\n\nFetched pages:\n\n${corpus}` },
        ],
        stream: false,
        options: { temperature: 0.1 },
      }),
      SUMMARY_TIMEOUT_MS,
      "Summarizer"
    )
  );

  const digest = (response?.message?.content ?? "").trim();
  if (!digest) throw new Error("summarizer returned an empty digest");
  return digest;
}

// ---------------------------------------------------------------------------
// Career grid — built in pieces.
//
// WHY TWO CALLS INSTEAD OF ONE: a model asked for the whole grid at once
// generates 4-6 KB of nested JSON in a single tool call, and Ollama's hosted
// chat API silently DISCARDS tool calls above ~2 KB — the reply comes back as
// an empty message (no content, no tool_calls) even though the model generated
// ~1100 tokens. That was the cause of the assistant going silent right after a
// tool call. `start_career_grid` (~270 chars) + one `add_career_path` per track
// (~1.3 KB) stay comfortably under that ceiling; measured 9/9 delivered.
//
// These tools do no server-side work: they hand the model's arguments to the
// route, which assembles the grid and streams it to the browser. Their RESULTS
// are deliberately tiny acks — the payload already went to the frontend, so
// echoing it back into the model's context would only burn tokens.
// ---------------------------------------------------------------------------
async function startCareerGrid(
  args: Record<string, unknown>
): Promise<{ gridStarted: true; note: string }> {
  const names = Array.isArray(args.pathNames) ? args.pathNames.length : 0;
  return {
    gridStarted: true,
    note: `Grid started with ${names} planned track(s). Call add_career_path once per track, then write your short summary.`,
  };
}

async function addCareerPath(
  args: Record<string, unknown>
): Promise<{ pathAdded: string; note: string }> {
  return {
    pathAdded: String(args.pathName ?? "untitled"),
    note: "Track added to the grid. Add the next track, or finish with a short text summary for the user.",
  };
}

// ---------------------------------------------------------------------------
// UI helper — one line describing what a tool returned, for the chat badge.
// ---------------------------------------------------------------------------
export function describeToolResult(name: string, result: unknown): string {
  const data = (result ?? {}) as Record<string, any>;

  if (data.error) return String(data.error).split(".")[0].slice(0, 90);

  switch (name) {
    case "web_search": {
      const pages = Number(data.pagesRead ?? 0);
      const sources = Array.isArray(data.sources) ? data.sources.length : 0;
      return `Read ${pages} page${pages === 1 ? "" : "s"} · ${sources} source${
        sources === 1 ? "" : "s"
      } summarized`;
    }
    case "web_fetch":
      return data.title ? `Summarized “${String(data.title).slice(0, 60)}”` : "Page summarized";
    case "start_career_grid":
      return "Building career map";
    case "add_career_path":
      return `Added “${String(data.pathAdded ?? "track").slice(0, 40)}”`;
    default:
      return "Done";
  }
}
