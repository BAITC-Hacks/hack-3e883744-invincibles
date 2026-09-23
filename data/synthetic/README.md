# SHAGRA-KIT v1 — generated synthetic starter kit

These files were created by the ШАГРА team with `tools/generate_kit.py` and seed `20260923`. They are **not** Halyk Bank data and are **not** the organizers' official starter kit. No real names, email addresses, or banking records are included. `manifest.json` gives SHA-256 hashes for the four data files. Run `python tools/validate_kit.py` to verify counts, references, dates, grades and useful candidate coverage.

## Files and schema

- `employees.json`: array of `{employee_id, role_id, grade, tenure_months, skills}`. `skills` is the authoritative **current snapshot**; absent skills are unknown.
- `events.json`: array of `{event_id, title, description, type, audience, gains}`. Each gain is `{skill_id, gain, max_level}`. No schedules or deadlines are asserted.
- `skills.json`: `{schema_version:"shagra-kit/1", skills:[...], roles:[...]}`. Role requirements are fixed for Junior, Middle and Senior.
- `activity_history.csv`: header `history_id,employee_id,event_id,status,occurred_at`; UTF-8, comma CSV; UTC timestamps.
- `manifest.json`: provenance, seed, as-of date, counts and hashes.

The history covers 2024-09-23 through 2026-09-22 in 24 monthly intervals. Historical completed events were applied to a generated base profile exactly once before `employees.json` was written. Loading or importing this kit must **not** apply those gains again. Replacing a snapshot during HR import is an explicit full replacement, not a merge of skills.

The five roles, grade requirements, skills, event effects, histories and names are synthetic design assumptions for the MVP. The eight reserved BACKEND profiles E0001–E0008 exercise useful step, repeated skip, empty history, cap, target met, Senior/no next grade, all useful events completed and equal-benefit options.
