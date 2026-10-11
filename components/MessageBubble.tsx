"use client";

import { Message } from "@/lib/types";
import { CareerGrid } from "./CareerGrid";
import { ToolCallBadge } from "./ToolCallBadge";

interface MessageBubbleProps {
  message: Message;
  onAskAI?: (question: string) => void;
}

export function MessageBubble({ message, onAskAI }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Grid message — render the full career visualization
  if (message.gridData) {
    return (
      <div className="w-full max-w-4xl mx-auto px-2 py-2 animate-fadeIn">
        <CareerGrid data={message.gridData} onAskAI={onAskAI} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {/* Tool call badges (shown above the message text) */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 max-w-[85%] sm:max-w-[75%]">
          {message.toolCalls.map((tool, i) => (
            <ToolCallBadge key={i} tool={tool} />
          ))}
        </div>
      )}

      {/* Text content */}
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

