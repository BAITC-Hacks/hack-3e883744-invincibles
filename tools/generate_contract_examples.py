"""Generate schema-validated HTTP examples from the deterministic starter kit."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'backend'))
from app.contracts.api import (ProfileResponse,EventActionRequest,CompletionResponse,HrOverview,ImportValidation,ImportCommit,ErrorResponse)
from app.contracts.recommendation import Preview,RecommendationResult
from app.data.repository import Repository
from app.application.employees import profile
from app.application.hr import overview
from app.core.progress import preview_event

OUT=Path('contracts/examples');OUT.mkdir(parents=True,exist_ok=True)
with TemporaryDirectory() as temp:
    repo=Repository(Path(temp)/'example.sqlite3')
    repo.initialize(Path('data/synthetic'),'demo-employee','demo-hr')
    ctx=repo.get_context('E0001')
    event=next(e for e in ctx.events if e.event_id=='EV_BACKEND_01')
    preview=preview_event(ctx,event)
    assert preview.coverage_before==42.9 and preview.coverage_after==45.7 and preview.target_gain==2
    senior=repo.get_context('E0006')
    examples={
        'profile-active':(ProfileResponse,profile(ctx)),
        'profile-no-next-grade':(ProfileResponse,profile(senior)),
        'preview':(Preview,preview),
        'completion':(CompletionResponse,CompletionResponse(employee_id='E0001',event_id=event.event_id,applied=True,employee_version=2,dataset_version=2,preview=preview,history_id='H_DEMO_01')),
        'hr-overview':(HrOverview,overview(repo.snapshot())),
        'preview-request':(EventActionRequest,EventActionRequest(event_id=event.event_id,employee_version=1,dataset_version=1)),
    }
    item={'event_id':event.event_id,'title':event.title,'type':event.type,'rank':1,'preview':preview,'evidence':[
        {'kind':'GRADE_TARGET','text':'Следующий грейд: Senior.','refs':['employee.grade','role.requirements.Senior.SK_PYTHON']},
        {'kind':'SKILL_GAP','text':'Python: 2 из 4; прирост 1.','refs':['role.requirements.Senior.SK_PYTHON','event.EV_BACKEND_01.gains.SK_PYTHON']},
        {'kind':'HISTORY','text':'Истории участия пока нет.','refs':['history.type.course']}],
        'reason_codes':['TARGET_GAP'],'comparison_event_id':'EV_BACKEND_02'}
    common={'employee_id':'E0001','employee_version':1,'dataset_version':1,'status':'ready','cache_hit':False,'no_step_reason':None,'items':[item]}
    examples['recommendations-llm']=(RecommendationResult,RecommendationResult(**common,source='llm',fallback_reason=None))
    examples['recommendations-fallback']=(RecommendationResult,RecommendationResult(**common,source='deterministic_fallback',fallback_reason='unavailable'))
    summary={'new_employees':1,'replaced_employees':0,'new_history':0,'unchanged_history':0}
    examples['import-valid']=(ImportValidation,ImportValidation(import_id='IMP_DEMO_01',valid=True,base_dataset_version=1,expires_at='2026-09-23T09:15:00Z',summary=summary,errors=[]))
    examples['import-invalid']=(ImportValidation,ImportValidation(import_id=None,valid=False,base_dataset_version=1,expires_at=None,summary={'new_employees':0,'replaced_employees':0,'new_history':0,'unchanged_history':0},errors=[{'file':'activity_history.csv','path':'row[3].occurred_at','code':'INVALID_DATE','message':'Неверная дата.'}]))
    examples['import-commit']=(ImportCommit,ImportCommit(import_id='IMP_DEMO_01',dataset_version=2,summary=summary,applied=True))
    examples['error-stale']=(ErrorResponse,ErrorResponse(error={'code':'STALE_CONTEXT','message':'Профиль изменился. Обновите данные.','details':[]},request_id='req_demo_01'))
    for name,(model,value) in examples.items():
        encoded=value.model_dump_json(indent=2,exclude_none=False)
        model.model_validate_json(encoded)
        (OUT/f'{name}.json').write_text(encoded+'\n',encoding='utf-8')
print(f'{len(examples)} examples validated against Pydantic')
