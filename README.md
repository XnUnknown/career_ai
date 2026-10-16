# CareerCompass

An AI career-recommendation app. You hold a conversation, the assistant
researches the web on your behalf, and it draws an interactive **career map** —
several tracks branching from where you are now, each with the roles, salary
ranges, skills and outlook along the way.

Next.js 14 (App Router) · TypeScript · Tailwind · Ollama function calling ·
Postgres + Prisma.

---

## What it does

- **Guided intake** — the assistant asks one question at a time, then researches
  before recommending. Anything you've already saved to your profile is skipped.
- **Real web research** — `web_search` and `web_fetch` run on Ollama's hosted
  endpoints. Every result link is fetched and summarized, so the model sees a
  compact digest instead of ~40k characters of raw page text.
- **Career maps** — the model builds a grid of tracks via tool calls; the UI
  renders it as an interactive node graph with a detail drawer per role.
- **Everything persists** — accounts, profiles, conversations, tool calls and
  career maps live in Postgres, so nothing is lost on refresh.
- **Accounts** — email + password, with server-side sessions that log out for
  real (the session row is revoked, not just the cookie cleared).

## Status

Working end to end: auth, profile, chat with streaming + tool calling, persistent
sessions, and the career-map UI.

Known limitations, stated plainly:

- **No tests and no CI.** There is no test runner, no test files, and no
  `.github/` workflows.
- **Rate limiting is per-process and in-memory** (`lib/rateLimit.ts`). On
  serverless each instance enforces its own bucket, so it is not a global limit
  in production. `/api/health` reports this.
- **No `middleware.ts`.** Auth is enforced per page and per route handler rather
  than centrally.
- **A research turn takes ~30–40s**, which is why `/api/chat` declares
  `maxDuration = 60`.

---

## Quick start

You need **Node.js 18.17 or newer** (Next.js 14's minimum — the repo declares no
`engines` field), **Docker** for the local database, and either a local Ollama
server or an [Ollama Cloud](https://ollama.com) API key.

**1. Install**

```bash
npm install
```

**2. Configure.** Create both files from the template — they hold different
variables and are read by different tools, so you need both:

```bash
cp .env.example .env.local   # Next.js reads this: DATABASE_URL, OLLAMA_*
cp .env.example .env         # docker compose reads this: POSTGRES_*
```

Then set `DATABASE_URL` in `.env.local`. With the default compose credentials:

```
DATABASE_URL=postgresql://career:pick-something-local@localhost:5432/careercompass
```

Both files are gitignored.

**3. Start Postgres and apply the schema**

```bash
npm run db:up        # starts Postgres 16 and waits until it's healthy
npm run db:migrate   # applies prisma/migrations
```

**4. Run it**

```bash
npm run dev
```

Open http://localhost:3000. Sign up, then start a chat.

### Verifying Ollama before you blame the app

```bash
node --env-file=.env.local scripts/ollama-smoke-test.mjs
```

Streams a single throwaway reply to stdout. (There is no npm script for it.)

### If something's misconfigured

`GET /api/health` returns `200` when everything needed to serve a chat is
configured and reachable, or `503` with a `checks` object naming what's wrong:
`database`, `ollamaModel`, `ollamaApiKey`, `migrations`. It reports **presence
only, never values** — a health endpoint shouldn't be a way to probe for
connection strings or hostnames.

---

## Environment variables

| Variable | Read by | Purpose |
|---|---|---|
| `DATABASE_URL` | Next.js | Postgres connection string. |
| `OLLAMA_HOST` | Next.js | `http://localhost:11434` for local, `https://ollama.com` for cloud. |
| `OLLAMA_API_KEY` | Next.js | Needed for cloud inference, **and for web search even against a local server** — the SDK always posts the web tools to `ollama.com`. |
| `OLLAMA_MODEL` | Next.js | Model name. Cloud models take no `-cloud` suffix. |
| `RATE_LIMIT_MAX` | Next.js | Burst tokens per IP before throttling (default `30`). |
| `RATE_LIMIT_REFILL_PER_MINUTE` | Next.js | Refill rate (default `15`). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | docker compose | Only applied when the volume is **first** created — changing them later has no effect on existing data. |

Note the code-level default for `OLLAMA_MODEL` is `llama3.1`, while
`.env.example` suggests `gemma4:31b`. Set it explicitly.

---

## How a chat turn works

```
Browser ──POST /api/chat──▶ route handler
                              │ auth → rate limit → validate → resolve session
                              │ persist the user turn BEFORE calling the model
                              ▼
                         lib/ollama.ts  agent loop
                              │  chat(tools, stream) ──▶ onToken ──▶ SSE "token"
                              │  tool_calls present?
                              │    ├─ execute round concurrently
                              │    └─ append role:"tool" results, loop
                              └─ final answer streamed with tools DISABLED
                              ▼
                         persist assistant turn + tool calls + grid
```

Two details worth knowing:

- **The user's message is saved before the model is called**, so it survives a
  failed stream.
- **The loop always ends with a prose answer.** Whatever terminates it — no
  tools, the duplicate-call guard, or `MAX_TOOL_ROUNDS` — one final streaming
  call runs with tools omitted, so the assistant can't go silent after a tool
  call.

### SSE events

`POST /api/chat` responds `text/event-stream`, with `data: <json>` frames:

| Event | Payload |
|---|---|
| `start` | `{ sessionId }` — a brand-new conversation learns its id here |
| `token` | `{ text }` |
| `tool` | `{ id, name, arguments }` |
| `tool_result` | `{ id, name, summary, ok, durationMs }` |
| `grid` | `{ gridId, data, final }` — replaces the map in place |
| `done` | — |
| `error` | `{ message }` |

Rate-limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`Retry-After` on `429`) ride along on both the JSON and SSE responses.

