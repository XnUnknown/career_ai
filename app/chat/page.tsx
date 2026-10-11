"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatWindow } from "@/components/ChatWindow";
import { ChatInput } from "@/components/ChatInput";
import { GridPanel } from "@/components/GridPanel";
import { SessionSidebar, type SessionSummary } from "@/components/SessionSidebar";
import { Message, ToolCallInfo } from "@/lib/types";
import { CareerGridData } from "@/lib/types/career";
import {
  clearSessionCache,
  readCachedMessages,
  readCachedSessions,
  writeCachedMessages,
  writeCachedSessions,
} from "@/lib/sessionCache";

/**
 * Chat page — consumes the streaming SSE contract from /api/chat.
 *
 * Event format (one per line, separated by a blank line):
 *   data: {"type":"start","sessionId"}                 → stream opened
 *   data: {"type":"token","text":"..."}                → append to the reply
 *   data: {"type":"tool","id","name","arguments":{}}   → a tool was called
 *   data: {"type":"tool_result","id","summary","ok"}   → that tool finished
 *   data: {"type":"grid","gridId","data":{...}}        → career grid (redrawn as it grows)
 *   data: {"type":"done"}                              → stream finished
 *   data: {"type":"error","message":"..."}             → something failed
 *
 * Layout is a three-column split: sessions on the left, the conversation in the
 * middle, and the selected career map on the right. The map pane is a real
 * sibling column (not an overlay), so the chat stays live beside it and closing
 * the pane gives the full width back to the chat.
 */

type SSEPayload = {
  type: "start" | "token" | "tool" | "tool_result" | "grid" | "done" | "error";
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  summary?: string;
  ok?: boolean;
  durationMs?: number;
  gridId?: string;
  final?: boolean;
  sessionId?: string;
  data?: CareerGridData;
  message?: string;
};

interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

/** Id of the most recently created map in a transcript, if any. */
function lastGridId(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].gridData) return messages[i].id;
  }
  return null;
}

