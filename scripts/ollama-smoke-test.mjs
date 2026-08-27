// Quick Ollama connectivity smoke test.
// Works for local Ollama and Ollama Cloud. Loads config from .env.local:
//   node --env-file=.env.local scripts/ollama-smoke-test.mjs
import { Ollama } from "ollama";

const client = new Ollama({
  host: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  ...(process.env.OLLAMA_API_KEY
    ? { headers: { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } }
    : {}),
});

const model = process.env.OLLAMA_MODEL ?? "llama3.1";
const response = await client.chat({
  model,
  messages: [{ role: "user", content: "Why is the sky blue?" }],
  stream: true,
});

for await (const part of response) {
  process.stdout.write(part.message.content ?? "");
}
console.log();