### Tools the model can call

| Tool | Does |
|---|---|
| `web_search` | Searches, fetches every result link concurrently, summarizes them in one extra model call, returns a compact digest. Default 4 results, capped at 5. |
| `web_fetch` | Fetches and summarizes one URL the model already knows. |
| `start_career_grid` | Opens a map: title, starting point, planned track names. |
| `add_career_path` | Adds one track (path name + 3 roles). |

The career map is deliberately **two** tools rather than one. A single call
returning a whole grid generates 4–6 KB of nested JSON, and Ollama's hosted API
silently discards tool calls above roughly 2 KB — the reply comes back with no
content and no `tool_calls`. Split into a ~270-char opener plus ~1.3 KB per
track, every call arrives.

---

## Project layout

```
app/
  page.tsx                  / — landing page (personalizes if signed in)
  login/page.tsx            /login — combined login + signup form
  chat/page.tsx             /chat — the app: sidebar + chat + map pane
  profile/page.tsx          /profile — view/edit your profile
  api/
    auth/{login,signup,logout,me}/route.ts
    chat/route.ts           POST — the only AI endpoint (SSE)
    health/route.ts         GET  — deployment diagnostics
    profile/route.ts        GET, PATCH
    sessions/route.ts       GET, POST
    sessions/[id]/route.ts  GET
components/                 All client components (chat, career map, sidebar)
lib/
  auth.ts                   scrypt hashing, session tokens, cookie handling
  db.ts                     The single cached PrismaClient
  chatStore.ts              Every Prisma query for chat, in one place
  ollama.ts                 The agent loop + streaming
  ollamaClient.ts           The one place the Ollama client is built
  prompts.ts                System prompt + the static welcome message
  profile.ts                Profile validation + system-prompt formatting
  rateLimit.ts              In-memory token bucket
  sessionCache.ts           Browser read-through cache (DB always wins)
  tools/index.ts            Tool schemas, execution, result summaries
prisma/
  schema.prisma             9 models
  migrations/               20261011050156_init
scripts/ollama-smoke-test.mjs
docker-compose.yml          Local Postgres 16
SCHEMA_DRAFT.md             Schema design record and rationale
```

**Auth model.** Passwords are hashed with Node's built-in `scrypt` (no native
build) and stored self-describing as `scrypt$N$r$p$salt$hash`, so the cost
parameters can be raised later without invalidating existing hashes. The
`cc_session` cookie holds a random token; only its SHA-256 hash is stored, so a
leaked database dump can't be replayed as a login. Sessions last 4 hours — one
constant drives both the cookie and the `auth_sessions.expires_at` row so the
two can't drift. Login returns one message for both a wrong password and an
unknown email, so the endpoint can't be used to enumerate accounts.

---

## Database

Postgres 16 via Prisma. Nine tables:

`users` · `user_profiles` · `auth_sessions` · `chat_sessions` · `messages` ·
`message_tool_calls` · `career_grids` · `career_paths` · `career_roles`

Prisma can't express CHECK constraints, partial or expression indexes, or
triggers, so those are **appended by hand** to the generated migration: the
email-lowercase check, the constrained-set checks, the partial unique index
enforcing one recommended track per grid, a GIN full-text index over message
content, and the `updated_at` triggers. See `SCHEMA_DRAFT.md` §8 and the header
of `prisma/schema.prisma`.

Two design choices worth flagging: messages are ordered by an explicit
per-session `seq` rather than a timestamp (messages can share a millisecond, and
a transcript has to replay in the order it was spoken), and salary/years stay
`TEXT` because the model writes things like `"₹4-8 LPA"` and `"0-1 years"` —
parsing those into numbers would be a lossy guess.

```bash
npm run db:up       # start Postgres, wait until healthy
npm run db:migrate  # apply migrations
npm run db:studio   # browse the data
npm run db:logs     # tail the container
npm run db:down     # stop (data survives in the careercompass-data volume)
```

`docker compose down -v` wipes the volume if you want a clean slate.

---

## Deploying to Vercel

Set these in the Vercel project, not in a committed file:

- `DATABASE_URL` — a **hosted** Postgres. A local container is unreachable from
  serverless functions; `localhost:5432` means nothing from Vercel's network.
  Neon, Vercel Postgres and Supabase all have free tiers.
- `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_HOST`.

Then apply the schema once against that database:

```bash
DATABASE_URL=<hosted-url> npx prisma migrate deploy
```

Two platform notes:

- **Prefer your provider's pooled connection string** (Neon's `-pooler` host,
  Supabase's port 6543). Each serverless instance opens its own pool; if you see
  *"too many clients already"*, that's why. Migrations sometimes fail over a
  pooler — if `prisma migrate deploy` errors, add a `directUrl` to the datasource
  in `prisma/schema.prisma` pointing at the non-pooled URL.
- `/api/chat` declares `maxDuration = 60` because a research turn measures
  ~30–40s and Hobby's default is 10s, which would kill the stream mid-answer.

After deploying, `GET /api/health` tells you what's still misconfigured.

---

## npm scripts

| Script | Does |
|---|---|
| `dev` | Next.js dev server |
| `build` | `prisma generate && next build` |
| `start` | Production server |
| `lint` | `next lint` |
| `db:up` / `db:down` / `db:logs` | Local Postgres via compose |
| `db:migrate` | `prisma migrate deploy` |
| `db:studio` | Prisma Studio |

> **Windows:** `npm run build` fails with `EPERM` on the Prisma query engine if
> `npm run dev` is running — both touch the same generated client. Stop the dev
> server first.
