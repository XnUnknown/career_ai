"use client";

import Link from "next/link";

/**
 * SessionSidebar — the persistent left rail listing past conversations.
 *
 * Ordered newest-first by `lastMessageAt`, which the server bumps on every
 * turn — so continuing an older conversation lifts it back to the top of the
 * list on its own.
 */

export interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: number;
}

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeId: string | null;
  user: { email: string; displayName: string | null } | null;
  open: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

/** "just now" / "12m" / "3h" / "Mar 4" */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SessionSidebar({
  sessions,
  activeId,
  user,
  open,
  onSelect,
  onNewChat,
  onSignOut,
  onClose,
}: SessionSidebarProps) {
  return (
    <>
      {/* Mobile backdrop — the rail is off-canvas below lg. */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 flex flex-col bg-panel border-r border-white/10 transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="shrink-0 px-4 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Career<span className="text-accent">Compass</span>
            </span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden w-7 h-7 rounded-lg text-muted hover:text-ink hover:bg-white/5 transition flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <button
            onClick={onNewChat}
            className="mt-3 w-full py-2 rounded-xl border border-white/10 text-sm text-ink hover:bg-white/5 hover:border-accent/30 transition"
          >
            + New chat
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 && (
            <div className="px-4 py-6 text-xs text-muted text-center">
              No conversations yet.
            </div>
          )}

          {sessions.map((session) => {
            const active = session.id === activeId;
            return (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={`w-full text-left px-4 py-2.5 border-l-2 transition ${
                  active
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <div
                  className={`text-[13px] truncate ${
                    active ? "text-ink" : "text-ink/80"
                  }`}
                >
                  {session.title}
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  {relativeTime(session.lastMessageAt)}
                  {session.messageCount > 1 &&
                    ` · ${session.messageCount} messages`}
                </div>
              </button>
            );
          })}
        </nav>

        {user && (
          <div className="shrink-0 px-4 py-3 border-t border-white/10">
            <div className="text-[11px] text-muted truncate">
              {user.displayName || user.email}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <Link
                href="/profile"
                className="text-[11px] text-muted hover:text-ink transition"
              >
                Profile
              </Link>
              <Link
                href="/"
                className="text-[11px] text-muted hover:text-ink transition"
              >
                Home
              </Link>
              <button
                onClick={onSignOut}
                className="text-[11px] text-muted hover:text-ink transition"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
