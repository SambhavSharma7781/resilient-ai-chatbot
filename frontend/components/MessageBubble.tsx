import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { normalizeMath } from "@/lib/math";
import type { ChatMessage } from "@/lib/types";
import { MetaChips } from "./MetaChips";
import { AlertIcon, RefreshIcon } from "./icons";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals a reply that has already arrived, word by word, so it reads like typing instead of
 * popping in whole. Replies from restored history, and users who prefer reduced motion, skip it.
 */
function useReveal(text: string, animate: boolean) {
  const [shown, setShown] = useState(() => (animate && !prefersReducedMotion() ? 0 : text.length));
  useEffect(() => {
    if (!animate || prefersReducedMotion()) return;
    const duration = Math.min(2200, Math.max(500, text.length * 9));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      let n = Math.floor(text.length * t);
      if (t < 1) {
        const space = text.indexOf(" ", n); // stop on a word boundary so words appear whole
        n = space === -1 ? text.length : space;
      } else {
        n = text.length;
      }
      setShown(n);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);
  return shown;
}

export function MessageBubble({ message, onRetry, busy }: { message: ChatMessage; onRetry: (m: ChatMessage) => void; busy: boolean }) {
  const shown = useReveal(message.content, !!message.fresh && message.role === "assistant" && !message.error);
  const typing = shown < message.content.length;
  const enter = message.fresh ? "rise" : "";

  if (message.role === "user") {
    return (
      <div className={`flex justify-end ${enter}`}>
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className={`flex ${enter}`}>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] text-fg" role="alert">
          <p className="flex items-start gap-2">
            <AlertIcon className="mt-0.5 shrink-0 text-warn" width={16} height={16} />
            <span>{message.content}</span>
          </p>
          {message.retryText && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              disabled={busy}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-surface px-3 py-1.5 text-[13px] font-medium text-fg transition hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshIcon /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${enter}`}>
      <div className="max-w-[92%] min-w-0 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-[15px] shadow-sm">
        <div className="prose-chat break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
            components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
          >
            {normalizeMath(typing ? message.content.slice(0, shown) : message.content)}
          </ReactMarkdown>
        </div>
        {message.meta && !typing && (
          <div className={message.fresh ? "rise" : ""}>
            <MetaChips meta={message.meta} />
          </div>
        )}
      </div>
    </div>
  );
}