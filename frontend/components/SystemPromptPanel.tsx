import { useEffect, useId, useRef } from "react";
import { XIcon } from "./icons";

const MAX = 2000;

export function SystemPromptPanel({
  value,
  applied,
  onChange,
  onApply,
  onClose,
}: {
  value: string;
  applied: string;
  onChange: (v: string) => void;
  onApply: (v: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const dirty = value.trim() !== applied.trim();
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label="System prompt">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold">
            System prompt
          </label>
          <p className="mt-0.5 text-xs text-muted">Sets how the assistant behaves for this chat. It is sent with every message and changes the cache key.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close system prompt"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted hover:bg-surface-2 hover:text-fg"
        >
          <XIcon />
        </button>
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        rows={3}
        placeholder="e.g. You are a concise assistant. Answer in at most two sentences."
        className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {applied.trim() ? "Active for this chat" : "No system prompt active"} · {value.length}/{MAX}
        </span>
        <div className="flex gap-2">
          {applied.trim() && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                onApply("");
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={!dirty}
            onClick={() => onApply(value.trim())}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}