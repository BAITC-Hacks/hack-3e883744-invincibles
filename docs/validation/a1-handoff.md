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

Use a fresh `DATABASE_PATH` when checking initial versions. Existing SQLite data and the session secret survive a restart; startup imports the kit only into an empty database. Do not publish or pass `OPENAI_API_KEY` to frontend build variables. With no key, profile, HR and recommendations start; recommendations use an explicitly labelled deterministic fallback. Live AI readiness must be verified separately by A2.

## Container configuration

`Dockerfile`, `compose.yaml`, `.env.example` are supplied. Intended commands: `docker compose up --build` (app on `127.0.0.1:8080`) and `AI_PROVIDER=ollama docker compose --profile local-ai up --build` (model daemon/private network, model pull). Node 22.19.0, Python 3.12.11 and Ollama 0.11.6 images are pinned by digest. The runtime named volume contains SQLite, the session secret and A2's expected usage file. Docker Engine 29.8.1 and Compose 5.5.1 were installed on this Ubuntu 26.04 host. A3's partial frontend passes `npm ci` and `npm run build`; the multi-stage app image also builds successfully.

An isolated Compose project `shagra-a1-check` ran on port 18080 with its own new runtime volume and `OPENAI_API_KEY` overridden empty. HTML and health returned 200; unauthenticated profile returned 401; employee login, preview, deterministic recommendation, completion and retry passed. Preview left the profile unchanged. After `docker compose restart app`, employee and dataset versions remained 2, and retrying the same idempotency key returned 200 without another gain. The verification container was stopped with `docker compose down` without `-v`, so its test volume remains available for inspection. The normal demo volume was untouched.

## A2 integration and remaining validation

`create_app` now constructs A2's `RecommendationService` by default. `create_app(..., recommendation_service=...)` remains available for tests. Startup schedules one short JSON Schema probe through the selected provider and its paid-attempt limiter, without blocking the app. `/api/v1/health` reports `loading` during the probe, `ready` only after a valid response or a successful LLM recommendation, and `unavailable` on failure or when the OpenAI key is absent. `/api/v1/health` itself does not call the provider. The route checks employee and dataset versions both before and after the recommendation call.

All 42 backend tests pass with A2's latest code. The A1 container smoke intentionally disabled paid OpenAI calls. A2 fixed the benchmark health path and separately reported live OpenAI acceptance: Q1–Q3 matched their controls, 29/30 recommendation cache misses used valid LLM output, and cache-miss p95 was 2.3126 seconds; see `docs/validation/ai.json` and `latency.json`. A3's live browser E2E, `THIRD_PARTY.md` and `docs/DEMO.md` have not arrived in this checkout.
