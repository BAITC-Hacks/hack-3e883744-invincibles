# Data and provenance

[Documentation](README.md) · [Русский](../README.md#данные-и-импорт) · [Қазақша](../README.kk.md#деректер-және-импорт) · [English](../README.en.md#data-and-import)

The shipped dataset is the team's deterministic synthetic **SHAGRA-KIT v1** in [`data/synthetic`](../data/synthetic/README.md). It is not an official bank or organizer dataset. The generator uses seed 20260923 and date 2026-09-23; the manifest hashes all four data files. Re-run the generator into a temporary directory and compare hashes to reproduce it.

The canonical schema is in `backend/app/contracts/domain.py` and design §5. Employee skills are authoritative current snapshots. A historical `completed` record documents participation; import and startup never reapply its gain. Runtime completion applies `max(before, min(5, max_level, before+gain))` once inside a SQLite transaction. Missing skills remain unknown. The kit has 200 employees, 40 events, 60 skills and 1,736 activity-history entries spanning 24 monthly intervals.

HR import accepts only `employees.json` and `activity_history.csv` in this team's schema. It validates both files before storing a normalized pending payload, then commits it atomically within 15 minutes if dataset version has not changed. Existing employee IDs replace the full skills snapshot; identical history IDs are no-ops. New historical completed entries for existing employees require that employee's snapshot in the same import. Repeating a byte-identical import does not increment versions or skills.

The official starter kit has not been received. Compatibility is therefore unverified. When it arrives, read its README, map role/grade/skill/status/date/gain rules in a **separate adapter**, test a sample profile, and record the mapping here. Unknown fields or incompatible semantics must return `UNSUPPORTED_KIT_SCHEMA`; this implementation does not guess a mapping.
