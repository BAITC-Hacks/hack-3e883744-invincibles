import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('живой backend: вход, профиль, HR-импорт и новый профиль', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Логин').fill('employee')
  await page.getByLabel('Пароль').fill('demo-employee')
  await page.getByRole('button', { name: 'Войти →' }).click()
  await expect(page.getByText('ID E0001', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ваш следующий шаг' })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти' }).click()
  await page.getByLabel('Логин').fill('hr')
  await page.getByLabel('Пароль').fill('demo-hr')
  await page.getByRole('button', { name: 'Войти →' }).click()
  await expect(page.getByRole('heading', { name: 'Где нужен следующий шаг' })).toBeVisible()
  await page.getByRole('link', { name: 'Импортировать данные' }).click()
  const employee = JSON.parse(readFileSync(resolve(process.cwd(), '../data/synthetic/employees.json'), 'utf8'))[0]
  employee.employee_id = 'A3_CHECK_01'
  await page.getByLabel('Профили сотрудников').setInputFiles({ name: 'employees.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([employee])) })
  await page.getByLabel('История активностей').setInputFiles({ name: 'activity_history.csv', mimeType: 'text/csv', buffer: Buffer.from('history_id,employee_id,event_id,status,occurred_at\n') })
  await page.getByRole('button', { name: 'Проверить файлы' }).click()
  await expect(page.getByText('Файлы прошли проверку.')).toBeVisible()
  await page.getByRole('button', { name: 'Подтвердить и применить' }).click()
  await expect(page.getByRole('link', { name: 'Открыть профиль A3_CHECK_01' })).toBeVisible()
  await page.getByRole('link', { name: 'Открыть профиль A3_CHECK_01' }).click()
  await expect(page.getByText('ID A3_CHECK_01', { exact: false })).toBeVisible()
})