export default function ChatPage() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null);

  /**
   * The map we last auto-opened. Without this, closing the pane mid-turn would
   * be undone by the next `grid` event for the same map, since the map streams
   * in several times as tracks are added.
   */
  const autoOpenedRef = useRef<string | null>(null);

  const openGrid = useCallback((gridId: string) => {
    autoOpenedRef.current = gridId;
    setSelectedGridId(gridId);
  }, []);

  /** Load one conversation's stored transcript into state. */
  const loadSession = useCallback(
    async (id: string) => {
      // Paint the cached copy first — a reload then feels instant instead of
      // blanking the pane while the request is in flight.
      const cached = readCachedMessages(id);
      if (cached) {
        setSessionId(id);
        setMessages(cached);
        setSidebarOpen(false);
        const cachedGrid = lastGridId(cached);
        autoOpenedRef.current = cachedGrid;
        setSelectedGridId(cachedGrid);
      }

      const res = await fetch(`/api/sessions/${id}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) return; // keep the cached view if we had one

      const data = (await res.json()) as {
        session: { id: string; title?: string };
        messages: Message[];
      };

      // The database is the source of truth — overwrite the cached copy so a
      // conversation edited on another device converges here too.
      setSessionId(data.session.id);
      setMessages(data.messages);
      setSidebarOpen(false);

      const grid = lastGridId(data.messages);
      autoOpenedRef.current = grid;
      setSelectedGridId(grid);
    },
    [router]
  );

  const refreshSessionList = useCallback(async () => {
    const res = await fetch("/api/sessions");
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: SessionSummary[] };
    setSessions(data.sessions);
    writeCachedSessions(data.sessions);
  }, []);

  /** Move a conversation to the top of the rail the moment it's used. */
  const bumpSessionToTop = useCallback((id: string) => {
    setSessions((list) => {
      const target = list.find((s) => s.id === id);
      if (!target) return list;
      const rest = list.filter((s) => s.id !== id);
      return [{ ...target, lastMessageAt: Date.now() }, ...rest];
    });
  }, []);

  // On mount: require a session, then resume the most recent conversation.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Seed from localStorage first so a reload paints immediately. The fetch
      // below overwrites it — the cache is never trusted over the database.
      const cachedList = readCachedSessions();
      if (cachedList.length > 0) {
        const cachedMessages = readCachedMessages(cachedList[0].id);
        if (cachedMessages) {
          setSessions(cachedList);
          setSessionId(cachedList[0].id);
          setMessages(cachedMessages);
          const grid = lastGridId(cachedMessages);
          autoOpenedRef.current = grid;
          setSelectedGridId(grid);
          setBootstrapping(false);
        }
      }

      const me = await fetch("/api/auth/me");
      if (cancelled) return;

      if (!me.ok) {
        clearSessionCache(); // signed out or expired — don't leave PII behind
        router.push("/login");
        return;
      }

      const { user: meUser } = (await me.json()) as { user: SessionUser };
      if (cancelled) return;
      setUser(meUser);

      const list = await fetch("/api/sessions");
      if (cancelled || !list.ok) {
        setBootstrapping(false);
        return;
      }

      const { sessions: listData } = (await list.json()) as {
        sessions: SessionSummary[];
      };
      if (cancelled) return;
      setSessions(listData);
      writeCachedSessions(listData);

      if (listData.length > 0) {
        await loadSession(listData[0].id);
      } else {
        // First ever visit: open a conversation so the welcome message is there
        // waiting, rather than an empty pane.
        await startNewChatInternal();
      }

      if (!cancelled) setBootstrapping(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, loadSession]);

  // Mirror the open conversation into localStorage. Gated on `!loading` so it
  // fires once per finished turn rather than on every streamed token.
  useEffect(() => {
    if (loading || !sessionId || messages.length === 0) return;
    writeCachedMessages(sessionId, messages);
  }, [sessionId, messages, loading]);

  /** Open a fresh conversation (server seeds it with the welcome message). */
  const startNewChatInternal = useCallback(async () => {
    const res = await fetch("/api/sessions", { method: "POST" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;

    const data = (await res.json()) as {
      session: { id: string };
      messages: Message[];
    };

    setSessionId(data.session.id);
    setMessages(data.messages);
    setSelectedGridId(null);
    autoOpenedRef.current = null;
    setSidebarOpen(false);
    await refreshSessionList();
  }, [router, refreshSessionList]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    if (sessionId) bumpSessionToTop(sessionId);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    // Placeholder assistant bubble that we fill in as tokens stream in.
    const assistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
    ]);

    const patchAssistant = (update: (prev: Message) => Partial<Message>) =>
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, ...update(msg) } : msg))
      );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          sessionId,
        }),
      });

      if (res.status === 401) {
        clearSessionCache();
        router.push("/login");
        return;
      }

      if (!res.ok) {
        // Non-stream responses (400 / 429 / 500) are plain JSON.
        const err = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("This browser doesn't support streaming responses.");

      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        // Events are separated by a blank line: "data: {...}\n\n"
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;

          let payload: SSEPayload;
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue; // incomplete/partial line — skip
          }

          switch (payload.type) {
            case "start":
              // A brand-new conversation only learns its id here.
              if (payload.sessionId) setSessionId(payload.sessionId);
              break;

            case "token":
              patchAssistant((prev) => ({
                content: prev.content + (payload.text ?? ""),
              }));
              break;

            case "tool":
              // Append tool call badge to the current assistant message.
              // `id` lets the matching tool_result event find it again.
              patchAssistant((prev) => ({
                toolCalls: [
                  ...(prev.toolCalls ?? []),
                  {
                    id: payload.id ?? crypto.randomUUID(),
                    name: payload.name ?? "unknown",
                    arguments: payload.arguments ?? {},
                    status: "running" as const,
                  } as ToolCallInfo,
                ],
              }));
              break;

            case "tool_result":
              patchAssistant((prev) => ({
                toolCalls: (prev.toolCalls ?? []).map((t) =>
                  t.id === payload.id
                    ? {
                        ...t,
                        status: payload.ok === false ? ("error" as const) : ("done" as const),
                        summary: payload.summary,
                        durationMs: payload.durationMs,
                      }
                    : t
                ),
              }));
              break;

            case "grid":
              // The server sends the grid repeatedly as tracks arrive, always
              // with the same gridId. Replace that map's message in place so the
              // card updates instead of stacking up copies.
              if (payload.data) {
                const gridId = payload.gridId ?? "grid";
                const gridData = payload.data;
                setMessages((m) => {
                  const existing = m.findIndex((msg) => msg.id === gridId);
                  if (existing === -1) {
                    return [
                      ...m,
                      {
                        id: gridId,
                        role: "assistant" as const,
                        content: "",
                        createdAt: Date.now(),
                        gridData,
                      },
                    ];
                  }
                  return m.map((msg, i) =>
                    i === existing ? { ...msg, gridData } : msg
                  );
                });

                // Show the new map on the right — but only once per map, so a
                // pane the user closed mid-turn stays closed.
                if (autoOpenedRef.current !== gridId) {
                  autoOpenedRef.current = gridId;
                  setSelectedGridId(gridId);
                }
              }
              break;

            case "error":
              throw new Error(payload.message ?? "Unknown error");
            case "done":
            default:
              break;
          }
        }
      }

      // Fire-and-forget: the rail's order and counters changed with this turn.
      void refreshSessionList();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      // Replace whatever was streamed so far with the error text.
      patchAssistant(() => ({ content: `⚠️ ${message}` }));
    } finally {
      setLoading(false);
    }
  };

  /** Called when a role's "Ask AI" button is used in the map pane. */
  const handleAskAI = (question: string) => {
    send(question);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Don't leave the previous user's transcripts on a shared browser.
    clearSessionCache();
    router.push("/login");
    router.refresh();
  };

  if (bootstrapping) {
    return (
      <div className="h-screen flex items-center justify-center text-muted text-sm">
        Loading your conversations…
      </div>
    );
  }

  const activeGrid = messages.find(
    (m) => m.id === selectedGridId && m.gridData
  )?.gridData;

  const activeTitle = sessions.find((s) => s.id === sessionId)?.title;

  return (
    <div className="h-screen flex overflow-hidden">
      <SessionSidebar
        sessions={sessions}
        activeId={sessionId}
        user={user}
        open={sidebarOpen}
        onSelect={loadSession}
        onNewChat={startNewChatInternal}
        onSignOut={signOut}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Conversation column. Hidden below lg while a map is open, so the map
          gets the whole screen instead of being squeezed. */}
      <main
        className={`flex-1 min-w-0 flex-col ${
          activeGrid ? "hidden lg:flex" : "flex"
        }`}
      >
        <header className="shrink-0 border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversation list"
            className="lg:hidden w-8 h-8 rounded-lg text-muted hover:text-ink hover:bg-white/5 transition flex items-center justify-center"
          >
            ☰
          </button>
          <div className="text-sm truncate text-muted">
            {activeTitle ?? "New chat"}
          </div>
        </header>

        <ChatWindow
          messages={messages}
          loading={loading}
          onOpenGrid={openGrid}
          activeGridId={selectedGridId}
        />
        <ChatInput onSend={send} disabled={loading} />
      </main>

      {activeGrid && (
        <GridPanel
          data={activeGrid}
          onClose={() => setSelectedGridId(null)}
          onAskAI={handleAskAI}
        />
      )}
    </div>
  );
}
