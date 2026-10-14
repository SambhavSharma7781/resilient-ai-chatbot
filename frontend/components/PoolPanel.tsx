import { useEffect, useState } from "react";
import type { Health } from "@/lib/types";
import { KeyIcon, RefreshIcon, XIcon } from "./icons";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ago(from: number | null, now: number): string {
  if (!from) return "Not updated yet";
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 5) return "Updated just now";
  if (s < 60) return `Updated ${s}s ago`;
  return `Updated ${Math.floor(s / 60)}m ago`;
}

export function PoolPanel({
  health,
  updatedAt,
  onRefresh,
  onClose,
}: {
  health: Health | null;
  updatedAt: number | null;
  onRefresh: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Counters that differ from what was on screen when the panel opened get a one-off highlight when they change.
  const [opened] = useState(health?.stats);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const [ok] = await Promise.all([onRefresh(), sleep(500)]); // keep the spinner visible long enough to notice
    setFailed(!ok);
    setBusy(false);
  };

  const stats: [string, keyof Health["stats"]][] = [
    ["Requests", "requests"],
    ["Live", "live"],
    ["Cache hits", "cache_hits"],
    ["Failovers", "fallbacks"],
    ["All-keys-down", "failures"],
  ];

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
          onClick={() => void refresh()}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-70"
        >
          <RefreshIcon className={busy ? "animate-spin motion-reduce:animate-none" : ""} /> {busy ? "Refreshing" : "Refresh"}
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
            {stats.map(([label, key]) => {
              const v = health.stats[key];
              const changed = opened !== undefined && opened[key] !== v;
              return (
                <div key={`${key}-${v}`} className={`rounded-xl bg-surface-2 px-2 py-2 ${changed ? "flash" : ""}`}>
                  <dd className="text-base font-semibold tabular-nums">{v}</dd>
                  <dt className="text-[11px] text-muted">{label}</dt>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>
              Cache: {health.cache_backend} · Sessions: {health.session_backend} · Counters reset when the server restarts.
            </span>
            <span role="status" className={failed ? "font-medium text-bad" : ""}>
              {failed ? "Couldn't refresh. Try again." : `${ago(updatedAt, now)} · auto-updates every 5 s`}
            </span>
          </p>
        </>
      )}
    </section>
  );
}