import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.imports import ImportService
from app.bootstrap import create_app
from app.data.repository import Repository

KIT = Path('data/synthetic')
EMPTY_HISTORY = b'history_id,employee_id,event_id,status,occurred_at\n'
TZ_EMPLOYEE = {
    'employee_id': 'E0028', 'role': 'Backend Engineer', 'grade': 'Middle',
    'tenure_months': 52,
    'skills': {'SK_PYTHON': 3, 'SK_SYSTEM_DESIGN': 2, 'SK_PUBLIC_SPEAKING': 2},
}


def setup(tmp_path):
    repo = Repository(tmp_path / 'db.sqlite3')
    repo.initialize(KIT, 'demo-employee', 'demo-hr')
    return repo, ImportService(repo)


def validate(service, employee, history=EMPTY_HISTORY):
    return service.validate('hr', json.dumps([employee]).encode(), history)


def test_tz_role_snapshot_commits_without_replaying_gains_and_reimport_is_noop(tmp_path):
    repo, service = setup(tmp_path)
    history = EMPTY_HISTORY + b'H_TZ,E0028,EV_SOFT_03,completed,2025-01-01T08:00:00Z\n'
    pending = validate(service, TZ_EMPLOYEE, history)
    assert pending.valid, pending.errors
    assert repo.dataset_version() == 1
    committed = service.commit('hr', pending.import_id, pending.base_dataset_version)
    assert committed.applied
    employee = repo.get_context('E0028').employee
    assert employee.role_id == 'BACKEND'
    assert employee.skills == TZ_EMPLOYEE['skills']
    assert employee.tenure_months == 52
    pending = validate(service, TZ_EMPLOYEE, history)
    assert pending.valid
    assert not service.commit('hr', pending.import_id, pending.base_dataset_version).applied
    assert repo.dataset_version() == committed.dataset_version


@pytest.mark.parametrize('locale', ['en', 'ru', 'kk', 'role_id'])
def test_role_matches_catalog_id_or_localized_name_with_strip_and_casefold(tmp_path, locale):
    repo, service = setup(tmp_path)
    if locale == 'kk':
        # Seed has no Kazakh role names. Verify resolution from a real catalog
        # update, without introducing any translation into production code.
        with repo.connection() as conn:
            row = json.loads(conn.execute("SELECT payload_json FROM roles WHERE id='BACKEND'").fetchone()[0])
            row['name']['kk'] = 'Бэкенд әзірлеуші'
            conn.execute("UPDATE roles SET payload_json=? WHERE id='BACKEND'", (json.dumps(row),))
    role = next(role for role in repo.snapshot()[3] if role.role_id == 'BACKEND')
    value = role.role_id if locale == 'role_id' else getattr(role.name, locale)
    pending = validate(service, {**TZ_EMPLOYEE, 'role': '  ' + value.swapcase() + '  '})
    assert pending.valid, pending.errors
    service.commit('hr', pending.import_id, pending.base_dataset_version)
    assert repo.get_context('E0028').employee.role_id == 'BACKEND'


@pytest.mark.parametrize(('fields', 'code'), [
    ({'role': 'Backend Enginer'}, 'UNKNOWN_ROLE'),
    ({'role': 'Backend Engineer', 'role_id': 'QA'}, 'ROLE_CONFLICT'),
    ({'role': 12}, 'INVALID_DATA'),
    ({'role': None}, 'INVALID_DATA'),
    ({'role': '  '}, 'UNKNOWN_ROLE'),
])
def test_invalid_role_does_not_stage_or_mutate_import(tmp_path, fields, code):
    repo, service = setup(tmp_path)
    before = repo.snapshot()
    good = {**TZ_EMPLOYEE, 'employee_id': 'E_NEW_VALID'}
    bad = {**TZ_EMPLOYEE, **fields}
    result = service.validate('hr', json.dumps([good, bad]).encode(), EMPTY_HISTORY)
    assert not result.valid and result.import_id is None
    assert any(error.code == code for error in result.errors)
    assert repo.snapshot() == before
    with repo.connection() as conn:
        assert conn.execute('SELECT count(*) FROM imports').fetchone()[0] == 0


