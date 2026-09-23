from pathlib import Path
from fastapi.testclient import TestClient
from app.bootstrap import create_app

KIT=Path('data/synthetic')
ORIGIN={'Origin':'http://localhost:8080'}

def client(tmp_path):
    return TestClient(create_app(database_path=tmp_path/'db.sqlite3',kit_dir=KIT,secret_path=tmp_path/'secret',app_origin='http://localhost:8080'))

def test_auth_401_403_and_preview_no_mutation(tmp_path):
    with client(tmp_path) as c:
        assert c.get('/api/v1/employees/E0001').status_code==401
        assert c.post('/api/v1/auth/login',json={'username':'employee','password':'demo-employee'},headers=ORIGIN).status_code==200
        assert c.get('/api/v1/employees/E0002').status_code==403
        assert c.get('/api/v1/hr/overview').status_code==403
        before=c.get('/api/v1/employees/E0001').json()
        req={'event_id':'EV_BACKEND_01','employee_version':before['employee_version'],'dataset_version':before['dataset_version']}
        preview=c.post('/api/v1/employees/E0001/preview',json=req,headers=ORIGIN)
        assert preview.status_code==200
        assert c.get('/api/v1/employees/E0001').json()==before

def test_completion_version_conflict_and_origin(tmp_path):
    with client(tmp_path) as c:
        c.post('/api/v1/auth/login',json={'username':'employee','password':'demo-employee'},headers=ORIGIN)
        req={'event_id':'EV_BACKEND_01','employee_version':1,'dataset_version':1}
        assert c.post('/api/v1/employees/E0001/completions',json=req,headers={'Idempotency-Key':'one'}).status_code==403
        first=c.post('/api/v1/employees/E0001/completions',json=req,headers={**ORIGIN,'Idempotency-Key':'one'})
        assert first.status_code==201
        assert c.post('/api/v1/employees/E0001/completions',json=req,headers={**ORIGIN,'Idempotency-Key':'one'}).status_code==200
        assert c.post('/api/v1/employees/E0001/preview',json=req,headers=ORIGIN).status_code==409

def test_hr_two_step_import_and_stale_commit(tmp_path):
    import json
    with client(tmp_path) as c:
        c.post('/api/v1/auth/login',json={'username':'hr','password':'demo-hr'},headers=ORIGIN)
        assert c.get('/api/v1/employees?q=e0001').json()['total']==0
        assert c.get('/api/v1/employees?q=E0001').json()['total']==1
        profile=json.loads((KIT/'employees.json').read_text())[0]
        profile['employee_id']='E_NEW_01'
        files={'employees_file':('employees.json',json.dumps([profile]).encode(),'application/json'),'history_file':('activity_history.csv',b'history_id,employee_id,event_id,status,occurred_at\n','text/csv')}
        validated=c.post('/api/v1/imports/validate',files=files,headers=ORIGIN)
        assert validated.status_code==200
        body=validated.json();assert body['valid']
        assert c.get('/api/v1/employees/E_NEW_01').status_code==404
        committed=c.post(f"/api/v1/imports/{body['import_id']}/commit",json={'base_dataset_version':body['base_dataset_version']},headers=ORIGIN)
        assert committed.status_code==200 and committed.json()['applied']
        assert c.get('/api/v1/employees/E_NEW_01').status_code==200
        again=c.post(f"/api/v1/imports/{body['import_id']}/commit",json={'base_dataset_version':body['base_dataset_version']},headers=ORIGIN)
        assert again.status_code==200 and again.json()['applied'] is False
        stale=c.post('/api/v1/employees/E0001/preview',json={'event_id':'EV_BACKEND_01','employee_version':1,'dataset_version':1},headers=ORIGIN)
        assert stale.status_code==409


def test_import_invalid_last_line_has_no_partial_write(tmp_path):
    import json
    with client(tmp_path) as c:
        c.post('/api/v1/auth/login',json={'username':'hr','password':'demo-hr'},headers=ORIGIN)
        profile=json.loads((KIT/'employees.json').read_text())[0]
        profile['employee_id']='E_NEW_BAD'
        csv=b'history_id,employee_id,event_id,status,occurred_at\nH_GOOD,E_NEW_BAD,EV_SOFT_00,skipped,2025-01-01T08:00:00Z\nH_BAD,E_NEW_BAD,EV_SOFT_00,completed,not-a-date\n'
        files={'employees_file':('employees.json',json.dumps([profile]).encode(),'application/json'),'history_file':('activity_history.csv',csv,'text/csv')}
        result=c.post('/api/v1/imports/validate',files=files,headers=ORIGIN)
        assert result.status_code==422 and result.json()['valid'] is False
        assert c.get('/api/v1/employees/E_NEW_BAD').status_code==404
        assert c.get('/api/v1/health').json()['dataset_version']==1


def test_recommendation_rejects_result_after_concurrent_change(tmp_path):
    import asyncio
    from app.contracts.api import EventActionRequest
    from app.contracts.recommendation import RecommendationResult
    from app.data.repository import Repository
    repo=Repository(tmp_path/'db.sqlite3')
    class MutatingRecommendationService:
        async def recommend(self,ctx,request):
            mutation=EventActionRequest(event_id='EV_BACKEND_01',employee_version=ctx.employee_version,dataset_version=ctx.dataset_version)
            await asyncio.to_thread(repo.complete,'employee','employee','E0001',mutation,'mutating-key')
            return RecommendationResult(employee_id='E0001',employee_version=1,dataset_version=1,status='no_eligible_events',source=None,cache_hit=False,fallback_reason=None,no_step_reason='no_catalog_coverage',items=[])
    app=create_app(database_path=tmp_path/'db.sqlite3',kit_dir=KIT,secret_path=tmp_path/'secret',app_origin='http://localhost:8080',recommendation_service=MutatingRecommendationService())
    with TestClient(app) as c:
        c.post('/api/v1/auth/login',json={'username':'employee','password':'demo-employee'},headers=ORIGIN)
        result=c.post('/api/v1/employees/E0001/recommendations',json={'employee_version':1,'dataset_version':1},headers=ORIGIN)
        assert result.status_code==409 and result.json()['error']['code']=='STALE_CONTEXT'
        assert repo.get_context('E0001').employee_version==2


def test_import_commit_rejects_changed_dataset_version(tmp_path):
    import json
    with client(tmp_path) as c:
        c.post('/api/v1/auth/login',json={'username':'hr','password':'demo-hr'},headers=ORIGIN)
        profile=json.loads((KIT/'employees.json').read_text())[0]
        profile['employee_id']='E_STALE_IMPORT'
        files={'employees_file':('employees.json',json.dumps([profile]).encode(),'application/json'),'history_file':('activity_history.csv',b'history_id,employee_id,event_id,status,occurred_at\n','text/csv')}
        valid=c.post('/api/v1/imports/validate',files=files,headers=ORIGIN).json()
        complete=c.post('/api/v1/employees/E0001/completions',json={'event_id':'EV_BACKEND_01','employee_version':1,'dataset_version':1},headers={**ORIGIN,'Idempotency-Key':'hr-change'})
        assert complete.status_code==201
        result=c.post(f"/api/v1/imports/{valid['import_id']}/commit",json={'base_dataset_version':1},headers=ORIGIN)
        assert result.status_code==409 and result.json()['error']['code']=='IMPORT_CONFLICT'
        assert c.get('/api/v1/employees/E_STALE_IMPORT').status_code==404
