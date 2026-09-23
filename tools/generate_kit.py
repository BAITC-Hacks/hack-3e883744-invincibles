"""Deterministic, team-generated SHAGRA-KIT v1. No bank data is used."""
import argparse
import calendar
import csv
import hashlib
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.contracts.domain import Employee, Event, HistoryEntry, RoleDefinition, SkillDefinition, SkillsCatalog

SEED = 20260923
AS_OF = date(2026, 9, 23)
START = date(2024, 9, 23)
END = date(2026, 9, 22)
ROLES = ['BACKEND', 'DATA_ANALYST', 'QA', 'PRODUCT', 'CUSTOMER_SUPPORT']
HARD = {
    'BACKEND': [('SK_PYTHON','Python','Python'),('SK_SYSTEM_DESIGN','System Design','Проектирование систем'),('SK_BACKEND_02','API Design','Проектирование API'),('SK_BACKEND_03','Databases','Базы данных'),('SK_BACKEND_04','Service Reliability','Надёжность сервисов'),('SK_BACKEND_05','Code Review','Ревью кода'),('SK_BACKEND_06','Testing','Тестирование'),('SK_BACKEND_07','Security','Безопасность'),('SK_BACKEND_08','Observability','Наблюдаемость'),('SK_BACKEND_09','Distributed Systems','Распределённые системы')],
    'DATA_ANALYST': [('SK_DATA_ANALYST_%02d'%i,en,ru) for i,(en,ru) in enumerate([('SQL','SQL'),('Data Modeling','Моделирование данных'),('Dashboard Design','Проектирование дашбордов'),('Statistics','Статистика'),('Data Quality','Качество данных'),('Python Analysis','Анализ на Python'),('Experiment Design','Дизайн экспериментов'),('Data Visualization','Визуализация данных'),('Metric Design','Проектирование метрик'),('Forecasting','Прогнозирование')])],
    'QA': [('SK_QA_%02d'%i,en,ru) for i,(en,ru) in enumerate([('Test Design','Тест-дизайн'),('API Testing','Тестирование API'),('Automation','Автоматизация'),('Exploratory Testing','Исследовательское тестирование'),('Performance Testing','Нагрузочное тестирование'),('Bug Analysis','Анализ дефектов'),('Mobile Testing','Мобильное тестирование'),('Security Testing','Тестирование безопасности'),('Regression Planning','Планирование регрессии'),('Test Data','Тестовые данные')])],
    'PRODUCT': [('SK_PRODUCT_%02d'%i,en,ru) for i,(en,ru) in enumerate([('Product Discovery','Исследование продукта'),('Roadmapping','Дорожная карта'),('User Research','Исследование пользователей'),('Prioritization','Приоритизация'),('Metrics','Продуктовые метрики'),('Experimentation','Эксперименты'),('Requirements','Требования'),('Journey Mapping','Карта пути клиента'),('Pricing Research','Исследование ценности'),('Stakeholder Alignment','Согласование интересов')])],
    'CUSTOMER_SUPPORT': [('SK_CUSTOMER_SUPPORT_%02d'%i,en,ru) for i,(en,ru) in enumerate([('Case Resolution','Решение обращений'),('Product Knowledge','Знание продукта'),('Service Recovery','Восстановление сервиса'),('Knowledge Base','База знаний'),('Quality Assurance','Контроль качества'),('Escalation','Эскалация'),('Complaint Analysis','Анализ жалоб'),('Channel Operations','Работа с каналами'),('Accessibility','Доступность сервиса'),('Process Improvement','Улучшение процессов')])],
}
SOFT = [('SK_PUBLIC_SPEAKING','Public Speaking','Публичные выступления')] + [('SK_SOFT_%02d'%i,en,ru) for i,(en,ru) in enumerate([('Feedback','Обратная связь'),('Collaboration','Сотрудничество'),('Time Management','Управление временем'),('Empathy','Эмпатия'),('Critical Thinking','Критическое мышление'),('Writing','Деловое письмо'),('Facilitation','Фасилитация'),('Adaptability','Адаптивность'),('Mentoring','Наставничество')],start=1)]
ROLE_NAMES = {'BACKEND':('Backend Engineer','Backend-разработчик'),'DATA_ANALYST':('Data Analyst','Аналитик данных'),'QA':('QA Engineer','Инженер по тестированию'),'PRODUCT':('Product Manager','Менеджер продукта'),'CUSTOMER_SUPPORT':('Customer Support','Специалист поддержки')}
EVENT_NAMES = {
 'BACKEND':[('Service Boundaries Review','Разбор границ сервисов'),('API Contract Workshop','Практикум API-контрактов'),('Reliability Incident Lab','Разбор надёжности'),('Security Testing Lab','Практикум безопасности'),('Observability Design','Проектирование наблюдаемости'),('System Design Mentoring','Наставничество по проектированию систем')],
 'DATA_ANALYST':[('SQL and Data Model Lab','Практикум SQL и моделей данных'),('Dashboard and Statistics','Дашборды и статистика'),('Data Quality Clinic','Клиника качества данных'),('Experiment Visualization','Эксперименты и визуализация'),('Metric Forecasting','Метрики и прогнозирование'),('Data Modeling Mentoring','Наставничество по моделированию данных')],
 'QA':[('Test Design and API Lab','Разбор тест-дизайна и API'),('Automation Exploration','Автоматизация и исследование'),('Performance and Bug Analysis','Нагрузка и анализ дефектов'),('Mobile Security Testing','Мобильная безопасность'),('Regression Data Lab','Регрессия и тестовые данные'),('API Testing Mentoring','Наставничество по тестированию API')],
 'PRODUCT':[('Discovery and Roadmap','Исследование и дорожная карта'),('Research Prioritization','Исследование и приоритеты'),('Metrics Experiments','Метрики и эксперименты'),('Requirements Journey','Требования и путь клиента'),('Value and Stakeholders','Ценность и стейкхолдеры'),('Roadmap Mentoring','Наставничество по дорожной карте')],
 'CUSTOMER_SUPPORT':[('Case and Product Lab','Обращения и знание продукта'),('Service Recovery Workshop','Восстановление сервиса'),('Quality and Escalation','Качество и эскалация'),('Complaint and Channel Lab','Жалобы и каналы'),('Accessibility Improvement','Доступность и улучшения'),('Product Knowledge Mentoring','Наставничество по знанию продукта')],
}
SOFT_EVENTS = [('Public Speaking Practice','Практика публичных выступлений'),('Feedback Conversation','Разговор об обратной связи'),('Collaboration Lab','Практикум сотрудничества'),('Time Planning','Планирование времени'),('Empathy Workshop','Практикум эмпатии'),('Critical Thinking Lab','Практикум критического мышления'),('Business Writing','Деловое письмо'),('Facilitation Practice','Практика фасилитации'),('Adaptability Workshop','Практикум адаптивности'),('Mentoring Practice','Практика наставничества')]


