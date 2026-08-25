"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { ChatInput } from "@/components/ChatInput";
import { Message } from "@/lib/types";
import Link from "next/link";

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
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      const reply: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "(no response)",
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "⚠️ Something went wrong. Please try again.",
          createdAt: Date.now(),
        },
      ]);
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
