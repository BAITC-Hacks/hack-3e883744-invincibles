import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { login, logout, mockApi } from './helpers'
const screenshotDir = resolve(process.cwd(), '../docs/validation/ui/simple')

test('язык и тема сохраняются; настройки и разделы не перезапрашивают рекомендации', async ({
  page,
}) => {
  const state = await mockApi(page)
  await login(page)
  await expect(
    page.getByRole('button', { name: 'Примерить шаг', exact: true }),
  ).toBeVisible()
  const before = state.recommendations
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(
    page.getByRole('heading', { name: 'My development', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Preview step', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Light theme', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'KZ', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Менің дамуым', exact: true }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
  await page.getByRole('button', { name: 'RU', exact: true }).click()
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'Навыки', exact: true })
    .click()
  await expect(page).toHaveURL(/\/me\/skills/)
  await page.getByRole('searchbox', { name: 'Найти навык' }).fill('Python')
  await expect(page.locator('.sh-skill-list h3')).toHaveCount(1)
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'История', exact: true })
    .click()
  await expect(
    page.getByText('Пока нет записей', { exact: true }),
  ).toBeVisible()
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'Обзор', exact: true })
    .click()
  expect(state.recommendations).toBe(before)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'My development', exact: true }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('примерка не меняет профиль; сравнение, клавиатура и подтверждение работают', async ({
  page,
}) => {
  const state = await mockApi(page)
  await login(page)
  const button = page.getByRole('button', {
    name: 'Примерить шаг',
    exact: true,
  })
  await button.click()
  const dialog = page.getByRole('dialog', { name: 'Примерка шага' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('45,7%', { exact: true })).toBeVisible()
  const reads = state.profileReads
  await dialog
    .getByRole('checkbox', { name: 'Сравнить с другой активностью' })
    .check()
  await expect(dialog.getByText('45,7%', { exact: true })).toHaveCount(2)
  expect(state.profileReads).toBe(reads)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(
    dialog.getByRole('button', { name: 'Подтвердить выполнение A' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
  await button.click()
  await page.getByRole('button', { name: 'Подтвердить выполнение A' }).click()
  await page.getByRole('button', { name: 'Да, выполнено', exact: true }).click()
  await expect(page.locator('.sh-notice[role=status]')).toContainText(
    'Выполнение записано.',
  )
  await expect.poll(() => state.profileReads).toBeGreaterThan(reads)
  expect(state.completionRequests).toHaveLength(1)
})

test('повтор после сетевой ошибки использует прежний ключ и тело', async ({
  page,
}) => {
  const state = await mockApi(page, { retryCompletion: true })
  await login(page)
  await page.getByRole('button', { name: 'Уже выполнил', exact: true }).click()
  await page.getByRole('button', { name: 'Да, выполнено', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Повторить сохранение' }).click()
  await expect(page.locator('.sh-notice[role=status]')).toContainText(
    'Выполнение записано.',
  )
  expect(state.completionRequests).toHaveLength(2)
  expect(state.completionRequests[0]).toEqual(state.completionRequests[1])
  expect(state.completionRequests[0].key).toBeTruthy()
})

test('устаревшая примерка закрывается и обновляет профиль', async ({
  page,
}) => {
  const state = await mockApi(page, { stalePreview: true })
  await login(page)
  const before = state.profileReads
  await page.getByRole('button', { name: 'Примерить шаг', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.sh-notice[role=status]')).toContainText(
    'Профиль изменился.',
  )
  await expect.poll(() => state.profileReads).toBeGreaterThan(before)
  expect(state.completionRequests).toHaveLength(0)
})

test('ошибка рекомендаций допускает повтор; профиль остаётся доступным', async ({
  page,
  browserName,
}) => {
  await mockApi(page, { failedRecommendations: true })
  await login(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Готовность навыков' }),
  ).toBeVisible()
  if (browserName === 'chromium') {
    mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({
      path: resolve(screenshotDir, 'profile-error.png'),
      animations: 'disabled',
    })
  }
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Примерить шаг', exact: true }),
  ).toBeVisible()
})

test('исключение сохраняется между разделами одного сотрудника', async ({
  page,
}) => {
  const state = await mockApi(page)
  await login(page)
  await page.getByRole('button', { name: 'Другой шаг', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Подходящего шага пока нет' }),
  ).toBeVisible()
  const before = state.recommendations
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'Навыки', exact: true })
    .click()
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'Обзор', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Подходящего шага пока нет' }),
  ).toBeVisible()
  expect(state.recommendations).toBe(before)
})

test('HR: таблицы раскрываются, поиск и страницы сохраняются в URL, импорт разделён', async ({
  page,
}) => {
  const state = await mockApi(page)
  await login(page, 'hr')
  await expect(page.locator('.sh-report')).not.toHaveAttribute('open', '')
  await page.locator('.sh-report > summary').click()
  await expect(page.locator('.sh-desktop-table tbody tr')).toHaveCount(10)
  await page.getByRole('button', { name: 'Следующая страница' }).click()
  await expect(page).toHaveURL(/page=2/)
  await page.getByRole('button', { name: 'Участие', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Участие', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox', { name: 'Поиск в таблице' }).fill('Разбор')
  await expect
    .poll(() => new URL(page.url()).searchParams.get('q'))
    .toBe('Разбор')
  await page.reload()
  await expect(
    page.getByRole('searchbox', { name: 'Поиск в таблице' }),
  ).toHaveValue('Разбор')
  await page.getByLabel('Найти сотрудника по ID', { exact: true }).fill('E0001')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await page.locator('.sh-search-results').getByRole('link').click()
  await expect(page).toHaveURL(/\/employees\/E0001/)
  await page.getByRole('link', { name: 'Назад · HR' }).click()
  await page
    .locator('.sh-page-heading')
    .getByRole('link', { name: 'Импорт', exact: true })
    .click()
  await expect(page.locator('.sh-import-review')).toHaveCount(0)
  await page
    .getByLabel('Профили сотрудников', { exact: true })
    .setInputFiles({
      name: 'employees.json',
      mimeType: 'application/json',
      buffer: Buffer.from('[{"employee_id":"E9999"}]'),
    })
  await page
    .getByLabel('История активностей', { exact: true })
    .setInputFiles({
      name: 'activity_history.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'history_id,employee_id,event_id,status,occurred_at\n',
      ),
    })
  await page
    .getByRole('button', { name: 'Проверить файлы', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Файлы прошли проверку.')
  expect(state.commits).toBe(0)
  await page.getByRole('button', { name: 'Подтвердить и применить' }).click()
  await expect(
    page.getByRole('link', { name: 'Открыть профиль E9999' }),
  ).toBeVisible()
  expect(state.commits).toBe(1)
})

for (const width of [320, 390, 768, 1280, 1440])
  test(`обе темы и основные страницы без переполнения ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await login(page)
    await expect(
      page.getByRole('button', { name: 'Примерить шаг', exact: true }),
    ).toBeVisible()
    for (const theme of ['dark', 'light']) {
      if (theme === 'light')
        await page
          .getByRole('button', { name: 'Светлая тема', exact: true })
          .click()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1)
      if (width === 390) {
        const box = await page
          .getByRole('button', { name: 'Примерить шаг', exact: true })
          .boundingBox()
        const nav = await page.locator('.sh-bottomnav').boundingBox()
        expect(box!.y + box!.height).toBeLessThan(nav!.y)
      }
      if (browserName === 'chromium' && [390, 1440].includes(width)) {
        mkdirSync(screenshotDir, { recursive: true })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({
          path: resolve(screenshotDir, `profile-${width}-${theme}.png`),
          animations: 'disabled',
        })
      }
    }
    await page
      .getByRole('button', { name: 'Примерить шаг', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await logout(page)
    await page.getByLabel('Логин', { exact: true }).fill('hr')
    await page.getByLabel('Пароль', { exact: true }).fill('demo-hr')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Развитие команды', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1)
    if (browserName === 'chromium' && [390, 1440].includes(width))
      await page.screenshot({
        path: resolve(screenshotDir, `hr-${width}-light.png`),
        animations: 'disabled',
      })
    await page.locator('.sh-report > summary').click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1)
    if (width < 768) {
      await page.locator('.sh-mobile-table summary').first().click()
      await expect(page.locator('.sh-mobile-table details[open]')).toHaveCount(
        1,
      )
    }
    await page
      .locator('.sh-page-heading')
      .getByRole('link', { name: 'Импорт', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Импорт профилей и истории' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

test('увеличение 200%, reduced motion и языки на узком экране', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await login(page)
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  for (const locale of ['KZ', 'EN', 'RU']) {
    await page.getByRole('button', { name: locale, exact: true }).click()
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false)
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1'
  })
  await page.setViewportSize({ width: 320, height: 844 })
  for (const locale of ['KZ', 'EN', 'RU']) {
    await page.getByRole('button', { name: locale, exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1)
  }
})

test('контраст текста и элементов управления в обеих темах', async ({
  page,
}) => {
  await mockApi(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page)
  for (const theme of ['dark', 'light']) {
    if (theme === 'light')
      await page
        .getByRole('button', { name: 'Светлая тема', exact: true })
        .click()
    const pairs = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const luminance = (token: string) => {
        const value = style.getPropertyValue(token).trim()
        const channels = value
          .slice(1)
          .match(/../g)!
          .map((v) => parseInt(v, 16) / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        )
      }
      const pairs: Array<{
        foreground: string
        background: string
        ratio: number
        minimum: number
      }> = []
      for (const foreground of [
        '--text-primary',
        '--text-secondary',
        '--text-muted',
        '--positive',
        '--negative',
        '--warning',
      ])
        for (const background of ['--bg-app', '--bg-panel', '--bg-raised']) {
          const values = [luminance(foreground), luminance(background)].sort(
            (a, b) => b - a,
          )
          pairs.push({
            foreground,
            background,
            ratio: (values[0] + 0.05) / (values[1] + 0.05),
            minimum: 4.5,
          })
        }
      for (const [foreground, background, minimum] of [
        ['--on-accent', '--accent', 4.5],
        ['--border-control', '--bg-panel', 3],
      ] as const) {
        const values = [luminance(foreground), luminance(background)].sort(
          (a, b) => b - a,
        )
        pairs.push({
          foreground,
          background,
          ratio: (values[0] + 0.05) / (values[1] + 0.05),
          minimum,
        })
      }
      return pairs
    })
    for (const pair of pairs)
      expect(
        pair.ratio,
        `${theme}: ${pair.foreground}/${pair.background}`,
      ).toBeGreaterThanOrEqual(pair.minimum)
  }
})

test('загрузка и отсутствие шага сохраняют доступ к профилю', async ({
  page,
  browserName,
}) => {
  await mockApi(page, { noStep: true, delayedRecommendations: 1500 })
  await login(page)
  await expect(
    page.getByRole('heading', { name: 'Готовность навыков' }),
  ).toBeVisible()
  if (browserName === 'chromium') {
    mkdirSync(screenshotDir, { recursive: true })
    await page.screenshot({
      path: resolve(screenshotDir, 'profile-loading.png'),
      animations: 'disabled',
    })
  }
  await expect(
    page.getByRole('heading', { name: 'Подходящего шага пока нет' }),
  ).toBeVisible()
  if (browserName === 'chromium')
    await page.screenshot({
      path: resolve(screenshotDir, 'profile-empty.png'),
      animations: 'disabled',
    })
  await page
    .locator('.sh-sidebar')
    .getByRole('link', { name: 'Навыки', exact: true })
    .click()
  await expect(
    page.getByRole('searchbox', { name: 'Найти навык' }),
  ).toBeVisible()
})
