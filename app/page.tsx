import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-2xl w-full text-center">
          <div className="inline-block px-3 py-1 text-xs rounded-full border border-white/10 text-muted mb-8">
            AI-Powered Career Guidance · Personalized for You
          </div>

          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-tight">
            Career<span className="text-accent">Compass</span>
          </h1>

          <p className="mt-5 text-lg text-muted max-w-lg mx-auto leading-relaxed">
            Tell us who you are. We&apos;ll research the job market, analyze your
            strengths, and map out career paths tailored to you — visually.
          </p>

          <div className="mt-10">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-accent hover:opacity-90 transition font-medium text-white"
            >
              Discover Your Career Path
              <span className="text-lg">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-sm font-medium text-muted uppercase tracking-widest mb-10">
            How it works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Tell us about you",
                desc: "Answer a few quick questions — your age, interests, favorite subjects, and work style preferences.",
              },
              {
                step: "02",
                title: "We research for you",
                desc: "Our AI searches the web for real salary data, skill demand, and industry trends in real-time.",
              },
              {
                step: "03",
                title: "See your career map",
                desc: "Get an interactive visual grid of career paths — click any role to explore skills, salary, and next steps.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 rounded-xl bg-panel/40 border border-white/5"
              >
                <div className="text-accent text-xs font-mono mb-3">
                  {item.step}
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

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-white/5 text-center">
        <div className="text-xs text-muted">
          Built with Next.js + Ollama ·{" "}
          <a
            href="https://github.com/XnUnknown/career_ai"
            target="_blank"
            rel="noreferrer"
            className="text-accent/70 hover:text-accent transition"
          >
            View on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

