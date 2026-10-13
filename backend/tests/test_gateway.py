import asyncio
import uuid

import pytest

from app.gateway import GatewayUnavailable
from tests.conftest import make_gateway


def msg(text=None):
    return [{"role": "user", "content": text or f"question {uuid.uuid4().hex}"}]


async def test_failover_walks_past_429_quota_and_5xx(fake):
    gw = make_gateway(fake, ["bad429-a", "badquota-b", "bad500-c", "bad503-d", "good-e"])
    r = await gw.complete(msg())
    assert r.source == "LIVE_INFERENCE"
    assert r.served_by == "good-e"
    assert r.fallback_used is True
    assert "[good-e]" in r.reply


async def test_auth_error_also_fails_over(fake):
    gw = make_gateway(fake, ["bad401-a", "good-b"])
    r = await gw.complete(msg())
    assert r.served_by == "good-b"


async def test_bad_key_enters_cooldown_and_is_skipped(fake):
    gw = make_gateway(fake, ["bad429-cool", "good-b"])
    await gw.complete(msg())
    before = fake.calls.count("bad429-cool")
    await gw.complete(msg())
    assert fake.calls.count("bad429-cool") == before, "key in cooldown must not be called again"
    status = {p["label"]: p for p in await gw.pool_status()}
    assert status["bad429-cool"]["status"] == "cooldown"
    assert status["good-b"]["status"] == "healthy"


async def test_primary_healthy_means_no_fallback(fake):
    gw = make_gateway(fake, ["good-primary", "good-backup"])
    r = await gw.complete(msg())
    assert r.served_by == "good-primary"
    assert r.fallback_used is False


async def test_repeat_request_is_served_from_cache(fake):
    gw = make_gateway(fake, ["good-x"])
    m = msg("What is the capital of France?" + uuid.uuid4().hex)
    first = await gw.complete(m)
    await asyncio.sleep(0.5)  # LiteLLM writes cache entries in a background task
    calls_before = len(fake.calls)
    second = await gw.complete(m)
    assert first.source == "LIVE_INFERENCE"
    assert second.source == "LLM_CACHE"
    assert len(fake.calls) == calls_before, "cache hit must not reach the provider"
    assert second.reply == first.reply
    assert second.latency_ms <= first.latency_ms
    assert (second.input_tokens, second.output_tokens) == (first.input_tokens, first.output_tokens)


async def test_cache_is_shared_across_keys(fake):
    """The cache key must not depend on which key/deployment answered: a gateway with a completely
    different key pool still hits the entry written by the first one."""
    gw1 = make_gateway(fake, ["good-first"])
    m = msg()
    await gw1.complete(m)
    await asyncio.sleep(0.5)
    gw2 = make_gateway(fake, ["good-other", "good-another"], reset_cache=False)  # same cache, different pool
    assert (await gw2.complete(m)).source == "LLM_CACHE"


async def test_different_history_is_a_cache_miss(fake):
    gw = make_gateway(fake, ["good-x"])
    base = msg()
    await gw.complete(base)
    await asyncio.sleep(0.5)
    longer = base + [{"role": "assistant", "content": "ok"}, {"role": "user", "content": "and now?"}]
    assert (await gw.complete(longer)).source == "LIVE_INFERENCE"


async def test_all_keys_failing_raises_clean_error(fake):
    gw = make_gateway(fake, ["bad429-1", "bad500-2"])
    with pytest.raises(GatewayUnavailable) as e:
        await gw.complete(msg())
    assert "bad429" not in str(e.value) and "bad500" not in str(e.value)
