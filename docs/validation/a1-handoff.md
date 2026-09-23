# A1 handoff to A2/A3 (2026-09-23)

## Contracts and endpoints

Python imports use `app.*` with `PYTHONPATH=backend`. Source schemas: `backend/app/contracts/{domain,api,recommendation}.py`; HTTP reference: `contracts/README.md`; generated examples: `contracts/examples`; exported runtime schema: `contracts/openapi.json`. Recommendation `source` is `llm`, `deterministic_fallback`, or `null` for empty states. `fallback_reason` is one of `timeout`, `unavailable`, `invalid_output`, `busy`, `context_too_large`, `rate_limited`, `call_limit`, or `null`. The first contract commit was `2644d3c`; correction `21bacaf` is mandatory.

The API uses `/api/v1`. Mutating POSTs require `Origin` equal to `APP_ORIGIN` (or matching Referer if Origin is absent). For a Vite proxy at `http://localhost:5173`, run the backend with `APP_ORIGIN=http://localhost:5173`. The browser cookie is HttpOnly and SameSite Strict. Demo users: `employee` / `demo-employee` bound to E0001; `hr` / `demo-hr` can inspect and import all synthetic profiles. Passwords can be overridden via backend env variables.

## Locally verified commands

From the repository root on this machine (Python 3.12 installed):

```bash
/usr/bin/python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
.venv/bin/python tools/generate_kit.py --seed 20260923 --as-of 2026-09-23 --output data/synthetic
.venv/bin/python tools/validate_kit.py data/synthetic
.venv/bin/python tools/generate_contract_examples.py
.venv/bin/python tools/export_openapi.py
.venv/bin/python -m pytest backend/tests -q
PYTHONPATH=backend DATABASE_PATH=runtime/shagra.sqlite3 APP_ORIGIN=http://localhost:8080 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Use a fresh `DATABASE_PATH` when checking initial versions. Existing SQLite data and the session secret survive a restart; startup imports the kit only into an empty database. Do not publish or pass `OPENAI_API_KEY` to frontend build variables. With no key, profile and HR APIs start; live AI readiness must be verified separately by A2.

## Container configuration

`Dockerfile`, `compose.yaml`, `.env.example` are supplied. Intended commands: `docker compose up --build` (app on `127.0.0.1:8080`) and `AI_PROVIDER=ollama docker compose --profile local-ai up --build` (model daemon/private network, model pull). Node 22.19.0, Python 3.12.11 and Ollama 0.11.6 images are pinned by digest. The runtime named volume contains SQLite, the session secret and A2's expected usage file. Docker/Podman are not installed in A1's current environment, so these commands require a Docker-enabled machine for final verification. Frontend build must create `frontend/dist` for the multi-stage image.

## Known integration dependency

`create_app(..., recommendation_service=...)` accepts A2's `RecommendationService` directly for tests. Production bootstrap still needs the concrete A2 provider and service constructors wired when `backend/app/recommendations` is supplied. Until that integration, the recommendation route cannot satisfy the full MVP and `/health.model_status` remains `unavailable`; do not label fallback as a working LLM.
