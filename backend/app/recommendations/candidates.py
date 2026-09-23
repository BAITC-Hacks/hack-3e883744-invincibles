"""Deterministic candidate selection; all domain math remains in A1's core."""

from __future__ import annotations

from collections.abc import Iterable


def _core():
    # Imported at call time so A1 can publish the shared core independently.
    from app import core

    return core


def _contracts():
    from app import contracts

    return contracts


def _history_value(summary: object, name: str) -> int:
    return int(getattr(summary, name))


def useful_candidates(ctx: object, excluded_event_ids: Iterable[str] = ()) -> list:
    """Return useful, eligible candidates before scoring or UI exclusions."""
    core = _core()
    excluded = set(excluded_event_ids)
    candidates = []
    for event in ctx.events:
        if event.event_id in excluded or not core.check_eligibility(ctx, event).allowed:
            continue
        preview = core.preview_event(ctx, event)
        if preview.target_gain > 0:
            candidates.append((event, preview))
    return candidates


def build_candidates(ctx: object, request: object) -> list:
    """Score eligible useful events by the exact §8.1 heuristic."""
    core = _core()
    Candidate = _contracts().Candidate
    target = core.next_grade(ctx.role, ctx.employee.grade)
    if target is None:
        return []
    requirements = ctx.role.requirements[target]
    # Unknown target skills and a met target are empty states, not zero-filled data.
    if any(skill_id not in ctx.employee.skills for skill_id in requirements):
        return []
    gap_total = sum(max(0, level - ctx.employee.skills[skill_id]) for skill_id, level in requirements.items())
    if gap_total == 0:
        return []
    candidates = []
    for event, preview in useful_candidates(ctx, request.excluded_event_ids):
        history = core.summarize_type_history(ctx, event.type)
        completed = _history_value(history, "completed")
        skipped = _history_value(history, "skipped")
        declined = _history_value(history, "declined")
        h = (completed + 1) / (completed + skipped + declined + 2)
        preferred = bool(request.preferred_type and request.preferred_type == event.type)
        score = 0.80 * (preview.target_gain / gap_total) + 0.15 * h + 0.05 * int(preferred)
        reasons = ["TARGET_GAP"]
        if completed:
            reasons.append("HISTORY_SUPPORT")
        if skipped or declined:
            reasons.append("HISTORY_CAUTION")
        if not (completed or skipped or declined):
            reasons.append("HISTORY_UNKNOWN")
        if preferred:
            reasons.append("EXPLICIT_PREFERENCE")
        candidates.append(Candidate(event=event, preview=preview, score=score,
                                    history_summary=history, allowed_reason_codes=reasons))
    candidates.sort(key=lambda c: (-c.score, -c.preview.target_gain, c.event.event_id))
    return candidates


def shortlist(candidates: list, maximum: int = 8) -> list:
    """Keep the highest target gain present even when it falls outside top score."""
    selected = list(candidates[:maximum])
    if not selected:
        return selected
    maximum_gain = max(c.preview.target_gain for c in candidates)
    if all(c.preview.target_gain != maximum_gain for c in selected):
        winner = min((c for c in candidates if c.preview.target_gain == maximum_gain),
                     key=lambda c: (-c.score, c.event.event_id))
        selected[-1] = winner
    return selected
