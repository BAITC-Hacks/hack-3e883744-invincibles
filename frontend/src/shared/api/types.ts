export type LocalizedText = { en: string; ru: string | null; kk: string | null }
export type Role = 'employee' | 'hr'
export type Auth = { role: Role; employee_id: string | null }
export type EventType = 'course' | 'workshop' | 'mentoring'
export type HistoryStatus = 'completed' | 'skipped' | 'declined'
export type SkillRow = {
  skill_id: string
  name: LocalizedText
  current: number | null
  target: number | null
  gap: number | null
}
export type HistoryRow = {
  history_id: string
  event_id: string
  title: LocalizedText
  type: EventType
  status: HistoryStatus
  occurred_at: string
}
export type AvailableEvent = {
  event_id: string
  title: LocalizedText
  type: EventType
  target_gain: number
}
export type Profile = {
  employee: {
    employee_id: string
    role_id: string
    grade: string
    tenure_months: number
    skills: Record<string, number>
  }
  employee_version: number
  dataset_version: number
  role_name: LocalizedText
  target_grade: string | null
  coverage: number | null
  state: 'active' | 'no_next_grade' | 'target_met' | 'incomplete_skills'
  skill_rows: SkillRow[]
  history: HistoryRow[]
  available_events: AvailableEvent[]
}
export type SkillChange = {
  skill_id: string
  before: number
  after: number
  delta: number
  target: number | null
  remaining_gap: number | null
}
export type Preview = {
  event_id: string
  employee_version: number
  dataset_version: number
  changes: SkillChange[]
  coverage_before: number | null
  coverage_after: number | null
  target_gain: number
}
export type Evidence = {
  kind: 'GRADE_TARGET' | 'SKILL_GAP' | 'HISTORY' | 'PREFERENCE'
  text: string
  refs: string[]
}
export type RecommendationItem = {
  event_id: string
  title: LocalizedText
  type: EventType
  rank: number
  preview: Preview
  evidence: Evidence[]
  reason_codes: string[]
  comparison_event_id: string | null
}
export type RecommendationResult = {
  employee_id: string
  employee_version: number
  dataset_version: number
  status:
    | 'ready'
    | 'no_next_grade'
    | 'target_met'
    | 'incomplete_skills'
    | 'no_eligible_events'
    | 'all_candidates_excluded'
  source: 'llm' | 'deterministic_fallback' | null
  cache_hit: boolean
  fallback_reason: string | null
  no_step_reason:
    | 'no_catalog_coverage'
    | 'all_useful_completed'
    | 'audience_or_missing_skills'
    | null
  items: RecommendationItem[]
}
export type HrOverview = {
  dataset_version: number
  employees_total: number
  skill_gaps: {
    skill_id: string
    name: LocalizedText
    affected_count: number
    assessed_count: number
    affected_share: number | null
    mean_gap: number | null
  }[]
  no_step: {
    employee_id: string
    role_id: string
    role_name?: LocalizedText
    reason: string
  }[]
  participation: {
    event_id: string
    title: LocalizedText
    completed: number
    skipped: number
    declined: number
    unique_participants: number
    completion_share: number | null
  }[]
}
export type EmployeeList = {
  items: {
    employee_id: string
    role_id: string
    role_name?: LocalizedText
    grade: string
  }[]
  total: number
}
export type ImportSummary = {
  new_employees: number
  replaced_employees: number
  new_history: number
  unchanged_history: number
}
export type ImportValidation = {
  import_id: string | null
  valid: boolean
  base_dataset_version: number
  expires_at: string | null
  summary: ImportSummary
  errors: { file: string | null; path: string; code: string; message: string }[]
}
export type ImportCommit = {
  import_id: string
  dataset_version: number
  summary: ImportSummary
  applied: boolean
}
export type EventAction = {
  event_id: string
  employee_version: number
  dataset_version: number
}
export type Completion = {
  employee_id: string
  event_id: string
  applied: boolean
  employee_version: number
  dataset_version: number
  preview: Preview
  history_id: string
}
