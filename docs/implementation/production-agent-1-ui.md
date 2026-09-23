# A1 — рабочий редизайн, сотрудник и общие компоненты

## Готовый промпт агенту

Ты — A1. Реализуй новый дизайн ШАГРЫ в рабочем React-приложении. Требуется реализация с настоящим API, а не макет или новый план. Доведи свой пакет до сборки и браузерной проверки.

Сначала прочитай [общий план](../superpowers/plans/2026-09-23-production-redesign.md), [требования](frontend-design-requirements.md), [референс](a3-template.jpg), `docs/validation/ui/redesign/README.md`, исходные `frontend/src/App.tsx`, `api.ts`, `types.ts`. Посмотри четыре PNG и CSS макетов. Следуй владению файлами и интерфейсам общего плана. A2 делает HR/импорт, A3 — API и выпуск.

## Задача 1. Общая система и интерфейсы для A2

**Файлы:** `frontend/src/shared/ui/*`, `shared/lib/format.ts`, `shared/styles/*`, `frontend/src/types.ts`, `frontend/public/fonts/*`, `frontend/package*.json` при необходимости.

**Потребляет:** текущие API-типы, palette/geometry требований, локальные font assets и лицензии из макетов.

**Выдаёт:** точный UI-barrel и форматирование из §3 общего плана, обязательные role_name в типах, тёмные tokens.

- [ ] Перенеси локальные шрифты в production-assets; не импортируй файлы из docs в production runtime. Передай A3 список фактически используемых шрифтов/иконок для THIRD_PARTY.
- [ ] Создай общие компоненты с API из общего плана. Обработай focus-visible, disabled/busy и ARIA.
- [ ] Замени глобальную палитру; исключи конфликт `table-caption`. Глобальные компонентные классы — `sh-*` или CSS Modules.
- [ ] Проверь `npm --prefix frontend run build`; передай A2 SHA общего каркаса, не дожидаясь остальных экранов.

## Задача 2. Оболочка, вход и маршруты

**Файлы:** `frontend/src/app/*`, `pages/auth/*`, `App.tsx`, `main.tsx`, `style.css`.

- [ ] Реализуй desktop-sidebar 216 px, tablet-rail 72 px и mobile bottom navigation по требованиям. Не добавляй пустые разделы.
- [ ] Добавь `/me`, `/me/skills`, `/me/history`, сохрани `/hr`, `/hr/import`, `/employees/:id`. HR-профиль имеет вкладки через `?tab=overview|skills|history`.
- [ ] Роль и сотрудник берутся только из `/auth/me`. Состояние загрузки сессии не показывай как ошибку входа. При истечении сессии отправляй на login без бесконечного retry.
- [ ] Реализуй тёмный login; покажи отдельные подписи логина и пароля для синтетических демо-аккаунтов. Не отключай проверку Origin.
- [ ] Используй две страницы A2 по точным путям общего плана. Подключай их после поставки A2, без заглушек в итоговом commit.

## Задача 3. Профиль, навыки, история, рекомендации

**Файлы:** `pages/employee/*`, `entities/employee/*`, `entities/skill/*`, `features/recommendations/*`.

- [ ] Раздели существующий ProfilePage на получение состояния и представление; перенос существующей логики не должен потерять обработку ошибок/версий.
- [ ] Выполни порядок первого экрана из требований: краткая сводка и первый CTA раньше подробностей. На 390 × 844 CTA целиком виден.
- [ ] Покажи карту всех навыков с легендой и доступным выбором. Сортируй топ-дефициты по gap desc и названию; null не равен нулю.
- [ ] Реализуй полный раздел навыков с поиском/фильтрами и отдельную историю с датами/статусами. Навыки без цели — отдельное состояние.
- [ ] Используй `item.preview` для результата, evidence/ref для объяснения, source/fallback_reason для честной подписи источника. Не пересчитывай coverage самостоятельно.
- [ ] Сохраняй excluded IDs при навигации внутри одного профиля; очищай при смене сотрудника, logout и успешном выполнении. Не повторяй AI-запрос от открытия доказательств или меню.
- [ ] Обработай все статусы RecommendationResult, ошибки, retry и состояние отсутствующих данных без искусственных карточек.

## Задача 4. Реальная примерка и запись

**Файлы:** `features/preview/*`, `features/completion/*`, общий диалог в `shared/ui/*`.

- [ ] Вызови preview для A/B с одинаковыми employee_version/dataset_version. Результат B не складывается с A.
- [ ] Покажи числа и шкалы before/after/target/remaining_gap. В подтверждении используй названия навыков из profile.skill_rows, а не `BACKEND_06`.
- [ ] Подпиши выполнение как действие над вариантом A и назови активность в диалоге.
- [ ] Исправь начальный фокус и Shift+Tab: фокус никогда не уходит под диалог. Поддержи Escape, возврат на исходный элемент и блокировку фонового скролла.
- [ ] Во время отправки нельзя закрыть подтверждение через Escape/backdrop и потерять состояние операции. При сетевом retry используй тот же ключ и тело; при 409 перечитай данные без автоматической повторной записи.
- [ ] После success обнови профиль/историю/рекомендации и очисти устаревшую примерку.

## Задача 5. Доказательство результата

**Файлы тестов:** `frontend/tests/employee-redesign.spec.ts`, `frontend/tests/fixtures/employee-redesign.ts`.

Пиши регрессионные проверки на конкретные ошибки до исправления. Для статических стилей достаточно браузерной сверки; не тестируй каждый CSS-класс.

```ts
// После входа и загрузки рекомендаций на viewport 390 × 844:
const cta = page.getByRole('button', { name: 'Примерить', exact: true }).first()
const box = await cta.boundingBox()
expect(box).not.toBeNull()
expect(box!.y).toBeGreaterThanOrEqual(0)
expect(box!.y + box!.height).toBeLessThanOrEqual(844)
await cta.click()
await page.keyboard.press('Shift+Tab')
expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
await page.keyboard.press('Escape')
await expect(cta).toBeFocused()
```

- [ ] Проверь unknown skill/no next grade/no recommendation, длинное название, 200% zoom, fallback и истечение сессии.
- [ ] Через interception completion зафиксируй Idempotency-Key и body первой неудачной попытки; при retry сравни их на равенство. Preview должен отправлять только `/preview`, а не `/completions`.
- [ ] Запусти build и свои Playwright-тесты; согласуй с A3 установку браузеров в окружении.
- [ ] Проверь настоящий backend в отдельной тестовой среде A3: вход, примерка, выполнение, обновление.
- [ ] Снимки desktop/mobile передай A3 для `docs/validation/release`. Сверь с референсом и макетами; копирование всех дефектов макета не требуется.

Команды: `npm --prefix frontend run build`; `npm --prefix frontend run test:e2e -- tests/employee-redesign.spec.ts`. До появления конфигурации A3 не запускай live-test против пользовательской БД.

**Готово:** весь сотруднический сценарий работает в новом оформлении через API; HR-страницы A2 подключены; нет старого светлого UI, служебных обозначений и дефекта фокуса. Отчёт: SHA, команды, viewport, доказательства и незакрытые зависимости. Не редактируй backend и файлы A2/A3.
