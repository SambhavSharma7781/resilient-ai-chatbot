import type { Health, Meta } from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
  /** Backend answered (so it is awake) but declined or failed the request. */
  get reachable() {
    return this.status > 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    // network failure, CORS failure, sleeping host or timeout all look the same to the browser
    throw new ApiError("Can't reach the server right now. It may be waking up.", 0, "NETWORK");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body (e.g. a host's holding page) */
  }

  if (!res.ok) {
    const d = data as { error?: { code?: string; message?: string }; detail?: unknown } | null;
    const detail = typeof d?.detail === "string" ? d.detail : undefined;
    const message = d?.error?.message ?? detail ?? (res.status >= 500 ? "The server hit a problem. Please try again." : "That request couldn't be processed.");
    // 502/503/504 without our JSON error body = host is still starting up
    const code = d?.error?.code ?? (res.status >= 502 && res.status <= 504 ? "NETWORK" : "HTTP_" + res.status);
    throw new ApiError(message, code === "NETWORK" ? 0 : res.status, code);
  }
  return data as T;
}

export interface ChatResult {
  session_id: string;
  reply: string;
  metadata: Meta;
}

export const sendChat = (session_id: string, message: string, system_prompt: string) =>
  request<ChatResult>("/api/chat", { method: "POST", body: JSON.stringify({ session_id, message, system_prompt }) });

export interface ServerSession {
  system_prompt: string;
  messages: { role: "user" | "assistant"; content: string; meta?: Meta }[];
}
export const getSession = (id: string) => request<ServerSession>(`/api/session/${id}`, {}, 20_000);
export const resetSession = (id: string) => request<unknown>(`/api/session/${id}`, { method: "DELETE" }, 20_000);
export const getHealth = (timeoutMs = 15_000) => request<Health>("/api/health", {}, timeoutMs);
