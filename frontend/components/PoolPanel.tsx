import type { Health } from "@/lib/types";
import { KeyIcon, RefreshIcon, XIcon } from "./icons";

export function PoolPanel({ health, onRefresh, onClose }: { health: Health | null; onRefresh: () => void; onClose: () => void }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Key pool status">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Key pool &amp; resilience</h2>
          <p className="mt-0.5 text-xs text-muted">
            Keys are tried in priority order. A key that is rate-limited or failing is skipped for a cooldown, then retried. Only labels are shown, never keys.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
        >
          <RefreshIcon /> Refresh
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close key pool"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted hover:bg-surface-2 hover:text-fg"
        >
          <XIcon />
        </button>
      </div>

      {!health ? (
        <p className="mt-3 text-sm text-muted">Waiting for the backend…</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {health.pool.map((p) => (
              <li key={p.label} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <KeyIcon className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-muted">priority {p.priority}</span>
                  </div>
                  <div className="truncate font-mono text-xs text-muted">{p.model}</div>
                </div>
                {p.status === "healthy" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-medium text-good">
                    <span className="h-1.5 w-1.5 rounded-full bg-good" /> healthy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" /> cooldown{p.cooldown_remaining_s ? ` · ${p.cooldown_remaining_s}s` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            {[
              ["Requests", health.stats.requests],
              ["Live", health.stats.live],
              ["Cache hits", health.stats.cache_hits],
              ["Failovers", health.stats.fallbacks],
              ["All-keys-down", health.stats.failures],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-surface-2 px-2 py-2">
                <dd className="text-base font-semibold tabular-nums">{v}</dd>
                <dt className="text-[11px] text-muted">{k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-muted">
            Cache: {health.cache_backend} · Sessions: {health.session_backend} · Counters reset when the server restarts.
          </p>
        </>
      )}
    </section>
  );
}