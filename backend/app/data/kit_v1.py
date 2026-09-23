"""Reader for the team's own SHAGRA-KIT v1 only."""
import csv
import io
import json
from pathlib import Path
from pydantic import TypeAdapter
from app.contracts.domain import Employee, Event, HistoryEntry, SkillsCatalog

EMPLOYEES = TypeAdapter(list[Employee])
EVENTS = TypeAdapter(list[Event])
HISTORY = TypeAdapter(list[HistoryEntry])
HEADER = ['history_id','employee_id','event_id','status','occurred_at']


class KitParseError(ValueError):
    def __init__(self, path: str, code: str, message: str):
        self.path = path
        self.code = code
        super().__init__(message)


def parse_employees(data: bytes) -> list[Employee]:
    return EMPLOYEES.validate_json(data)


def parse_history(data: bytes) -> list[HistoryEntry]:
    stream=io.StringIO(data.decode('utf-8-sig'),newline='')
    reader=csv.DictReader(stream,strict=True)
    if reader.fieldnames is None or len(reader.fieldnames) != len(HEADER) or set(reader.fieldnames) != set(HEADER):
        raise KitParseError('header', 'INVALID_DATA', 'Неверный заголовок CSV.')
    rows=[]
    for index,row in enumerate(reader,start=2):
        if None in row or any(row[col] is None for col in HEADER):
            raise KitParseError(f'row[{index}]', 'INVALID_DATA', 'Неверное число полей CSV.')
        try: rows.append(HistoryEntry.model_validate(row))
        except Exception as exc:
            field = exc.errors()[0]['loc'][0] if hasattr(exc, 'errors') else 'root'
            code = 'INVALID_DATE' if field == 'occurred_at' else 'INVALID_DATA'
            raise KitParseError(f'row[{index}].{field}', code, 'Неверное значение в CSV.') from exc
    return rows


def load_kit(directory: Path):
    employees=parse_employees((directory/'employees.json').read_bytes())
    events=EVENTS.validate_json((directory/'events.json').read_bytes())
    catalog=SkillsCatalog.model_validate_json((directory/'skills.json').read_bytes())
    history=parse_history((directory/'activity_history.csv').read_bytes())
    return employees,events,catalog,history
