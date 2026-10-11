import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

/**
 * Landing page.
 *
 * Reads the session to decide the call to action — "Start your map" versus
 * "Continue" — so a signed-in visitor isn't invited to sign in again. It's a
 * server component, so there's no flash of the wrong button.
 */

export const dynamic = "force-dynamic"; // must not be cached per-user

const STEPS = [
  {
    step: "01",
    title: "Tell us about you",
    desc: "A few quick questions — age, interests, what you enjoy. Or fill your profile once and skip straight past them.",
  },
  {
    step: "02",
    title: "We do the research",
    desc: "The agent searches the live web for real salary data, in-demand skills and hiring trends, then reads the sources itself.",
  },
  {
    step: "03",
    title: "Explore your career map",
    desc: "An interactive map of career tracks opens beside the chat. Click any role for skills, salary, entry paths and outlook.",
  },
];

const FEATURES = [
  {
    icon: "🧭",
    title: "Grounded in real data",
    desc: "Figures come from pages the agent actually read, not from a model's memory of the job market.",
  },
  {
    icon: "🗺️",
    title: "A map, not a list",
    desc: "Every recommendation ends as a visual progression from where you are now to where it leads.",
  },
  {
    icon: "💬",
    title: "Ask about any role",
    desc: "Open a role on the map and ask follow-ups — what to learn first, what it pays, how to get in.",
  },
];

export default async function Home() {
  const user = await getSessionUser();
  const firstName = user?.profile?.displayName?.split(" ")[0] ?? null;

  return (
    <main className="min-h-screen flex flex-col">
      {/* ---- Nav ---- */}
      <nav className="px-6 py-5 flex items-center justify-between">
        <span className="text-sm font-medium">
          Career<span className="text-accent">Compass</span>
        </span>
        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              <Link
                href="/profile"
                className="text-sm text-muted hover:text-ink transition px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Profile
              </Link>
              <Link
                href="/chat"
                className="text-sm px-3.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition"
              >
                Open chat
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm px-3.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 hover:border-accent/30 transition"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="px-6 pt-10 pb-20 sm:pt-20 sm:pb-28">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-accent/25 bg-accent/10 text-accent/90 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Live web research · age-aware advice
          </div>

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.1]">
            Find the career
            <br />
            that actually
            <span className="text-accent"> fits you</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-muted max-w-xl mx-auto leading-relaxed">
            Answer a few questions. CareerCompass researches the current job
            market and maps out real paths — salaries, skills, and how to get
            there — for your situation, not the average one.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={user ? "/chat" : "/login"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-accent hover:opacity-90 transition font-medium text-white"
            >
              {user
                ? firstName
                  ? `Continue, ${firstName}`
                  : "Continue to your chat"
                : "Start your career map"}
              <span className="text-lg">→</span>
            </Link>
            {user && (
              <Link
                href="/profile"
                className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-white/10 hover:bg-white/5 hover:border-accent/30 transition text-sm"
              >
                Your profile
              </Link>
            )}
          </div>

          {!user && (
            <p className="mt-4 text-xs text-muted">
              Free to try · no card, no setup
            </p>
          )}
        </div>
      </section>

      {/* ---- Steps ---- */}
      <section className="px-6 py-16 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-medium text-muted uppercase tracking-widest mb-12">
            How it works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS.map((item) => (
              <div
                key={item.step}
                className="relative p-6 rounded-2xl bg-panel/50 border border-white/5 hover:border-accent/20 transition group"
              >
                <div className="text-accent/70 text-xs font-mono mb-4 group-hover:text-accent transition">
                  {item.step}
                </div>
                <div className="font-medium text-sm mb-2.5">{item.title}</div>
                <div className="text-sm text-muted leading-relaxed">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="px-6 py-16 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-xs font-medium text-muted uppercase tracking-widest mb-12">
            What makes it different
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {FEATURES.map((item) => (
              <div key={item.title} className="text-center px-4">
                <div className="w-11 h-11 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-lg mb-4">
                  {item.icon}
                </div>
                <div className="font-medium text-sm mb-2">{item.title}</div>
                <div className="text-sm text-muted leading-relaxed">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Not sure where you&apos;re headed?
          </h2>
          <p className="mt-3 text-muted text-sm">
            That&apos;s the normal starting point. Let&apos;s work it out.
          </p>
          <Link
            href={user ? "/chat" : "/login"}
            className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-accent hover:opacity-90 transition font-medium text-white"
          >
            {user ? "Back to your chat" : "Get started"}
            <span className="text-lg">→</span>
          </Link>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="mt-auto px-6 py-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <span>
            Built with Next.js + Ollama · CareerCompass
          </span>
          <div className="flex items-center gap-4">
            {user && (
              <Link href="/profile" className="hover:text-ink transition">
                Profile
              </Link>
            )}
            <a
              href="https://github.com/XnUnknown/career_ai"
              target="_blank"
              rel="noreferrer"
              className="text-accent/70 hover:text-accent transition"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
