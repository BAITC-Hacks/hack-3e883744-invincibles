"""Explicit import aliases; persisted employees retain the canonical kit schema."""
import json

from app.contracts.domain import Employee, RoleDefinition
from app.data.kit_v1 import EMPLOYEES, KitParseError


def parse_import_employees(data: bytes, roles: list[RoleDefinition]) -> list[Employee]:
    payload = json.loads(data)
    if not isinstance(payload, list):
        # Keep the canonical schema error for unsupported envelopes/objects.
        return EMPLOYEES.validate_python(payload)

    aliases: dict[str, set[str]] = {}
    for role in roles:
        for value in (role.role_id, role.name.en, role.name.ru, role.name.kk):
            if value is not None:
                aliases.setdefault(value.strip().casefold(), set()).add(role.role_id)

    normalized = []
    for index, employee in enumerate(payload):
        if not isinstance(employee, dict) or 'role' not in employee:
            normalized.append(employee)
            continue
        employee = dict(employee)
        value = employee.pop('role')
        path = f'{index}.role'
        if not isinstance(value, str):
            raise KitParseError(path, 'INVALID_DATA', 'Роль должна быть строкой.')
        matches = aliases.get(value.strip().casefold(), set())
        if not matches:
            raise KitParseError(path, 'UNKNOWN_ROLE', 'Неизвестная роль.')
        if len(matches) != 1:
            raise KitParseError(path, 'AMBIGUOUS_ROLE', 'Название соответствует нескольким ролям.')
        role_id = next(iter(matches))
        if 'role_id' in employee and employee['role_id'] != role_id:
            raise KitParseError(path, 'ROLE_CONFLICT', 'Поля role и role_id указывают разные роли.')
        employee['role_id'] = role_id
        normalized.append(employee)
    return EMPLOYEES.validate_python(normalized)
