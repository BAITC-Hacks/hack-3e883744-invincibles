"""Cross-file validation for the team's canonical kit."""
from collections import Counter
from datetime import date
from backend.app.contracts.domain import EmployeeContext
from backend.app.core.progress import next_grade, preview_event, target_requirements
from backend.app.core.eligibility import check_eligibility


def validate_references(employees,events,catalog,history):
    errors=[]
    by_employee={e.employee_id:e for e in employees}
    by_event={e.event_id:e for e in events}
    by_skill={s.skill_id:s for s in catalog.skills}
    by_role={r.role_id:r for r in catalog.roles}
    for label,values in [('employee_id',[e.employee_id for e in employees]),('event_id',[e.event_id for e in events]),('skill_id',[s.skill_id for s in catalog.skills]),('role_id',[r.role_id for r in catalog.roles]),('history_id',[h.history_id for h in history])]:
        duplicates=[id for id,count in Counter(values).items() if count>1]
        errors += [f'duplicate {label}: {id}' for id in duplicates]
    for e in employees:
        if e.role_id not in by_role: errors.append(f'{e.employee_id}: unknown role')
        errors += [f'{e.employee_id}: unknown skill {id}' for id in e.skills if id not in by_skill]
    for role in catalog.roles:
        errors += [f'{role.role_id}: unknown skill {id}' for id in role.requirements['Junior'] if id not in by_skill]
    for event in events:
        errors += [f'{event.event_id}: unknown role {id}' for id in event.audience.role_ids if id not in by_role]
        errors += [f'{event.event_id}: unknown skill {g.skill_id}' for g in event.gains if g.skill_id not in by_skill]
    completed=set()
    for h in history:
        if h.employee_id not in by_employee: errors.append(f'{h.history_id}: unknown employee')
        if h.event_id not in by_event: errors.append(f'{h.history_id}: unknown event')
        if h.status=='completed':
            key=(h.employee_id,h.event_id)
            if key in completed: errors.append(f'{h.history_id}: duplicate completed')
            completed.add(key)
    return errors


def candidate_share(employees,events,catalog,history):
    roles={r.role_id:r for r in catalog.roles}
    by_employee={e.employee_id:[] for e in employees}
    for row in history: by_employee[row.employee_id].append(row)
    count=0;eligible=0
    for employee in employees:
        role=roles[employee.role_id]
        if next_grade(role,employee.grade) is None: continue
        target=target_requirements(employee,role)
        if any(id not in employee.skills for id in target): continue
        if all(employee.skills[id]>=level for id,level in target.items()): continue
        count+=1
        ctx=EmployeeContext(employee=employee,employee_version=1,dataset_version=1,role=role,skills_catalog=catalog.skills,events=events,history=by_employee[employee.employee_id])
        if any(check_eligibility(ctx,event).allowed and preview_event(ctx,event).target_gain>0 for event in events): eligible+=1
    return eligible,count,eligible/count if count else 0
