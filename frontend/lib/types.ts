export type Source = "LLM_CACHE" | "LIVE_INFERENCE";

export interface Meta {
  source: Source;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  /** false on a cache hit: counts are from the original generation, nothing new was consumed */
  billed: boolean;
  fallback_used: boolean;
  /** non-secret key label such as "groq-1"; null on a cache hit */
  served_by: string | null;
  retries: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: Meta;
  /** arrived just now in this session: animate it in (restored history is shown instantly) */
  fresh?: boolean;
  /** friendly error shown in place of a reply */
  error?: boolean;
  /** the user text to resend when the Retry button is pressed */
  retryText?: string;
}

export interface PoolEntry {
  label: string;
  provider: string;
  model: string;
  priority: number;
  status: "healthy" | "cooldown";
  cooldown_remaining_s: number | null;
}

export interface Health {
  status: "ok" | "degraded";
  cache_backend: string;
  session_backend: string;
  pool: PoolEntry[];
  stats: { requests: number; cache_hits: number; live: number; fallbacks: number; failures: number };
}