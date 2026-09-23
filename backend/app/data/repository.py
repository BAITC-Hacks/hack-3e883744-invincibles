"""SQLite persistence with short, versioned transactions."""
import hashlib
import hmac
import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from app.contracts.domain import Employee, Event, HistoryEntry, RoleDefinition, SkillDefinition, EmployeeContext
from app.contracts.api import EventActionRequest, CompletionResponse
from app.core.progress import preview_event
from app.core.errors import DomainError
from .kit_v1 import load_kit
from .validation import validate_references


class RepoError(Exception):
    def __init__(self,code,message):
        self.code=code;self.message=message;super().__init__(message)


def encode(value): return value.model_dump_json(exclude_none=False)
def utc_now(): return datetime.now(timezone.utc)
def iso(value): return value.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def hash_password(password):
    salt=secrets.token_bytes(16)
    digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1)
    return salt.hex()+':'+digest.hex()

def verify_password(password,stored):
    try:
        salt,digest=stored.split(':')
        actual=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=2**14,r=8,p=1)
        return hmac.compare_digest(actual,bytes.fromhex(digest))
    except (ValueError,TypeError): return False


class Repository:
    def __init__(self,path): self.path=Path(path)

    @contextmanager
    def connection(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        conn=sqlite3.connect(self.path,timeout=2,isolation_level=None)
        conn.row_factory=sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=2000')
        conn.execute('PRAGMA journal_mode=WAL')
        try: yield conn
        finally: conn.close()

    def initialize(self,kit_dir,employee_password,hr_password):
        with self.connection() as conn:
            conn.executescript(Path(__file__).with_name('schema.sql').read_text())
            conn.execute('BEGIN IMMEDIATE')
            try:
                empty=conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone() is None
                if empty:
                    employees,events,catalog,history=load_kit(Path(kit_dir))
                    errors=validate_references(employees,events,catalog,history)
                    if errors: raise ValueError(errors)
                    conn.executemany('INSERT INTO employees VALUES(?,?,1)',[(e.employee_id,encode(e)) for e in employees])
                    conn.executemany('INSERT INTO events VALUES(?,?)',[(e.event_id,encode(e)) for e in events])
                    conn.executemany('INSERT INTO roles VALUES(?,?)',[(r.role_id,encode(r)) for r in catalog.roles])
                    conn.executemany('INSERT INTO skills VALUES(?,?)',[(s.skill_id,encode(s)) for s in catalog.skills])
                    conn.executemany('INSERT INTO history VALUES(?,?,?,?,?,NULL)',[(h.history_id,h.employee_id,h.event_id,h.status,iso(h.occurred_at)) for h in history])
                    conn.executemany('INSERT INTO meta VALUES(?,?)',[('schema_version','1'),('dataset_version','1')])
                else:
                    version=conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()['value']
                    if version!='1': raise RuntimeError(f'Unsupported database schema: {version}')
                for username,password,role,employee_id in [('employee',employee_password,'employee','E0001'),('hr',hr_password,'hr',None)]:
                    existing=conn.execute('SELECT password_hash FROM users WHERE username=?',(username,)).fetchone()
                    if not existing or not verify_password(password,existing['password_hash']):
                        conn.execute('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash',(username,hash_password(password),role,employee_id))
                conn.commit()
            except Exception:
                conn.rollback();raise

    def dataset_version(self):
        with self.connection() as conn: return int(conn.execute("SELECT value FROM meta WHERE key='dataset_version'").fetchone()['value'])

    def _context(self,conn,employee_id):
        row=conn.execute('SELECT payload_json,version FROM employees WHERE id=?',(employee_id,)).fetchone()
        if row is None: raise RepoError('NOT_FOUND','Сотрудник не найден.')
        employee=Employee.model_validate_json(row['payload_json'])
        role_row=conn.execute('SELECT payload_json FROM roles WHERE id=?',(employee.role_id,)).fetchone()
        role=RoleDefinition.model_validate_json(role_row['payload_json'])
        skills=[SkillDefinition.model_validate_json(r['payload_json']) for r in conn.execute('SELECT payload_json FROM skills ORDER BY id')]
        events=[Event.model_validate_json(r['payload_json']) for r in conn.execute('SELECT payload_json FROM events ORDER BY id')]
        history=[HistoryEntry(history_id=r['id'],employee_id=r['employee_id'],event_id=r['event_id'],status=r['status'],occurred_at=datetime.fromisoformat(r['occurred_at'].replace('Z','+00:00'))) for r in conn.execute('SELECT * FROM history WHERE employee_id=? ORDER BY occurred_at DESC,id',(employee_id,))]
        version=int(conn.execute("SELECT value FROM meta WHERE key='dataset_version'").fetchone()['value'])
        return EmployeeContext(employee=employee,employee_version=row['version'],dataset_version=version,role=role,skills_catalog=skills,events=events,history=history)

    def get_context(self,employee_id):
        with self.connection() as conn:
            conn.execute('BEGIN')
            try: return self._context(conn,employee_id)
            finally: conn.rollback()

    def list_employees(self,q='',limit=50,offset=0):
        with self.connection() as conn:
            total=conn.execute('SELECT count(*) FROM employees WHERE instr(id, ?) > 0',(q,)).fetchone()[0]
            rows=conn.execute('SELECT payload_json FROM employees WHERE instr(id, ?) > 0 ORDER BY id LIMIT ? OFFSET ?',(q,limit,offset)).fetchall()
            return [Employee.model_validate_json(r[0]) for r in rows],total

    def snapshot(self):
        with self.connection() as conn:
            conn.execute('BEGIN')
            try:
                version=int(conn.execute("SELECT value FROM meta WHERE key='dataset_version'").fetchone()['value'])
                employees=[Employee.model_validate_json(r[0]) for r in conn.execute('SELECT payload_json FROM employees ORDER BY id')]
                events=[Event.model_validate_json(r[0]) for r in conn.execute('SELECT payload_json FROM events ORDER BY id')]
                roles=[RoleDefinition.model_validate_json(r[0]) for r in conn.execute('SELECT payload_json FROM roles ORDER BY id')]
                skills=[SkillDefinition.model_validate_json(r[0]) for r in conn.execute('SELECT payload_json FROM skills ORDER BY id')]
                history=[HistoryEntry(history_id=r['id'],employee_id=r['employee_id'],event_id=r['event_id'],status=r['status'],occurred_at=datetime.fromisoformat(r['occurred_at'].replace('Z','+00:00'))) for r in conn.execute('SELECT * FROM history ORDER BY id')]
                return version,employees,events,roles,skills,history
            finally: conn.rollback()

    def complete(self,actor_id,actor_role,employee_id,request:EventActionRequest,key:str,return_retry=False):
        if not key or len(key)>128: raise RepoError('INVALID_REQUEST','Требуется Idempotency-Key.')
        fingerprint=json.dumps({'employee_id':employee_id,'event_id':request.event_id,'employee_version':request.employee_version,'dataset_version':request.dataset_version},sort_keys=True)
        with self.connection() as conn:
            conn.execute('BEGIN IMMEDIATE')
            try:
                previous=conn.execute('SELECT * FROM completions WHERE idempotency_key=?',(key,)).fetchone()
                if previous:
                    if previous['actor_id']!=actor_id or previous['request_fingerprint']!=fingerprint: raise RepoError('IDEMPOTENCY_CONFLICT','Ключ операции уже использован.')
                    response=json.loads(previous['response_json']);conn.commit();return (response,True) if return_retry else response
                ctx=self._context(conn,employee_id)
                event=next((e for e in ctx.events if e.event_id==request.event_id),None)
                if event is None: raise RepoError('NOT_FOUND','Активность не найдена.')
                if any(h.event_id==event.event_id and h.status=='completed' for h in ctx.history): raise RepoError('ALREADY_COMPLETED','Активность уже выполнена.')
                if ctx.employee_version!=request.employee_version or ctx.dataset_version!=request.dataset_version: raise RepoError('STALE_CONTEXT','Профиль изменился. Обновите данные.')
                try: preview=preview_event(ctx,event)
                except DomainError as exc: raise RepoError(exc.code,exc.message) from exc
                levels=dict(ctx.employee.skills)
                for change in preview.changes: levels[change.skill_id]=change.after
                updated=ctx.employee.model_copy(update={'skills':levels})
                history_id='H_'+uuid4().hex
                conn.execute('UPDATE employees SET payload_json=?,version=version+1 WHERE id=?',(encode(updated),employee_id))
                conn.execute('INSERT INTO history VALUES(?,?,?,?,?,?)',(history_id,employee_id,event.event_id,'completed',iso(utc_now()),actor_role))
                conn.execute("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='dataset_version'")
                result=CompletionResponse(employee_id=employee_id,event_id=event.event_id,applied=True,employee_version=ctx.employee_version+1,dataset_version=ctx.dataset_version+1,preview=preview,history_id=history_id).model_dump(mode='json')
                conn.execute('INSERT INTO completions VALUES(?,?,?,?)',(key,actor_id,fingerprint,json.dumps(result,ensure_ascii=False)))
                conn.commit();return (result,False) if return_retry else result
            except Exception:
                conn.rollback();raise

    def find_user(self,username,password):
        with self.connection() as conn:
            row=conn.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
            if row and verify_password(password,row['password_hash']): return {'username':username,'role':row['role'],'employee_id':row['employee_id']}
            return None

    def create_session(self,role,employee_id):
        id=secrets.token_urlsafe(32);expires=iso(utc_now()+timedelta(hours=8))
        with self.connection() as conn: conn.execute('INSERT INTO sessions VALUES(?,?,?,?)',(id,role,employee_id,expires))
        return id

    def get_session(self,id):
        with self.connection() as conn:
            row=conn.execute('SELECT * FROM sessions WHERE id=? AND expires_at>?',(id,iso(utc_now()))).fetchone()
            return {'role':row['role'],'employee_id':row['employee_id']} if row else None

    def delete_session(self,id):
        with self.connection() as conn: conn.execute('DELETE FROM sessions WHERE id=?',(id,))

    def save_import(self,actor_id,base_version,payload):
        import_id='IMP_'+uuid4().hex
        expires=iso(utc_now()+timedelta(minutes=15))
        with self.connection() as conn:
            conn.execute('BEGIN IMMEDIATE')
            try:
                current=int(conn.execute("SELECT value FROM meta WHERE key='dataset_version'").fetchone()['value'])
                if current!=base_version: raise RepoError('IMPORT_CONFLICT','Данные изменились. Проверьте файлы заново.')
                conn.execute('DELETE FROM imports WHERE status=? AND expires_at<?',('validated',iso(utc_now())))
                conn.execute('INSERT INTO imports VALUES(?,?,?,?,?,?,NULL)',(import_id,actor_id,'validated',base_version,json.dumps(payload,ensure_ascii=False),expires))
                conn.commit()
            except Exception: conn.rollback();raise
        return import_id,expires

    def commit_import(self,actor_id,import_id,base_version):
        with self.connection() as conn:
            conn.execute('BEGIN IMMEDIATE')
            try:
                conn.execute('DELETE FROM imports WHERE status=? AND expires_at<? AND id<>?',('validated',iso(utc_now()),import_id))
                row=conn.execute('SELECT * FROM imports WHERE id=?',(import_id,)).fetchone()
                if row is None: raise RepoError('NOT_FOUND','Импорт не найден.')
                if row['actor_id']!=actor_id: raise RepoError('FORBIDDEN','Импорт принадлежит другому пользователю.')
                if row['status']=='applied':
                    result=json.loads(row['result_json']);result['applied']=False;conn.commit();return result
                if row['expires_at']<iso(utc_now()):
                    conn.execute('DELETE FROM imports WHERE id=?',(import_id,));conn.commit()
                    raise RepoError('IMPORT_EXPIRED','Срок проверки импорта истёк.')
                current=int(conn.execute("SELECT value FROM meta WHERE key='dataset_version'").fetchone()['value'])
                if current!=base_version or current!=row['base_dataset_version']: raise RepoError('IMPORT_CONFLICT','Данные изменились. Проверьте файлы заново.')
                payload=json.loads(row['payload_json'])
                employees=[Employee.model_validate(e) for e in payload['employees']]
                history=[HistoryEntry.model_validate(h) for h in payload['history']]
                old_employees={r['id']:r for r in conn.execute('SELECT * FROM employees')}
                old_history={r['id']:r for r in conn.execute('SELECT * FROM history')}
                changed_employee_ids=set()
                for employee in employees:
                    encoded=encode(employee)
                    old=old_employees.get(employee.employee_id)
                    if old is None:
                        conn.execute('INSERT INTO employees VALUES(?,?,1)',(employee.employee_id,encoded))
                        changed_employee_ids.add(employee.employee_id)
                    elif json.loads(old['payload_json'])!=employee.model_dump(mode='json'):
                        conn.execute('UPDATE employees SET payload_json=?,version=version+1 WHERE id=?',(encoded,employee.employee_id))
                        changed_employee_ids.add(employee.employee_id)
                new_history=0
                for entry in history:
                    if entry.history_id in old_history: continue
                    conn.execute('INSERT INTO history VALUES(?,?,?,?,?,NULL)',(entry.history_id,entry.employee_id,entry.event_id,entry.status,iso(entry.occurred_at)))
                    new_history+=1
                    if entry.employee_id not in changed_employee_ids and entry.employee_id in old_employees:
                        conn.execute('UPDATE employees SET version=version+1 WHERE id=?',(entry.employee_id,))
                        changed_employee_ids.add(entry.employee_id)
                changed=bool(changed_employee_ids or new_history)
                if changed:
                    conn.execute("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='dataset_version'")
                    current+=1
                summary=payload['summary']
                result={'import_id':import_id,'dataset_version':current,'summary':summary,'applied':changed}
                conn.execute('UPDATE imports SET status=?,result_json=? WHERE id=?',('applied',json.dumps(result,ensure_ascii=False),import_id))
                conn.commit();return result
            except RepoError as exc:
                if exc.code!='IMPORT_EXPIRED':conn.rollback()
                raise
            except Exception: conn.rollback();raise
