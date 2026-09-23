# ШАГРА: перенос редизайна в рабочий билд — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement your assigned package task-by-task. Координация трёх исполнителей описана ниже; самостоятельно расширять команду не требуется.

**Goal:** Один рабочий Docker-билд с новым тёмным React-интерфейсом, настоящим API, исправленными дефектами и проверенным полным сценарием.

**Architecture:** Существующий FastAPI/SQLite и расчёты сохраняются. React делится на оболочку, страницы, функции и общие компоненты. Макеты используются как визуальная основа; их статические данные и демонстрационные обработчики не попадают в production.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, FastAPI, Pydantic, SQLite, Playwright, pytest, Docker Compose.

**Spec:** [Требования к frontend](../../implementation/frontend-design-requirements.md), [основная спецификация](../specs/2026-09-23-shagra-design.md), [визуальный референс](../../implementation/a3-template.jpg).

## Global Constraints

- Все API-запросы идут на `/api/v1` с `credentials: include`; ключ AI существует только на сервере.
- Preview не изменяет профиль. Выполнение и импорт требуют отдельного подтверждения.
- Неизвестный уровень не превращается в ноль; покрытие навыков не называется вероятностью повышения.
- Сохранить Idempotency-Key при повторе операции и проверку employee_version/dataset_version.
- Первый CTA виден целиком при 390 × 844 и масштабе 100%. При увеличении текста допускается вертикальный рост.
- Проверяемые ширины: 320, 390, 768, 1280, 1440 px. Контраст текста не менее 4,5:1, интерактивная область не менее 44 × 44 px.
- Никаких `window.SHAGRA_DESIGN`, hardcoded E0001, фальшивого сохранения и production-зависимости от `docs/validation/ui/redesign/data.js`.
- Не использовать реальную demo-БД для тестовых completion/import. Не удалять рабочие тома Docker.
- Не печатать `.env`, ключи, cookies и развёрнутый Compose environment в отчётах.
- Не менять провайдера AI, промпт ранжирования и расчёт прогресса ради редизайна.
- Не добавлять чат, уведомления, календарь, валюту, рейтинги и пустые разделы меню.
- Запрет на один общий «волшебный» процент готовности: результат подтверждается критериями и командами.

## Review Focus

1. Неизвестный навык, отсутствующий следующий грейд и отсутствие рекомендации: UI не показывает ложный ноль и не падает. Проверки A1.
2. Двойное подтверждение, сетевая ошибка после записи и устаревшая версия: нет повторного начисления и автоматической записи в новый контекст. Проверки A1/A3.
3. Замена профиля импортом, истёкшая проверка, смена файла после validate: нет скрытого применения и устаревшего commit. Проверки A2/A3.
4. Shift+Tab сразу после открытия диалога, Escape, touch, длинные русские строки и 200% zoom: управление остаётся доступным. Проверки A1/A2.
5. Перезапуск контейнера, прямой URL, неверный Origin и временная недоступность AI: данные сохраняются, маршруты работают, fallback обозначен. Проверки A3.

## 1. Три пакета

| Исполнитель | Задание | Ответственность |
|---|---|---|
| A1 | [Рабочий интерфейс сотрудника и общая UI-система](../../implementation/production-agent-1-ui.md) | Тема, меню, маршруты, вход, профиль, навыки, история, рекомендации, примерка, выполнение, общие компоненты |
| A2 | [Рабочий HR-интерфейс и импорт](../../implementation/production-agent-2-hr.md) | HR-сводка, поиск, таблицы, фильтры, пагинация, реальный импорт |
| A3 | [API, сборка и итоговая проверка](../../implementation/production-agent-3-api-release.md) | Названия ролей, evidence, контракты, тестовая инфраструктура, Docker, сквозной запуск и итоговый отчёт |

Задания предназначены для выполнения в отдельных задачах/ветках. Создание этих файлов само по себе не запускает агентов. Если агенты работают в одной директории, обязательно соблюдать владение файлами; не запускать одновременно git merge/rebase/checkout.

