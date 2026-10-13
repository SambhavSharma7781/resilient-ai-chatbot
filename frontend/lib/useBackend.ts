"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth } from "./api";
import type { Health } from "./types";

export type BackendState = "connecting" | "ok" | "degraded" | "offline";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tracks backend health and wakes a sleeping free-tier host: on mount it polls /api/health
 * until the server answers (up to ~90 s) so the first real message does not hit a cold start.
 */
export function useBackend() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<BackendState>("connecting");
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const h = await getHealth();
      if (!alive.current) return true;
      setHealth(h);
      setState(h.status === "ok" ? "ok" : "degraded");
      return true;
    } catch {
      if (alive.current) setState((s) => (s === "ok" || s === "degraded" ? "offline" : s));
      return false;
    }
  }, []);

  /** Poll until reachable or the timeout passes. */
  const waitUntilAwake = useCallback(
    async (timeoutMs = 75_000) => {
      const start = Date.now();
      while (alive.current && Date.now() - start < timeoutMs) {
        if (await refresh()) return true;
        await sleep(3000);
      }
      return false;
    },
    [refresh],
  );

  useEffect(() => {
    alive.current = true;
    (async () => {
      const ok = await waitUntilAwake(90_000);
      if (!ok && alive.current) setState("offline");
    })();
    return () => {
      alive.current = false;
    };
  }, [waitUntilAwake]);

  return { health, state, refresh, waitUntilAwake };
}
