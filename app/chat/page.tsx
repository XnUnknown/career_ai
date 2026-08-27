"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { ChatInput } from "@/components/ChatInput";
import { Message } from "@/lib/types";
import Link from "next/link";

/**
 * Chat page — consumes the streaming SSE contract from /api/chat.
 *
 * Event format (one per line, separated by a blank line):
 *   data: {"type":"token","text":"..."}                → append to the reply
 *   data: {"type":"tool","name":"...","arguments":{}}  → a tool was called
 *   data: {"type":"done"}                              → stream finished
 *   data: {"type":"error","message":"..."}             → something failed
 */

type SSEPayload = {
  type: "start" | "token" | "tool" | "done" | "error";
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  message?: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
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

    const patchAssistant = (update: (content: string) => string) =>
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, content: update(msg.content) } : msg))
      );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });

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
            case "token":
              patchAssistant((content) => content + (payload.text ?? ""));
              break;
            case "tool":
              // Member 1 can surface tool calls as a badge here.
              break;
            case "error":
              throw new Error(payload.message ?? "Unknown error");
            case "done":
            case "start":
            default:
              break;
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      // Replace whatever was streamed so far with the error text.
      patchAssistant(() => `⚠️ ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Home
        </Link>
        <div className="text-sm font-medium">
          Career<span className="text-accent">Compass</span>
        </div>
        <div className="text-xs text-muted">v0.1</div>
      </header>
      <ChatWindow messages={messages} loading={loading} />
      <ChatInput onSend={send} disabled={loading} />
    </div>
  );
}
