# ШАГРА HTTP contract v1

Base `/api/v1`, JSON UTF-8, signed HttpOnly session cookie. Schema source: `backend/app/contracts`. Examples in `contracts/examples` are generated and validated by `python tools/generate_contract_examples.py`.

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

Error shape: ErrorResponse. Codes and semantics are fixed by design §10. State versions are mandatory for mutation and recommendation requests. Preview does not write. `preview.employee_version` and `preview.dataset_version` refer to the pre-completion state.
