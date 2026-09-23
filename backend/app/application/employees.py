"""Employee-facing read models assembled from one repository context."""
from app.contracts.api import ProfileResponse, SkillRow, ProfileHistoryRow, AvailableEvent
from app.contracts.domain import EmployeeContext
from app.core.progress import next_grade, calculate_coverage, preview_event
from app.core.eligibility import check_eligibility


def profile(ctx:EmployeeContext)->ProfileResponse:
    employee=ctx.employee
    target_grade=next_grade(ctx.role,employee.grade)
    target=ctx.role.requirements[target_grade] if target_grade else {}
    unknown=any(skill not in employee.skills for skill in target)
    coverage=calculate_coverage(employee,ctx.role)
    if target_grade is None:state='no_next_grade'
    elif unknown:state='incomplete_skills'
    elif all(employee.skills[id]>=level for id,level in target.items()):state='target_met'
    else:state='active'
    names={s.skill_id:s.name for s in ctx.skills_catalog}
    rows=[]
    for id in set(employee.skills)|set(target):
        current=employee.skills.get(id)
        desired=target.get(id)
        gap=max(0,desired-current) if desired is not None and current is not None else None
        rows.append(SkillRow(skill_id=id,name=names[id],current=current,target=desired,gap=gap))
    rows.sort(key=lambda row:(0 if row.gap is None and row.target is not None else 1,-(row.gap or 0),row.skill_id))
    events={e.event_id:e for e in ctx.events}
    history=[ProfileHistoryRow(history_id=h.history_id,event_id=h.event_id,title=events[h.event_id].title,type=events[h.event_id].type,status=h.status,occurred_at=h.occurred_at) for h in ctx.history]
    history.sort(key=lambda h:(-h.occurred_at.timestamp(),h.history_id))
    available=[]
    for event in ctx.events:
        if check_eligibility(ctx,event).allowed:
            gain=preview_event(ctx,event).target_gain if not unknown else 0
            available.append(AvailableEvent(event_id=event.event_id,title=event.title,type=event.type,target_gain=gain))
    available.sort(key=lambda e:e.event_id)
    return ProfileResponse(employee=employee,employee_version=ctx.employee_version,dataset_version=ctx.dataset_version,role_name=ctx.role.name,target_grade=target_grade,coverage=coverage,state=state,skill_rows=rows,history=history,available_events=available)