## 2. Владение файлами

**A1:** `frontend/src/App.tsx`, `main.tsx`, `style.css`, `api.ts`, `types.ts`; `frontend/src/app/**`, `shared/**`, `entities/**`; страницы `pages/auth/**`, `pages/employee/**`; функции `features/recommendations/**`, `features/preview/**`, `features/completion/**`; `frontend/public/**`; `frontend/package.json`, `package-lock.json`; `frontend/tests/employee-redesign.spec.ts` и его собственные fixtures `frontend/tests/fixtures/employee-redesign.ts`.

**A2:** `frontend/src/pages/hr/**`; `frontend/src/features/hr/**`, `features/import/**`; `frontend/tests/hr-redesign.spec.ts`, `frontend/tests/fixtures/hr-redesign.ts`.

**A3:** `backend/**`, `contracts/**`, `tools/**`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `.github/**`, `README.md`, `THIRD_PARTY.md`, `docs/DEMO.md`; `frontend/playwright*.config.ts`, `frontend/tests/ui.spec.ts`, `frontend/tests/live.spec.ts`; `docs/validation/release/**`; новый `start-app.sh`.

`start-design.sh` и `docs/validation/ui/redesign/**` сохраняются как предпросмотр и исторические материалы. Они не должны запускаться вместо рабочего приложения. Требования не переписывать под ограничения собственной реализации.

Зависимости и lock меняет только A1. A2/A3 передают ему точную потребность. Исправление в чужом файле передаётся владельцу с воспроизведением; финальный merge выполняет координатор, а не три агента одновременно.

## 3. Зафиксированные интерфейсы

### 3.1. HTTP и типы

Существующие экспорты `api`, `ApiError`, `errorText`, `isAbort` из `frontend/src/api.ts` сохранить. Сигнатуры HTTP-методов не менять. Существующие типы из `frontend/src/types.ts` сохраняются; A1 добавляет обязательное `role_name: LocalizedText` в `EmployeeList.items[]` и `HrOverview.no_step[]`. A3 добавляет те же поля на backend и в контрактные примеры.

```ts
type LocalizedText = { en: string; ru: string | null; kk: string | null }
// GET /api/v1/employees
type EmployeeListItem = {
  employee_id: string; role_id: string; role_name: LocalizedText; grade: string
}
// GET /api/v1/hr/overview -> no_step[]
type NoStepRow = {
  employee_id: string; role_id: string; role_name: LocalizedText; reason: string
}
```

Новые поля аддитивные; существующие имена и семантика не меняются. Названия берутся из каталога ролей SQLite, не из словаря макета. Все fixtures обновляет их владелец; A3 обновляет contracts/examples и существующие общие тесты.

### 3.2. Входы страниц A2

```tsx
// frontend/src/pages/hr/HrOverviewPage.tsx
export default function HrOverviewPage(): React.JSX.Element
// frontend/src/pages/hr/HrImportPage.tsx
export default function HrImportPage(): React.JSX.Element
```

Страницы A2 рендерят только содержимое рабочей области. Навигацию, main, сессию и защиту роли обеспечивает оболочка A1. A1 подключает их к `/hr` и `/hr/import`. Профиль `/employees/:id` реализует A1; A2 делает ссылку на этот маршрут.

### 3.3. Общие компоненты A1 для A2

Экспорты находятся в `frontend/src/shared/ui/index.ts`. Для props разрешены указанные HTML-атрибуты; className не заменяет общую тему.

```ts
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean
}
export type PanelProps = HTMLAttributes<HTMLElement> & { children: ReactNode }
export type PageHeaderProps = { title: string; description?: string; actions?: ReactNode }
export type StatProps = { label: string; value: ReactNode; hint?: ReactNode }
export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: string; error?: string
}
export type EmptyStateProps = { title: string; description?: string; action?: ReactNode }
export type ErrorStateProps = { message: string; onRetry?: () => void; busy?: boolean }
export type SkeletonProps = HTMLAttributes<HTMLDivElement>
// Barrel экспортирует компоненты Button, Panel, PageHeader, Stat,
// Field, EmptyState, ErrorState, Skeleton с соответствующими props.
```

