import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
export const fixture = (name: string) =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), '../contracts/examples', name), 'utf8'),
  )
export const profile = fixture('profile-active.json')
export const fallback = fixture('recommendations-fallback.json')
export async function mockApi(
  page: Page,
  options: {
    retryCompletion?: boolean
    stalePreview?: boolean
    failedRecommendations?: boolean
    delayedRecommendations?: number
    noStep?: boolean
  } = {},
) {
  let role: 'employee' | 'hr' | null = null
  let completed = false,
    profileReads = 0,
    previewReads = 0,
    recommendations = 0,
    commits = 0,
    completionAttempts = 0
  const completionRequests: { key: string | undefined; body: unknown }[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    if (path.endsWith('/auth/me'))
      return role
        ? send({ role, employee_id: role === 'employee' ? 'E0001' : null })
        : send({ error: { code: 'UNAUTHENTICATED', message: 'Войдите.' } }, 401)
    if (path.endsWith('/auth/login')) {
      role = request.postDataJSON().username === 'hr' ? 'hr' : 'employee'
      return send({ role, employee_id: role === 'employee' ? 'E0001' : null })
    }
    if (path.endsWith('/auth/logout')) {
      role = null
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith('/hr/overview')) return send(fixture('hr-overview.json'))
    if (path === '/api/v1/employees')
      return send({
        items: [{ employee_id: 'E0001', role_id: 'BACKEND', grade: 'Middle' }],
        total: 1,
      })
    if (path.endsWith('/imports/validate'))
      return send(fixture('import-valid.json'))
    if (path.endsWith('/imports/IMP_DEMO_01/commit')) {
      commits++
      return send(fixture('import-commit.json'))
    }
    if (/^\/api\/v1\/employees\/[^/]+$/.test(path)) {
      profileReads++
      return send(
        completed
          ? {
              ...profile,
              employee_version: 2,
              dataset_version: 2,
              coverage: 45.7,
              history: [
                {
                  history_id: 'H_DEMO',
                  event_id: 'EV_BACKEND_01',
                  title: profile.available_events[0].title,
                  type: 'course',
                  status: 'completed',
                  occurred_at: '2026-09-23T00:00:00Z',
                },
              ],
            }
          : profile,
      )
    }
    if (path.endsWith('/recommendations')) {
      recommendations++
      if (options.delayedRecommendations)
        await new Promise((resolve) =>
          setTimeout(resolve, options.delayedRecommendations),
        )
      if (options.failedRecommendations && recommendations === 1)
        return send(
          { error: { code: 'HTTP_ERROR', message: 'Test retry' } },
          503,
        )
      if (
        completed ||
        options.noStep ||
        request.postDataJSON().excluded_event_ids.length
      )
        return send({
          ...fallback,
          status: 'no_eligible_events',
          no_step_reason: 'all_useful_completed',
          items: [],
        })
      return send(fallback)
    }
    if (path.endsWith('/preview')) {
      previewReads++
      if (options.stalePreview)
        return send(
          { error: { code: 'STALE_CONTEXT', message: 'Profile changed' } },
          409,
        )
      return send({
        ...fixture('preview.json'),
        event_id: request.postDataJSON().event_id,
      })
    }
    if (path.endsWith('/completions')) {
      completionAttempts++
      completionRequests.push({
        key: request.headers()['idempotency-key'],
        body: request.postDataJSON(),
      })
      if (options.retryCompletion && completionAttempts === 1)
        return route.abort('failed')
      completed = true
      return send(fixture('completion.json'), 201)
    }
    return send({ error: { code: 'NOT_FOUND', message: path } }, 404)
  })
  return {
    get profileReads() {
      return profileReads
    },
    get previewReads() {
      return previewReads
    },
    get recommendations() {
      return recommendations
    },
    get commits() {
      return commits
    },
    completionRequests,
  }
}
export async function login(page: Page, role: 'employee' | 'hr' = 'employee') {
  await page.goto('/')
  await page.getByLabel('Логин', { exact: true }).fill(role)
  await page.getByLabel('Пароль', { exact: true }).fill(`demo-${role}`)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: role === 'hr' ? 'Развитие команды' : 'Моё развитие',
      exact: true,
    }),
  ).toBeVisible()
}
export async function logout(page: Page) {
  const account = page.getByRole('button', { name: 'Аккаунт', exact: true })
  if (await account.isVisible()) await account.click()
  else await page.locator('.sh-sidebar-account').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Выйти', exact: true })
    .click()
}
