"use client";

import { useEffect, useState } from "react";

/**
 * ProfileForm — renders the profile as a read-only summary, or as an editable
 * form when `editing`. One component for both so the two views can't drift.
 */

export interface ProfileData {
  displayName: string | null;
  dateOfBirth: string | null;
  age: number | null;
  currentStatus: string | null;
  currentRoleTitle: string | null;
  currentEmployer: string | null;
  educationLevel: string | null;
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
  onboardingCompletedAt: number | null;
}

/** Labels for the values the database accepts. */
const STATUS_OPTIONS = [
  { value: "student", label: "Studying" },
  { value: "working", label: "Working" },
  { value: "between", label: "Between things" },
  { value: "other", label: "Something else" },
];

const EDUCATION_OPTIONS = [
  { value: "school", label: "School" },
  { value: "high_school", label: "High school" },
  { value: "undergrad", label: "Undergraduate" },
  { value: "postgrad", label: "Postgraduate" },
  { value: "doctorate", label: "Doctorate" },
  { value: "other", label: "Other" },
];

function labelFor(
  options: { value: string; label: string }[],
  value: string | null
): string | null {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Initials for the avatar. There's no image upload — that needs blob storage —
 * so the initials treatment gives a stable, on-theme avatar for free.
 */
function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function ProfileForm({
  value,
  email,
  editing,
  saving,
  onSubmit,
  onCancel,
}: {
  value: ProfileData;
  email: string | null;
  editing: boolean;
  saving: boolean;
  onSubmit: (next: ProfileData) => void;
  onCancel: () => void;
}) {
  // Draft state for edit mode. Lists are held as the raw comma-separated text
  // the user typed, then split on save.
  const [draft, setDraft] = useState(value);
  const [listText, setListText] = useState({
    interests: value.interests.join(", "),
    hobbies: value.hobbies.join(", "),
    workStyle: value.workStyle.join(", "),
    constraints: value.constraints.join(", "),
  });

  // Re-sync when the saved profile changes underneath us (e.g. after a save).
  useEffect(() => {
    setDraft(value);
    setListText({
      interests: value.interests.join(", "),
      hobbies: value.hobbies.join(", "),
      workStyle: value.workStyle.join(", "),
      constraints: value.constraints.join(", "),
    });
  }, [value]);

  const set = <K extends keyof ProfileData>(key: K, next: ProfileData[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const split = (text: string) =>
      text.split(",").map((item) => item.trim()).filter(Boolean);

    onSubmit({
      ...draft,
      interests: split(listText.interests),
      hobbies: split(listText.hobbies),
      workStyle: split(listText.workStyle),
      constraints: split(listText.constraints),
    });
  };

  const location = [draft.city, draft.region, draft.countryCode]
    .filter(Boolean)
    .join(", ");

  // ---------------------------------------------------------------- view mode
  if (!editing) {
    const rows: { label: string; value: string | null }[] = [
      { label: "Age", value: draft.age ? `${draft.age}` : null },
      { label: "Date of birth", value: draft.dateOfBirth },
      {
        label: "Currently",
        value: draft.currentStatus
          ? [
              labelFor(STATUS_OPTIONS, draft.currentStatus),
              draft.currentRoleTitle,
              draft.currentEmployer ? `at ${draft.currentEmployer}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : draft.currentRoleTitle,
      },
      {
        label: "Education",
        value: draft.educationLevel
          ? [labelFor(EDUCATION_OPTIONS, draft.educationLevel), draft.fieldOfStudy]
              .filter(Boolean)
              .join(" in ")
          : draft.fieldOfStudy,
      },
      { label: "Location", value: location || null },
      { label: "Currency", value: draft.currency },
    ];

    const lists: { label: string; items: string[]; tone?: "accent" }[] = [
      { label: "Interests", items: draft.interests, tone: "accent" },
      { label: "Hobbies", items: draft.hobbies },
      { label: "Work style", items: draft.workStyle, tone: "accent" },
      { label: "Constraints", items: draft.constraints },
    ];

    const hasAnything =
      rows.some((row) => row.value) || lists.some((list) => list.items.length > 0);

    return (
      <div className="space-y-8">
        {/* Identity */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-lg font-semibold text-accent shrink-0">
            {initials(draft.displayName, email)}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">
              {draft.displayName || "No name set"}
            </div>
            <div className="text-sm text-muted truncate">{email}</div>
          </div>
        </div>

        {!hasAnything && (
          <div className="text-sm text-muted bg-panel/50 border border-white/5 rounded-xl px-4 py-5 text-center">
            Nothing filled in yet. Add your details and the assistant will stop
            asking for them.
          </div>
        )}

        {rows.some((row) => row.value) && (
          <dl className="divide-y divide-white/5 border-y border-white/5">
            {rows
              .filter((row) => row.value)
              .map((row) => (
                <div key={row.label} className="flex gap-4 py-3">
                  <dt className="text-sm text-muted w-36 shrink-0">{row.label}</dt>
                  <dd className="text-sm">{row.value}</dd>
                </div>
              ))}
          </dl>
        )}

        {lists
          .filter((list) => list.items.length > 0)
          .map((list) => (
            <div key={list.label}>
              <div className="text-sm text-muted mb-2.5">{list.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.items.map((item, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      list.tone === "accent"
                        ? "bg-accent/10 border-accent/25 text-accent/90"
                        : "bg-white/5 border-white/10 text-muted"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  }

  // ---------------------------------------------------------------- edit mode
  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="About you">
        <TextField
          label="Name"
          value={draft.displayName}
          onChange={(v) => set("displayName", v)}
          placeholder="How should we address you?"
        />
        <TextField
          label="Date of birth"
          type="date"
          value={draft.dateOfBirth}
          onChange={(v) => set("dateOfBirth", v)}
        />
        <p className="text-[11px] text-muted -mt-1">
          Age is worked out from this, so you never have to update it.
        </p>
      </Section>

      <Section title="Where you are now">
        <SelectField
          label="Current status"
          value={draft.currentStatus}
          onChange={(v) => set("currentStatus", v)}
          options={STATUS_OPTIONS}
          placeholder="Select…"
        />
        <TextField
          label="Role or course"
          value={draft.currentRoleTitle}
          onChange={(v) => set("currentRoleTitle", v)}
          placeholder="e.g. Junior QA Tester"
        />
        <TextField
          label="Employer or institution"
          value={draft.currentEmployer}
          onChange={(v) => set("currentEmployer", v)}
          placeholder="Optional"
        />
        <SelectField
          label="Education level"
          value={draft.educationLevel}
          onChange={(v) => set("educationLevel", v)}
          options={EDUCATION_OPTIONS}
          placeholder="Select…"
        />
        <TextField
          label="Field of study"
          value={draft.fieldOfStudy}
          onChange={(v) => set("fieldOfStudy", v)}
          placeholder="e.g. Computer Science"
        />
      </Section>

      <Section title="Location">
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField
            label="City"
            value={draft.city}
            onChange={(v) => set("city", v)}
          />
          <TextField
            label="State or region"
            value={draft.region}
            onChange={(v) => set("region", v)}
          />
          <TextField
            label="Country code"
            value={draft.countryCode}
            onChange={(v) => set("countryCode", v.toUpperCase())}
            placeholder="IN"
            maxLength={2}
            hint="Two letters, e.g. IN, US, GB"
          />
          <TextField
            label="Currency code"
            value={draft.currency}
            onChange={(v) => set("currency", v.toUpperCase())}
            placeholder="INR"
            maxLength={3}
            hint="Salaries are shown in this"
          />
        </div>
        <TextField
          label="Postal code"
          value={draft.postalCode}
          onChange={(v) => set("postalCode", v)}
          placeholder="Optional"
        />
      </Section>

      <Section title="What you're into">
        <ListField
          label="Interests"
          value={listText.interests}
          onChange={(v) => setListText((t) => ({ ...t, interests: v }))}
          placeholder="coding, data, design"
        />
        <ListField
          label="Hobbies"
          value={listText.hobbies}
          onChange={(v) => setListText((t) => ({ ...t, hobbies: v }))}
          placeholder="chess, football"
        />
        <ListField
          label="Preferred work style"
          value={listText.workStyle}
          onChange={(v) => setListText((t) => ({ ...t, workStyle: v }))}
          placeholder="analytical, remote"
        />
        <ListField
          label="Constraints"
          value={listText.constraints}
          onChange={(v) => setListText((t) => ({ ...t, constraints: v }))}
          placeholder="budget:low, no relocation"
        />
        <p className="text-[11px] text-muted">
          Separate each with a comma.
        </p>
      </Section>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl border border-white/10 text-sm hover:bg-white/5 transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-muted uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 rounded-xl bg-bg border border-white/10 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent/50 transition"
      />
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2.5 rounded-xl bg-bg border border-white/10 text-sm text-ink outline-none focus:border-accent/50 transition"
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl bg-bg border border-white/10 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent/50 transition"
      />
    </label>
  );
}
