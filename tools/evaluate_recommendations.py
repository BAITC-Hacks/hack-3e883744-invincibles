"""Live Q1–Q3 evaluation using the real provider and A1 contracts."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"], cwd=ROOT, text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


async def evaluate() -> dict:
    from app.contracts.domain import EmployeeContext
    from app.contracts.recommendation import RecommendationRequest
    from app.recommendations import RecommendationService
    from app.recommendations.providers import provider_from_env

    cases = json.loads((ROOT / "data" / "acceptance" / "q1-q3.json").read_text(encoding="utf-8"))
    provider = provider_from_env()
    ranking = RecommendationService(provider=provider)
    runs = []
    for case in cases:
        ctx = EmployeeContext.model_validate(case["context"])
        request = RecommendationRequest.model_validate(case["request"])
        started = time.perf_counter()
        result = await ranking.recommend(ctx, request)
        elapsed = time.perf_counter() - started
        actual = [item.event_id for item in result.items]
        evidence_ok = all({"GRADE_TARGET", "SKILL_GAP", "HISTORY"}.issubset(
            {e.kind for e in item.evidence}) for item in result.items)
        runs.append({
            "case": case["id"], "source": result.source,
            "selected_event_ids": actual, "duration_seconds": round(elapsed, 4),
            "fallback_reason": result.fallback_reason,
            "expected_first": case["expected"]["first_event_id"],
            "expected_first_met": bool(actual and actual[0] == case["expected"]["first_event_id"]),
            "evidence_complete": evidence_ok,
            "llm_valid_under_10s": result.source == "llm" and elapsed < 10 and evidence_ok,
        })
    ledger = provider.limiter.snapshot() if hasattr(provider, "limiter") else None
    return {"status": "evaluated", "provider": provider.provider_id, "model": ranking.model,
            "prompt_version": ranking.prompt_version, "runs": runs,
            "acceptance_met": all(run["llm_valid_under_10s"] and run["expected_first_met"] for run in runs),
            "usage_ledger": ledger}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "validation" / "ai.json")
    args = parser.parse_args()
    report = {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "git_sha": git_sha()}
    if os.getenv("AI_PROVIDER", "openai") == "openai" and not os.getenv("OPENAI_API_KEY"):
        report.update(status="blocked", reason="OPENAI_API_KEY is absent on server; live AI unverified",
                      provider="openai", model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini-2025-04-14"),
                      prompt_version="2", runs=[], acceptance_met=False)
        exit_code = 2
    else:
        try:
            report.update(asyncio.run(evaluate()))
            exit_code = 0 if report["acceptance_met"] else 1
        except Exception as exc:
            report.update(status="error", reason=type(exc).__name__, acceptance_met=False)
            exit_code = 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"AI evaluation: {report['status']}; acceptance_met={report['acceptance_met']}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
