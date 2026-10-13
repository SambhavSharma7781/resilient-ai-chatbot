from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    message: str = Field(min_length=1)
    system_prompt: str | None = None  # None = keep the session's current prompt; "" = clear it


class Metadata(BaseModel):
    source: Literal["LLM_CACHE", "LIVE_INFERENCE"]
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    billed: bool  # False for cache hits: counts are from the original generation, nothing new was consumed
    fallback_used: bool
    served_by: str | None = None  # non-secret key label, e.g. "groq-1"; None on a cache hit
    retries: int = 0


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    metadata: Metadata
