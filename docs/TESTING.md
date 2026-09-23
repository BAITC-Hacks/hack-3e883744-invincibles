# Проверка проекта

[Документация](README.md) · [Русский](../README.md) · [Қазақша](../README.kk.md) · [English](../README.en.md)

Проверки разделены на расчётные правила, браузер с подставленными ответами, живую интеграцию и реальные вызовы AI. Успех одной группы не подменяет другую. Зависимости устанавливаются по README; команды ниже выполняются из корня репозитория.

## Быстрая проверка

```bash
.venv/bin/python -m pytest -q
.venv/bin/python tools/validate_kit.py
.venv/bin/python -m pip check
npm --prefix frontend run build
docker compose config --quiet
```

В PowerShell замените `.venv/bin/python` на `.\.venv\Scripts\python.exe`. `docker compose config --quiet` проверяет конфигурацию, но не сборку образа и не доступ к Docker daemon. Не выводите полный `docker compose config` в общий чат: раскрытая конфигурация может содержать ключ API.

Backend-тесты проверяют авторизацию, допуск, расчёты, неизвестные навыки, версии, повторные операции, импорт и валидацию AI. Валидатор кита проверяет ссылки, распределение профилей, период истории и полезность каталога. `pip check` проверяет совместимость установленных зависимостей.

## Браузерные сценарии

```bash
cd frontend
npx playwright install chromium
npm run test:e2e -- --project=chromium --workers=1
```

Конфигурация сама запускает Vite. Обычный набор подставляет API-ответы, чтобы воспроизводимо проверить загрузку, ошибки, пустые состояния, навигацию, темы, языки, формы, клавиатуру и адаптивность.

Для всех трёх движков установите их через `npx playwright install chromium firefox webkit`, затем выполните `npm run test:e2e`. На Linux при отсутствии библиотек используйте [официальную установку системных зависимостей](https://playwright.dev/docs/browsers): `npx playwright install --with-deps`.

Тесты сохраняют trace при сбое в игнорируемый `frontend/test-results/`. Часть сценариев также обновляет отслеживаемые PNG в `docs/validation/ui/simple`: проверяйте `git diff` перед коммитом, чтобы случайно не заменить исходные снимки.

## Живой backend: отдельная БД

Live-тест выполняет реальное начисление и импорт. Используйте новую временную директорию для каждого прогона. Порт 18080 должен быть свободен. Обычная БД демо и ключ из `.env` для этого сценария не нужны.

Linux/macOS, терминал 1 из корня проекта:

```bash
export SHAGRA_TEST_DIR="$(mktemp -d)"
export DATABASE_PATH="$SHAGRA_TEST_DIR/shagra.sqlite3"
export SESSION_SECRET_PATH="$SHAGRA_TEST_DIR/session-secret"
export AI_USAGE_PATH="$SHAGRA_TEST_DIR/ai-usage.json"
export KIT_PATH="$PWD/data/synthetic"
export FRONTEND_DIST="$PWD/frontend/dist"
export APP_ORIGIN=http://localhost:18080
export AI_PROVIDER=openai
export OPENAI_API_KEY=''
export COOKIE_SECURE=false
export DEMO_EMPLOYEE_PASSWORD=demo-employee
export DEMO_HR_PASSWORD=demo-hr
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 18080
```

Терминал 2 из корня проекта:

```bash
LIVE_BASE_URL=http://localhost:18080 npm --prefix frontend run test:e2e:live
```

Windows PowerShell, терминал 1:

```powershell
$shagraTestDir = Join-Path $env:TEMP ("shagra-test-" + [guid]::NewGuid().ToString('N'))
$env:DATABASE_PATH = "$shagraTestDir/shagra.sqlite3"
$env:SESSION_SECRET_PATH = "$shagraTestDir/session-secret"
$env:AI_USAGE_PATH = "$shagraTestDir/ai-usage.json"
$env:KIT_PATH = "$PWD/data/synthetic"
$env:FRONTEND_DIST = "$PWD/frontend/dist"
$env:APP_ORIGIN = 'http://localhost:18080'
$env:AI_PROVIDER = 'openai'
$env:OPENAI_API_KEY = ''
$env:COOKIE_SECURE = 'false'
$env:DEMO_EMPLOYEE_PASSWORD = 'demo-employee'
$env:DEMO_HR_PASSWORD = 'demo-hr'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 18080
```

PowerShell, терминал 2:

```powershell
$env:LIVE_BASE_URL = 'http://localhost:18080'
npm --prefix frontend run test:e2e:live
```

Сценарий проверяет вход, реальный профиль, две примерки без записи, подтверждение выполнения, новые версии и историю, HR-сводку, валидацию/применение импорта и открытие нового профиля. После теста остановите сервер через Ctrl+C. Временную директорию можно удалить после сохранения нужного отчёта. Для следующего прогона создайте новую.

## Реальный AI

[Отчёт Q1–Q3](validation/ai.json) содержит провайдера, модель, SHA, длительности, полноту evidence и признак прохождения. [Отчёт задержки](validation/latency.json) отдельно фиксирует cache misses и cache hits. Это измерения на синтетических профилях, не оценка кадровых решений.

Для нового платного прогона задайте `OPENAI_API_KEY` в окружении терминала и отдельный доступный для записи `AI_USAGE_PATH`. Прямой запуск Python не читает `.env`. Из корня:

```bash
.venv/bin/python tools/evaluate_recommendations.py --live --output runtime/validation/ai.json
```

Файл отчёта создаётся автоматически. Проверяйте `acceptance_met=true`, `source=llm`, ожидаемое первое событие и обязательные evidence во всех трёх случаях. Fallback — корректная работа приложения при недоступности AI, но не успешная проверка модели. Новые отчёты пишите в `runtime/validation`, а в `docs/validation` переносите после проверки; не перезаписывайте исторические доказательства автоматически.

## Зафиксированный результат

Локальный финальный обход 23 сентября 2026 на `3eb7a86`:

| Проверка | Результат и граница |
|---|---|
| Backend | 42 теста прошли |
| Frontend production build | TypeScript и Vite прошли |
| UI Chromium | 21 сценарий прошёл последовательно; в первом параллельном прогоне был таймаут входа, не воспроизведённый отдельно |
| Live Chromium | 1 полный сценарий прошёл на отдельной БД; использован fallback |
| Синтетический кит | 200 сотрудников, 40 событий, 60 навыков, 1736 записей, 24 месячных интервала; 168/169 проверяемых профилей с полезным событием |
| OpenAPI | Сохранённая схема совпала со схемой приложения, 12 маршрутов |
| Реальный OpenAI | Q1–Q3 прошли в отдельном аудите; исторические результаты доступны по ссылкам выше |
| Compose | Конфигурация разобрана; контейнер не запускался из-за прав на Docker socket |

Повторная проверка после очистки CSS и обновления документации фиксируется отдельно в [отчёте очистки](validation/documentation-cleanup-2026-09-23.md). Запуск на всех ОС, физическом телефоне и публичном сервере этими результатами не подтверждён.
