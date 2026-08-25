"use client";

import { useState, KeyboardEvent } from "react";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");

  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-white/10 bg-panel/60 backdrop-blur px-4 py-3">
      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
          className="flex-1 resize-none bg-bg/70 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent max-h-40"
        />
        <button
          onClick={send}
          disabled={disabled || !text.trim()}
          className="px-5 py-3 rounded-xl bg-accent disabled:opacity-40 hover:opacity-90 transition text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
