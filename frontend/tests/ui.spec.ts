import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixture = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), '../contracts/examples', name), 'utf8'))
const originalProfile = fixture('profile-active.json')
const fallback = fixture('recommendations-fallback.json')
const basePreview = fixture('preview.json')
const overview = fixture('hr-overview.json')
const validImport = fixture('import-valid.json')
const commitImport = fixture('import-commit.json')

async function mockApi(page: Page) {
  let role: 'employee' | 'hr' | null = null
  let completed = false
  let profileReads = 0
  let previewReads = 0
  let commits = 0
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const path = url.pathname
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/v1/auth/me') return role ? send({ role, employee_id: role === 'employee' ? 'E0001' : null }) : send({ error: { code: 'UNAUTHENTICATED', message: 'Войдите.', details: [] }, request_id: 'test' }, 401)
    if (path === '/api/v1/auth/login' && method === 'POST') {
      const body = route.request().postDataJSON()
      role = body.username === 'hr' ? 'hr' : 'employee'
      return send({ role, employee_id: role === 'employee' ? 'E0001' : null })
    }
    if (path === '/api/v1/auth/logout') { role = null; return route.fulfill({ status: 204 }) }
    if (path === '/api/v1/hr/overview') return send(overview)
    if (path === '/api/v1/employees' && method === 'GET') return send({ items: [{ employee_id: 'E0001', role_id: 'BACKEND', grade: 'Middle' }], total: 1 })
    if (path === '/api/v1/imports/validate') return send(validImport)
    if (path === '/api/v1/imports/IMP_DEMO_01/commit') { commits++; return send(commitImport) }
    if (/^\/api\/v1\/employees\/[^/]+$/.test(path)) {
      profileReads++
      return send(completed ? { ...originalProfile, employee_version: 2, dataset_version: 2, coverage: 45.7, history: [{ history_id: 'H_DEMO_01', event_id: 'EV_BACKEND_01', title: originalProfile.available_events[0].title, type: 'course', status: 'completed', occurred_at: '2026-09-23T00:00:00Z' }] } : originalProfile)
    }
    if (path.endsWith('/recommendations')) return send(completed ? { ...fallback, employee_version: 2, dataset_version: 2, status: 'no_eligible_events', source: null, fallback_reason: null, no_step_reason: 'all_useful_completed', items: [] } : fallback)
    if (path.endsWith('/preview')) {
      previewReads++
      const body = route.request().postDataJSON()
      return send({ ...basePreview, event_id: body.event_id, target_gain: body.event_id === 'EV_BACKEND_01' ? 2 : 1 })
    }
    if (path.endsWith('/completions')) { completed = true; return send(fixture('completion.json'), 201) }
    return send({ error: { code: 'NOT_FOUND', message: path, details: [] }, request_id: 'test' }, 404)
  })
  return { get profileReads() { return profileReads }, get previewReads() { return previewReads }, get commits() { return commits } }
}

async function login(page: Page, user: 'employee' | 'hr') {
  await page.goto('/')
  await page.getByLabel('Логин').fill(user)
  await page.getByLabel('Пароль').fill(user === 'hr' ? 'demo-hr' : 'demo-employee')
  await page.getByRole('button', { name: 'Войти →' }).click()
}

