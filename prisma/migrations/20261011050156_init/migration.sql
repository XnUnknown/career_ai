-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "date_of_birth" DATE,
    "current_status" TEXT,
    "current_role_title" TEXT,
    "current_employer" TEXT,
    "education_level" TEXT,
    "field_of_study" TEXT,
    "country_code" CHAR(2),
    "region" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "timezone" TEXT,
    "currency" CHAR(3),
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "work_style" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_tool_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "call_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arguments" JSONB NOT NULL DEFAULT '{}',
    "result_summary" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "duration_ms" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_grids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "message_id" UUID,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "starting_label" TEXT NOT NULL,
    "starting_description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_paths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grid_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "career_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "path_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "years_from_start" TEXT NOT NULL DEFAULT '',
    "salary_range" TEXT NOT NULL DEFAULT '',
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "entry_path" TEXT NOT NULL DEFAULT '',
    "outlook" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "career_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_last_message_at_idx" ON "chat_sessions"("user_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "messages_session_id_seq_key" ON "messages"("session_id", "seq");

-- CreateIndex
CREATE INDEX "message_tool_calls_message_id_position_idx" ON "message_tool_calls"("message_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "career_grids_message_id_key" ON "career_grids"("message_id");

-- CreateIndex
CREATE INDEX "career_grids_user_id_created_at_idx" ON "career_grids"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "career_grids_session_id_idx" ON "career_grids"("session_id");

-- CreateIndex
CREATE INDEX "career_paths_grid_id_position_idx" ON "career_paths"("grid_id", "position");

-- CreateIndex
CREATE INDEX "career_roles_path_id_position_idx" ON "career_roles"("path_id", "position");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_tool_calls" ADD CONSTRAINT "message_tool_calls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_grids" ADD CONSTRAINT "career_grids_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_grids" ADD CONSTRAINT "career_grids_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_grids" ADD CONSTRAINT "career_grids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_paths" ADD CONSTRAINT "career_paths_grid_id_fkey" FOREIGN KEY ("grid_id") REFERENCES "career_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_roles" ADD CONSTRAINT "career_roles_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "career_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written additions (see SCHEMA_DRAFT.md §8).
-- Prisma's schema language can't express CHECK constraints, partial/expression
-- indexes, or triggers, so they are appended to the generated migration here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------

-- Emails are stored lowercased so Bob@x.com and bob@x.com can't both register.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- Constrained sets are plain TEXT with a CHECK rather than a Postgres ENUM,
-- so adding a value is a one-line migration instead of ALTER TYPE.
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_role_valid"
  CHECK ("role" IN ('user', 'assistant', 'system', 'tool')),
  ADD CONSTRAINT "messages_seq_positive" CHECK ("seq" > 0);

ALTER TABLE "chat_sessions"
  ADD CONSTRAINT "chat_sessions_status_valid"
  CHECK ("status" IN ('active', 'archived'));

ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_dob_sane"
    CHECK ("date_of_birth" IS NULL OR "date_of_birth" > DATE '1900-01-01'),
  ADD CONSTRAINT "user_profiles_status_valid"
    CHECK ("current_status" IS NULL OR "current_status" IN
           ('student', 'working', 'between', 'other')),
  ADD CONSTRAINT "user_profiles_education_valid"
    CHECK ("education_level" IS NULL OR "education_level" IN
           ('school', 'high_school', 'undergrad', 'postgrad', 'doctorate', 'other'));

-- ---------------------------------------------------------------------------
-- Exactly one recommended track per grid, enforced by the database.
-- A partial unique index: only rows where recommended = true are indexed.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "career_paths_one_recommended_idx"
  ON "career_paths" ("grid_id") WHERE "recommended";

-- ---------------------------------------------------------------------------
-- Full-text search over chat history.
-- ---------------------------------------------------------------------------
CREATE INDEX "messages_content_fts_idx"
  ON "messages" USING GIN (to_tsvector('english', "content"));

-- ---------------------------------------------------------------------------
-- updated_at triggers.
-- Prisma's @updatedAt only fires from the application; these keep the column
-- correct for raw SQL writes too (psql, seed scripts, manual fixes).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "user_profiles_set_updated_at" BEFORE UPDATE ON "user_profiles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "chat_sessions_set_updated_at" BEFORE UPDATE ON "chat_sessions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
