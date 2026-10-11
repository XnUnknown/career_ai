"use client";

import type { CareerGridData } from "@/lib/types/career";

/**
 * CareerGridCard — the compact stand-in for a career map inside the chat.
 *
 * The full graph lives in the right-hand panel (see GridPanel), not inline, so
 * the conversation stays readable when several maps are produced in one chat.
 * Clicking the card opens that map in the panel.
 */
export function CareerGridCard({
  data,
  active,
  onOpen,
}: {
  data: CareerGridData;
  active?: boolean;
  onOpen: () => void;
}) {
  const tracks = data.paths.length;
  const roles = data.paths.reduce((n, path) => n + path.roles.length, 0);
  const recommended = data.paths.find((path) => path.recommended);
  const firstSkills = data.paths[0]?.roles[0]?.skills?.slice(0, 3) ?? [];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full max-w-[85%] sm:max-w-[75%] text-left px-4 py-3.5 rounded-2xl border transition group ${
        active
          ? "bg-accent/10 border-accent/40"
          : "bg-panel border-white/10 hover:border-accent/30 hover:bg-accent/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-base shrink-0">
          🗺️
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{data.title}</div>
          <div className="text-xs text-muted mt-1">
            {tracks} career track{tracks === 1 ? "" : "s"} · {roles} role
            {roles === 1 ? "" : "s"}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {data.paths.slice(0, 3).map((path, i) => (
              <span
                key={i}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  path.recommended
                    ? "bg-accent/15 border-accent/35 text-accent"
                    : "bg-white/5 border-white/10 text-muted"
                }`}
              >
                {path.recommended && "★ "}
                {path.pathName}
              </span>
            ))}
            {tracks > 3 && (
              <span className="text-[11px] px-2 py-0.5 text-muted">
                +{tracks - 3} more
              </span>
            )}
          </div>

          {firstSkills.length > 0 && !recommended && (
            <div className="text-[11px] text-muted/70 mt-2 truncate">
              Skills include {firstSkills.join(", ")}
            </div>
          )}
        </div>

        <span className="text-xs text-accent shrink-0 self-center opacity-70 group-hover:opacity-100 transition">
          {active ? "Viewing" : "View map →"}
        </span>
      </div>
    </button>
  );
}
