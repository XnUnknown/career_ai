/**
 * lib/sessionCache.ts — browser-side cache of conversations.
 *
 * Postgres stays the source of truth. This is a read-through cache in front of
 * it so a page reload paints instantly from disk instead of waiting on two
 * round trips, and so a conversation opened offline still shows its transcript.
 *
 * How it's used:
 *   - On load: render the cached transcript immediately, then fetch the real
 *     one and overwrite. The database always wins; the cache is never trusted
 *     over a successful fetch.
 *   - On use: every turn writes to *both* places — the server persists to
 *     Postgres, and the client mirrors the updated transcript here.
 *
 * Everything is wrapped in try/catch: localStorage throws in private windows,
 * when site data is blocked, and when the quota is full. A cache miss must
 * never break the chat, so every failure degrades to "no cache".
 */

import type { Message } from "@/lib/types";

/** Bump when the stored shape changes — old entries are then ignored. */
const VERSION = "v1";
const INDEX_KEY = `careercompass.${VERSION}.index`;
const SESSION_PREFIX = `careercompass.${VERSION}.session.`;

/** Keep the N most recently used conversations; the rest are evicted. */
const MAX_CACHED_SESSIONS = 12;

export interface CachedSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: number;
}

interface CachedSession {
  savedAt: number;
  messages: Message[];
}

function storage(): Storage | null {
  try {
    // Accessing localStorage itself throws in some privacy modes.
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Corrupt entry — drop it so it can't keep failing.
    try {
      store.removeItem(key);
    } catch {
      /* nothing more we can do */
    }
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;

  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Almost certainly QuotaExceededError. Free the oldest half and retry once.
    try {
      const index = readIndex();
      for (const entry of index.slice(Math.floor(MAX_CACHED_SESSIONS / 2))) {
        store.removeItem(SESSION_PREFIX + entry.id);
      }
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------------

function readIndex(): CachedSessionSummary[] {
  const parsed = readJson<CachedSessionSummary[]>(INDEX_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

export function readCachedSessions(): CachedSessionSummary[] {
  return readIndex();
}

export function writeCachedSessions(sessions: CachedSessionSummary[]): void {
  writeJson(INDEX_KEY, sessions.slice(0, MAX_CACHED_SESSIONS));
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

export function readCachedMessages(sessionId: string): Message[] | null {
  const cached = readJson<CachedSession>(SESSION_PREFIX + sessionId);
  if (!cached || !Array.isArray(cached.messages)) return null;
  return cached.messages;
}

export function cachedAt(sessionId: string): number | null {
  return readJson<CachedSession>(SESSION_PREFIX + sessionId)?.savedAt ?? null;
}

/**
 * Mirror a transcript into the cache and move the conversation to the front of
 * the index, evicting whatever falls off the end.
 */
export function writeCachedMessages(
  sessionId: string,
  messages: Message[],
  summary?: { title?: string | null; lastMessageAt?: number }
): void {
  const payload: CachedSession = { savedAt: Date.now(), messages };
  if (!writeJson(SESSION_PREFIX + sessionId, payload)) return;

  const index = readIndex();
  const existing = index.find((entry) => entry.id === sessionId);

  const entry: CachedSessionSummary = {
    id: sessionId,
    title: summary?.title ?? existing?.title ?? "New chat",
    messageCount: messages.length,
    lastMessageAt: summary?.lastMessageAt ?? existing?.lastMessageAt ?? Date.now(),
  };

  const next = [entry, ...index.filter((item) => item.id !== sessionId)];

  // Drop both the index entry and the transcript blob for anything evicted,
  // otherwise the blobs would sit there consuming quota forever.
  const store = storage();
  for (const evicted of next.slice(MAX_CACHED_SESSIONS)) {
    try {
      store?.removeItem(SESSION_PREFIX + evicted.id);
    } catch {
      /* ignore */
    }
  }

  writeJson(INDEX_KEY, next.slice(0, MAX_CACHED_SESSIONS));
}

/** Wipe everything this app cached (used on sign-out). */
export function clearSessionCache(): void {
  const store = storage();
  if (!store) return;

  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(`careercompass.${VERSION}.`)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    /* ignore */
  }
}
