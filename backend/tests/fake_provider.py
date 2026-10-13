"""Fake OpenAI-compatible provider whose behaviour is chosen by the API key (test-only)."""
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def make_fake_app(calls: list, requests_log: list) -> FastAPI:
    app = FastAPI()

    @app.post("/v1/chat/completions")
    async def chat(req: Request):
        key = req.headers.get("authorization", "").replace("Bearer ", "")
        body = await req.json()
        calls.append(key)
        requests_log.append(body)
        if key.startswith("bad429"):
            return JSONResponse({"error": {"message": "Rate limit reached", "type": "rate_limit_error", "code": "rate_limit_exceeded"}}, status_code=429)
        if key.startswith("badquota"):
            return JSONResponse({"error": {"message": "You exceeded your current quota", "type": "insufficient_quota", "code": "insufficient_quota"}}, status_code=429)
        if key.startswith("bad500"):
            return JSONResponse({"error": {"message": "Internal server error"}}, status_code=500)
        if key.startswith("bad503"):
            return JSONResponse({"error": {"message": "Service unavailable"}}, status_code=503)
        if key.startswith("bad401"):
            return JSONResponse({"error": {"message": "Incorrect API key provided", "type": "invalid_request_error", "code": "invalid_api_key"}}, status_code=401)
        msgs = body["messages"]
        n_in = sum(len(m["content"].split()) for m in msgs)
        system = next((m["content"] for m in msgs if m["role"] == "system"), "")
        text = f"[{key}] you said: {msgs[-1]['content']}" + (f" | sys={system}" if system else "") + f" | turns={sum(1 for m in msgs if m['role']=='user')}"
        return {
            "id": "chatcmpl-fake", "object": "chat.completion", "created": int(time.time()), "model": "fake-model-1",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": n_in, "completion_tokens": 9, "total_tokens": n_in + 9},
        }

    return app
