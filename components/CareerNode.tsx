"use client";

import { CareerRole } from "@/lib/types/career";

interface CareerNodeProps {
  role: CareerRole;
  isRecommended: boolean;
  onClick: () => void;
}

export function CareerNode({ role, isRecommended, onClick }: CareerNodeProps) {
  return (
    <button
      onClick={onClick}
      className={`career-node group w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-200 cursor-pointer
        ${
          isRecommended
            ? "bg-accent/10 border-accent/40 hover:border-accent hover:bg-accent/15 shadow-[0_0_20px_rgba(124,92,255,0.08)]"
            : "bg-panel/80 border-white/10 hover:border-white/25 hover:bg-panel"
        }
        hover:scale-[1.02] hover:shadow-lg`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold leading-snug">{role.title}</div>
        {isRecommended && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            ⭐ Top Pick
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="opacity-60">⏱</span>
          {role.yearsFromStart}
        </span>
        <span className="flex items-center gap-1">
          <span className="opacity-60">💰</span>
          {role.salaryRange}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {role.skills.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-muted border border-white/8"
          >
            {skill}
          </span>
        ))}
        {role.skills.length > 3 && (
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-muted">
            +{role.skills.length - 3}
          </span>
        )}
      </div>

      <div className="mt-2 text-[11px] text-accent/70 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to view details →
      </div>
    </button>
  );
}
