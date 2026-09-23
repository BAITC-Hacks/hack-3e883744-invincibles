"""Pure grade, coverage and event effect calculations."""
from decimal import Decimal, ROUND_HALF_UP
from app.contracts.domain import Employee, EmployeeContext, Event, RoleDefinition
from app.contracts.recommendation import Preview, SkillChange
from .errors import DomainError


def next_grade(role: RoleDefinition, grade: str) -> str | None:
    grades = [g.value for g in role.grade_order]
    try:
        index = grades.index(str(grade.value if hasattr(grade, 'value') else grade))
    except ValueError:
        raise DomainError('INVALID_DATA', 'Неизвестный грейд.')
    return grades[index + 1] if index + 1 < len(grades) else None


def target_requirements(employee: Employee, role: RoleDefinition) -> dict[str, int] | None:
    grade = next_grade(role, employee.grade)
    return role.requirements[grade] if grade else None


def raw_coverage(employee: Employee, role: RoleDefinition) -> Decimal | None:
    target = target_requirements(employee, role)
    if target is None or any(skill not in employee.skills for skill in target):
        return None
    numerator = sum(min(employee.skills[skill], level) for skill, level in target.items())
    return Decimal(100) * Decimal(numerator) / Decimal(sum(target.values()))


def calculate_coverage(employee: Employee, role: RoleDefinition) -> float | None:
    raw = raw_coverage(employee, role)
    return float(raw.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if raw is not None else None


def preview_event(ctx: EmployeeContext, event: Event) -> Preview:
    from .eligibility import check_eligibility
    eligibility = check_eligibility(ctx, event)
    if not eligibility.allowed:
        raise DomainError('INCOMPLETE_SKILLS' if eligibility.reason == 'INCOMPLETE_SKILLS' else 'INELIGIBLE_EVENT', 'Активность недоступна.', [{'reason': eligibility.reason}])
    before = ctx.employee
    after_skills = dict(before.skills)
    target = target_requirements(before, ctx.role)
    changes = []
    target_gain = 0
    for gain in sorted(event.gains, key=lambda g: g.skill_id):
        old = before.skills[gain.skill_id]
        new = max(old, min(5, gain.max_level, old + gain.gain))
        after_skills[gain.skill_id] = new
        required = target.get(gain.skill_id) if target else None
        remaining = max(0, required - new) if required is not None else None
        delta = new - old
        if required is not None:
            target_gain += min(delta, max(0, required - old))
        changes.append(SkillChange(skill_id=gain.skill_id,before=old,after=new,delta=delta,target=required,remaining_gap=remaining))
    updated = before.model_copy(update={'skills': after_skills})
    return Preview(event_id=event.event_id,employee_version=ctx.employee_version,dataset_version=ctx.dataset_version,changes=changes,coverage_before=calculate_coverage(before,ctx.role),coverage_after=calculate_coverage(updated,ctx.role),target_gain=target_gain)