test('профиль, немутирующая примерка и подтверждение', async ({ page }) => {
  const state = await mockApi(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page, 'employee')
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await expect(page.getByRole('heading', { name: 'Ваш следующий шаг' })).toBeVisible()
  await expect(page.getByText('Резервный расчёт', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Истории участия пока нет.', { exact: false }).last()).toBeVisible()
  const readsBefore = state.profileReads
  await page.getByRole('button', { name: 'Примерить' }).click()
  await expect(page.getByRole('dialog', { name: 'Примерка шага' })).toBeVisible()
  await expect(page.getByText('45,7%').first()).toBeVisible()
  expect(state.previewReads).toBeGreaterThanOrEqual(2)
  expect(state.profileReads).toBe(readsBefore)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Примерка шага' })).toBeHidden()
  await page.getByRole('button', { name: 'Примерить' }).click()
  await page.getByRole('button', { name: 'Подтвердить выполнение' }).click()
  await expect(page.getByRole('dialog', { name: 'Отметить выполнение?' })).toBeVisible()
  await page.getByRole('button', { name: 'Да, выполнено' }).click()
  await expect(page.getByText('Выполнение записано.', { exact: false })).toBeVisible()
  await expect.poll(() => state.profileReads).toBeGreaterThan(readsBefore)
  expect(errors).toEqual([])
})

test('HR видит срезы и может проверить импорт', async ({ page }) => {
  const state = await mockApi(page)
  await login(page, 'hr')
  await expect(page.getByRole('heading', { name: 'Где нужен следующий шаг' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Каких навыков не хватает' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Кому каталог не помог' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Как используют активности' })).toBeVisible()
  await page.getByRole('link', { name: 'Импортировать данные' }).click()
  await page.getByLabel('Профили сотрудников').setInputFiles({ name: 'employees.json', mimeType: 'application/json', buffer: Buffer.from('[{"employee_id":"E9999"}]') })
  await page.getByLabel('История активностей').setInputFiles({ name: 'activity_history.csv', mimeType: 'text/csv', buffer: Buffer.from('history_id,employee_id,event_id,status,occurred_at\n') })
  await page.getByRole('button', { name: 'Проверить файлы' }).click()
  await expect(page.getByText('Файлы прошли проверку.')).toBeVisible()
  expect(state.commits).toBe(0)
  await page.getByRole('button', { name: 'Подтвердить и применить' }).click()
  await expect(page.getByRole('link', { name: 'Открыть профиль E9999' })).toBeVisible()
  expect(state.commits).toBe(1)
})

for (const width of [390, 768, 1280]) {
  test(`нет горизонтального переполнения при ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 840 })
    await mockApi(page)
    await login(page, 'employee')
    await expect(page.getByRole('heading', { name: 'Ваш следующий шаг' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    if (browserName === 'chromium' && width !== 768) {
      const dir = resolve(process.cwd(), '../docs/validation/ui')
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: resolve(dir, `profile-${width}.png`), fullPage: true })
    }
    if (width === 390) {
      await page.getByRole('button', { name: 'Примерить' }).click()
      await expect(page.getByRole('dialog', { name: 'Примерка шага' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      await page.getByRole('button', { name: 'Подтвердить выполнение' }).click()
      await expect(page.getByRole('dialog', { name: 'Отметить выполнение?' })).toBeVisible()
    }
  })
}

for (const width of [390, 768, 1280]) {
  test(`HR и импорт доступны при ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 840 })
    await mockApi(page)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await login(page, 'hr')
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await expect(page.getByRole('heading', { name: 'Где нужен следующий шаг' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    if (browserName === 'chromium' && width === 390) {
      const dir = resolve(process.cwd(), '../docs/validation/ui')
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: resolve(dir, 'hr-390.png'), fullPage: true })
    }
    await page.getByRole('link', { name: 'Импортировать данные' }).click()
    await expect(page.getByRole('heading', { name: 'Импорт профилей и истории' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    if (browserName === 'chromium' && width === 390) {
      await page.screenshot({ path: resolve(process.cwd(), '../docs/validation/ui/import-390.png'), fullPage: true })
    }
    if (width === 390) {
      await page.getByLabel('Профили сотрудников').setInputFiles({ name: 'employees.json', mimeType: 'application/json', buffer: Buffer.from('[{"employee_id":"E9999"}]') })
      await page.getByLabel('История активностей').setInputFiles({ name: 'activity_history.csv', mimeType: 'text/csv', buffer: Buffer.from('history_id,employee_id,event_id,status,occurred_at\n') })
      await page.getByRole('button', { name: 'Проверить файлы' }).click()
      await expect(page.getByText('Файлы прошли проверку.')).toBeVisible()
      await page.getByRole('button', { name: 'Подтвердить и применить' }).click()
      await expect(page.getByRole('link', { name: 'Открыть профиль E9999' })).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}
