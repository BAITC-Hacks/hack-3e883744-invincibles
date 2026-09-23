from app.contracts.domain import EmployeeContext, Event
from app.contracts.recommendation import Eligibility


def check_eligibility(ctx: EmployeeContext, event: Event) -> Eligibility:
    employee = ctx.employee
    if employee.role_id not in event.audience.role_ids or employee.grade not in event.audience.grades:
        return Eligibility(allowed=False, reason='AUDIENCE_MISMATCH')
    if any(entry.event_id == event.event_id and entry.status == 'completed' for entry in ctx.history):
        return Eligibility(allowed=False, reason='ALREADY_COMPLETED')
    if any(gain.skill_id not in employee.skills for gain in event.gains):
        return Eligibility(allowed=False, reason='INCOMPLETE_SKILLS')
    return Eligibility(allowed=True, reason=None)
