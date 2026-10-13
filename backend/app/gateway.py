"""LiteLLM gateway: key pool, automatic failover, response cache, per-request usage."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import litellm
from litellm import Cache, Router

from .config import Deployment, RedisConfig

log = logging.getLogger("gateway")

MODEL_GROUP = "chat"  # every key sits under ONE model name, so the cache key is identical whichever key answers

litellm.drop_params = True  # providers accept different optional params; drop what a provider does not support
litellm.suppress_debug_info = True


class GatewayUnavailable(Exception):
    """Every key in the pool failed. Carries no provider text, so nothing sensitive can leak to a client."""

    def __init__(self, error_class: str, status_code: int | None):
        super().__init__(f"all deployments failed ({error_class}, status={status_code})")
        self.error_class = error_class
        self.status_code = status_code


@dataclass
class GatewayResult:
    reply: str
    source: str  # LLM_CACHE | LIVE_INFERENCE
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    served_by: str | None
    fallback_used: bool
    retries: int


def configure_cache(redis: RedisConfig | None, ttl_seconds: int) -> str:
    """Install LiteLLM's built-in response cache. Redis when configured, otherwise in-process memory."""
    if redis:
        litellm.cache = Cache(
            type="redis",
            host=redis.host,
            port=str(redis.port),
            password=redis.password,
            ssl=redis.ssl,
            ttl=ttl_seconds,
            namespace="chatcache",
        )
        return "redis"
    litellm.cache = Cache(type="local", ttl=ttl_seconds)
    return "memory"


class ChatGateway:
    def __init__(
        self,
        deployments: list[Deployment],
        *,
        cache_backend: str,
        cooldown_seconds: int = 60,
        request_timeout: float = 25.0,
        max_output_tokens: int = 1024,
    ):
        if not deployments:
            raise ValueError("no deployments configured: set at least one provider key")
        self.deployments = deployments
        self.cache_backend = cache_backend
        self.max_output_tokens = max_output_tokens
        self.primary_order = min(d.order for d in deployments)
        self.stats = {"requests": 0, "cache_hits": 0, "live": 0, "fallbacks": 0, "failures": 0}

        model_list = []
        for d in deployments:
            params = {"model": d.litellm_model, "api_key": d.api_key, "order": d.order}
            if d.api_base:
                params["api_base"] = d.api_base
            model_list.append({"model_name": MODEL_GROUP, "litellm_params": params, "model_info": {"id": d.label}})

        self.router = Router(
            model_list=model_list,
            cache_responses=True,  # uses the litellm.cache installed by configure_cache()
            num_retries=len(deployments) + 1,  # enough attempts to walk the whole pool
            allowed_fails=1,
            cooldown_time=cooldown_seconds,  # a failing key is skipped for this long
            timeout=request_timeout,
            enable_pre_call_checks=True,  # required for `order` priority
            routing_strategy="simple-shuffle",
        )

    async def complete(self, messages: list[dict[str, str]]) -> GatewayResult:
        self.stats["requests"] += 1
        started = time.perf_counter()
        try:
            resp = await self.router.acompletion(model=MODEL_GROUP, messages=messages, max_tokens=self.max_output_tokens)
        except Exception as exc:  # noqa: BLE001 - deliberately broad: callers must never see a raw provider error
            self.stats["failures"] += 1
            status = getattr(exc, "status_code", None)
            log.warning("all deployments failed: %s status=%s", type(exc).__name__, status)
            raise GatewayUnavailable(type(exc).__name__, status) from None
        latency_ms = round((time.perf_counter() - started) * 1000)

        hidden = getattr(resp, "_hidden_params", None) or {}
        cache_hit = hidden.get("cache_hit") is True
        served_by = None if cache_hit else hidden.get("model_id")
        headers = hidden.get("additional_headers") or {}
        retries = int(headers.get("x-litellm-attempted-retries") or 0) if not cache_hit else 0
        order_of = {d.label: d.order for d in self.deployments}
        fallback_used = bool(served_by) and order_of.get(served_by, self.primary_order) > self.primary_order

        usage = getattr(resp, "usage", None)
        result = GatewayResult(
            reply=(resp.choices[0].message.content or "").strip(),
            source="LLM_CACHE" if cache_hit else "LIVE_INFERENCE",
            model=resp.model or "unknown",
            latency_ms=latency_ms,
            input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
            output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
            served_by=served_by,
            fallback_used=fallback_used,
            retries=retries,
        )
        self.stats["cache_hits" if cache_hit else "live"] += 1
        if fallback_used:
            self.stats["fallbacks"] += 1
        return result

    async def pool_status(self) -> list[dict]:
        """Public-safe view of the key pool: labels and health only, never keys."""
        cooling = {}
        try:
            active = await self.router.cooldown_cache.async_get_active_cooldowns([d.label for d in self.deployments], None)
            cooling = {mid: info for mid, info in active}
        except Exception:  # noqa: BLE001
            log.exception("could not read cooldowns")
        now = time.time()
        rows = []
        for d in self.deployments:
            info = cooling.get(d.label)
            remaining = None
            if info:
                remaining = max(0, round(float(info.get("timestamp", now)) + float(info.get("cooldown_time", 0)) - now))
            rows.append(
                {
                    "label": d.label,
                    "provider": d.provider,
                    "model": d.litellm_model.split("/", 1)[-1],
                    "priority": d.order,
                    "status": "cooldown" if info else "healthy",
                    "cooldown_remaining_s": remaining,
                }
            )
        return rows
