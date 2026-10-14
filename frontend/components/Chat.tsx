"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getSession, resetSession, sendChat } from "@/lib/api";
import { loadSessionId, loadSystemPrompt, newSessionId, saveSessionId, saveSystemPrompt } from "@/lib/session";
import type { ChatMessage } from "@/lib/types";
import { useBackend } from "@/lib/useBackend";
import { EmptyState } from "./EmptyState";
import { ArrowDownIcon, PlusIcon, SendIcon, SlidersIcon } from "./icons";
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
  const [showJump, setShowJump] = useState(false);
  const [announce, setAnnounce] = useState("");
  const restored = useRef(false);
  const scrollerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const hasMessages = useRef(false);
  const stick = useRef(true); // keep following new messages only while the reader is at the bottom
  const instant = useRef(true); // first paint of a restored chat jumps, it does not animate

  // restore the conversation from the server once the backend is reachable
  useEffect(() => {
    if (!sessionId || restored.current || (state !== "ok" && state !== "degraded")) return;
    restored.current = true;
    getSession(sessionId)
      .then((s) => {
        instant.current = true;
        stick.current = true;
        setMessages(s.messages.map((m) => ({ id: uid(), role: m.role, content: m.content, meta: m.meta })));
      })
      .catch(() => {});
  }, [sessionId, state]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !calm ? "smooth" : "auto" });
  }, []);

  // Scroll the message list itself (never the page) and only while the reader is following along.
  useEffect(() => {
    hasMessages.current = messages.length > 0;
    if (!hasMessages.current) {
      scrollerRef.current?.scrollTo({ top: 0 }); // the welcome screen always starts at the top
    } else if (stick.current) {
      scrollToBottom(!instant.current);
    }
    instant.current = false;
  }, [messages, sending, scrollToBottom]);

  // Content can still grow after the first paint (fonts, markdown, wrapping): stay pinned to the bottom if the reader is there.
  useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollerRef.current;
    if (!content || !scroller) return;
    const ro = new ResizeObserver(() => {
      if (stick.current && hasMessages.current) scroller.scrollTop = scroller.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = atBottom;
    setShowJump(!atBottom);
  };

  // Escape closes whichever panel is open and hands focus back to the button that opened it.
  useEffect(() => {
    if (panel === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPanel("none");
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  // While the key pool is open, keep cooldown timers fresh.
  useEffect(() => {
    if (panel !== "pool") return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [panel, refresh]);

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
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: result.reply, meta: result.metadata, fresh: true }]);
        setAnnounce(`Assistant replied: ${result.reply}`);
        void refresh();
      } catch (e) {
        const content =
          e instanceof ApiError
            ? e.reachable
              ? e.message
              : "I couldn't reach the server. It may still be starting up, so please try again in a few seconds."
            : "Something went wrong. Please try again.";
        setMessages((m) => [...m, { id: uid(), role: "assistant", content, error: true, retryText: text, fresh: true }]);
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
      stick.current = true;
      setMessages((m) => [...m, { id: uid(), role: "user", content: text, fresh: true }]);
      void deliver(text);
    },
    [sending, sessionId, deliver],
  );

  const retry = useCallback(
    (errMsg: ChatMessage) => {
      if (!errMsg.retryText || sending) return;
      stick.current = true;
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
    setPanel("none");
    stick.current = true;
    setShowJump(false);
    inputRef.current?.focus();
    resetSession(old).catch(() => {}); // best effort; old history is also cleaned up by TTL
  }, [sending, sessionId]);

  const applyPrompt = (v: string) => {
    setAppliedPrompt(v);
    saveSystemPrompt(v);
    setPanel("none");
    inputRef.current?.focus();
  };

  const toggle = (p: Panel, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setPanel((cur) => (cur === p ? "none" : p));
  };

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      {panel !== "none" && <div className="fixed inset-0 z-20 bg-black/20 sm:bg-black/5" onClick={() => setPanel("none")} aria-hidden />}

      <header className="relative z-30 shrink-0">
        <div className="relative mx-auto w-full max-w-3xl px-4 pb-3 pt-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 sm:flex-1">
              <h1 className="text-[17px] font-semibold tracking-tight">Resilient AI Chat</h1>
              <p className="truncate text-xs text-muted">LiteLLM key pool · automatic failover · response cache</p>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2">
              <StatusPill state={state} health={health} open={panel === "pool"} onClick={(el) => toggle("pool", el)} />
              <button
                type="button"
                onClick={(e) => toggle("prompt", e.currentTarget)}
                aria-expanded={panel === "prompt"}
                aria-controls="panel-prompt"
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface-2 sm:px-3 ${
                  appliedPrompt ? "border-accent/50 text-accent" : "border-line"
                } ${panel === "prompt" ? "bg-surface-2" : ""}`}
              >
                <SlidersIcon />
                <span className="sm:hidden">Prompt</span>
                <span className="hidden sm:inline">System prompt</span>
                {appliedPrompt ? " · on" : ""}
              </button>
              <button
                type="button"
                onClick={newChat}
                disabled={sending}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-50 sm:px-3"
              >
                <PlusIcon />
                <span>
                  New<span className="hidden sm:inline"> chat</span>
                </span>
              </button>
            </div>
          </div>

          {panel !== "none" && (
            <div
              id={panel === "pool" ? "panel-pool" : "panel-prompt"}
              className="absolute inset-x-4 top-full z-30 -mt-1 max-h-[calc(100dvh-7.5rem)] overflow-y-auto rounded-2xl shadow-xl sm:inset-x-6"
            >
              {panel === "pool" ? (
                <PoolPanel health={health} onRefresh={() => void refresh()} onClose={() => setPanel("none")} />
              ) : (
                <SystemPromptPanel
                  value={promptDraft}
                  applied={appliedPrompt}
                  onChange={setPromptDraft}
                  onApply={applyPrompt}
                  onClose={() => {
                    setPanel("none");
                    triggerRef.current?.focus();
                  }}
                />
              )}
            </div>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 border-t border-line/60">
        <main ref={scrollerRef} onScroll={onScroll} className="relative h-full overflow-y-auto overscroll-contain" aria-label="Conversation">
          <div className="sr-only" role="status" aria-live="polite">
            {announce}
          </div>
          <div ref={contentRef} className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
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
          </div>
        </main>
        {showJump && (
          <button
            type="button"
            onClick={() => {
              stick.current = true;
              setShowJump(false);
              scrollToBottom(true);
            }}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-md transition hover:bg-surface-2"
          >
            <ArrowDownIcon /> Latest message
          </button>
        )}
      </div>

      <footer className="shrink-0 border-t border-line/60 bg-bg">
        <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
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
              placeholder="Message the assistant…"
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
            <span className="hidden sm:inline"> Enter to send, Shift+Enter for a new line.</span>
            {draft.length > MAX_CHARS - 300 && ` · ${draft.length}/${MAX_CHARS}`}
          </p>
        </div>
      </footer>
    </div>
  );
}