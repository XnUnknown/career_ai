/**
 * lib/profile.ts — validation for the profile editor, plus the formatter that
 * feeds the profile into the chat prompt.
 *
 * The rules here mirror the CHECK constraints on `user_profiles`. That
 * duplication is deliberate: without it, posting `currentStatus: "wizard"`
 * would reach Postgres, trip `user_profiles_status_valid`, and surface to the
 * user as an opaque 500. Validating first means they get a sentence instead.
 * The database constraint stays as the backstop for anything that bypasses
 * this file.
 *
 * SERVER-ONLY (imported by the API route and by lib/prompts).
 */

/** Must match the CHECK constraint on user_profiles.current_status. */
export const CURRENT_STATUSES = ["student", "working", "between", "other"] as const;
export type CurrentStatus = (typeof CURRENT_STATUSES)[number];

/** Must match the CHECK constraint on user_profiles.education_level. */
export const EDUCATION_LEVELS = [
  "school",
  "high_school",
  "undergrad",
  "postgrad",
  "doctorate",
  "other",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

const MAX_SHORT = 120; // role titles, employers, field of study
const MAX_NAME = 80;
const MAX_LIST_ITEMS = 12;
const MAX_LIST_ITEM = 40;

export interface ProfileInput {
  displayName: string | null;
  dateOfBirth: Date | null;
  currentStatus: CurrentStatus | null;
  currentRoleTitle: string | null;
  currentEmployer: string | null;
  educationLevel: EducationLevel | null;
  fieldOfStudy: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string | null;
  currency: string | null;
  interests: string[];
  hobbies: string[];
  workStyle: string[];
  constraints: string[];
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Comma-separated strings or a real array both work — the form sends arrays,
 *  but this keeps the endpoint usable from a plain HTML form or curl. */
function list(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const cleaned = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.slice(0, MAX_LIST_ITEM));

  // Dedupe case-insensitively, keeping the first spelling the user chose.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of cleaned) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

/**
 * Parse a `YYYY-MM-DD` date of birth.
 *
 * Rejects anything outside the range the CHECK constraint allows (it requires
 * > 1900-01-01) and anything in the future, so a typo'd year surfaces as a
 * message rather than a constraint violation.
 */
function dateOfBirth(value: unknown): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Date of birth must be a date." };

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { ok: false, error: "Date of birth must be in YYYY-MM-DD format." };

  const [, y, m, d] = match;
  const parsed = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "That date of birth isn't a real date." };
  }

  const year = Number(y);
  if (year <= 1900) return { ok: false, error: "Please enter a year after 1900." };
  if (parsed.getTime() > Date.now()) {
    return { ok: false, error: "Date of birth can't be in the future." };
  }

  return { ok: true, value: parsed };
}

/** Uppercase ISO codes, or null. Length must match the CHAR(n) columns. */
function code(value: unknown, length: number): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (!upper) return null;
  if (upper.length !== length || !/^[A-Z]+$/.test(upper)) return null;
  return upper;
}

export function normalizeProfile(
  body: Record<string, unknown>
): { ok: true; data: ProfileInput } | { ok: false; error: string } {
  const dob = dateOfBirth(body.dateOfBirth);
  if (!dob.ok) return dob;

  const status = text(body.currentStatus, 20);
  if (status && !CURRENT_STATUSES.includes(status as CurrentStatus)) {
    return { ok: false, error: `Unknown status "${status}".` };
  }

  const education = text(body.educationLevel, 20);
  if (education && !EDUCATION_LEVELS.includes(education as EducationLevel)) {
    return { ok: false, error: `Unknown education level "${education}".` };
  }

  return {
    ok: true,
    data: {
      displayName: text(body.displayName, MAX_NAME),
      dateOfBirth: dob.value,
      currentStatus: (status as CurrentStatus | null) ?? null,
      currentRoleTitle: text(body.currentRoleTitle, MAX_SHORT),
      currentEmployer: text(body.currentEmployer, MAX_SHORT),
      educationLevel: (education as EducationLevel | null) ?? null,
      fieldOfStudy: text(body.fieldOfStudy, MAX_SHORT),
      countryCode: code(body.countryCode, 2),
      region: text(body.region, MAX_SHORT),
      city: text(body.city, MAX_SHORT),
      postalCode: text(body.postalCode, 20),
      timezone: text(body.timezone, 60),
      currency: code(body.currency, 3),
      interests: list(body.interests),
      hobbies: list(body.hobbies),
      workStyle: list(body.workStyle),
      constraints: list(body.constraints),
    },
  };
}

/** Age in whole years, derived — never stored, so it can't drift from the DOB. */
export function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

type ProfileRow = {
  displayName: string | null;
  dateOfBirth: Date | null;
  currentStatus: string | null;
  currentRoleTitle: string | null;
  currentEmployer: string | null;
  educationLevel: string | null;
  fieldOfStudy: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  currency: string | null;
  interests: string[];
  hobbies: string[];
  workStyle: string[];
  constraints: string[];
};

/**
 * Render the profile as a block for the system prompt, or null when there's
 * nothing worth saying.
 *
 * Without this the profile is a write-only feature — the user fills it in and
 * the assistant still opens by asking their age. With it, the intake skips
 * what's already known.
 */
export function formatProfileForPrompt(profile: ProfileRow | null): string | null {
  if (!profile) return null;

  const facts: string[] = [];
  const age = ageFrom(profile.dateOfBirth);
  if (age !== null) facts.push(`Age ${age}`);

  if (profile.currentStatus) {
    const role = profile.currentRoleTitle
      ? ` as ${profile.currentRoleTitle}${profile.currentEmployer ? ` at ${profile.currentEmployer}` : ""}`
      : "";
    facts.push(`Currently ${profile.currentStatus}${role}`);
  } else if (profile.currentRoleTitle) {
    facts.push(`Works as ${profile.currentRoleTitle}`);
  }

  if (profile.educationLevel) {
    facts.push(
      `${profile.educationLevel}${profile.fieldOfStudy ? ` in ${profile.fieldOfStudy}` : ""}`
    );
  }
  if (profile.countryCode) {
    facts.push(
      `Based in ${[profile.city, profile.region, profile.countryCode].filter(Boolean).join(", ")}${
        profile.currency ? ` (salaries in ${profile.currency})` : ""
      }`
    );
  }
  if (profile.interests.length) facts.push(`Interests: ${profile.interests.join(", ")}`);
  if (profile.hobbies.length) facts.push(`Hobbies: ${profile.hobbies.join(", ")}`);
  if (profile.workStyle.length) facts.push(`Preferred work style: ${profile.workStyle.join(", ")}`);
  if (profile.constraints.length) facts.push(`Constraints: ${profile.constraints.join(", ")}`);

  if (facts.length === 0) return null;

  return `# What you already know about this user
They filled this in on their profile, so do NOT ask for it again:
${facts.map((fact) => `- ${fact}`).join("\n")}

Start from here. Ask only about what's still missing above.`;
}
