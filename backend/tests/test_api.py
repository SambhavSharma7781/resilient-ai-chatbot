import asyncio

import httpx


def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def chat(c, sid, text, **extra):
    return await c.post("/api/chat", json={"session_id": sid, "message": text, **extra})


async def test_response_shape_and_metadata(make_app, new_id):
    app, _ = make_app(["good-a"])
    async with client(app) as c:
        r = await chat(c, new_id(), "hello shape")
    assert r.status_code == 200
    body = r.json()
    md = body["metadata"]
    assert md["source"] == "LIVE_INFERENCE"
    assert md["model"] == "fake-model-1"
    assert isinstance(md["latency_ms"], int) and md["latency_ms"] >= 0
    assert md["input_tokens"] > 0 and md["output_tokens"] == 9
    assert md["billed"] is True


async def test_multi_turn_memory_and_per_request_tokens(make_app, new_id):
    app, _ = make_app(["good-a"])
    sid = new_id()
    async with client(app) as c:
        r1 = (await chat(c, sid, "my name is Asha")).json()
        r2 = (await chat(c, sid, "what is my name?")).json()
        r3 = (await chat(c, new_id(), "what is my name?")).json()  # different session = no memory
    assert "turns=1" in r1["reply"]
    assert "turns=2" in r2["reply"], "second turn must include the first user message"
    assert "turns=1" in r3["reply"]
    # token usage is per request, and grows with the history that was sent
    assert r2["metadata"]["input_tokens"] > r1["metadata"]["input_tokens"]
    assert r1["metadata"]["output_tokens"] == r2["metadata"]["output_tokens"] == 9


async def test_system_prompt_is_applied_and_persists(make_app, new_id):
    app, _ = make_app(["good-a"])
    sid = new_id()
    async with client(app) as c:
        a = (await chat(c, sid, "hi", system_prompt="Talk like a pirate")).json()
        b = (await chat(c, sid, "again")).json()  # no system_prompt sent: session keeps it
        cleared = (await chat(c, sid, "third", system_prompt="")).json()
    assert "sys=Talk like a pirate" in a["reply"]
    assert "sys=Talk like a pirate" in b["reply"]
    assert "sys=" not in cleared["reply"]


async def test_cache_hit_reported_through_api(make_app, new_id):
    app, _ = make_app(["good-a"])
    async with client(app) as c:
        first = (await chat(c, new_id(), "Same question for cache")).json()
        await asyncio.sleep(0.5)
        second = (await chat(c, new_id(), "Same question for cache")).json()  # new session, same history => same cache key
    assert first["metadata"]["source"] == "LIVE_INFERENCE"
    assert second["metadata"]["source"] == "LLM_CACHE"
    assert second["metadata"]["billed"] is False
    assert second["metadata"]["served_by"] is None


async def test_failover_visible_to_user_without_error(make_app, new_id):
    app, _ = make_app(["bad429-api", "good-b"])
    async with client(app) as c:
        r = await chat(c, new_id(), "fail over please")
    assert r.status_code == 200
    md = r.json()["metadata"]
    assert md["fallback_used"] is True and md["served_by"] == "good-b"


async def test_all_providers_down_gives_friendly_503(make_app, new_id):
    app, _ = make_app(["bad429-1", "bad500-2"])
    sid = new_id()
    async with client(app) as c:
        r = await chat(c, sid, "anyone there")
        hist = (await c.get(f"/api/session/{sid}")).json()
    assert r.status_code == 503
    err = r.json()["error"]
    assert err["code"] == "ALL_PROVIDERS_UNAVAILABLE" and "try again" in err["message"].lower()
    assert "Traceback" not in r.text
    assert hist["messages"] == [], "a failed turn must not pollute history"


async def test_health_never_leaks_keys(make_app):
    app, _ = make_app(["good-SECRETKEY-123", "bad500-SECRETKEY-456"], labels=["pool-1", "pool-2"])
    async with client(app) as c:
        await chat(c, "leakcheck-session-1", "hello")  # exercise failover so the cooldown path is covered too
        r = await c.get("/api/health")
    assert r.status_code == 200
    assert "SECRETKEY" not in r.text
    assert {p["label"] for p in r.json()["pool"]} == {"pool-1", "pool-2"}


async def test_session_get_and_reset(make_app, new_id):
    app, _ = make_app(["good-a"])
    sid = new_id()
    async with client(app) as c:
        await chat(c, sid, "remember me")
        got = (await c.get(f"/api/session/{sid}")).json()
        assert [m["role"] for m in got["messages"]] == ["user", "assistant"]
        assert got["messages"][1]["meta"]["source"] == "LIVE_INFERENCE"
        assert (await c.delete(f"/api/session/{sid}")).json()["reset"] is True
        assert (await c.get(f"/api/session/{sid}")).json()["messages"] == []


async def test_input_validation(make_app, new_id):
    app, _ = make_app(["good-a"])
    async with client(app) as c:
        assert (await chat(c, "bad id!", "x")).status_code == 422
        assert (await chat(c, new_id(), "")).status_code == 422
        assert (await chat(c, new_id(), "   ")).status_code == 422
        assert (await chat(c, new_id(), "x" * 5000)).status_code == 422


async def test_cors_header_present(make_app):
    app, _ = make_app(["good-a"])
    async with client(app) as c:
        r = await c.options("/api/chat", headers={"Origin": "https://example.vercel.app", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") in {"*", "https://example.vercel.app"}
