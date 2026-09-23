# ШАГРА HTTP contract v1

Base `/api/v1`, JSON UTF-8, signed HttpOnly session cookie. All state-changing POSTs require a matching `Origin` header (or matching `Referer` when Origin is absent). Schema source: `backend/app/contracts`. Examples in `contracts/examples` are generated and validated by `python tools/generate_contract_examples.py`.

| Method | Path | Access | Request | Success |
|---|---|---|---|---|
| GET | `/health` | public | — | HealthResponse |
| POST | `/auth/login` | public | LoginRequest | AuthResponse + cookie |
| GET | `/auth/me` | session | — | AuthResponse |
| POST | `/auth/logout` | session | `{}` | 204 |
| GET | `/employees?q=&limit=50&offset=0` | HR | — | EmployeeList |
| GET | `/employees/{id}` | owner or HR | — | ProfileResponse |
| POST | `/employees/{id}/recommendations` | owner or HR | RecommendationRequest | RecommendationResult |
| POST | `/employees/{id}/preview` | owner or HR | EventActionRequest | Preview |
| POST | `/employees/{id}/completions` | owner or HR | EventActionRequest + `Idempotency-Key` | CompletionResponse, 201 new / 200 retry |
| GET | `/hr/overview` | HR | — | HrOverview |
| POST | `/imports/validate` | HR | multipart `employees_file`, `history_file` | ImportValidation; 422 invalid |
| POST | `/imports/{import_id}/commit` | HR | ImportCommitRequest | ImportCommit |

Success bodies are direct objects, without a `data` wrapper. Error bodies are `ErrorResponse`: `{error:{code,message,details:[{file,path,code,message}]},request_id}`. The one exception is an invalid file upload: HTTP 422 returns `ImportValidation` with `valid=false`, `import_id=null`, `expires_at=null` and field errors. State versions are mandatory for mutation and recommendation requests. Preview does not write. `preview.employee_version` and `preview.dataset_version` refer to the pre-completion state; completion's top-level versions are the new state.

| HTTP | Error code |
|---|---|
| 400 | `INVALID_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `STALE_CONTEXT`, `IDEMPOTENCY_CONFLICT`, `ALREADY_COMPLETED`, `IMPORT_CONFLICT` |
| 410 | `IMPORT_EXPIRED` |
| 413 | `FILE_TOO_LARGE` |
| 422 | `INVALID_DATA`, `UNSUPPORTED_KIT_SCHEMA`, `INELIGIBLE_EVENT`, `INCOMPLETE_SKILLS` |

Profile `skill_rows` sort unknown target skills first, then positive gaps descending, then skill ID; `history` sorts date descending and history ID ascending; `available_events` sorts event ID. Recommendation `source` is `llm`, `deterministic_fallback`, or `null` for empty states. A fallback is a working deterministic calculation, not a successful AI call. Import validation expires after 15 minutes; a repeated successful commit returns `applied=false` without changing versions.

Import files: employee JSON is an array. Each employee may use canonical `role_id` or `role` matched against a current catalog ID/localized name (trimmed and case-insensitive). Both fields must agree if supplied. Unknown/ambiguous roles are rejected with field errors. CSV requires the five documented column names, in any order; duplicate/missing/extra columns are rejected. [Runnable examples](../data/demo-import/README.md).
