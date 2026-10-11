"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Login / signup page.
 *
 * One form, two modes — the only difference is which endpoint it posts to and
 * whether the name field is shown. On success the session cookie is already
 * set by the response, so we just navigate.
 */

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSignup ? { email, password, displayName } : { email, password }
        ),
      });

      const data = await res.json().catch(() => ({} as { error?: string }));

      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      // Cookie is set; land on the home page, which greets them by name and
      // offers the way into the chat.
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Link
        href="/"
        className="text-sm text-muted hover:text-ink transition mb-6"
      >
        ← Home
      </Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold">
            Career<span className="text-accent">Compass</span>
          </h1>
          <p className="text-sm text-muted mt-2">
            {isSignup
              ? "Create an account to save your career maps."
              : "Sign in to pick up where you left off."}
          </p>
        </div>

        <div className="bg-panel border border-white/10 rounded-2xl p-6">
          <form onSubmit={submit} className="space-y-4">
            {isSignup && (
              <Field
                label="Name"
                type="text"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Optional"
                autoComplete="name"
              />
            )}

            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
            />

            {error && (
              <div className="text-xs text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy
                ? isSignup
                  ? "Creating account…"
                  : "Signing in…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>

        <div className="text-center text-sm text-muted mt-5">
          {isSignup ? "Already have an account?" : "New here?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? "login" : "signup")}
            className="text-accent hover:underline"
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full px-3 py-2.5 rounded-xl bg-bg border border-white/10 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent/50 transition"
      />
    </label>
  );
}
