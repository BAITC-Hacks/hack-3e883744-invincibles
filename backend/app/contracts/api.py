"""HTTP /api/v1 request and response models."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import Field, StrictInt
from .domain import StrictModel, ID, Level, Grade, EventType, HistoryStatus, Employee, LocalizedText
from .recommendation import Preview

Version = Annotated[StrictInt, Field(ge=1)]
Count = Annotated[StrictInt, Field(ge=0)]

class ErrorDetail(StrictModel):
    file: str | None
    path: str
    code: str
    message: str

class ErrorBody(StrictModel):
    code: str
    message: str
    details: list[ErrorDetail]

class ErrorResponse(StrictModel):
    error: ErrorBody
    request_id: str

class HealthResponse(StrictModel):
    status: Literal['ok']
    dataset_version: Version
    model_status: Literal['ready', 'loading', 'unavailable']
    provider: Literal['openai', 'ollama']
    model: str

class LoginRequest(StrictModel):
    username: str
    password: str

class AuthResponse(StrictModel):
    role: Literal['employee', 'hr']
    employee_id: ID | None

class EmployeeListItem(StrictModel):
    employee_id: ID
    role_id: ID
    grade: Grade

class EmployeeList(StrictModel):
    items: list[EmployeeListItem]
    total: Count

class SkillRow(StrictModel):
    skill_id: ID
    name: LocalizedText
    current: Level | None
    target: Level | None
    gap: Count | None

class ProfileHistoryRow(StrictModel):
    history_id: ID
    event_id: ID
    title: LocalizedText
    type: EventType
    status: HistoryStatus
    occurred_at: datetime

class AvailableEvent(StrictModel):
    event_id: ID
    title: LocalizedText
    type: EventType
    target_gain: Count

class ProfileResponse(StrictModel):
    employee: Employee
    employee_version: Version
    dataset_version: Version
    role_name: LocalizedText
    target_grade: Grade | None
    coverage: float | None
    state: Literal['active', 'no_next_grade', 'target_met', 'incomplete_skills']
    skill_rows: list[SkillRow]
    history: list[ProfileHistoryRow]
    available_events: list[AvailableEvent]

class EventActionRequest(StrictModel):
    event_id: ID
    employee_version: Version
    dataset_version: Version

class CompletionResponse(StrictModel):
    employee_id: ID
    event_id: ID
    applied: bool
    employee_version: Version
    dataset_version: Version
    preview: Preview
    history_id: ID

class HrSkillGap(StrictModel):
    skill_id: ID
    name: LocalizedText
    affected_count: Count
    assessed_count: Count
    affected_share: float | None
    mean_gap: float | None

class HrNoStep(StrictModel):
    employee_id: ID
    role_id: ID
    reason: str

class HrParticipation(StrictModel):
    event_id: ID
    title: LocalizedText
    completed: Count
    skipped: Count
    declined: Count
    unique_participants: Count
    completion_share: float | None

class HrOverview(StrictModel):
    dataset_version: Version
    employees_total: Count
    skill_gaps: list[HrSkillGap]
    no_step: list[HrNoStep]
    participation: list[HrParticipation]

class ImportSummary(StrictModel):
    new_employees: Count
    replaced_employees: Count
    new_history: Count
    unchanged_history: Count

class ImportValidation(StrictModel):
    import_id: ID | None
    valid: bool
    base_dataset_version: Version
    expires_at: datetime | None
    summary: ImportSummary
    errors: list[ErrorDetail]

class ImportCommitRequest(StrictModel):
    base_dataset_version: Version

class ImportCommit(StrictModel):
    import_id: ID
    dataset_version: Version
    summary: ImportSummary
    applied: bool
