from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from app.data.repository import Repository, RepoError
from app.contracts.api import EventActionRequest
from app.application.hr import overview

KIT=Path('data/synthetic')


def repo(tmp_path):
    value=Repository(tmp_path/'db.sqlite3')
    value.initialize(KIT,'demo-employee','demo-hr')
    return value


def test_completion_retry_and_concurrent_keys(tmp_path):
    value=repo(tmp_path)
    req=EventActionRequest(event_id='EV_BACKEND_01',employee_version=1,dataset_version=1)
    def call(key):
        try: return value.complete('employee','employee','E0001',req,key)
        except RepoError as exc: return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        a,b=list(pool.map(call,['key-one','key-two']))
    assert sorted([isinstance(a,dict),isinstance(b,dict)])==[False,True]
    assert 'ALREADY_COMPLETED' in (a,b)
    success=a if isinstance(a,dict) else b
    key='key-one' if isinstance(a,dict) else 'key-two'
    assert success['employee_version']==2
    assert value.complete('employee','employee','E0001',req,key)==success
    with pytest.raises(RepoError) as duplicate:
        value.complete('employee','employee','E0001',req,'fresh-key')
    assert duplicate.value.code=='ALREADY_COMPLETED'
    assert value.get_context('E0001').employee.skills['SK_PYTHON']==3
    assert sum(h.status=='completed' and h.event_id=='EV_BACKEND_01' for h in value.get_context('E0001').history)==1


def test_restart_retains_state(tmp_path):
    value=repo(tmp_path)
    req=EventActionRequest(event_id='EV_BACKEND_01',employee_version=1,dataset_version=1)
    first=value.complete('employee','employee','E0001',req,'key-restart')
    fresh=Repository(tmp_path/'db.sqlite3')
    fresh.initialize(KIT,'demo-employee','demo-hr')
    assert fresh.get_context('E0001').employee_version==2
    assert fresh.get_context('E0001').employee.skills['SK_PYTHON']==3
    assert fresh.complete('employee','employee','E0001',req,'key-restart')==first


def test_hr_completion_records_actor_role(tmp_path):
    value=repo(tmp_path)
    req=EventActionRequest(event_id='EV_BACKEND_01',employee_version=1,dataset_version=1)
    value.complete('hr','hr','E0001',req,'hr-key')
    with value.connection() as conn:
        row=conn.execute("SELECT actor_role FROM history WHERE employee_id='E0001' AND event_id='EV_BACKEND_01' AND status='completed'").fetchone()
    assert row['actor_role']=='hr'


def test_hr_overview_uses_known_skill_denominators_and_distinct_reasons(tmp_path):
    value=repo(tmp_path)
    result=overview(value.snapshot())
    python=next(row for row in result.skill_gaps if row.skill_id=='SK_PYTHON')
    assert python.assessed_count==34
    assert python.affected_count==25
    reasons={row.employee_id:row.reason for row in result.no_step}
    assert reasons['E0005']=='target_met'
    assert reasons['E0006']=='no_next_grade'
    assert reasons['E0007']=='all_useful_completed'
    for row in result.participation:
        total=row.completed+row.skipped+row.declined
        assert row.unique_participants<=total
        assert row.completion_share is None if total==0 else row.completion_share==round(row.completed/total,4)
