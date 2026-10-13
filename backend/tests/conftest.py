import socket
import threading
import time
import uuid

import pytest
import uvicorn

from app.config import Deployment, load_settings
from app.gateway import ChatGateway, configure_cache
from app.main import create_app
from app.sessions import SessionStore
from tests.fake_provider import make_fake_app


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def fake():
    calls, requests_log = [], []
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(make_fake_app(calls, requests_log), host="127.0.0.1", port=port, log_level="error"))
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield type("Fake", (), {"base": f"http://127.0.0.1:{port}/v1", "calls": calls, "requests": requests_log})
    server.should_exit = True


def make_gateway(fake, keys: list[str], labels: list[str] | None = None, reset_cache: bool = True) -> ChatGateway:
    """keys are tried in the given priority order (one provider per key => strict priority).
    By default the label equals the key so tests can assert on it; pass `labels` to separate them."""
    if reset_cache:
        configure_cache(None, 600)  # fresh in-memory LiteLLM cache
    labels = labels or keys
    deployments = [
        Deployment(label=labels[i], provider="fake", litellm_model="openai/fake-model", api_key=k, order=i + 1, api_base=fake.base)
        for i, k in enumerate(keys)
    ]
    return ChatGateway(deployments, cache_backend="memory", cooldown_seconds=30, request_timeout=10, max_output_tokens=256)


@pytest.fixture
def new_id():
    return lambda: "t" + uuid.uuid4().hex[:16]


@pytest.fixture
def make_app(fake):
    def _make(keys, labels=None):
        gw = make_gateway(fake, keys, labels)
        settings = load_settings({"RATE_LIMIT_PER_MINUTE": "1000"})
        return create_app(settings=settings, gateway=gw, store=SessionStore(None, 600)), gw

    return _make
