import json
from pathlib import Path
from app.data.repository import Repository
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
