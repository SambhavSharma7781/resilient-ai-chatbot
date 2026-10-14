import type { BackendState } from "@/lib/useBackend";
import type { Health } from "@/lib/types";

export function StatusPill({ state, health, onClick, open }: { state: BackendState; health: Health | null; onClick: (el: HTMLElement) => void; open: boolean }) {
  const healthy = health?.pool.filter((p) => p.status === "healthy").length ?? 0;
  const total = health?.pool.length ?? 0;
  const cfg = {
    connecting: { dot: "bg-warn animate-pulse", text: "Waking backend…", cls: "bg-warn-soft text-warn" },
    ok: { dot: "bg-good", text: `${healthy}/${total} keys healthy`, cls: "bg-good-soft text-good" },
    degraded: { dot: "bg-warn", text: `Degraded · ${healthy}/${total} keys`, cls: "bg-warn-soft text-warn" },
    offline: { dot: "bg-bad", text: "Backend offline", cls: "bg-bad-soft text-bad" },
  }[state];
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      aria-controls="panel-pool"
      aria-expanded={open}
      aria-label={`Key pool: ${cfg.text}`}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 sm:min-w-[8.5rem] sm:px-3 text-xs font-medium transition hover:opacity-90 ${cfg.cls} ${open ? "ring-2 ring-current/30" : ""}`}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {cfg.text}
    </button>
  );
}