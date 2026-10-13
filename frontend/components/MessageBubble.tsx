import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";
import { MetaChips } from "./MetaChips";
import { AlertIcon, RefreshIcon } from "./icons";

export function MessageBubble({ message, onRetry, busy }: { message: ChatMessage; onRetry: (m: ChatMessage) => void; busy: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex">
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
    <div className="flex">
      <div className="max-w-[92%] min-w-0 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-[15px] shadow-sm">
        <div className="prose-chat break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {message.meta && <MetaChips meta={message.meta} />}
      </div>
    </div>
  );
}
