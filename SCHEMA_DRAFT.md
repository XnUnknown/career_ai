# CareerCompass — Database Schema

**Status:** DESIGN AGREED — models not yet generated
**Target:** PostgreSQL 15+ via **Prisma**
**Scope:** (1) user ↔ CareerCompass chat sessions, (2) user profile data

> Decisions are settled (see §6). The DDL in §5 is the source of truth the
> Prisma models in `prisma/schema.prisma` must match; §8 lists the handful of
> constraints Prisma can't express and that need raw SQL.

---

## 1. What we're storing

Your two requirements plus what the existing app already produces:

| # | Requirement | Tables |
|---|---|---|
| 1 | **Chat sessions with CareerCompass** | `chat_sessions`, `messages`, `message_tool_calls` |
| 2 | **User data** — name, picture, DOB, current role/education, address | `users`, `user_profiles` |
| 3 | *Already produced by the app, currently thrown away on refresh* | `career_grids`, `career_paths`, `career_roles` |

Item 3 matters: today the career grid lives only in React state
(`Message.gridData`). Refresh the page and the user's recommendations are gone.
It is the app's main output, so I've given it real tables rather than a blob —
see decision **D2**.

---

## 2. Entity relationships

```mermaid
erDiagram
    users ||--o| user_profiles : "has one"
    users ||--o{ chat_sessions : "starts"
    users ||--o{ career_grids : "owns"

    chat_sessions ||--o{ messages : "contains"
    chat_sessions ||--o{ career_grids : "produced in"

    messages ||--o{ message_tool_calls : "invokes"
    messages ||--o| career_grids : "renders"

    career_grids ||--o{ career_paths : "has tracks"
    career_paths ||--o{ career_roles : "has roles"
```

Cardinality notes:

* **1:1** `users` → `user_profiles` (split for the reason in D1).
* **1:N** `chat_sessions` → `messages` — a session is one conversation.
* **1:N** `messages` → `message_tool_calls` — one assistant turn can call
  several tools in a single round (the loop in `lib/ollama.ts` fans out).
* **1:1** `messages` → `career_grids` — a turn either builds a grid or doesn't.
* **1:N:1** `career_grids` → `career_paths` → `career_roles` — mirrors
  `CareerGridData` in `lib/types/career.ts` exactly.

---

## 3. Tables at a glance

| Table | Rows mean | Grows with |
|---|---|---|
| `users` | an account | signups |
| `user_profiles` | that person's personal + intake data | signups |
| `chat_sessions` | one conversation thread | every "New chat" |
| `messages` | one turn (user or assistant) | every message |
| `message_tool_calls` | one tool the model invoked | every search / grid call |
| `career_grids` | one career map shown to the user | every full recommendation |
| `career_paths` | one track in that map | 3–5 per grid |
| `career_roles` | one role in that track | 3 per path |

---

## 4. Column specifications

### 4.1 `users` — identity & login

