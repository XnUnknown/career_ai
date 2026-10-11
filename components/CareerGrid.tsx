"use client";

import { useState, useRef, useEffect } from "react";
import type { CareerGridData, CareerRole } from "@/lib/types/career";
import { CareerNode } from "./CareerNode";
import { CareerDetailPanel } from "./CareerDetailPanel";

interface CareerGridProps {
  data: CareerGridData;
  onAskAI?: (question: string) => void;
}

interface SelectedRole {
  role: CareerRole;
  pathName: string;
}

/**
 * CareerGrid — Interactive career path visualization.
 *
 * Renders a starting-point node at the top, with branching SVG lines
 * down to each career path column. Each column stacks role nodes
 * vertically with SVG connectors.
 */
export function CareerGrid({ data, onAskAI }: CareerGridProps) {
  const [selectedRole, setSelectedRole] = useState<SelectedRole | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const startNodeRef = useRef<HTMLDivElement>(null);
  const pathHeaderRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);

  // Compute SVG connector lines from the starting node to each path header
  useEffect(() => {
    const computeLines = () => {
      if (!gridRef.current || !startNodeRef.current) return;

      const gridRect = gridRef.current.getBoundingClientRect();
      const startRect = startNodeRef.current.getBoundingClientRect();

      const startX = startRect.left + startRect.width / 2 - gridRect.left;
      const startY = startRect.bottom - gridRect.top;

      const newLines: typeof lines = [];

      pathHeaderRefs.current.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const endX = rect.left + rect.width / 2 - gridRect.left;
        const endY = rect.top - gridRect.top;
        newLines.push({ x1: startX, y1: startY, x2: endX, y2: endY });
      });

      setLines(newLines);
    };

    // Run after layout
    const timer = setTimeout(computeLines, 100);
    window.addEventListener("resize", computeLines);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", computeLines);
    };
  }, [data]);

  const handleAskAI = (roleTitle: string) => {
    setSelectedRole(null);
    onAskAI?.(
      `Tell me more about becoming a ${roleTitle}. What specific steps should I take?`
    );
  };

  return (
    <div className="career-grid-wrapper animate-fadeIn">
      {/* Title */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold">{data.title}</h2>
      </div>

      <div ref={gridRef} className="relative">
        {/* SVG connector lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ overflow: "visible" }}
        >
          {lines.map((line, i) => {
            const midY = (line.y1 + line.y2) / 2;
            return (
              <path
                key={i}
                d={`M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`}
                fill="none"
                stroke="rgba(124,92,255,0.3)"
                strokeWidth="2"
                strokeDasharray="6 4"
                className="animate-drawLine"
              />
            );
          })}
        </svg>

        {/* Starting point node */}
        <div className="flex justify-center mb-8 relative z-10">
          <div
            ref={startNodeRef}
            className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-accent/15 border border-accent/30 max-w-md"
          >
            <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-lg shrink-0">
              👤
            </div>
            <div>
              <div className="text-sm font-semibold">
                {data.startingPoint.label}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {data.startingPoint.description}
              </div>
            </div>
          </div>
        </div>

        {/* Career path columns */}
        <div
          className="grid gap-4 relative z-10"
          style={{
            gridTemplateColumns: `repeat(${data.paths.length}, minmax(200px, 1fr))`,
          }}
        >
          {data.paths.map((path, pathIdx) => (
            <div key={pathIdx} className="flex flex-col gap-3">
              {/* Path header */}
              <div
                ref={(el) => {
                  if (el) pathHeaderRefs.current.set(pathIdx, el);
                }}
                className={`text-center px-3 py-2.5 rounded-xl border ${
                  path.recommended
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-panel/60 border-white/10 text-ink"
                }`}
              >
                <div className="text-sm font-semibold">{path.pathName}</div>
                {path.recommended && (
                  <div className="text-[10px] mt-0.5 text-accent/80">
                    ⭐ AI Recommended
                  </div>
                )}
              </div>

              {/* Role nodes with vertical connectors */}
              {path.roles.map((role, roleIdx) => (
                <div key={roleIdx} className="flex flex-col items-center">
                  {/* Vertical connector line */}
                  {roleIdx > 0 && (
                    <div className="w-px h-3 bg-white/15 mb-1" />
                  )}
                  <div className="w-1.5 h-1.5 rounded-full bg-white/20 mb-2" />

                  <CareerNode
                    role={role}
                    isRecommended={path.recommended}
                    onClick={() =>
                      setSelectedRole({ role, pathName: path.pathName })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedRole && (
        <CareerDetailPanel
          role={selectedRole.role}
          pathName={selectedRole.pathName}
          onClose={() => setSelectedRole(null)}
          onAskAI={handleAskAI}
        />
      )}
    </div>
  );
}
