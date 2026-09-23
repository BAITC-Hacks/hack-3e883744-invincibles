# A3 — исправления API, безопасная проверка и рабочая сборка

## Готовый промпт агенту

Ты — A3. Исправь подтверждённые дефекты API, подготовь изолированные проверки и проверь объединённый рабочий билд нового дизайна. A1 реализует сотрудника/общий UI, A2 — HR/импорт. Не подменяй их работу макетами и не редактируй принадлежащие им файлы.

Прочитай [общий план](../superpowers/plans/2026-09-23-production-redesign.md), [требования](frontend-design-requirements.md), backend contracts/routes/service, Dockerfile/compose, текущие тесты и README. Следуй интерфейсам и владению общего плана.

## Задача 1. Понятные evidence и названия ролей

**Файлы:** `backend/app/recommendations/service.py`, `backend/app/contracts/api.py`, `backend/app/http/routes.py`, `backend/app/application/hr.py`, `backend/app/data/repository.py`, соответствующие тесты.

- [ ] Добавь регрессию для текущего текста `Grade.MIDDLE`/`EventType.COURSE`; убедись, что тест падает на исходном коде.
- [ ] Формируй grade через enum.value; типы событий отображай централизованно понятными русскими словами, с грамматически корректной фразой. Не меняй kind/refs, сортировку, промпт и расчёт рекомендаций.
- [ ] Добавь обязательное `role_name: LocalizedText` в EmployeeListItem и HrNoStep. Источник — RoleDefinition.name в SQLite. Сохрани role_id.
- [ ] Получай названия без отдельного запроса для каждого сотрудника и без словаря фиксированных пяти ролей в HTTP-коде.
- [ ] Обнови `contracts/openapi.json`, соответствующие `contracts/examples/*`, генератор примеров при необходимости. Генерацию выполняй на временной БД, не на runtime пользователя.
- [ ] Проверь все статусы no_step, HR-поиск и профиль с неизвестными уровнями. Передай A1/A2 SHA контракта и пример ответа.

```python
# После построения реальной рекомендации для синтетического профиля:
texts = [entry.text for item in result.items for entry in item.evidence]
assert all('Grade.' not in text and 'EventType.' not in text for text in texts)
# После GET /employees и GET /hr/overview:
assert employee_item['role_name'] == role_definition.name.model_dump(mode='json')
assert no_step_item['role_name'] == role_definition.name.model_dump(mode='json')
```

Не добавляй новые публичные endpoint без необходимости: два аддитивных поля достаточны для задания.

## Задача 2. Изолированный сквозной стенд

**Файлы:** `frontend/playwright.live.config.ts`, `frontend/playwright.config.ts`, `frontend/tests/live.spec.ts`, `frontend/tests/ui.spec.ts`, `tools/run_live_e2e.py`.

- [ ] Замени жёсткий baseURL localhost:8080 на обязательный `LIVE_BASE_URL` для live-конфига. Если переменной нет, завершай запуск с понятной ошибкой и командой стенда; не используй пользовательский сервер по умолчанию.
- [ ] Создай `tools/run_live_e2e.py`: TemporaryDirectory для SQLite/секрета/AI-ledger, отдельный локальный порт, абсолютный FRONTEND_DIST, APP_ORIGIN равен LIVE_BASE_URL, health polling с дедлайном 30 секунд, гарантированное завершение uvicorn в finally.
- [ ] Используй `sys.executable` для uvicorn. При занятости порта покажи ошибку/выбери другой, не останавливай неизвестный процесс. Добавь `--port` для явного выбора и `--live-ai` для отдельной проверки провайдера.
- [ ] По умолчанию стенд явно очищает OPENAI_API_KEY только в дочернем окружении и проверяет честный fallback. `.env` и пользовательские настройки не изменяются. Для live AI ключ наследуется безопасно, не печатается.
- [ ] Выполни build перед сервером; запусти npm live-test с LIVE_BASE_URL; при ошибке пробрось ненулевой exit code и сохрани диагностический вывод без секретов.
- [ ] Существующий live-test должен проверить исходную версию, немутирующую примерку, выполнение, обновление истории, HR-импорт нового ID и реальный профиль. Адаптируй селекторы к новому UI после интеграции A1/A2.
- [ ] Установи требуемые Playwright browsers из официального установщика, если среда допускает. Если отсутствуют права или системные зависимости, зафиксируй точный блокер; не называй suite прошедшей.

