import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-block px-3 py-1 text-xs rounded-full border border-white/10 text-muted mb-6">
          Powered by local AI · Ollama
        </div>
        <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight">
          Career<span className="text-accent">Compass</span>
        </h1>
        <p className="mt-5 text-lg text-muted">
          Personalized career recommendations for any age. Tell us your interests
          and knowledge fields, and we&apos;ll suggest paths tailored to you.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/chat"
            className="px-6 py-3 rounded-xl bg-accent hover:opacity-90 transition font-medium"
          >
            Start Chat
          </Link>
          <a
            href="https://github.com/XnUnknown/career_ai"
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-xl border border-white/15 hover:bg-white/5 transition"
          >
            View Repo
          </a>
        </div>
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          {[
            { t: "Tell us about you", d: "Age, interests, favorite subjects." },
            { t: "We research careers", d: "Live web search for current data." },
            { t: "Get clear paths", d: "Skills, courses, and next steps." },
          ].map((s) => (
            <div key={s.t} className="p-4 rounded-xl bg-panel/60 border border-white/10">
              <div className="font-medium">{s.t}</div>
              <div className="text-sm text-muted mt-1">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
