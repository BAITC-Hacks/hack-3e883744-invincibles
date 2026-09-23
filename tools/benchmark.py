"""Measure live recommendation cache misses and hits through the HTTP API."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import httpx


def percentiles(times: list[float]) -> dict:
    if not times:
        return {"count": 0, "p50_seconds": None, "p95_seconds": None, "max_seconds": None}
    ordered = sorted(times)
    return {"count": len(times), "p50_seconds": round(statistics.median(times), 4),
            "p95_seconds": round(ordered[min(len(times) - 1, int(0.95 * len(times) + 0.9999) - 1)], 4),
            "max_seconds": round(max(times), 4)}


async def measure(base_url: str, count: int) -> dict:
    origin = os.getenv("APP_ORIGIN", base_url.rstrip("/"))
    headers = {"Origin": origin}
    async with httpx.AsyncClient(base_url=base_url, timeout=15) as client:
        health = await client.get("/health")
        health.raise_for_status()
        health_info = health.json()
        login = await client.post("/api/v1/auth/login", json={"username": "hr",
                              "password": os.getenv("DEMO_HR_PASSWORD", "demo-hr")}, headers=headers)
        login.raise_for_status()
        if login.json().get("role") != "hr":
            raise RuntimeError("HR login did not return the hr role")
        listing = await client.get("/api/v1/employees", params={"limit": 200, "offset": 0})
        listing.raise_for_status()
        employees = listing.json()["items"]
        if len(employees) < count:
            raise RuntimeError(f"Need {count} distinct profiles for cache misses; found {len(employees)}")
        profile_ids = []
        for item in employees:
            profile = await client.get(f"/api/v1/employees/{item['employee_id']}")
            profile.raise_for_status()
            state = profile.json()
            if state.get("state") == "active" and any(
                event.get("target_gain", 0) > 0 for event in state.get("available_events", [])
            ):
                profile_ids.append(item["employee_id"])
            if len(profile_ids) == count:
                break
        if len(profile_ids) < count:
            raise RuntimeError(f"Need {count} active profiles with useful events; found {len(profile_ids)}")
        series = {}
        for label in ("cache_miss", "cache_hit"):
            observations = []
            for employee_id in profile_ids:
                profile = await client.get(f"/api/v1/employees/{employee_id}")
                profile.raise_for_status()
                state = profile.json()
                request = {"employee_version": state["employee_version"],
                           "dataset_version": state["dataset_version"],
                           "excluded_event_ids": [], "preferred_type": None}
                started = time.perf_counter()
                response = await client.post(f"/api/v1/employees/{employee_id}/recommendations",
                                             json=request, headers=headers)
                elapsed = time.perf_counter() - started
                response.raise_for_status()
                result = response.json()
                observations.append({"seconds": elapsed, "source": result.get("source"),
                                     "cache_hit": result.get("cache_hit"),
                                     "fallback_reason": result.get("fallback_reason"),
                                     "status": result.get("status")})
            series[label] = {
                **percentiles([item["seconds"] for item in observations]),
                "llm_success_count": sum(item["source"] == "llm" for item in observations),
                "fallback_count": sum(item["source"] == "deterministic_fallback" for item in observations),
                "cache_hit_count": sum(item["cache_hit"] is True for item in observations),
                "empty_count": sum(item["source"] is None for item in observations),
                "fallback_reasons": {reason: sum(item["fallback_reason"] == reason for item in observations)
                                     for reason in sorted({item["fallback_reason"] for item in observations
                                                           if item["fallback_reason"]})},
            }
        return {"health": {key: health_info.get(key) for key in ("provider", "model", "model_status")},
                "series": series}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8080")
    parser.add_argument("--count", type=int, default=30)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "validation" / "latency.json")
    args = parser.parse_args()
    report = {"timestamp_utc": datetime.now(timezone.utc).isoformat(), "base_url": args.base_url,
              "requested_samples": args.count, "environment": platform.platform()}
    try:
        report["git_sha"] = subprocess.check_output(["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"], cwd=ROOT,
                                                     text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        report["git_sha"] = None
    try:
        measurements = asyncio.run(measure(args.base_url, args.count))
        report.update(measurements)
        miss = report["series"]["cache_miss"]
        hit = report["series"]["cache_hit"]
        report["measurement_valid"] = (miss["cache_hit_count"] == 0
                                       and hit["cache_hit_count"] == args.count
                                       and miss["empty_count"] == 0)
        report["acceptance_met"] = (report["measurement_valid"]
                                    and miss["llm_success_count"] >= 0.9 * args.count
                                    and miss["p95_seconds"] is not None and miss["p95_seconds"] < 10)
        report["status"] = "measured"
        exit_code = 0 if report["acceptance_met"] else 1
    except httpx.HTTPStatusError as exc:
        report.update(status="blocked", reason="HTTPStatusError",
                      http_status=exc.response.status_code, failed_path=exc.request.url.path,
                      acceptance_met=False)
        exit_code = 2
    except Exception as exc:
        report.update(status="blocked", reason=type(exc).__name__, acceptance_met=False)
        exit_code = 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Benchmark: {report['status']}; acceptance_met={report['acceptance_met']}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
