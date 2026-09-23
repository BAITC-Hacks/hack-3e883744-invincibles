"""HR aggregates from a single read snapshot; no LLM calls."""
from collections import Counter,defaultdict
from backend.app.contracts.api import HrOverview,HrSkillGap,HrNoStep,HrParticipation
from backend.app.contracts.domain import EmployeeContext
from backend.app.core.progress import next_grade,preview_event
from backend.app.core.eligibility import check_eligibility


def overview(snapshot):
    version,employees,events,roles,skills,history=snapshot
    role_map={r.role_id:r for r in roles};skill_map={s.skill_id:s for s in skills}
    history_by_employee=defaultdict(list)
    for h in history: history_by_employee[h.employee_id].append(h)
    assessed=Counter();affected=Counter();gap_sum=Counter();no_step=[]
    for employee in employees:
        role=role_map[employee.role_id]
        next_g=next_grade(role,employee.grade)
        if next_g is None:
            no_step.append(HrNoStep(employee_id=employee.employee_id,role_id=employee.role_id,reason='no_next_grade'));continue
        target=role.requirements[next_g]
        missing=any(id not in employee.skills for id in target)
        for id,required in target.items():
            if id in employee.skills:
                assessed[id]+=1;gap=max(0,required-employee.skills[id])
                if gap:affected[id]+=1;gap_sum[id]+=gap
        if missing:
            no_step.append(HrNoStep(employee_id=employee.employee_id,role_id=employee.role_id,reason='incomplete_skills'));continue
        if all(employee.skills[id]>=required for id,required in target.items()):
            no_step.append(HrNoStep(employee_id=employee.employee_id,role_id=employee.role_id,reason='target_met'));continue
        ctx=EmployeeContext(employee=employee,employee_version=1,dataset_version=version,role=role,skills_catalog=skills,events=events,history=history_by_employee[employee.employee_id])
        useful=[event for event in events if check_eligibility(ctx,event).allowed and preview_event(ctx,event).target_gain>0]
        if useful:continue
        potential=[];catalog_gap=False
        for event in events:
            if not any(g.skill_id in target and employee.skills[g.skill_id]<target[g.skill_id] and min(5,g.max_level,employee.skills[g.skill_id]+g.gain)>employee.skills[g.skill_id] for g in event.gains if g.skill_id in employee.skills):continue
            catalog_gap=True
            if employee.role_id in event.audience.role_ids and employee.grade in event.audience.grades and all(g.skill_id in employee.skills for g in event.gains):potential.append(event)
        reason='all_useful_completed' if potential else 'audience_or_missing_skills' if catalog_gap else 'no_catalog_coverage'
        no_step.append(HrNoStep(employee_id=employee.employee_id,role_id=employee.role_id,reason=reason))
    gaps=[HrSkillGap(skill_id=id,name=skill_map[id].name,affected_count=affected[id],assessed_count=assessed[id],affected_share=round(affected[id]/assessed[id],4) if assessed[id] else None,mean_gap=round(gap_sum[id]/affected[id],1) if affected[id] else None) for id in sorted(assessed)]
    history_by_event=defaultdict(list)
    for h in history:history_by_event[h.event_id].append(h)
    participation=[]
    for event in events:
        entries=history_by_event[event.event_id];counts=Counter(h.status for h in entries)
        total=len(entries)
        participation.append(HrParticipation(event_id=event.event_id,title=event.title,completed=counts['completed'],skipped=counts['skipped'],declined=counts['declined'],unique_participants=len({h.employee_id for h in entries}),completion_share=round(counts['completed']/total,4) if total else None))
    return HrOverview(dataset_version=version,employees_total=len(employees),skill_gaps=gaps,no_step=no_step,participation=participation)
