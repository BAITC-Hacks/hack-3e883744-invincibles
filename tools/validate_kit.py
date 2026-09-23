"""Verify provenance, referential integrity, scenarios and candidate coverage."""
import argparse
import calendar
import hashlib
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app.data.kit_v1 import load_kit
from backend.app.data.validation import validate_references,candidate_share


def validate(directory:Path):
    employees,events,catalog,history=load_kit(directory)
    manifest=json.loads((directory/'manifest.json').read_text())
    assert manifest['schema_version']=='shagra-kit/1'
    assert manifest['seed']==20260923 and manifest['as_of']=='2026-09-23'
    assert manifest['provenance']=='team_generated_synthetic'
    assert manifest['counts']=={'employees':200,'events':40,'skills':60}
    for name,digest in manifest['sha256'].items():
        assert hashlib.sha256((directory/name).read_bytes()).hexdigest()==digest,name
    assert len(employees)==200 and len(events)==40 and len(catalog.skills)==60
    errors=validate_references(employees,events,catalog,history)
    assert not errors,errors
    by_role=Counter(e.role_id for e in employees)
    assert by_role=={role:40 for role in ['BACKEND','DATA_ANALYST','QA','PRODUCT','CUSTOMER_SUPPORT']}
    for role in by_role:
        assert Counter(e.grade for e in employees if e.role_id==role)=={'Junior':20,'Middle':14,'Senior':6}
    by_employee=Counter(h.employee_id for h in history)
    for h in history:
        employee=next(e for e in employees if e.employee_id==h.employee_id)
        months=employee.tenure_months
        index=2026*12+9-1-months
        year,month=divmod(index,12);month+=1
        hire=date(year,month,min(23,calendar.monthrange(year,month)[1]))
        assert h.occurred_at.date()>=max(date(2024,9,23),hire),(h.history_id,hire)
    assert max(by_employee.values())<=18
    assert sum(by_employee[e.employee_id]==0 for e in employees)>=10
    assert {h.status for h in history}=={'completed','skipped','declined'}
    start=date(2024,9,23);end=date(2026,9,22)
    month_bins=set()
    for h in history:
        day=h.occurred_at.date();assert start<=day<=end
        index=(day.year-start.year)*12+day.month-start.month-(1 if day.day<23 else 0)
        month_bins.add(index)
    assert month_bins==set(range(24)),month_bins
    by_id={e.employee_id:e for e in employees}
    assert by_id['E0001'].skills['SK_PYTHON']==2
    assert by_id['E0004'].skills['SK_SYSTEM_DESIGN']==2
    assert all(by_id['E0005'].skills[id]==4 for id in [s.skill_id for s in catalog.skills if s.skill_id.startswith('SK_BACKEND_') or s.skill_id in ('SK_PYTHON','SK_SYSTEM_DESIGN')])
    assert len([h for h in history if h.employee_id=='E0007' and h.status=='completed'])==16
    useful,total,share=candidate_share(employees,events,catalog,history)
    assert share>=0.70,(useful,total,share)
    print(json.dumps({'employees':len(employees),'events':len(events),'skills':len(catalog.skills),'history':len(history),'month_bins':len(month_bins),'useful':useful,'eligible_profiles':total,'share':round(share,4)},ensure_ascii=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,default=Path('data/synthetic'));args=p.parse_args();validate(args.directory)
