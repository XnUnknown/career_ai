"use client";

import { CareerRole } from "@/lib/types/career";

interface CareerDetailPanelProps {
  role: CareerRole;
  pathName: string;
  onClose: () => void;
  onAskAI: (roleTitle: string) => void;
}

export function CareerDetailPanel({
  role,
  pathName,
  onClose,
  onAskAI,
}: CareerDetailPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fadeIn"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-panel border-l border-white/10 z-50 overflow-y-auto animate-slideInRight">
        {/* Header */}
        <div className="sticky top-0 bg-panel/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted uppercase tracking-wider">
              {pathName}
            </div>
            <h2 className="text-lg font-semibold mt-0.5">{role.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 hover:bg-white/5 transition flex items-center justify-center text-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg/50 border border-white/8 rounded-xl px-4 py-3">
              <div className="text-xs text-muted mb-1">Timeline</div>
              <div className="text-sm font-medium">{role.yearsFromStart}</div>
            </div>
            <div className="bg-bg/50 border border-white/8 rounded-xl px-4 py-3">
              <div className="text-xs text-muted mb-1">Salary Range</div>
              <div className="text-sm font-medium">{role.salaryRange}</div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">
              About this Role
            </h3>
            <p className="text-sm leading-relaxed text-ink/90">
              {role.description}
            </p>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">
              Key Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {role.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 text-xs rounded-full bg-accent/15 text-accent border border-accent/20"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Entry Path */}
          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">
              How to Get In
            </h3>
            <p className="text-sm leading-relaxed text-ink/90">
              {role.entryPath}
            </p>
          </div>

          {/* Outlook */}
          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">
              Job Market Outlook
            </h3>
            <p className="text-sm leading-relaxed text-ink/90">
              {role.outlook}
            </p>
          </div>

          {/* Ask AI button */}
          <button
            onClick={() => onAskAI(role.title)}
            className="w-full py-3 rounded-xl bg-accent hover:opacity-90 transition text-sm font-medium flex items-center justify-center gap-2"
          >
            <span>🤖</span>
            Ask AI about this role
          </button>
        </div>
      </div>
    </>
  );
}
