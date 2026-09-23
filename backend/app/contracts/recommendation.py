"""Shared A1/A2 recommendation contract."""
from typing import Literal, Annotated
from pydantic import Field, StrictInt
from .domain import StrictModel, ID, Level, EventType, Event, LocalizedText

AnnotatedVersion = Annotated[StrictInt, Field(ge=1)]
AnnotatedDelta = Annotated[StrictInt, Field(ge=0)]


class RecommendationRequest(StrictModel):
    employee_version: AnnotatedVersion
    dataset_version: AnnotatedVersion
    excluded_event_ids: list[ID] = Field(default_factory=list)
    preferred_type: EventType | None = None


class SkillChange(StrictModel):
    skill_id: ID
    before: Level
    after: Level
    delta: AnnotatedDelta
    target: Level | None
    remaining_gap: AnnotatedDelta | None


class Preview(StrictModel):
    event_id: ID
    employee_version: AnnotatedVersion
    dataset_version: AnnotatedVersion
    changes: list[SkillChange]
    coverage_before: float | None
    coverage_after: float | None
    target_gain: AnnotatedDelta


class Eligibility(StrictModel):
    allowed: bool
    reason: Literal['AUDIENCE_MISMATCH', 'ALREADY_COMPLETED', 'INCOMPLETE_SKILLS'] | None = None


class HistorySummary(StrictModel):
    completed: AnnotatedDelta
    skipped: AnnotatedDelta
    declined: AnnotatedDelta


class Evidence(StrictModel):
    kind: Literal['GRADE_TARGET', 'SKILL_GAP', 'HISTORY', 'PREFERENCE']
    text: str
    refs: list[str]


class Candidate(StrictModel):
    event: Event
    preview: Preview
    score: float
    history_summary: HistorySummary
    allowed_reason_codes: list[str]


class RecommendationItem(StrictModel):
    event_id: ID
    title: LocalizedText
    type: EventType
    rank: AnnotatedVersion
    preview: Preview
    evidence: list[Evidence]
    reason_codes: list[str]
    comparison_event_id: ID | None


class RecommendationResult(StrictModel):
    employee_id: ID
    employee_version: AnnotatedVersion
    dataset_version: AnnotatedVersion
    status: Literal['ready', 'no_next_grade', 'target_met', 'incomplete_skills', 'no_eligible_events', 'all_candidates_excluded']
    source: Literal['llm', 'deterministic_fallback'] | None
    cache_hit: bool
    fallback_reason: Literal['timeout', 'unavailable', 'invalid_output', 'busy', 'context_too_large', 'rate_limited', 'call_limit'] | None
    no_step_reason: Literal['no_catalog_coverage', 'all_useful_completed', 'audience_or_missing_skills'] | None
    items: list[RecommendationItem]