Only what's needed to authenticate. Personal data lives in `user_profiles`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK, `gen_random_uuid()` |
| `email` | `text` | no | unique, **stored lowercased** (see D6) |
| `password_hash` | `text` | yes | null = OAuth-only account (bcrypt/argon2) |
| `email_verified_at` | `timestamptz` | yes | null = unverified |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()`, bumped by trigger |
| `last_login_at` | `timestamptz` | yes | |
| `deleted_at` | `timestamptz` | yes | soft delete; null = active |

### 4.2 `user_profiles` — the data you listed

1:1 with `users`; the row is created empty at signup and filled in as the
guided intake runs (the app asks one question at a time, so most columns are
nullable by design).

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `uuid` | no | PK **and** FK → `users.id`, cascade |
| `display_name` | `text` | yes | "Profile name" |
| `avatar_url` | `text` | yes | "Profile picture" — see D4 |
| `date_of_birth` | `date` | yes | "date of birth" — age is derived, never stored |
| `current_status` | `text` | yes | `student` / `working` / `between` / `other` — "Current Working role or education" |
| `current_role_title` | `text` | yes | e.g. "Junior Data Analyst" |
| `current_employer` | `text` | yes | |
| `education_level` | `text` | yes | `school` / `high_school` / `undergrad` / `postgrad` / `doctorate` / `other` |
| `field_of_study` | `text` | yes | e.g. "Computer Science" |
| `country_code` | `char(2)` | yes | ISO 3166-1 — drives salary region + currency |
| `region` | `text` | yes | state / province |
| `city` | `text` | yes | |
| `postal_code` | `text` | yes | |
| `timezone` | `text` | yes | IANA, e.g. `Asia/Kolkata` |
| `currency` | `char(3)` | yes | ISO 4217 — what salaries are shown in |
| `interests` | `text[]` | no | intake Q2, e.g. `{coding,biology}` |
| `hobbies` | `text[]` | no | intake Q3 |
| `work_style` | `text[]` | no | intake Q4, e.g. `{analytical,remote}` |
| `constraints` | `text[]` | no | intake Q5, e.g. `{budget:low,no_relocation}` |
| `onboarding_completed_at` | `timestamptz` | yes | null = still in guided intake |
| `created_at` / `updated_at` | `timestamptz` | no | |

### 4.3 `chat_sessions` — "Sessions of user with Career_AI"

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK — also sent to the client |
| `user_id` | `uuid` | no | FK → `users.id`, cascade |
| `title` | `text` | yes | auto-set from the first user message |
| `model` | `text` | yes | e.g. `gemma4:31b` — which model answered |
| `status` | `text` | no | `active` / `archived`, default `active` |
| `message_count` | `integer` | no | denormalized for the sidebar list, default 0 |
| `created_at` | `timestamptz` | no | |
| `updated_at` | `timestamptz` | no | |
| `last_message_at` | `timestamptz` | yes | sort key for "Recent chats" |

### 4.4 `messages` — one turn

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `session_id` | `uuid` | no | FK → `chat_sessions.id`, cascade |
| `seq` | `integer` | no | 1,2,3… within the session. **Ordering key** — see D5 |
| `role` | `text` | no | `user` / `assistant` / `system` / `tool` |
| `content` | `text` | no | default `''`; an assistant turn may be tools-only |
| `prompt_tokens` | `integer` | yes | from Ollama's `prompt_eval_count` |
| `completion_tokens` | `integer` | yes | from `eval_count` |
| `duration_ms` | `integer` | yes | wall-clock for the turn |
| `error` | `text` | yes | set if the turn failed mid-stream |
| `created_at` | `timestamptz` | no | |

Unique on `(session_id, seq)`.

> Only the **finished** turn is written. Streaming tokens are not persisted —
> the route writes once when `generateRecommendation` resolves.

### 4.5 `message_tool_calls` — tools the model invoked

Matches `ToolCallInfo` in `lib/types.ts` (which the UI already renders as
badges).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `message_id` | `uuid` | no | FK → `messages.id`, cascade |
| `call_id` | `text` | no | the signature from `lib/ollama.ts` (name + args) |
| `name` | `text` | no | `web_search` / `web_fetch` / `start_career_grid` / `add_career_path` |
| `arguments` | `jsonb` | no | shape varies per tool → **jsonb**, not columns |
| `result_summary` | `text` | yes | e.g. "Read 3 pages · 3 sources summarized" |
| `ok` | `boolean` | no | default true |
| `duration_ms` | `integer` | yes | |
| `position` | `integer` | no | order within the message |
| `created_at` | `timestamptz` | no | |

### 4.6 `career_grids` → `career_paths` → `career_roles`

This is `CareerGridData` normalised:

```ts
// lib/types/career.ts  →  database
CareerGridData        →  career_grids  (+ career_paths via FK)
  .title              →  career_grids.title
  .startingPoint      →  career_grids.starting_label / starting_description
  .paths[]            →  career_paths
    .pathName         →  career_paths.name
    .recommended      →  career_paths.recommended
    .roles[]          →  career_roles
```

**`career_grids`**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK — **reuse as the SSE `gridId`** already sent to the browser |
| `session_id` | `uuid` | no | FK → `chat_sessions.id`, cascade |
| `message_id` | `uuid` | yes | FK → `messages.id`, the turn that drew it |
| `user_id` | `uuid` | no | FK → `users.id`, cascade |
| `title` | `text` | no | |
| `starting_label` | `text` | no | |
| `starting_description` | `text` | no | |
| `created_at` | `timestamptz` | no | |

**`career_paths`**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `grid_id` | `uuid` | no | FK → `career_grids.id`, cascade |
| `name` | `text` | no | |
| `recommended` | `boolean` | no | default false — exactly one true per grid |
| `position` | `integer` | no | column order in the UI |

**`career_roles`**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` | no | PK |
| `path_id` | `uuid` | no | FK → `career_paths.id`, cascade |
| `position` | `integer` | no | 0 = entry-level |
| `title` | `text` | no | |
| `years_from_start` | `text` | no | kept as text — the model returns "0-1 years" |
| `salary_range` | `text` | no | kept as text — "₹4-8 LPA", "$50K-$75K" |
| `skills` | `text[]` | no | default `{}` |
| `description` | `text` | no | |
| `entry_path` | `text` | no | |
| `outlook` | `text` | no | |

