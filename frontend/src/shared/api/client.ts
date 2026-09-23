import type {
  Auth,
  Completion,
  EmployeeList,
  EventAction,
  HrOverview,
  ImportCommit,
  ImportValidation,
  Preview,
  Profile,
  RecommendationResult,
} from './types'

const base = '/api/v1'

function sessionExpired(path: string, status: number) {
  if (status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('shagra:session-expired'))
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(base + path, {
    credentials: 'include',
    ...init,
    headers:
      init.body instanceof FormData
        ? init.headers
        : {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
  })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    sessionExpired(path, response.status)
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? 'Не удалось выполнить запрос.',
      payload?.error?.details ?? [],
    )
  }
  return payload as T
}

const json = (body: unknown) => JSON.stringify(body)
const employeePath = (id: string) => `/employees/${encodeURIComponent(id)}`

export const api = {
  me: (signal?: AbortSignal) => request<Auth>('/auth/me', { signal }),
  login: (username: string, password: string) =>
    request<Auth>('/auth/login', {
      method: 'POST',
      body: json({ username, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST', body: '{}' }),
  profile: (id: string, signal?: AbortSignal) =>
    request<Profile>(employeePath(id), { signal }),
  recommendations: (
    id: string,
    profile: Profile,
    excluded_event_ids: string[],
    signal?: AbortSignal,
  ) =>
    request<RecommendationResult>(employeePath(id) + '/recommendations', {
      method: 'POST',
      body: json({
        employee_version: profile.employee_version,
        dataset_version: profile.dataset_version,
        excluded_event_ids,
        preferred_type: null,
      }),
      signal,
    }),
  preview: (id: string, action: EventAction, signal?: AbortSignal) =>
    request<Preview>(employeePath(id) + '/preview', {
      method: 'POST',
      body: json(action),
      signal,
    }),
  complete: (id: string, action: EventAction, key: string) =>
    request<Completion>(employeePath(id) + '/completions', {
      method: 'POST',
      body: json(action),
      headers: { 'Idempotency-Key': key },
    }),
  overview: (signal?: AbortSignal) =>
    request<HrOverview>('/hr/overview', { signal }),
  employees: (q: string, offset = 0, limit = 50, signal?: AbortSignal) =>
    request<EmployeeList>(
      `/employees?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`,
      { signal },
    ),
  validate: async (
    employees: File,
    history: File,
  ): Promise<ImportValidation> => {
    const body = new FormData()
    body.append('employees_file', employees)
    body.append('history_file', history)
    const response = await fetch(base + '/imports/validate', {
      method: 'POST',
      body,
      credentials: 'include',
    })
    const payload = await response.json().catch(() => null)
    if (response.status === 422 && payload?.valid === false)
      return payload as ImportValidation
    if (!response.ok) {
      sessionExpired('/imports/validate', response.status)
      throw new ApiError(
        response.status,
        payload?.error?.code ?? 'HTTP_ERROR',
        payload?.error?.message ?? 'Проверка не удалась.',
        payload?.error?.details ?? [],
      )
    }
    return payload as ImportValidation
  },
  commit: (importId: string, version: number) =>
    request<ImportCommit>(`/imports/${encodeURIComponent(importId)}/commit`, {
      method: 'POST',
      body: json({ base_dataset_version: version }),
    }),
}

export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Неизвестная ошибка.'
