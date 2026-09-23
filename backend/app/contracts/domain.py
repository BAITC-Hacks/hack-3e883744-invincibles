"""Canonical SHAGRA-KIT v1 and immutable operation context."""
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, field_validator, model_validator

ID = Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,64}$')]
Level = Annotated[StrictInt, Field(ge=0, le=5)]
Gain = Annotated[StrictInt, Field(ge=1, le=5)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Grade(str, Enum):
    JUNIOR = 'Junior'
    MIDDLE = 'Middle'
    SENIOR = 'Senior'


class EventType(str, Enum):
    COURSE = 'course'
    WORKSHOP = 'workshop'
    MENTORING = 'mentoring'


class HistoryStatus(str, Enum):
    COMPLETED = 'completed'
    SKIPPED = 'skipped'
    DECLINED = 'declined'


class LocalizedText(StrictModel):
    en: str = Field(min_length=1, max_length=200)
    ru: str | None = Field(default=None, min_length=1, max_length=200)
    kk: str | None = Field(default=None, min_length=1, max_length=200)


class Employee(StrictModel):
    employee_id: ID
    role_id: ID
    grade: Grade
    tenure_months: Annotated[StrictInt, Field(ge=0, le=600)]
    skills: dict[ID, Level]


class Audience(StrictModel):
    role_ids: list[ID] = Field(min_length=1)
    grades: list[Grade] = Field(min_length=1)


class EventGain(StrictModel):
    skill_id: ID
    gain: Gain
    max_level: Level


class Event(StrictModel):
    event_id: ID
    title: LocalizedText
    description: str = Field(max_length=500)
    type: EventType
    audience: Audience
    gains: list[EventGain] = Field(min_length=1)

    @model_validator(mode='after')
    def unique_gains(self):
        ids = [x.skill_id for x in self.gains]
        if len(ids) != len(set(ids)):
            raise ValueError('duplicate skill_id in gains')
        return self


class HistoryEntry(StrictModel):
    history_id: ID
    employee_id: ID
    event_id: ID
    status: HistoryStatus
    occurred_at: datetime

    @field_validator('occurred_at')
    @classmethod
    def utc_date(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
            raise ValueError('occurred_at must be UTC')
        return value


class SkillDefinition(StrictModel):
    skill_id: ID
    name: LocalizedText
    kind: str = Field(pattern=r'^(hard|soft)$')


class RoleDefinition(StrictModel):
    role_id: ID
    name: LocalizedText
    grade_order: list[Grade]
    requirements: dict[Grade, dict[ID, Annotated[StrictInt, Field(ge=1, le=5)]]]

    @model_validator(mode='after')
    def valid_matrix(self):
        if self.grade_order != [Grade.JUNIOR, Grade.MIDDLE, Grade.SENIOR]:
            raise ValueError('grade_order must be Junior, Middle, Senior')
        if set(self.requirements) != set(self.grade_order):
            raise ValueError('requirements must cover all grades')
        keys = set(self.requirements[Grade.JUNIOR])
        if not keys or any(set(self.requirements[g]) != keys for g in self.grade_order):
            raise ValueError('required skills must be nonempty and identical across grades')
        for skill in keys:
            levels = [self.requirements[g][skill] for g in self.grade_order]
            if levels != sorted(levels):
                raise ValueError('requirements cannot decrease')
        return self


class SkillsCatalog(StrictModel):
    schema_version: str = Field(pattern=r'^shagra-kit/1$')
    skills: list[SkillDefinition]
    roles: list[RoleDefinition]


class EmployeeContext(StrictModel):
    employee: Employee
    employee_version: Annotated[StrictInt, Field(ge=1)]
    dataset_version: Annotated[StrictInt, Field(ge=1)]
    role: RoleDefinition
    skills_catalog: list[SkillDefinition]
    events: list[Event]
    history: list[HistoryEntry]