Field связывает label/hint/error с input, используя id/useId. Button с busy отключает повторное нажатие и сообщает aria-busy. Panel — section. PageHeader содержит единственный h1 страницы; оболочка не дублирует h1. Сложную HR-таблицу и upload-поля A2 реализует внутри своего пакета, используя общие tokens.

`frontend/src/shared/lib/format.ts` экспортирует `localized(value: LocalizedText): string`, `formatPercent(value: number | null): string`, `formatDate(value: string): string`. Locale ru-RU; null → «нет данных»; даты истории отображаются как дата, время импорта — отдельным форматированием A2.

## 4. Порядок работы и интеграции

### Контрольная точка 1 — основа

- [ ] A1 выпускает общий UI-barrel, tokens, форматирование и расширенные TypeScript-типы. Старый App пока остаётся собираемым.
- [ ] A3 выпускает исправленные evidence, role_name и контрактные примеры с тестами.
- [ ] A2 параллельно создаёт HR-модель фильтров/сортировки и страницы по интерфейсам §3; до получения основы не создаёт собственную копию shared UI.
- [ ] Владельцы передают SHA коммитов координатору. Коммиты основы интегрируются до подключения новых страниц.

### Контрольная точка 2 — интерфейсы

- [ ] A1 реализует сотрудника, вход, оболочку и диалоги; A2 — HR и импорт.
- [ ] A2 передаёт два default-export страницы и свои проверки.
- [ ] A1 подключает страницы A2 и заменяет старый App. Сборка выполняется на объединённом дереве.
- [ ] Старые monolithic-компоненты и несовместимые стили удаляет A1 после переноса всех их функций.

### Контрольная точка 3 — выпуск

- [ ] A3 получает объединённые изменения, обновляет старые тестовые селекторы и запускает общую проверку.
- [ ] Найденные дефекты возвращаются A1/A2 по владению; после исправлений повторяется затронутая проверка.
- [ ] A3 проверяет чистый Compose-запуск и перезапуск на отдельном project/volume.
- [ ] Координатор получает один итоговый отчёт с SHA проверенного дерева. При непроверенном Docker/браузере релиз не объявляется полностью проверенным.

## 5. Условия общего завершения

```text
React production build → FastAPI static serving → login → overview
→ real recommendations → preview A/B → completion → updated profile/history
→ HR login → overview/search → validate import → confirm → new profile
→ app/container restart → persisted state and direct URL work
```

Все шаги выполняются в новом тёмном интерфейсе. Наличие старого рабочего UI рядом с новым статическим макетом не удовлетворяет задаче. Сборка не зависит от `start-design.sh`, data.js макета и сервера предпросмотра.

Коммиты — отдельные, на английском, только по принадлежащим пакету файлам. Не использовать `git add .` без просмотра. Не выполнять force push. Публикацию итоговой ветки координирует владелец репозитория.

## 6. Исходное состояние для сравнения

Аудит перед началом: build проходит; 42 pytest проходят; kit validator проходит; OpenAPI совпадает с runtime; живые Q1–Q3 OpenAI проходят. Backend-сценарий проверен на временной БД. Новый дизайн ещё не встроен. Playwright не стартует без браузеров; Docker daemon недоступен текущему пользователю. Не принимать эти ограничения за разрешение пропустить итоговую проверку.

Формат отчёта каждого агента: SHA; изменённые файлы; закрытые критерии; команды и результаты; оставшиеся ограничения; изменения, ожидаемые от соседнего агента. Если доступа к Docker/браузеру нет, указать точную причину и воспроизводимую команду для завершения проверки.
