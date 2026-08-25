"use client";

import { Message } from "@/lib/types";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-accent text-white rounded-br-sm"
            : "bg-panel border border-white/10 text-ink rounded-bl-sm"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
