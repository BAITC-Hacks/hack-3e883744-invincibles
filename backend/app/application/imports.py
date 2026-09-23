"""Two-step employee/history import. Imported snapshots are authoritative."""
import csv
import json
from collections import Counter
from datetime import datetime,timezone
from pydantic import ValidationError
from app.contracts.api import ImportValidation,ImportSummary,ErrorDetail,ImportCommit
from app.data.kit_v1 import parse_employees,parse_history,KitParseError
from app.data.repository import Repository,RepoError

MAX_FILE=5*1024*1024


def detail(file,path,code,message): return ErrorDetail(file=file,path=path,code=code,message=message)


def schema_error(file,exc):
    first=exc.errors()[0]
    path='.'.join(map(str,first['loc'])) or 'root'
    code='UNSUPPORTED_KIT_SCHEMA' if first['type'] in ('extra_forbidden','missing') else 'INVALID_DATA'
    return detail(file,path,code,'Неверное значение или структура файла.')

class ImportService:
    def __init__(self,repository:Repository): self.repository=repository

    def validate(self,actor_id,employees_file:bytes,history_file:bytes):
        base,existing,events,roles,skills,old_history=self.repository.snapshot()
        zero=ImportSummary(new_employees=0,replaced_employees=0,new_history=0,unchanged_history=0)
        errors=[]
        if len(employees_file)>MAX_FILE or len(history_file)>MAX_FILE or len(employees_file)+len(history_file)>2*MAX_FILE:
            errors.append(detail(None,'files','FILE_TOO_LARGE','Файл превышает допустимый размер.'))
            return ImportValidation(import_id=None,valid=False,base_dataset_version=base,expires_at=None,summary=zero,errors=errors)
        try: employees=parse_employees(employees_file)
        except ValidationError as exc:
            errors.append(schema_error('employees.json',exc));employees=[]
        except (ValueError,UnicodeError):
            errors.append(detail('employees.json','root','INVALID_DATA','Неверный JSON.'));employees=[]
        try: history=parse_history(history_file)
        except KitParseError as exc:
            errors.append(detail('activity_history.csv',exc.path,exc.code,str(exc)));history=[]
        except (ValidationError,ValueError,UnicodeError,csv.Error):
            errors.append(detail('activity_history.csv','root','INVALID_DATA','Неверный CSV.'));history=[]
        if len(employees)>1000:errors.append(detail('employees.json','root','INVALID_DATA','Не более 1000 сотрудников.'))
        if len(history)>50000:errors.append(detail('activity_history.csv','root','INVALID_DATA','Не более 50000 строк.'))
        existing_map={e.employee_id:e for e in existing}
        new_map={e.employee_id:e for e in employees}
        role_ids={r.role_id for r in roles};skill_ids={s.skill_id for s in skills};event_ids={e.event_id for e in events}
        for id,n in Counter(e.employee_id for e in employees).items():
            if n>1:errors.append(detail('employees.json',id,'DUPLICATE_ID','Повторный ID сотрудника.'))
        for employee in employees:
            if employee.role_id not in role_ids:errors.append(detail('employees.json',employee.employee_id+'.role_id','UNKNOWN_ROLE','Неизвестная роль.'))
            for id in employee.skills:
                if id not in skill_ids:errors.append(detail('employees.json',employee.employee_id+'.skills.'+id,'UNKNOWN_SKILL','Неизвестный навык.'))
        old_ids={h.history_id:h for h in old_history}
        completed={(h.employee_id,h.event_id):h.history_id for h in old_history if h.status=='completed'}
        seen=set();new_count=0;unchanged_count=0
        for row in history:
            if row.history_id in seen:errors.append(detail('activity_history.csv',row.history_id,'DUPLICATE_ID','Повторный ID истории.'))
            seen.add(row.history_id)
            if row.employee_id not in existing_map and row.employee_id not in new_map:errors.append(detail('activity_history.csv',row.history_id+'.employee_id','UNKNOWN_EMPLOYEE','Неизвестный сотрудник.'))
            if row.event_id not in event_ids:errors.append(detail('activity_history.csv',row.history_id+'.event_id','UNKNOWN_EVENT','Неизвестная активность.'))
            if row.occurred_at>datetime.now(timezone.utc):errors.append(detail('activity_history.csv',row.history_id+'.occurred_at','INVALID_DATE','Дата в будущем.'))
            old=old_ids.get(row.history_id)
            if old:
                if old.model_dump(mode='json')!=row.model_dump(mode='json'):errors.append(detail('activity_history.csv',row.history_id,'HISTORY_CONFLICT','ID истории уже имеет другое содержимое.'))
                else:unchanged_count+=1
                continue
            new_count+=1
            if row.status=='completed':
                pair=(row.employee_id,row.event_id)
                if pair in completed:errors.append(detail('activity_history.csv',row.history_id,'COMPLETED_CONFLICT','Повторное завершение активности.'))
                completed[pair]=row.history_id
                if row.employee_id in existing_map and row.employee_id not in new_map:errors.append(detail('activity_history.csv',row.history_id,'SNAPSHOT_REQUIRED','Для completed нужен снимок сотрудника.'))
        summary=ImportSummary(new_employees=sum(e.employee_id not in existing_map for e in employees),replaced_employees=sum(e.employee_id in existing_map and e!=existing_map[e.employee_id] for e in employees),new_history=new_count,unchanged_history=unchanged_count)
        if errors:return ImportValidation(import_id=None,valid=False,base_dataset_version=base,expires_at=None,summary=summary,errors=errors)
        payload={'employees':[e.model_dump(mode='json') for e in employees],'history':[h.model_dump(mode='json') for h in history],'summary':summary.model_dump(mode='json')}
        import_id,expires=self.repository.save_import(actor_id,base,payload)
        return ImportValidation(import_id=import_id,valid=True,base_dataset_version=base,expires_at=datetime.fromisoformat(expires.replace('Z','+00:00')),summary=summary,errors=[])

    def commit(self,actor_id,import_id,base_dataset_version):
        return ImportCommit.model_validate(self.repository.commit_import(actor_id,import_id,base_dataset_version))
