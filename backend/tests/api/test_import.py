import json
from pathlib import Path
from app.data.repository import Repository,RepoError
from app.application.imports import ImportService

KIT=Path('data/synthetic')

def setup(tmp_path):
    repo=Repository(tmp_path/'db.sqlite3');repo.initialize(KIT,'demo-employee','demo-hr')
    return repo,ImportService(repo)

def test_invalid_final_csv_row_is_atomic(tmp_path):
    repo,service=setup(tmp_path)
    employees=[json.loads((KIT/'employees.json').read_text())[0]]
    before=repo.dataset_version()
    csv=b'history_id,employee_id,event_id,status,occurred_at\nH_NEW,E0001,EV_SOFT_00,skipped,2025-01-01T08:00:00Z\nH_BAD,E0001,EV_SOFT_00,completed,not-a-date\n'
    result=service.validate('hr',json.dumps(employees).encode(),csv)
    assert result.valid is False
    assert result.import_id is None
    assert result.errors[0].code=='INVALID_DATE'
    assert result.errors[0].path=='row[3].occurred_at'
    assert repo.dataset_version()==before
    assert all(h.history_id!='H_NEW' for h in repo.get_context('E0001').history)

def test_repeat_import_is_noop_and_snapshot_is_authoritative(tmp_path):
    repo,service=setup(tmp_path)
    employee=json.loads((KIT/'employees.json').read_text())[0]
    employee['skills']['SK_PYTHON']=4
    data=json.dumps([employee]).encode()
    csv=b'history_id,employee_id,event_id,status,occurred_at\nH_IMPORT_01,E0001,EV_SOFT_00,completed,2025-01-01T08:00:00Z\n'
    first=service.validate('hr',data,csv)
    assert first.valid
    commit=service.commit('hr',first.import_id,first.base_dataset_version)
    assert commit.applied
    assert repo.get_context('E0001').employee.skills['SK_PYTHON']==4
    assert repo.get_context('E0001').employee.skills['SK_PUBLIC_SPEAKING']==1
    assert service.commit('hr',first.import_id,first.base_dataset_version).applied is False
    again=service.validate('hr',data,csv)
    assert again.valid
    noop=service.commit('hr',again.import_id,again.base_dataset_version)
    assert noop.applied is False
    assert repo.dataset_version()==commit.dataset_version
    assert repo.get_context('E0001').employee.skills['SK_PYTHON']==4


def test_completed_for_existing_employee_requires_snapshot(tmp_path):
    repo,service=setup(tmp_path)
    csv=b'history_id,employee_id,event_id,status,occurred_at\nH_NEEDS_SNAPSHOT,E0001,EV_SOFT_00,completed,2025-01-01T08:00:00Z\n'
    result=service.validate('hr',b'[]',csv)
    assert not result.valid
    assert any(error.code=='SNAPSHOT_REQUIRED' for error in result.errors)
    assert repo.dataset_version()==1
    assert all(h.history_id!='H_NEEDS_SNAPSHOT' for h in repo.get_context('E0001').history)


def test_unknown_role_is_rejected_without_mutation(tmp_path):
    repo,service=setup(tmp_path)
    employee=json.loads((KIT/'employees.json').read_text())[0]
    employee['employee_id']='E_UNKNOWN_ROLE'
    employee['role_id']='ALIEN'
    result=service.validate('hr',json.dumps([employee]).encode(),b'history_id,employee_id,event_id,status,occurred_at\n')
    assert not result.valid
    assert any(error.code=='UNKNOWN_ROLE' for error in result.errors)
    assert repo.dataset_version()==1


def test_expired_pending_import_cannot_apply(tmp_path):
    import pytest
    repo,service=setup(tmp_path)
    employee=json.loads((KIT/'employees.json').read_text())[0]
    employee['employee_id']='E_EXPIRED'
    pending=service.validate('hr',json.dumps([employee]).encode(),b'history_id,employee_id,event_id,status,occurred_at\n')
    assert pending.valid
    with repo.connection() as conn:
        conn.execute('UPDATE imports SET expires_at=? WHERE id=?',('2020-01-01T00:00:00Z',pending.import_id))
    with pytest.raises(RepoError) as error:
        service.commit('hr',pending.import_id,pending.base_dataset_version)
    assert error.value.code=='IMPORT_EXPIRED'
    assert repo.dataset_version()==1


def test_reimport_entire_seed_kit_is_noop(tmp_path):
    repo,service=setup(tmp_path)
    pending=service.validate('hr',(KIT/'employees.json').read_bytes(),(KIT/'activity_history.csv').read_bytes())
    assert pending.valid
    assert pending.summary.new_employees==0
    assert pending.summary.replaced_employees==0
    assert pending.summary.new_history==0
    assert pending.summary.unchanged_history==1736
    result=service.commit('hr',pending.import_id,pending.base_dataset_version)
    assert result.applied is False and result.dataset_version==1


def test_unknown_file_shape_reports_unsupported_schema(tmp_path):
    repo,service=setup(tmp_path)
    result=service.validate('hr',b'{"employees": []}',b'history_id,employee_id,event_id,status,occurred_at\n')
    assert not result.valid
    assert any(error.code=='UNSUPPORTED_KIT_SCHEMA' for error in result.errors)
    assert repo.dataset_version()==1