def local(en,ru): return {'en':en,'ru':ru}
def iso(day): return f'{day.isoformat()}T08:00:00Z'
def months_before(day, months):
    m=day.year*12+day.month-1-months
    year,month=divmod(m,12); month+=1
    return date(year,month,min(day.day,calendar.monthrange(year,month)[1]))
def dump(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')


def build():
    rng=random.Random(SEED)
    skills=[SkillDefinition(skill_id=id,name=local(en,ru),kind='hard') for role in ROLES for id,en,ru in HARD[role]]
    skills += [SkillDefinition(skill_id=id,name=local(en,ru),kind='soft') for id,en,ru in SOFT]
    roles=[];events=[]
    for role_id in ROLES:
        en,ru=ROLE_NAMES[role_id]
        ids=[x[0] for x in HARD[role_id]]; soft_ids=[x[0] for x in SOFT]
        roles.append(RoleDefinition(role_id=role_id,name=local(en,ru),grade_order=['Junior','Middle','Senior'],requirements={g:{id:hard_level for id in ids}|{id:soft_level for id in soft_ids} for g,hard_level,soft_level in [('Junior',1,1),('Middle',3,2),('Senior',4,3)]}))
        for i,(title_en,title_ru) in enumerate(EVENT_NAMES[role_id]):
            a,b=(2*i,2*i+1) if i<5 else (1,1)
            gains=[{'skill_id':ids[a],'gain':1,'max_level':4},{'skill_id':ids[b],'gain':1,'max_level':4}] if i<5 else [{'skill_id':ids[1],'gain':1,'max_level':5}]
            events.append(Event(event_id=f'EV_{role_id}_{i+1:02d}',title=local(title_en,title_ru),description=f'Учебная активность: {title_ru.lower()}.',type='mentoring' if i==5 else ['course','workshop','mentoring'][i%3],audience={'role_ids':[role_id],'grades':['Middle','Senior'] if i==5 else ['Junior','Middle','Senior']},gains=gains))
    for i,(en,ru) in enumerate(SOFT_EVENTS):
        events.append(Event(event_id=f'EV_SOFT_{i:02d}',title=local(en,ru),description=f'Учебная активность: {ru.lower()}.',type=['course','workshop','mentoring'][i%3],audience={'role_ids':ROLES,'grades':['Junior','Middle','Senior']},gains=[{'skill_id':SOFT[i][0],'gain':1,'max_level':3}]))
    event_map={e.event_id:e for e in events}
    employees=[];history=[]
    fixed_empty={'E0001','E0003','E0004','E0006','E0008','E0041','E0042','E0043','E0044','E0045'}
    h=0
    for n in range(1,201):
        eid=f'E{n:04d}'; role_index=(n-1)//40;role_id=ROLES[role_index];offset=(n-1)%40
        if role_id=='BACKEND' and offset<8:
            grade='Senior' if eid=='E0006' else 'Middle'
        elif role_id=='BACKEND':
            rest=offset-8;grade='Junior' if rest<20 else 'Middle' if rest<27 else 'Senior'
        else: grade='Junior' if offset<20 else 'Middle' if offset<34 else 'Senior'
        tenure=48 if n<=8 else rng.randint(12,60)
        ids=[x[0] for x in HARD[role_id]];soft_ids=[x[0] for x in SOFT]
        if n<=8:
            hard_level,soft_level={1:(2,1),2:(2,1),3:(1,1),4:(4,3),5:(3,3),6:(3,2),7:(0,0),8:(2,2)}[n]
            levels={id:hard_level for id in ids}|{id:soft_level for id in soft_ids}
            if n==4: levels['SK_SYSTEM_DESIGN']=2
        else: levels={id:rng.randint(0,3) for id in ids+soft_ids}
        rows=[]
        if eid=='E0002':
            rows=[(f'H_RESERVED_{eid}_{i}',eid,'EV_SOFT_00','skipped',iso(date(2025,9+i,1))) for i in range(1,4)]
        elif eid=='E0005':
            rows=[(f'H_RESERVED_{eid}_{i+1}',eid,f'EV_BACKEND_{i+1:02d}','completed',iso(date(2025,10,1)+timedelta(days=i))) for i in range(5)]
        elif eid=='E0007':
            selected=[e for e in events if role_id in e.audience.role_ids and grade in e.audience.grades]
            rows=[(f'H_RESERVED_{eid}_{i+1}',eid,e.event_id,'completed',iso(date(2025,10,1)+timedelta(days=i))) for i,e in enumerate(selected)]
        elif eid not in fixed_empty:
            hire=max(START,months_before(AS_OF,tenure))
            possible=[e for e in events if role_id in e.audience.role_ids and grade in e.audience.grades]
            done=set()
            for _ in range(rng.randint(0,18)):
                choices=[e for e in possible if e.event_id not in done]
                if not choices: break
                event=rng.choice(choices)
                status=rng.choices(['completed','skipped','declined'],weights=[5,3,2])[0]
                if status=='completed': done.add(event.event_id)
                day=hire+timedelta(days=rng.randint(0,(END-hire).days))
                h+=1;rows.append((f'H{h:06d}',eid,event.event_id,status,iso(day)))
        for hid,_,ev,status,at in sorted(rows,key=lambda x:(x[4],x[0])):
            if status=='completed':
                for gain in event_map[ev].gains:
                    old=levels[gain.skill_id]
                    levels[gain.skill_id]=max(old,min(5,gain.max_level,old+gain.gain))
        employees.append(Employee(employee_id=eid,role_id=role_id,grade=grade,tenure_months=tenure,skills=levels))
        history.extend(HistoryEntry(history_id=row[0],employee_id=row[1],event_id=row[2],status=row[3],occurred_at=row[4]) for row in rows)
    return employees,events,skills,roles,history


def write(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    employees,events,skills,roles,history=build()
    dump(output/'employees.json',[e.model_dump(mode='json') for e in employees])
    dump(output/'events.json',[e.model_dump(mode='json') for e in events])
    dump(output/'skills.json',SkillsCatalog(schema_version='shagra-kit/1',skills=skills,roles=roles).model_dump(mode='json'))
    with (output/'activity_history.csv').open('w',encoding='utf-8',newline='') as file:
        writer=csv.writer(file,lineterminator='\n');writer.writerow(['history_id','employee_id','event_id','status','occurred_at'])
        for row in sorted(history,key=lambda h:(h.occurred_at,h.history_id)):
            writer.writerow([row.history_id,row.employee_id,row.event_id,row.status,row.occurred_at.strftime('%Y-%m-%dT%H:%M:%SZ')])
    files=['employees.json','events.json','skills.json','activity_history.csv']
    manifest={'schema_version':'shagra-kit/1','seed':SEED,'as_of':AS_OF.isoformat(),'provenance':'team_generated_synthetic','counts':{'employees':len(employees),'events':len(events),'skills':len(skills)},'sha256':{name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in files}}
    dump(output/'manifest.json',manifest)
    print(json.dumps(manifest,ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('data/synthetic'));args=parser.parse_args();write(args.output)