> `salary_range` and `years_from_start` stay **text** on purpose: the model
> writes human ranges, and parsing them into min/max integers is a lossy
> guess. If you later want salary analytics, add nullable
> `salary_min`/`salary_max`/`salary_currency` columns and backfill.

---

## 5. Full DDL

```sql
-- ===========================================================================
-- CareerCompass schema
-- ===========================================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- --------------------------------------------------------------------------
-- updated_at trigger helper
-- --------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text        not null unique,
  password_hash     text,
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint users_email_lowercase check (email = lower(email))
);

create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- user_profiles
-- --------------------------------------------------------------------------
create table user_profiles (
  user_id           uuid primary key references users(id) on delete cascade,
  display_name      text,
  avatar_url        text,
  date_of_birth     date,
  current_status    text,
  current_role_title text,
  current_employer  text,
  education_level   text,
  field_of_study    text,
  country_code      char(2),
  region            text,
  city              text,
  postal_code       text,
  timezone          text,
  currency          char(3),
  interests         text[] not null default '{}',
  hobbies           text[] not null default '{}',
  work_style        text[] not null default '{}',
  constraints       text[] not null default '{}',
  onboarding_completed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint user_profiles_dob_sane
    check (date_of_birth is null or date_of_birth > date '1900-01-01'),
  constraint user_profiles_status_valid
    check (current_status is null or current_status in
           ('student','working','between','other')),
  constraint user_profiles_education_valid
    check (education_level is null or education_level in
           ('school','high_school','undergrad','postgrad','doctorate','other'))
);

create trigger user_profiles_set_updated_at before update on user_profiles
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- chat_sessions
-- --------------------------------------------------------------------------
create table chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  title           text,
  model           text,
  status          text not null default 'active',
  message_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz,

  constraint chat_sessions_status_valid
    check (status in ('active','archived'))
);

create trigger chat_sessions_set_updated_at before update on chat_sessions
  for each row execute function set_updated_at();

-- --------------------------------------------------------------------------
-- messages
-- --------------------------------------------------------------------------
create table messages (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references chat_sessions(id) on delete cascade,
  seq               integer not null,
  role              text not null,
  content           text not null default '',
  prompt_tokens     integer,
  completion_tokens integer,
  duration_ms       integer,
  error             text,
  created_at        timestamptz not null default now(),

  constraint messages_role_valid
    check (role in ('user','assistant','system','tool')),
  constraint messages_seq_positive check (seq > 0),
  unique (session_id, seq)
);

-- --------------------------------------------------------------------------
-- message_tool_calls
-- --------------------------------------------------------------------------
create table message_tool_calls (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid not null references messages(id) on delete cascade,
  call_id        text not null,
  name           text not null,
  arguments      jsonb not null default '{}'::jsonb,
  result_summary text,
  ok             boolean not null default true,
  duration_ms    integer,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- career_grids / career_paths / career_roles
-- --------------------------------------------------------------------------
create table career_grids (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references chat_sessions(id) on delete cascade,
  message_id           uuid unique references messages(id) on delete set null,
  user_id              uuid not null references users(id) on delete cascade,
  title                text not null,
  starting_label       text not null,
  starting_description text not null,
  created_at           timestamptz not null default now()
);

create table career_paths (
  id          uuid primary key default gen_random_uuid(),
  grid_id     uuid not null references career_grids(id) on delete cascade,
  name        text not null,
  recommended boolean not null default false,
  position    integer not null default 0
);

create table career_roles (
  id               uuid primary key default gen_random_uuid(),
  path_id          uuid not null references career_paths(id) on delete cascade,
  position         integer not null default 0,
  title            text not null,
  years_from_start text not null default '',
  salary_range     text not null default '',
  skills           text[] not null default '{}',
  description      text not null default '',
  entry_path       text not null default '',
  outlook          text not null default ''
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------
-- "Recent chats" sidebar: newest first, per user.
create index chat_sessions_user_recent_idx
  on chat_sessions (user_id, last_message_at desc nulls last);

-- Replaying a conversation.
create index messages_session_seq_idx on messages (session_id, seq);

create index message_tool_calls_message_idx
  on message_tool_calls (message_id, position);

-- "My recommendations", newest first.
create index career_grids_user_recent_idx
  on career_grids (user_id, created_at desc);
create index career_grids_session_idx on career_grids (session_id);

create index career_paths_grid_idx on career_paths (grid_id, position);
create index career_roles_path_idx  on career_roles (path_id, position);

-- One recommended track per grid, enforced by the database.
create unique index career_paths_one_recommended_idx
  on career_paths (grid_id) where recommended;

-- Full-text search over chat history (optional, cheap to add).
create index messages_content_fts_idx
  on messages using gin (to_tsvector('english', content));
```

