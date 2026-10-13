const KEY = "resilient-chat:session-id";
const PROMPT_KEY = "resilient-chat:system-prompt";

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "s_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadSessionId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    /* storage can be blocked; fall through to a fresh id */
  }
  const id = newSessionId();
  saveSessionId(id);
  return id;
}

export function saveSessionId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

export const loadSystemPrompt = () => {
  try {
    return localStorage.getItem(PROMPT_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveSystemPrompt = (v: string) => {
  try {
    localStorage.setItem(PROMPT_KEY, v);
  } catch {}
};
