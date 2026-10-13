const EXAMPLES = [
  "Explain how DNS resolution works in three sentences.",
  "Write a haiku about resilient systems.",
  "What is 17 × 23? Show the steps.",
];

export function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-10 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Ask anything</h2>
      <p className="mt-1.5 text-sm text-muted">
        Every reply shows where it came from, which model answered, how long it took and what it cost in tokens.
      </p>

      <div className="mt-6 flex w-full flex-col gap-2">
        {EXAMPLES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t)}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm transition hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>

      <ol className="mt-8 grid w-full gap-2 text-left text-[13px] text-muted sm:grid-cols-3">
        <li className="rounded-xl bg-surface-2 p-3"><b className="text-fg">1 · Ask</b><br />Send a message and read the badges under the reply.</li>
        <li className="rounded-xl bg-surface-2 p-3"><b className="text-fg">2 · Repeat</b><br />Start a New chat and send the same message to see <span className="font-mono text-good">LLM_CACHE</span>.</li>
        <li className="rounded-xl bg-surface-2 p-3"><b className="text-fg">3 · Inspect</b><br />Click the status pill to watch keys fail over and cool down.</li>
      </ol>
    </div>
  );
}
