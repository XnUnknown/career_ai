/**
 * GET /api/health — is this deployment actually wired up?
 *
 * Exists because the usual first-deploy failure is a missing or stale
 * environment variable, and the symptom (chat hanging, or a 500 deep inside a
 * stream) doesn't say which one. This answers it directly.
 *
 * Deliberately reports only PRESENCE of configuration, never values, and
 * returns a generic reason when the database is unreachable — a health
 * endpoint is often the least protected route in an app, so it shouldn't be a
 * way to probe for connection strings or hostnames.
 *
 *   200 → everything needed to serve a chat is configured and reachable
 *   503 → something is missing or down; `checks` says which
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache a health check

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // --- database -----------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    checks.database = { ok: false, detail: "DATABASE_URL is not set" };
  } else {
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true, detail: "connected" };
    } catch {
      // No error text: it can contain the host, user and database name.
      checks.database = {
        ok: false,
        detail: "unreachable — check DATABASE_URL and that the database allows this host",
      };
    }
  }

  // --- model + web tools (Ollama Cloud) ------------------------------------
  // Chat needs a model; web_search/web_fetch additionally need the API key,
  // since the SDK always posts those two calls to ollama.com.
  checks.ollamaModel = process.env.OLLAMA_MODEL
    ? { ok: true, detail: process.env.OLLAMA_MODEL }
    : { ok: false, detail: "OLLAMA_MODEL is not set" };

  checks.ollamaApiKey = process.env.OLLAMA_API_KEY
    ? { ok: true, detail: "set" }
    : { ok: false, detail: "OLLAMA_API_KEY is not set — chat works, web search will not" };

  // --- migrations applied? -------------------------------------------------
  // A reachable database with no tables is a deployment that will fail on the
  // first signup, which is a confusing way to find out.
  if (checks.database.ok) {
    try {
      await prisma.user.count();
      checks.migrations = { ok: true, detail: "applied" };
    } catch {
      checks.migrations = {
        ok: false,
        detail: "database is empty — run `npm run db:migrate`",
      };
    }
  } else {
    checks.migrations = { ok: false, detail: "skipped, database unreachable" };
  }

  const ok = Object.values(checks).every((check) => check.ok);

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      // The rate limiter keeps its counters in memory, so on serverless each
      // instance enforces its own. Reported here so it isn't mistaken for a
      // working global limit.
      rateLimit: "in-memory, per instance (not shared across serverless instances)",
    },
    { status: ok ? 200 : 503 }
  );
}
