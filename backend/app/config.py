"""Environment-driven configuration. Secrets only ever come from env vars."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlparse

# (provider, env var holding comma-separated keys, env var overriding the model, default LiteLLM model string)
# Model names change often on free tiers, so every one is overridable without a code change.
PROVIDERS: list[tuple[str, str, str, str]] = [
    ("gemini", "GEMINI_API_KEYS", "GEMINI_MODEL", "gemini/gemini-2.5-flash"),
    ("groq", "GROQ_API_KEYS", "GROQ_MODEL", "groq/openai/gpt-oss-120b"),
    ("openrouter", "OPENROUTER_API_KEYS", "OPENROUTER_MODEL", "openrouter/nvidia/nemotron-3-super-120b-a12b:free"),
]


@dataclass(frozen=True)
class Deployment:
    """One (provider, key) pair in the pool. `label` is safe to show publicly; the key never is."""

    label: str
    provider: str
    litellm_model: str
    api_key: str = field(repr=False)
    order: int  # lower = tried first; equal orders are load-balanced
    api_base: str | None = None


@dataclass(frozen=True)
class RedisConfig:
    host: str
    port: int
    password: str | None
    ssl: bool


@dataclass(frozen=True)
class Settings:
    port: int
    allowed_origins: list[str]
    allowed_origin_regex: str | None
    redis: RedisConfig | None
    cache_ttl_seconds: int
    session_ttl_seconds: int
    max_history_messages: int
    max_message_chars: int
    max_system_prompt_chars: int
    max_output_tokens: int
    request_timeout_seconds: float
    cooldown_seconds: int
    rate_limit_per_minute: int
    demo_outage_key: bool


def _csv(value: str | None) -> list[str]:
    return [p.strip() for p in (value or "").split(",") if p.strip()]


def _parse_redis(url: str | None) -> RedisConfig | None:
    if not url:
        return None
    u = urlparse(url)
    if not u.hostname:
        return None
    return RedisConfig(host=u.hostname, port=u.port or 6379, password=u.password, ssl=u.scheme == "rediss")


def load_settings(env: dict[str, str] | None = None) -> Settings:
    e = env if env is not None else os.environ
    return Settings(
        port=int(e.get("PORT", "8000")),
        allowed_origins=_csv(e.get("ALLOWED_ORIGINS")) or ["*"],
        allowed_origin_regex=e.get("ALLOWED_ORIGIN_REGEX") or None,
        redis=_parse_redis(e.get("REDIS_URL")),
        cache_ttl_seconds=int(e.get("CACHE_TTL_SECONDS", "3600")),
        session_ttl_seconds=int(e.get("SESSION_TTL_SECONDS", "86400")),
        max_history_messages=int(e.get("MAX_HISTORY_MESSAGES", "20")),
        max_message_chars=int(e.get("MAX_MESSAGE_CHARS", "4000")),
        max_system_prompt_chars=int(e.get("MAX_SYSTEM_PROMPT_CHARS", "2000")),
        max_output_tokens=int(e.get("MAX_OUTPUT_TOKENS", "2048")),
        request_timeout_seconds=float(e.get("REQUEST_TIMEOUT_SECONDS", "25")),
        cooldown_seconds=int(e.get("COOLDOWN_SECONDS", "30")),
        rate_limit_per_minute=int(e.get("RATE_LIMIT_PER_MINUTE", "30")),
        demo_outage_key=e.get("DEMO_OUTAGE_KEY", "false").lower() in {"1", "true", "yes"},
    )


def build_deployments(settings: Settings, env: dict[str, str] | None = None) -> list[Deployment]:
    """Provider priority = order in PROVIDERS. Several keys for one provider share a priority and are load-balanced."""
    e = env if env is not None else os.environ
    out: list[Deployment] = []
    if settings.demo_outage_key:
        # A real HTTP 429 served by this very app, so reviewers can watch failover on the live site.
        out.append(
            Deployment(
                label="demo-outage-key",
                provider="demo",
                litellm_model="openai/demo-outage",
                api_key="demo",
                order=0,
                api_base=f"http://127.0.0.1:{settings.port}/_demo/v1",
            )
        )
    for idx, (provider, keys_var, model_var, default_model) in enumerate(PROVIDERS, start=1):
        keys = _csv(e.get(keys_var)) or _csv(e.get(keys_var.removesuffix("S")))  # also accept GEMINI_API_KEY
        model = e.get(model_var) or default_model
        api_base = e.get(f"{provider.upper()}_API_BASE") or None  # optional: point a provider at a compatible proxy
        for n, key in enumerate(keys, start=1):
            out.append(Deployment(label=f"{provider}-{n}", provider=provider, litellm_model=model, api_key=key, order=idx, api_base=api_base))
    return out