---

## 6. Decisions

All settled. The DDL in §5 already reflects them.

| # | Decision | Choice |
|---|---|---|
| D1 | Split identity from profile? | **Yes** — `users` + `user_profiles` |
| D2 | How to store the career grid? | **Normalized** — `career_grids`/`paths`/`roles` |
| D3 | Auth | **Login required** — `user_id` NOT NULL, no `anon_id` |
| D4 | Profile picture | **`avatar_url`** — path into object storage, not a blob |
| D5 | Message ordering | **`messages.seq`** — explicit counter, unique per session |
| D6 | Email casing | **Lowercased + CHECK** — avoids `citext` |
| D7 | Constrained sets | **`text` + CHECK**, not Postgres `ENUM` |
| D8 | Salary / time-to-role | **`text`** — the model writes "₹4-8 LPA", "0-1 years" |
| D9 | Education & work history | **Current status only** — no history tables |

Reasoning worth keeping in mind for the ones that shaped the schema:

**D2 — normalized grid.** You can now answer questions the product will
actually want: which tracks get recommended most, what salary ranges you quote,
which skills recur. It also maps 1:1 onto `CareerGridData`, so the frontend
renderer is unchanged. Cost: 3 tables and a join instead of one jsonb blob.

**D3 — login required.** Simplifies the model: `chat_sessions.user_id` and
`career_grids.user_id` are NOT NULL, and the `anon_id` column plus its partial
index are gone. Consequence to plan for: **every** chat request now needs an
authenticated user, so the auth layer has to land in the same phase — the chat
route can't write a session without one.

**D7 — text + CHECK.** A Postgres `ENUM` needs `ALTER TYPE` to grow and can't
be changed in the same transaction as other DDL; a CHECK is a one-line
migration. There's no enum type-safety at the DB level — the ORM layer covers
that.

### Deliberately NOT in this schema

* **Login sessions / refresh tokens** — now that login is required (D3) you
  need these, but their shape depends on how you authenticate (NextAuth vs
  hand-rolled cookies vs JWT). Separate decision, separate table.
* **Rate limiting** — still in-memory in `lib/rateLimit.ts`, resets on every
  restart. Moving it to Postgres/Redis is a separate task.
* **OAuth accounts** — an `oauth_accounts` table (provider, provider_user_id)
  if you offer Google/GitHub login.

---

## 7. How this connects to the code you already have

| Existing code | Becomes |
|---|---|
| `Message` / `ToolCallInfo` in `lib/types.ts` | `messages` + `message_tool_calls` |
| `CareerGridData` in `lib/types/career.ts` | `career_grids` + `career_paths` + `career_roles` |
| SSE `gridId` in `app/api/chat/route.ts` | `career_grids.id` — reuse the same UUID |
| `messages` state in `app/chat/page.tsx` | loaded from `GET /api/sessions/:id` |
| `start_career_grid` / `add_career_path` args | assembled into the 3 grid tables on the last `add_career_path` |
| `describeToolResult()` in `lib/tools/index.ts` | `message_tool_calls.result_summary` |

---

## 8. Prisma notes

The models live in `prisma/schema.prisma`. Four things Prisma's schema language
**cannot** express, which need raw SQL appended to the generated migration:

1. **CHECK constraints** (§5: email lowercase, enum-ish sets, `date_of_birth`
   sanity, `seq > 0`). Prisma has no `@check`. Without them the columns are
   plain `text` and any string is accepted.
2. **The partial unique index** `career_paths_one_recommended_idx` — enforces
   "exactly one recommended track per grid" at the database level.
3. **The full-text index** on `messages.content`.
4. **`updated_at` triggers.** Prisma's `@updatedAt` handles this from the
   application, but it won't fire for raw SQL writes (seed scripts, psql). Keep
   the trigger as the safety net.

Also: `gen_random_uuid()` is used as the DB-side PK default rather than
Prisma's client-side `uuid()`, so raw SQL inserts and Prisma inserts agree, and
the SSE `gridId` can be generated either side.

---

## 9. Next step

1. `npm i -D prisma && npm i @prisma/client`, set `DATABASE_URL`.
2. `npx prisma migrate dev --name init` from `prisma/schema.prisma`, then
   append the raw SQL from §8 to that migration.
3. Wire `app/api/chat/route.ts` to persist a session + turn after each
   completed stream (uses the `seq` counter).
4. Add `GET /api/sessions` (sidebar) and `GET /api/sessions/:id` (replay).
5. Swap `app/chat/page.tsx` from in-memory state to those endpoints.
6. Auth layer (D3) — required before step 3 can write anything.
