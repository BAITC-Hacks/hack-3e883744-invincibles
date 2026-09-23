import { expect, test } from '@playwright/test'
import { fixture, login, mockApi } from './helpers'

test('роль после входа подтверждается сессией, а не ответом login', async ({ page }) => {
  await mockApi(page)
  let loggedIn = false
  let meCalls = 0
  await page.route('**/api/v1/auth/me', route => {
    meCalls++
    return route.fulfill({ status: loggedIn ? 200 : 401, contentType: 'application/json', body: JSON.stringify(loggedIn ? { role: 'employee', employee_id: 'E0001' } : { error: { code: 'UNAUTHENTICATED', message: 'Войдите.' } }) })
  })
  await page.route('**/api/v1/auth/login', route => {
    loggedIn = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'hr', employee_id: null }) })
  })
  await page.goto('/')
  await page.getByLabel('Логин', { exact: true }).fill('employee')
  await page.getByLabel('Пароль', { exact: true }).fill('demo-employee')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/me$/)
  expect(meCalls).toBeGreaterThanOrEqual(2)
})

test('401 у профиля завершает сессию без повтора запросов', async ({ page }) => {
  await mockApi(page)
  await login(page)
  let profileCalls = 0
  await page.route('**/api/v1/employees/E0001', route => {
    profileCalls++
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Войдите.' } }) })
  })
  await page.reload()
  await expect(page.getByLabel('Логин', { exact: true })).toBeVisible()
  expect(profileCalls).toBeLessThanOrEqual(2)
})

test('устаревший успешный ответ рекомендаций не отображается как актуальный', async ({ page }) => {
  await mockApi(page)
  let calls = 0
  await page.route('**/recommendations', route => {
    calls++
    const result = fixture('recommendations-fallback.json')
    result.employee_version += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await login(page)
  await expect.poll(() => calls).toBeGreaterThan(0)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Примерить шаг', exact: true })).toHaveCount(0)
  expect(calls).toBeLessThanOrEqual(3)
})

test('мобильный обзор показывает CTA до карты и различает неизвестный навык', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const profile = fixture('profile-active.json')
  profile.skill_rows[0].current = null
  profile.skill_rows[0].gap = null
  await page.route('**/api/v1/employees/E0001', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }))
  await login(page)
  const cta = page.getByRole('button', { name: 'Примерить шаг', exact: true })
  const box = await cta.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await expect(page.getByRole('heading', { name: 'Карта навыков' })).toBeVisible()
  const unknown = page.getByRole('button', { name: /Проектирование API.*Нет оценки/ })
  await unknown.click()
  await expect(page.getByRole('status')).toContainText('Нет оценки')
})

test('последний грейд и отсутствие шага не создают ложного нуля', async ({ page }) => {
  await mockApi(page)
  const profile = fixture('profile-no-next-grade.json')
  profile.employee.employee_id = 'E0001'
  await page.route('**/api/v1/employees/E0001', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }))
  await page.route('**/recommendations', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ employee_id: 'E0001', employee_version: 1, dataset_version: 1, status: 'no_next_grade', source: null, cache_hit: false, fallback_reason: null, no_step_reason: null, items: [] }) }))
  await login(page)
  await expect(page.getByText('Следующий грейд не задан').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Подходящего шага пока нет' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Примерить шаг' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Проектирование API.*Нет требования/ })).toBeVisible()
  await expect(page.locator('.sh-readiness')).not.toContainText('0%')
})

test('длинное название и резервный источник остаются доступны на 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await mockApi(page)
  const result = fixture('recommendations-fallback.json')
  result.items[0].title.ru = 'ОченьДлинноеНазваниеАктивностиБезПробеловДляПроверкиМасштабированияИнтерфейса'
  await page.route('**/recommendations', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) }))
  await login(page)
  await expect(page.getByText(result.items[0].title.ru)).toBeVisible()
  await expect(page.getByText('По правилам')).toBeVisible()
  await expect(page.getByText(result.items[0].evidence[0].text).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
