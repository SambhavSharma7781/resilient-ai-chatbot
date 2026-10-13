"""Multi-turn session state. Redis when configured (survives restarts), in-memory otherwise or if Redis errors."""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

from .config import RedisConfig

log = logging.getLogger("sessions")
MAX_MEMORY_SESSIONS = 2000


@dataclass
class Session:
    system_prompt: str = ""
    messages: list[dict] = field(default_factory=list)  # {"role","content"} (+ "meta" on assistant turns)


class SessionStore:
    def __init__(self, redis_cfg: RedisConfig | None, ttl_seconds: int):
        self.ttl = ttl_seconds
        self._mem: dict[str, tuple[float, Session]] = {}
        self._redis = None
        self.backend = "memory"
        if redis_cfg:
            import redis.asyncio as aioredis

            self._redis = aioredis.Redis(
                host=redis_cfg.host,
                port=redis_cfg.port,
                password=redis_cfg.password,
                ssl=redis_cfg.ssl,
                decode_responses=True,
                socket_timeout=3,
                socket_connect_timeout=3,
            )
            self.backend = "redis"

    @staticmethod
    def _key(session_id: str) -> str:
        return f"chat:session:{session_id}"

    async def get(self, session_id: str) -> Session:
        if self._redis:
            try:
                raw = await self._redis.get(self._key(session_id))
                if raw:
                    data = json.loads(raw)
                    return Session(system_prompt=data.get("system_prompt", ""), messages=data.get("messages", []))
                return self._mem_get(session_id)
            except Exception:  # noqa: BLE001
                log.warning("redis get failed, using memory")
        return self._mem_get(session_id)

    async def save(self, session_id: str, session: Session) -> None:
        if self._redis:
            try:
                payload = json.dumps({"system_prompt": session.system_prompt, "messages": session.messages})
                await self._redis.set(self._key(session_id), payload, ex=self.ttl)
                self._mem.pop(session_id, None)
                return
            except Exception:  # noqa: BLE001
                log.warning("redis set failed, using memory")
        self._mem_save(session_id, session)

    async def delete(self, session_id: str) -> None:
        self._mem.pop(session_id, None)
        if self._redis:
            try:
                await self._redis.delete(self._key(session_id))
            except Exception:  # noqa: BLE001
                log.warning("redis delete failed")

    # --- in-memory fallback -------------------------------------------------
    def _mem_get(self, session_id: str) -> Session:
        item = self._mem.get(session_id)
        if item and item[0] > time.time():
            return item[1]
        self._mem.pop(session_id, None)
        return Session()

    def _mem_save(self, session_id: str, session: Session) -> None:
        if len(self._mem) >= MAX_MEMORY_SESSIONS:
            oldest = min(self._mem, key=lambda k: self._mem[k][0])
            self._mem.pop(oldest, None)
        self._mem[session_id] = (time.time() + self.ttl, session)
