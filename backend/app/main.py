from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, build_deployments, load_settings
from .gateway import ChatGateway, GatewayUnavailable, configure_cache
from .schemas import ChatRequest, ChatResponse, Metadata
from .sessions import Session, SessionStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api")

SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
FRIENDLY_UNAVAILABLE = "All AI providers are busy right now. Please try again in a minute."


def create_app(settings: Settings | None = None, gateway: ChatGateway | None = None, store: SessionStore | None = None) -> FastAPI:
    settings = settings or load_settings()
    if gateway is None:
        cache_backend = configure_cache(settings.redis, settings.cache_ttl_seconds)
        gateway = ChatGateway(
            build_deployments(settings),
            cache_backend=cache_backend,
            cooldown_seconds=settings.cooldown_seconds,
            request_timeout=settings.request_timeout_seconds,
            max_output_tokens=settings.max_output_tokens,
        )
    store = store or SessionStore(settings.redis, settings.session_ttl_seconds)

    app = FastAPI(title="Resilient AI Chatbot API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.allowed_origin_regex,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,  # no cookies are used, so "*" origins is safe
    )

    locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)  # serialise turns within one session
    hits: dict[str, deque] = defaultdict(deque)

    def rate_limited(request: Request) -> bool:
        fwd = request.headers.get("x-forwarded-for", "")
        ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        now = time.time()
        q = hits[ip]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= settings.rate_limit_per_minute:
            return True
        q.append(now)
        if len(hits) > 5000:
            hits.clear()
        return False

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):  # last line of defence: never leak a stack trace
        log.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}})

    @app.get("/")
    async def root():
        return {"service": "Resilient AI Chatbot API", "docs": "/docs", "health": "/api/health"}

    @app.get("/api/health")
    async def health():
        pool = await gateway.pool_status()
        healthy = sum(1 for p in pool if p["status"] == "healthy")
        return {
            "status": "ok" if healthy else "degraded",
            "cache_backend": gateway.cache_backend,
            "session_backend": store.backend,
            "pool": pool,
            "stats": gateway.stats,
        }

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(body: ChatRequest, request: Request):
        message = body.message.strip()
        if not message:
            raise HTTPException(status_code=422, detail="Message cannot be empty.")
        if len(message) > settings.max_message_chars:
            raise HTTPException(status_code=422, detail=f"Message is too long (max {settings.max_message_chars} characters).")
        if body.system_prompt and len(body.system_prompt) > settings.max_system_prompt_chars:
            raise HTTPException(status_code=422, detail=f"System prompt is too long (max {settings.max_system_prompt_chars} characters).")
        if rate_limited(request):
            return JSONResponse(status_code=429, content={"error": {"code": "RATE_LIMITED", "message": "You're sending messages too quickly. Please wait a moment."}})

        async with locks[body.session_id]:
            session = await store.get(body.session_id)
            if body.system_prompt is not None:
                session.system_prompt = body.system_prompt.strip()

            llm_messages: list[dict[str, str]] = []
            if session.system_prompt:
                llm_messages.append({"role": "system", "content": session.system_prompt})
            llm_messages += [{"role": m["role"], "content": m["content"]} for m in session.messages]
            llm_messages.append({"role": "user", "content": message})

            try:
                result = await gateway.complete(llm_messages)
            except GatewayUnavailable:
                return JSONResponse(status_code=503, content={"error": {"code": "ALL_PROVIDERS_UNAVAILABLE", "message": FRIENDLY_UNAVAILABLE}})

            meta = Metadata(
                source=result.source,
                model=result.model,
                latency_ms=result.latency_ms,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                billed=result.source == "LIVE_INFERENCE",
                fallback_used=result.fallback_used,
                served_by=result.served_by,
                retries=result.retries,
            )
            session.messages.append({"role": "user", "content": message})
            session.messages.append({"role": "assistant", "content": result.reply, "meta": meta.model_dump()})
            session.messages = session.messages[-settings.max_history_messages :]
            await store.save(body.session_id, session)

        return ChatResponse(session_id=body.session_id, reply=result.reply, metadata=meta)

    def valid_id(session_id: str) -> str:
        if not SESSION_ID_RE.match(session_id):
            raise HTTPException(status_code=422, detail="Invalid session id.")
        return session_id

    @app.get("/api/session/{session_id}")
    async def get_session(session_id: str):
        s: Session = await store.get(valid_id(session_id))
        return {"session_id": session_id, "system_prompt": s.system_prompt, "messages": s.messages}

    @app.delete("/api/session/{session_id}")
    async def reset_session(session_id: str):
        await store.delete(valid_id(session_id))
        return {"session_id": session_id, "reset": True}

    if settings.demo_outage_key:
        # Simulated provider outage used by the "demo-outage-key" deployment. Returns a genuine HTTP 429.
        @app.post("/_demo/v1/chat/completions")
        async def demo_outage():
            return JSONResponse(
                status_code=429,
                content={"error": {"message": "Simulated rate limit (demo outage key)", "type": "rate_limit_error", "code": "rate_limit_exceeded"}},
            )

    return app
