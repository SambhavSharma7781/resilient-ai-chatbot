"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getSession, resetSession, sendChat } from "@/lib/api";
import { loadSessionId, loadSystemPrompt, newSessionId, saveSessionId, saveSystemPrompt } from "@/lib/session";
import type { ChatMessage } from "@/lib/types";
import { useBackend } from "@/lib/useBackend";
import { EmptyState } from "./EmptyState";
import { PlusIcon, SendIcon, SlidersIcon } from "./icons";
import { MessageBubble } from "./MessageBubble";
import { PoolPanel } from "./PoolPanel";
import { StatusPill } from "./StatusPill";
import { SystemPromptPanel } from "./SystemPromptPanel";

const MAX_CHARS = 4000;
const uid = () => Math.random().toString(36).slice(2, 10);
type Panel = "none" | "prompt" | "pool";

export default function Chat() {
  const { health, state, refresh, waitUntilAwake } = useBackend();
  // Chat is rendered client-side only (see ChatLoader), so state can initialise straight from localStorage.
  const [sessionId, setSessionId] = useState(loadSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [promptDraft, setPromptDraft] = useState(loadSystemPrompt);
  const [appliedPrompt, setAppliedPrompt] = useState(loadSystemPrompt);
  const restored = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // restore the conversation from the server once the backend is reachable
  useEffect(() => {
    if (!sessionId || restored.current || (state !== "ok" && state !== "degraded")) return;
    restored.current = true;
    getSession(sessionId)
      .then((s) => {
        setMessages(s.messages.map((m) => ({ id: uid(), role: m.role, content: m.content, meta: m.meta })));
      })
      .catch(() => {});
  }, [sessionId, state]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [draft]);

  const deliver = useCallback(
    async (text: string) => {
      setSending(true);
      setSlow(false);
      const slowTimer = setTimeout(() => setSlow(true), 7000);
      try {
        let result;
        try {
          result = await sendChat(sessionId, text, appliedPrompt);
        } catch (e) {
          // Looks like a sleeping free-tier host: wake it, then retry once automatically.
          if (e instanceof ApiError && !e.reachable && (await waitUntilAwake(60_000))) {
            result = await sendChat(sessionId, text, appliedPrompt);
          } else {
            throw e;
          }
        }
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: result.reply, meta: result.metadata }]);
        void refresh();
      } catch (e) {
        const content =
          e instanceof ApiError
            ? e.reachable
              ? e.message
              : "I couldn't reach the server. It may still be starting up, so please try again in a few seconds."
            : "Something went wrong. Please try again.";
        setMessages((m) => [...m, { id: uid(), role: "assistant", content, error: true, retryText: text }]);
        void refresh();
      } finally {
        clearTimeout(slowTimer);
        setSending(false);
        setSlow(false);
      }
    },
    [sessionId, appliedPrompt, refresh, waitUntilAwake],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || sending || !sessionId) return;
      setDraft("");
      setMessages((m) => [...m, { id: uid(), role: "user", content: text }]);
      void deliver(text);
    },
    [sending, sessionId, deliver],
  );

  const retry = useCallback(
    (errMsg: ChatMessage) => {
      if (!errMsg.retryText || sending) return;
      setMessages((m) => m.filter((x) => x.id !== errMsg.id));
      void deliver(errMsg.retryText);
    },
    [sending, deliver],
  );

  const newChat = useCallback(async () => {
    if (sending) return;
    const old = sessionId;
    const id = newSessionId();
    saveSessionId(id);
    setSessionId(id);
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
    resetSession(old).catch(() => {}); // best effort; old history is also cleaned up by TTL
  }, [sending, sessionId]);

  const applyPrompt = (v: string) => {
    setAppliedPrompt(v);
    saveSystemPrompt(v);
  };

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? "none" : p));

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="shrink-0 px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold tracking-tight">Resilient AI Chat</h1>
            <p className="text-xs text-muted">LiteLLM key pool · automatic failover · response cache</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill state={state} health={health} open={panel === "pool"} onClick={() => toggle("pool")} />
            <button
              type="button"
              onClick={() => toggle("prompt")}
              aria-expanded={panel === "prompt"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 ${
                appliedPrompt ? "border-accent/50 text-accent" : "border-line"
              }`}
            >
              <SlidersIcon /> System prompt{appliedPrompt ? " · on" : ""}
            </button>
            <button
              type="button"
              onClick={newChat}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-50"
            >
              <PlusIcon /> New chat
            </button>
          </div>
        </div>
        {panel !== "none" && (
          <div className="mt-3">
            {panel === "pool" ? (
              <PoolPanel health={health} onRefresh={() => void refresh()} />
            ) : (
              <SystemPromptPanel value={promptDraft} applied={appliedPrompt} onChange={setPromptDraft} onApply={applyPrompt} />
            )}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
        {messages.length === 0 && !sending ? (
          <EmptyState onPick={submit} disabled={sending || !sessionId} />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onRetry={retry} busy={sending} />
            ))}
            {sending && (
              <div className="flex">
                <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-sm" role="status">
                  <span className="sr-only">The assistant is replying</span>
                  <span className="flex items-center gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  {slow && <p className="mt-2 text-xs text-muted">Still working. The free backend may be waking up or switching keys.</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25"
        >
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(draft);
              }
            }}
            rows={1}
            placeholder="Message the assistant…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-42 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || !sessionId}
            aria-label="Send message"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition hover:opacity-90 disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </form>
        <p className="mt-2 px-1 text-center text-[11px] text-muted">
          Free-tier models can be slow or wrong. Replies repeated with identical history come from cache.
          {draft.length > MAX_CHARS - 300 && ` · ${draft.length}/${MAX_CHARS}`}
        </p>
      </footer>
    </div>
  );
}
