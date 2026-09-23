"""Generate and validate deterministic HTTP examples against shared Pydantic models."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.contracts.domain import Employee, RoleDefinition, SkillDefinition, Event, EmployeeContext, Grade
from backend.app.contracts.recommendation import RecommendationResult
from backend.app.contracts.api import (
    ProfileResponse, EventActionRequest, CompletionResponse, HrOverview,
    ImportValidation, ImportCommit, ErrorResponse, SkillRow, AvailableEvent,
)
from backend.app.core.progress import calculate_coverage, next_grade, preview_event

OUT = Path('contracts/examples')
OUT.mkdir(parents=True, exist_ok=True)

hard = ['SK_PYTHON', 'SK_SYSTEM_DESIGN'] + [f'SK_BACKEND_{i:02d}' for i in range(2, 10)]
soft = ['SK_PUBLIC_SPEAKING'] + [f'SK_SOFT_{i:02d}' for i in range(1, 10)]
ids = hard + soft
names = ['Python', 'System Design'] + [f'Backend Skill {i}' for i in range(2, 10)] + ['Public Speaking'] + [f'Soft Skill {i}' for i in range(1, 10)]
skills = [SkillDefinition(skill_id=id, name={'en':name}, kind='hard' if id in hard else 'soft') for id,name in zip(ids,names)]
role = RoleDefinition(role_id='BACKEND', name={'en':'Backend Engineer','ru':'Backend-разработчик'}, grade_order=['Junior','Middle','Senior'], requirements={g:{id:level for id in hard}|{id:sl for id in soft} for g,level,sl in [('Junior',1,1),('Middle',3,2),('Senior',4,3)]})
event = Event(event_id='EV_BACKEND_01',title={'en':'Service Boundaries Workshop','ru':'Разбор границ сервисов'},description='Практика проектирования сервисов.',type='course',audience={'role_ids':['BACKEND'],'grades':['Junior','Middle','Senior']},gains=[{'skill_id':hard[0],'gain':1,'max_level':4},{'skill_id':hard[1],'gain':1,'max_level':4}])
employee = Employee(employee_id='E0001',role_id='BACKEND',grade='Middle',tenure_months=48,skills={id:2 if id in hard else 1 for id in ids})
ctx = EmployeeContext(employee=employee,employee_version=1,dataset_version=1,role=role,skills_catalog=skills,events=[event],history=[])
preview = preview_event(ctx,event)
assert preview.coverage_before == 42.9 and preview.coverage_after == 45.7 and preview.target_gain == 2

def profile(c):
    target = next_grade(role,c.employee.grade)
    req = role.requirements[target] if target else {}
    rows = [SkillRow(skill_id=id,name=next(s.name for s in skills if s.skill_id==id),current=c.employee.skills.get(id),target=req.get(id),gap=max(0,req[id]-c.employee.skills[id]) if id in req and id in c.employee.skills else None) for id in ids]
    rows.sort(key=lambda x:(0 if x.gap is None else 1,-(x.gap or 0),x.skill_id))
    available = [AvailableEvent(event_id=event.event_id,title=event.title,type=event.type,target_gain=preview.target_gain)] if target else []
    return ProfileResponse(employee=c.employee,employee_version=c.employee_version,dataset_version=c.dataset_version,role_name=role.name,target_grade=target,coverage=calculate_coverage(c.employee,role),state='no_next_grade' if target is None else 'active',skill_rows=rows,history=[],available_events=available)

examples = {}
examples['profile-active'] = (ProfileResponse,profile(ctx))
senior = employee.model_copy(update={'employee_id':'E0006','grade':Grade.SENIOR})
examples['profile-no-next-grade'] = (ProfileResponse,profile(ctx.model_copy(update={'employee':senior})))
item = {'event_id':event.event_id,'title':event.title,'type':event.type,'rank':1,'preview':preview,'evidence':[
 {'kind':'GRADE_TARGET','text':'Следующий грейд: Senior.','refs':['employee.grade','role.requirements.Senior.SK_PYTHON']},
 {'kind':'SKILL_GAP','text':'Python: 2 из 4; прирост 1.','refs':['role.requirements.Senior.SK_PYTHON','event.EV_BACKEND_01.gains.SK_PYTHON']},
 {'kind':'HISTORY','text':'Истории участия пока нет.','refs':['history.type.course']}],
 'reason_codes':['TARGET_GAIN'],'comparison_event_id':None}
common = {'employee_id':'E0001','employee_version':1,'dataset_version':1,'status':'ready','cache_hit':False,'no_step_reason':None,'items':[item]}
examples['recommendations-llm']=(RecommendationResult,RecommendationResult(**common,source='llm',fallback_reason=None))
examples['recommendations-fallback']=(RecommendationResult,RecommendationResult(**common,source='fallback',fallback_reason='provider_unavailable'))
examples['preview']=(type(preview),preview)
examples['completion']=(CompletionResponse,CompletionResponse(employee_id='E0001',event_id=event.event_id,applied=True,employee_version=2,dataset_version=2,preview=preview,history_id='H000001'))
examples['hr-overview']=(HrOverview,HrOverview(dataset_version=1,employees_total=200,skill_gaps=[{'skill_id':'SK_PYTHON','name':skills[0].name,'affected_count':1,'assessed_count':1,'affected_share':1.0,'mean_gap':2.0}],no_step=[{'employee_id':'E0006','role_id':'BACKEND','reason':'no_next_grade'}],participation=[{'event_id':event.event_id,'title':event.title,'completed':0,'skipped':0,'declined':0,'unique_participants':0,'completion_share':None}]))
summary={'new_employees':1,'replaced_employees':0,'new_history':0,'unchanged_history':0}
examples['import-valid']=(ImportValidation,ImportValidation(import_id='IMP_DEMO_01',valid=True,base_dataset_version=1,expires_at='2026-09-23T09:15:00Z',summary=summary,errors=[]))
examples['import-invalid']=(ImportValidation,ImportValidation(import_id=None,valid=False,base_dataset_version=1,expires_at=None,summary={'new_employees':0,'replaced_employees':0,'new_history':0,'unchanged_history':0},errors=[{'file':'activity_history.csv','path':'row[3].occurred_at','code':'INVALID_DATE','message':'Неверная дата.'}]))
examples['import-commit']=(ImportCommit,ImportCommit(import_id='IMP_DEMO_01',dataset_version=2,summary=summary,applied=True))
examples['error-stale']=(ErrorResponse,ErrorResponse(error={'code':'STALE_CONTEXT','message':'Профиль изменился. Обновите данные.','details':[]},request_id='req_demo_01'))
examples['preview-request']=(EventActionRequest,EventActionRequest(event_id=event.event_id,employee_version=1,dataset_version=1))
for name,(model,value) in examples.items():
    encoded=value.model_dump_json(indent=2,exclude_none=False)
    model.model_validate_json(encoded)
    (OUT/f'{name}.json').write_text(encoded+'\n',encoding='utf-8')
print(f'{len(examples)} examples validated')
