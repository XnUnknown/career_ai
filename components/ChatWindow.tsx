"use client";

import { useEffect, useRef } from "react";
import { Message } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

export function ChatWindow({
  messages,
  loading,
  researching,
  onOpenGrid,
  activeGridId,
}: {
  messages: Message[];
  loading: boolean;
  /** The model is searching the web right now. */
  researching: boolean;
  /** Opens a career map in the right-hand panel. */
  onOpenGrid?: (gridId: string) => void;
  activeGridId?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, researching]);

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

      {/* The single, abstracted progress signal.
          Deliberately says only that research is happening: which queries ran,
          how many pages were read and what summarizer produced are all
          implementation detail the user shouldn't have to parse. */}
      {loading && (
        <div className="flex justify-start">
          <div className="inline-flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-panel border border-white/10 text-sm text-muted">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span>
              {researching
                ? "Researching the web…"
                : "Thinking…"}
            </span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
