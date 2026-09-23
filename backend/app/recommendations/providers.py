"""Single-shot ranking providers and a durable paid-attempt ledger."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Protocol

import httpx


class ProviderError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class RankingProvider(Protocol):
    provider_id: str

    async def rank(self, payload: dict, schema: dict, timeout_seconds: float) -> dict: ...


class PaidCallLimiter:
    """Durable, process-local async-safe count. A corrupt ledger fails closed."""

    _locks: dict[Path, asyncio.Lock] = {}

    def __init__(self, path: str | Path = "/app/runtime/ai-usage.json", max_attempts: int = 2000):
        self.path = Path(path)
        self.max_attempts = max_attempts
        self._lock = self._locks.setdefault(self.path.resolve(), asyncio.Lock())

    def snapshot(self) -> dict:
        if not self.path.exists():
            return dict(attempts=0, input_tokens=0, output_tokens=0,
                        known_cost_usd=0.0, unknown_usage_attempts=0)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            fields = ("attempts", "input_tokens", "output_tokens", "unknown_usage_attempts")
            if any(type(data.get(k)) is not int or data[k] < 0 for k in fields):
                raise ValueError("invalid ledger")
            if not isinstance(data.get("known_cost_usd"), (float, int)) or data["known_cost_usd"] < 0:
                raise ValueError("invalid ledger")
            if data["unknown_usage_attempts"] > data["attempts"]:
                raise ValueError("invalid ledger")
            return data
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise ProviderError("call_limit") from exc

    def _write(self, data: dict) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_name(self.path.name + ".tmp")
            temporary.write_text(json.dumps(data, sort_keys=True), encoding="utf-8")
            os.replace(temporary, self.path)
        except OSError as exc:
            raise ProviderError("call_limit") from exc

    async def reserve(self) -> None:
        async with self._lock:
            data = self.snapshot()
            if data["attempts"] >= self.max_attempts:
                raise ProviderError("call_limit")
            data["attempts"] += 1
            data["unknown_usage_attempts"] += 1
            self._write(data)

    async def record_usage(self, usage: dict | None) -> None:
        if not usage:
            return
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if type(input_tokens) is not int or type(output_tokens) is not int or input_tokens < 0 or output_tokens < 0:
            return
        async with self._lock:
            data = self.snapshot()
            data["input_tokens"] += input_tokens
            data["output_tokens"] += output_tokens
            data["known_cost_usd"] += (input_tokens * 0.40 + output_tokens * 1.60) / 1_000_000
            data["unknown_usage_attempts"] = max(0, data["unknown_usage_attempts"] - 1)
            self._write(data)


class OpenAIProvider:
    provider_id = "openai"

    def __init__(self, api_key: str | None = None, model: str = "gpt-4.1-mini-2025-04-14",
                 limiter: PaidCallLimiter | None = None,
                 base_url: str = "https://api.openai.com/v1", client: httpx.AsyncClient | None = None):
        self.api_key = api_key if api_key is not None else os.getenv("OPENAI_API_KEY", "")
        self.model = model
        self.limiter = limiter or PaidCallLimiter(
            path=os.getenv("AI_USAGE_PATH", "/app/runtime/ai-usage.json"),
            max_attempts=int(os.getenv("AI_MAX_PAID_CALLS", "2000")),
        )
        self.base_url = base_url.rstrip("/")
        self.client = client

    async def rank(self, payload: dict, schema: dict, timeout_seconds: float) -> dict:
        if not self.api_key:
            raise ProviderError("unavailable")
        await self.limiter.reserve()
        request = {
            "model": self.model, "stream": False, "store": False,
            "max_output_tokens": 512, "temperature": 0,
            "instructions": payload["instructions"],
            "input": json.dumps(payload["context"], ensure_ascii=False, separators=(",", ":")),
            "text": {"format": {"type": "json_schema", "name": "ranked_choices",
                                "strict": True, "schema": schema}},
        }
        own_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=timeout_seconds)
        try:
            response = await client.post(
                self.base_url + "/responses", json=request,
                headers={"Authorization": f"Bearer {self.api_key}"}, timeout=timeout_seconds,
            )
            try:
                body = response.json()
            except ValueError:
                body = {}
            if not isinstance(body, dict):
                body = {}
            await self.limiter.record_usage(body.get("usage") if isinstance(body, dict) else None)
            if response.status_code == 429:
                raise ProviderError("rate_limited")
            if response.status_code >= 400:
                raise ProviderError("unavailable")
            if body.get("status") != "completed":
                raise ProviderError("invalid_output")
            output = body.get("output")
            if not isinstance(output, list):
                raise ProviderError("invalid_output")
            contents = [content for item in output if isinstance(item, dict) and item.get("type") == "message"
                        for content in item.get("content", []) if isinstance(content, dict)]
            if any(content.get("type") == "refusal" for content in contents):
                raise ProviderError("invalid_output")
            texts = [content.get("text") for content in contents if content.get("type") == "output_text"]
            if not texts or any(not isinstance(part, str) for part in texts):
                raise ProviderError("invalid_output")
            try:
                return json.loads("".join(texts))
            except ValueError as exc:
                raise ProviderError("invalid_output") from exc
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("unavailable") from exc
        finally:
            if own_client:
                await client.aclose()


class OllamaProvider:
    provider_id = "ollama"

    def __init__(self, model: str = "qwen2.5:1.5b", base_url: str = "http://ollama:11434",
                 client: httpx.AsyncClient | None = None):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.client = client

    async def rank(self, payload: dict, schema: dict, timeout_seconds: float) -> dict:
        own_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=timeout_seconds)
        try:
            response = await client.post(self.base_url + "/api/chat", json={
                "model": self.model, "stream": False, "format": schema, "keep_alive": "30m",
                "options": {"temperature": 0, "num_predict": 512},
                "messages": [{"role": "system", "content": payload["instructions"]},
                             {"role": "user", "content": json.dumps(payload["context"], ensure_ascii=False)}],
            }, timeout=timeout_seconds)
            if response.status_code == 429:
                raise ProviderError("rate_limited")
            if response.status_code >= 400:
                raise ProviderError("unavailable")
            body = response.json()
            return json.loads(body["message"]["content"])
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("unavailable") from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderError("invalid_output") from exc
        finally:
            if own_client:
                await client.aclose()


def provider_from_env() -> RankingProvider:
    provider = os.getenv("AI_PROVIDER", "openai").lower()
    if provider == "openai":
        return OpenAIProvider(model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini-2025-04-14"))
    if provider == "ollama":
        return OllamaProvider(model=os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b"),
                              base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"))
    raise ValueError("AI_PROVIDER must be openai or ollama")