def test_conflicting_catalog_alias_is_rejected_even_when_role_id_is_given(tmp_path):
    repo, service = setup(tmp_path)
    with repo.connection() as conn:
        row = json.loads(conn.execute("SELECT payload_json FROM roles WHERE id='QA'").fetchone()[0])
        row['name']['en'] = 'Backend Engineer'
        conn.execute("UPDATE roles SET payload_json=? WHERE id='QA'", (json.dumps(row),))
    before = repo.snapshot()
    result = validate(service, {**TZ_EMPLOYEE, 'role_id': 'BACKEND'})
    assert not result.valid
    assert any(error.code == 'AMBIGUOUS_ROLE' for error in result.errors)
    assert repo.snapshot() == before


def test_matching_role_and_role_id_are_accepted(tmp_path):
    repo, service = setup(tmp_path)
    assert validate(service, {**TZ_EMPLOYEE, 'role_id': 'BACKEND'}).valid


@pytest.mark.parametrize('change', [{'skills': {'SK_PYTHON': 6}}, {'tenure_months': True}, {'grade': 'middle'}, {'extra': 'unexpected'}])
def test_role_adapter_preserves_canonical_field_validation(tmp_path, change):
    repo, service = setup(tmp_path)
    result = validate(service, {**TZ_EMPLOYEE, **change})
    assert not result.valid and result.import_id is None
    assert repo.dataset_version() == 1


def test_csv_accepts_reordered_named_columns_and_utf8_bom(tmp_path):
    repo, service = setup(tmp_path)
    csv = '\ufeffstatus,event_id,occurred_at,employee_id,history_id\nskipped,EV_SOFT_00,2025-01-01T08:00:00Z,E0028,H_REORDERED\n'.encode()
    pending = validate(service, TZ_EMPLOYEE, csv)
    assert pending.valid, pending.errors
    service.commit('hr', pending.import_id, pending.base_dataset_version)
    assert any(row.history_id == 'H_REORDERED' for row in repo.get_context('E0028').history)


@pytest.mark.parametrize('header', [
    b'history_id,employee_id,event_id,status\n',
    b'history_id,employee_id,event_id,status,occurred_at,extra\n',
    b'history_id,employee_id,event_id,status,occurred_at,status\n',
])
def test_csv_rejects_missing_extra_and_duplicate_columns(tmp_path, header):
    repo, service = setup(tmp_path)
    pending = validate(service, TZ_EMPLOYEE, header)
    assert not pending.valid and pending.import_id is None
    assert any(error.path == 'header' for error in pending.errors)
    assert repo.dataset_version() == 1


def test_tz_example_is_accepted_through_authenticated_import_api(tmp_path):
    app = create_app(database_path=tmp_path / 'api.sqlite3', kit_dir=KIT,
                     secret_path=tmp_path / 'secret', app_origin='http://localhost:8080')
    headers = {'Origin': 'http://localhost:8080'}
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/login', json={'username': 'hr', 'password': 'demo-hr'}, headers=headers).status_code == 200
        files = {'employees_file': ('employees.json', json.dumps([TZ_EMPLOYEE]).encode(), 'application/json'),
                 'history_file': ('activity_history.csv', EMPTY_HISTORY, 'text/csv')}
        response = client.post('/api/v1/imports/validate', files=files, headers=headers)
        assert response.status_code == 200, response.text
        pending = response.json()
        response = client.post(f"/api/v1/imports/{pending['import_id']}/commit", json={'base_dataset_version': pending['base_dataset_version']}, headers=headers)
        assert response.status_code == 200 and response.json()['applied']
        employee = client.get('/api/v1/employees/E0028').json()['employee']
        assert employee['role_id'] == 'BACKEND'
        assert employee['skills'] == TZ_EMPLOYEE['skills']
