from app.contracts.domain import Employee, RoleDefinition, Event, EmployeeContext, SkillDefinition
from app.core.progress import calculate_coverage, next_grade, preview_event
from app.core.eligibility import check_eligibility
from app.core.errors import DomainError
from app.core.history import summarize_type_history
from app.application.employees import profile
import pytest


def context(level=2, max_level=4, grade='Middle', known=True):
    role = RoleDefinition.model_validate({'role_id':'BACKEND','name':{'en':'Backend'},'grade_order':['Junior','Middle','Senior'],'requirements':{'Junior':{'SK_PYTHON':1,'SK_SYSTEM_DESIGN':1},'Middle':{'SK_PYTHON':3,'SK_SYSTEM_DESIGN':2},'Senior':{'SK_PYTHON':4,'SK_SYSTEM_DESIGN':2}}})
    skills={'SK_PYTHON':level,'SK_SYSTEM_DESIGN':2} if known else {'SK_PYTHON':level}
    employee=Employee(employee_id='E0001',role_id='BACKEND',grade=grade,tenure_months=48,skills=skills)
    event=Event.model_validate({'event_id':'EV_BACKEND_01','title':{'en':'Course'},'description':'','type':'course','audience':{'role_ids':['BACKEND'],'grades':['Middle','Senior']},'gains':[{'skill_id':'SK_PYTHON','gain':1,'max_level':max_level}]})
    ctx=EmployeeContext(employee=employee,employee_version=1,dataset_version=1,role=role,skills_catalog=[SkillDefinition(skill_id='SK_PYTHON',name={'en':'Python'},kind='hard'),SkillDefinition(skill_id='SK_SYSTEM_DESIGN',name={'en':'System Design'},kind='hard')],events=[event],history=[])
    return ctx,event


def test_coverage_and_preview_66_7_to_83_3():
    ctx,event=context()
    assert next_grade(ctx.role,ctx.employee.grade)=='Senior'
    assert calculate_coverage(ctx.employee,ctx.role)==66.7
    preview=preview_event(ctx,event)
    assert preview.coverage_before==66.7
    assert preview.coverage_after==83.3
    assert preview.target_gain==1
    assert preview.changes[0].after==3


def test_cap_below_current_never_reduces_skill():
    ctx,event=context(level=4,max_level=3)
    assert preview_event(ctx,event).changes[0].after==4


def test_unknown_skill_is_not_zero():
    ctx,event=context(known=False)
    assert calculate_coverage(ctx.employee,ctx.role) is None
    assert preview_event(ctx,event).coverage_before is None


def test_no_next_grade():
    ctx,event=context(grade='Senior')
    assert next_grade(ctx.role,ctx.employee.grade) is None
    assert calculate_coverage(ctx.employee,ctx.role) is None
    assert preview_event(ctx,event).changes[0].target is None


def test_target_met_state_and_unknown_event_skill():
    ctx,event=context(level=4)
    assert profile(ctx).state=='target_met'
    assert calculate_coverage(ctx.employee,ctx.role)==100.0
    altered=event.model_copy(update={'gains':[event.gains[0].model_copy(update={'skill_id':'SK_UNKNOWN'})]})
    assert check_eligibility(ctx,altered).reason=='INCOMPLETE_SKILLS'
    with pytest.raises(DomainError) as error:
        preview_event(ctx,altered)
    assert error.value.code=='INCOMPLETE_SKILLS'


def test_type_history_counts_only_matching_event_type():
    from app.contracts.domain import HistoryEntry
    ctx,event=context()
    history=[HistoryEntry(history_id='H1',employee_id='E0001',event_id='EV_BACKEND_01',status='skipped',occurred_at='2025-10-01T08:00:00Z'),HistoryEntry(history_id='H2',employee_id='E0001',event_id='EV_BACKEND_01',status='declined',occurred_at='2025-11-01T08:00:00Z')]
    ctx=ctx.model_copy(update={'history':history})
    summary=summarize_type_history(ctx,'course')
    assert (summary.completed,summary.skipped,summary.declined)==(0,1,1)
    assert summarize_type_history(ctx,'mentoring').skipped==0


def test_completed_and_audience_rules_block_event():
    from app.contracts.domain import HistoryEntry
    ctx,event=context()
    wrong_audience=event.model_copy(update={'audience':event.audience.model_copy(update={'grades':['Junior']})})
    assert check_eligibility(ctx,wrong_audience).reason=='AUDIENCE_MISMATCH'
    completed=HistoryEntry(history_id='H3',employee_id='E0001',event_id=event.event_id,status='completed',occurred_at='2025-10-01T08:00:00Z')
    ctx=ctx.model_copy(update={'history':[completed]})
    assert check_eligibility(ctx,event).reason=='ALREADY_COMPLETED'
    with pytest.raises(DomainError) as error:
        preview_event(ctx,event)
    assert error.value.code=='INELIGIBLE_EVENT'
