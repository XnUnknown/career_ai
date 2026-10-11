import type { CareerGridData } from "@/lib/types/career";

export type Role = "user" | "assistant" | "system";

/** Info about a tool the AI called (shown as a badge in the chat). */
export interface ToolCallInfo {
  /** Stable id from the server — pairs a `tool` event with its `tool_result`. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** "running" until the matching tool_result event arrives. */
  status?: "running" | "done" | "error";
  /** Short outcome line, e.g. "Read 4 pages · 4 sources summarized". */
  summary?: string;
  durationMs?: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Present when the AI builds a career grid. */
  gridData?: CareerGridData;
  /** Tool calls made while generating this message. */
  toolCalls?: ToolCallInfo[];
}
