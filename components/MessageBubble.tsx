"use client";

import { Message } from "@/lib/types";
import { CareerGridCard } from "./CareerGridCard";

interface MessageBubbleProps {
  message: Message;
  /** Opens that map in the right-hand panel. */
  onOpenGrid?: (gridId: string) => void;
  /** The map currently shown in the panel, if any. */
  activeGridId?: string | null;
}

export function MessageBubble({
  message,
  onOpenGrid,
  activeGridId,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  // A career map renders as a compact card here; the graph itself opens in the
  // right-hand panel so a chat with several maps stays readable.
  if (message.gridData) {
    return (
      <div className="w-full animate-fadeIn">
        <CareerGridCard
          data={message.gridData}
          active={activeGridId === message.id}
          onOpen={() => onOpenGrid?.(message.id)}
        />
      </div>
    );
  }

  // Tool calls are intentionally NOT rendered. Every search the model runs is
  // an implementation detail — showing each query and page count cluttered the
  // conversation and made the assistant look like a scraper. The only signal is
  // the "researching" status in ChatWindow while work is in flight. The calls
  // are still recorded in the database, so the transcript keeps the audit trail
  // even though the user never sees it.

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {message.content && (
        <div
          className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-accent text-white rounded-br-sm"
              : "bg-panel border border-white/10 text-ink rounded-bl-sm"
          }`}
        >
          {message.content}
        </div>
      )}
    </div>
  );
}
