# Resilient AI Chat — backend

FastAPI + LiteLLM Router gateway with multi-key failover, built-in response caching and per-request token tracking.
Full documentation: see the repository root README.

- Health & pool status: `GET /api/health`
- Chat: `POST /api/chat`
- Interactive docs: `/docs`