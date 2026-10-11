"use client";

import type { ToolCallInfo } from "@/lib/types";

const TOOL_LABELS: Record<string, { icon: string; running: string; done: string }> = {
  web_search: { icon: "🔍", running: "Searching the web", done: "Searched the web" },
  web_fetch: { icon: "📄", running: "Reading page", done: "Read page" },
  start_career_grid: { icon: "📊", running: "Building career map", done: "Building career map" },
  add_career_path: { icon: "➕", running: "Adding track", done: "Added track" },
};

/**
 * Badge for one tool call. It starts in a "running" state (the tool is doing
 * search → fetch → summarize on the server, which takes a few seconds) and
 * flips to the outcome when the matching `tool_result` event arrives.
 */
export function ToolCallBadge({ tool }: { tool: ToolCallInfo }) {
  const info = TOOL_LABELS[tool.name] ?? {
    icon: "⚙️",
    running: tool.name,
    done: tool.name,
  };

  const status = tool.status ?? "running";
  const subject =
    tool.name === "web_search" && tool.arguments?.query
      ? String(tool.arguments.query)
      : tool.name === "web_fetch" && tool.arguments?.url
        ? String(tool.arguments.url)
        : null;

  const detail = subject && subject.length > 44 ? `${subject.slice(0, 44)}…` : subject;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border text-xs animate-fadeIn ${
        status === "error" ? "border-amber-400/30 text-amber-200/80" : "border-white/8 text-muted"
      }`}
    >
      <span className={status === "running" ? "animate-pulse" : ""}>
        {status === "error" ? "⚠️" : status === "done" ? "✓" : info.icon}
      </span>
      <span>
        {status === "running" ? info.running : info.done}
        {detail && <span className="text-ink/60 ml-1">&quot;{detail}&quot;</span>}
      </span>
      {status !== "running" && tool.summary && (
        <span className="text-ink/45 border-l border-white/10 pl-2">{tool.summary}</span>
      )}
    </div>
  );
}
