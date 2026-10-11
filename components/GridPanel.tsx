"use client";

import type { CareerGridData } from "@/lib/types/career";
import { CareerGrid } from "./CareerGrid";

/**
 * GridPanel — the right-hand pane that shows one career map.
 *
 * This is a real split of the page (a sibling flex column), not an overlay, so
 * the chat stays fully visible and usable beside it. Closing it returns the
 * whole width to the chat.
 *
 * Only one map is shown at a time; the inline cards in the chat choose which.
 */
export function GridPanel({
  data,
  onClose,
  onAskAI,
}: {
  data: CareerGridData;
  onClose: () => void;
  onAskAI?: (question: string) => void;
}) {
  return (
    <section className="flex-1 lg:flex-none lg:w-[46%] lg:max-w-[760px] min-w-0 flex flex-col border-l border-white/10 bg-bg">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{data.title}</div>
          <div className="text-[11px] text-muted">
            {data.paths.length} track{data.paths.length === 1 ? "" : "s"} ·{" "}
            {data.startingPoint.label}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close career map"
          className="shrink-0 w-8 h-8 rounded-lg text-muted hover:text-ink hover:bg-white/5 transition flex items-center justify-center"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </header>

      {/* overflow-x-auto: CareerGrid lays its tracks out at minmax(200px, 1fr),
          so a 5-track map needs ~1000px. The panel is narrower than that, and
          the grid should scroll rather than clip. */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
        <CareerGrid data={data} onAskAI={onAskAI} />
      </div>
    </section>
  );
}
