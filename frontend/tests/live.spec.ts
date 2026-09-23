import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('живой backend: вход, примерка, выполнение, HR-импорт и новый профиль', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const directory = resolve(process.cwd(), '../docs/validation/ui/simple')
  mkdirSync(directory, { recursive: true })
  async function capture(view: string) {
    for (const theme of ['dark', 'light']) {
      const current = await page.locator('html').getAttribute('data-theme')
      if (current !== theme)
        await page
          .getByRole('button', {
            name: theme === 'light' ? 'Светлая тема' : 'Тёмная тема',
            exact: true,
          })
          .click()
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: resolve(directory, `live-${view}-${width}-${theme}.png`),
          animations: 'disabled',
        })
      }
    }
  }
  const recommendationResponse = page.waitForResponse((response) =>
    response.url().endsWith('/recommendations'),
  )
  await page.goto('/')
  await page.getByLabel('Логин').fill('employee')
  await page.getByLabel('Пароль').fill('demo-employee')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByText('ID E0001', { exact: false })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Ваш следующий шаг' }),
  ).toBeVisible()
  const recommendation = await recommendationResponse
  expect(recommendation.status()).toBe(200)
  const recommendationBody = await recommendation.json()
  expect(recommendationBody.status).toBe('ready')
  expect(['llm', 'deterministic_fallback']).toContain(recommendationBody.source)
  await expect(
    page.getByRole('button', { name: 'Примерить шаг', exact: true }).first(),
  ).toBeVisible()
  await capture('profile')
  const before = await page.evaluate(async () =>
    (await fetch('/api/v1/employees/E0001', { credentials: 'include' })).json(),
  )
  await page
    .getByRole('button', { name: 'Примерить шаг', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Примерка шага' }),
  ).toBeVisible()
  await expect(
    page.getByText('Примерка не меняет профиль и историю.'),
  ).toBeVisible()
  await page
    .getByRole('checkbox', { name: 'Сравнить с другой активностью' })
    .check()
  await expect(page.locator('.sh-compare-column')).toHaveCount(2)
  await page.screenshot({
    path: resolve(directory, 'live-preview.png'),
    animations: 'disabled',
  })
  const afterPreview = await page.evaluate(async () =>
    (await fetch('/api/v1/employees/E0001', { credentials: 'include' })).json(),
  )
  expect(afterPreview.employee_version).toBe(before.employee_version)
  expect(afterPreview.history.length).toBe(before.history.length)
  await page.getByRole('button', { name: 'Подтвердить выполнение A' }).click()
  const completionResponse = page.waitForResponse((response) =>
    response.url().endsWith('/completions'),
  )
  await page.getByRole('button', { name: 'Да, выполнено' }).click()
  expect((await completionResponse).status()).toBe(201)
  await expect(
    page.getByText('Выполнение записано.', { exact: false }),
  ).toBeVisible()
  const afterCompletion = await page.evaluate(async () =>
    (await fetch('/api/v1/employees/E0001', { credentials: 'include' })).json(),
  )
  expect(afterCompletion.employee_version).toBe(before.employee_version + 1)
  expect(afterCompletion.history.length).toBe(before.history.length + 1)
  await page.locator('.sh-sidebar-account').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Выйти', exact: true })
    .click()
  await page.getByLabel('Логин').fill('hr')
  await page.getByLabel('Пароль').fill('demo-hr')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Развитие команды' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Что развивать в первую очередь' }),
  ).toBeVisible()
  await capture('hr')
  await page
    .locator('.sh-page-heading')
    .getByRole('link', { name: 'Импорт', exact: true })
    .click()
  const employee = JSON.parse(
    readFileSync(
      resolve(process.cwd(), '../data/synthetic/employees.json'),
      'utf8',
    ),
  )[0]
  employee.employee_id = `A3_${Date.now().toString(36).toUpperCase()}`
  await page
    .getByLabel('Профили сотрудников')
    .setInputFiles({
      name: 'employees.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([employee])),
    })
  await page
    .getByLabel('История активностей')
    .setInputFiles({
      name: 'activity_history.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'history_id,employee_id,event_id,status,occurred_at\n',
      ),
    })
  await page.getByRole('button', { name: 'Проверить файлы' }).click()
  await expect(
    page.getByText('Файлы прошли проверку.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Подтвердить и применить' }).click()
  await expect(
    page.getByRole('link', { name: `Открыть профиль ${employee.employee_id}` }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: `Открыть профиль ${employee.employee_id}` })
    .click()
  await expect(
    page.getByText(`ID ${employee.employee_id}`, { exact: false }),
  ).toBeVisible()
})
