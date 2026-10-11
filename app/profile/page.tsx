"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfileForm, type ProfileData } from "@/components/ProfileForm";

/**
 * Profile page — view and edit the saved profile.
 *
 * Starts in read mode so the page is a clean summary of who the user is, and
 * flips to the form on Edit. The same component renders both, so there's no
 * risk of the two drifting apart.
 */

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/profile");
      if (cancelled) return;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not load your profile.");
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { profile: ProfileData; email: string };
      setProfile(data.profile);
      setEmail(data.email);
      // Nothing filled in yet — open straight into the form.
      setEditing(!data.profile.onboardingCompletedAt);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const save = async (next: ProfileData) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      setProfile((data as { profile: ProfileData }).profile);
      setEditing(false);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        Loading your profile…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-ink transition">
          ← Home
        </Link>
        <div className="text-sm font-medium">
          Career<span className="text-accent">Compass</span>
        </div>
        <Link href="/chat" className="text-sm text-muted hover:text-ink transition">
          Chat →
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Your profile</h1>
            <p className="text-sm text-muted mt-1.5">
              The more we know, the less the assistant has to ask — it reads this
              before every conversation.
            </p>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 px-4 py-2 rounded-xl border border-white/10 text-sm hover:bg-white/5 hover:border-accent/30 transition"
            >
              Edit
            </button>
          )}
        </div>

        {error && (
          <div className="mb-5 text-xs text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        {savedAt && !editing && (
          <div className="mb-5 text-xs text-accent/90 bg-accent/10 border border-accent/25 rounded-lg px-3 py-2.5">
            ✓ Profile saved — the assistant will use it from your next message.
          </div>
        )}

        {profile && (
          <ProfileForm
            value={profile}
            email={email}
            editing={editing}
            saving={saving}
            onSubmit={save}
            onCancel={() => setEditing(false)}
          />
        )}
      </main>
    </div>
  );
}
