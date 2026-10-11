"use client";

import { useEffect, useRef } from "react";
import { Message } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function ChatWindow({
  messages,
  loading,
  onOpenGrid,
  activeGridId,
}: {
  messages: Message[];
  loading: boolean;
  /** Opens a career map in the right-hand panel. */
  onOpenGrid?: (gridId: string) => void;
  activeGridId?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          onOpenGrid={onOpenGrid}
          activeGridId={activeGridId}
        />
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="px-4 py-3 rounded-2xl bg-panel border border-white/10 text-muted text-sm">
            <span className="inline-flex gap-1">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce [animation-delay:120ms]">●</span>
              <span className="animate-bounce [animation-delay:240ms]">●</span>
            </span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
