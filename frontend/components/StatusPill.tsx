import type { BackendState } from "@/lib/useBackend";
import type { Health } from "@/lib/types";

export function StatusPill({ state, health, onClick, open }: { state: BackendState; health: Health | null; onClick: () => void; open: boolean }) {
  const healthy = health?.pool.filter((p) => p.status === "healthy").length ?? 0;
  const total = health?.pool.length ?? 0;
  const cfg = {
    connecting: { dot: "bg-warn animate-pulse", text: "Waking backend…", cls: "bg-warn-soft text-warn" },
    ok: { dot: "bg-good", text: `Online · ${healthy}/${total} keys healthy`, cls: "bg-good-soft text-good" },
    degraded: { dot: "bg-warn", text: `Degraded · ${healthy}/${total} keys healthy`, cls: "bg-warn-soft text-warn" },
    offline: { dot: "bg-bad", text: "Backend offline", cls: "bg-bad-soft text-bad" },
  }[state];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label="Show key pool status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90 ${cfg.cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {cfg.text}
    </button>
  );
}
