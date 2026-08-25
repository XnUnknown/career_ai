import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const REPLIES = [
  "Got it! Once we connect the Ollama model, I'll use this to give real recommendations.",
  "Thanks for the message. In the next step I'll wire this up to a local LLM via Ollama.",
  "Noted! Right now this is a stub. Soon I'll fetch live career data using web search.",
  "This is a placeholder reply. The real AI module is coming in the next milestone.",
];

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: IncomingMessage[] };
  const last = messages?.[messages.length - 1]?.content ?? "";

  const reply = `${REPLIES[Math.floor(Math.random() * REPLIES.length)]}\n\nYou said: "${last.slice(0, 200)}"`;

  return NextResponse.json({ reply });
}