```ts
const baseURL = process.env.LIVE_BASE_URL
if (!baseURL) throw new Error('Use tools/run_live_e2e.py to start an isolated test server')
// В defineConfig: use: { baseURL, trace: 'retain-on-failure' }
```

Стенд не перезаписывает старые картинки в docs/validation/ui при обычном тесте: снимки текущего прогона сохранять в test-results или `docs/validation/release` при выпуске доказательств. Исторические макеты не перегенерировать для маскировки расхождений.

## Задача 3. Docker и запуск рабочего приложения

**Файлы:** `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `start-app.sh`, `README.md`, `docs/DEMO.md`, `THIRD_PARTY.md`.

- [ ] Проверь, что image содержит только собранный рабочий frontend и backend, а старт не требует docs/preview. Сохрани non-root USER, один worker, runtime volume и healthcheck.
- [ ] Проверь APP_ORIGIN и APP_PORT: адрес браузера должен совпадать с origin. Не устраняй ошибку Origin отключением защиты.
- [ ] Создай исполняемый `start-app.sh`: перейти в каталог скрипта; проверить Docker Compose и доступ к daemon; выполнить `docker compose up -d --build app`; дождаться health с конечным таймаутом; вывести рабочий URL. При недоступном Docker — понятная ошибка, без автоматического sudo и изменения групп.
- [ ] Скрипт не печатает `.env`, не удаляет volumes, не запускает start-design.sh и не объявляет успех до health. Порт занят — ошибка с пояснением, не убийство чужого процесса.
- [ ] Проверь чистый запуск в отдельном Compose project, например `shagra-release-check`, с отдельным портом и origin; не используй рабочий project/volume. Без ключа должен работать fallback.
- [ ] Проверь перезапуск без удаления тома: импорт и выполнение сохраняются. После проверки удалить можно только созданный тестом project/volume; рабочие тома не трогать.
- [ ] Обнови README для Linux и текущего состояния, убери устаревшие утверждения «Docker отсутствует на этой Windows-машине» и «AI не проверен», заменив датированными фактами проверки.
- [ ] Для запуска без Docker явно опиши переменные окружения: `.env` сам по себе uvicorn не читает; AI_USAGE_PATH должен указывать в доступный local runtime, а не `/app/runtime`.
- [ ] Обнови лицензии по фактическим шрифтам/иконкам/зависимостям A1; оставь различие между синтетическим китом и непроверенной схемой организаторов.

## Задача 4. Общая приёмка после интеграции

- [ ] Запусти `.venv/bin/python -m pytest -q`, `.venv/bin/python tools/validate_kit.py`, `.venv/bin/python -m pip check`.
- [ ] Сравни runtime OpenAPI с сохранённым JSON; различий быть не должно.
- [ ] Запусти `npm --prefix frontend run build`, весь `test:e2e` в Chromium/Firefox/WebKit и новый изолированный live-стенд.
- [ ] Проверь role isolation, 401/403, неправильный Origin, повтор completion, stale context, invalid import без частичной записи и повтор commit.
- [ ] Выполни один короткий прогон Q1–Q3 с реальным AI при наличии серверного ключа: отдельный ledger, максимум 3 платных попытки, отчёт без ключа. Не запускай бесконечный benchmark при сбое.
- [ ] Проверь direct URLs, reload/back, 320/390/768/1280/1440 px, keyboard/focus и console; запроси A1/A2 исправления по обнаруженным дефектам.
- [ ] Отдельно убедись, что билд не содержит window.SHAGRA_DESIGN и данные статического E0001 не используются вместо API. Демонстрационная подпись учётной записи допустима, hardcoded профиль в данных — нет.
- [ ] Проверь отсутствие API-ключей в dist, не выводя обнаруженные значения: только имя файла и статус. Не делай `cat .env`.
- [ ] Выполни чистую контейнерную проверку и рестарт из задачи 3. Если Docker недоступен, это незакрытый критерий выпуска; сохрани все остальные проверенные результаты.
- [ ] Создай `docs/validation/release/README.md` с SHA, командами, результатами, viewport/браузерами, снимками и оставшимися блокерами. Запись «всё готово» допустима только после всех обязательных проверок.

**Готово:** API исправлен, контракт согласован с A1/A2, одна production-сборка обслуживает новое приложение и проходит основной сценарий. Завершающий отчёт относится к объединённому дереву, не только к твоей ветке. Не выполняй force push и не скрывай непроверенные шаги.
