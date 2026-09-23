# ШАГРА: рекомендации и проверка AI

## Роль модели

Сервис получает готовый `EmployeeContext` от A1 и никогда не читает БД или не меняет профиль. Он импортирует контракты A1 из `app.contracts.recommendation` и функции A1 из `app.core.progress`, `app.core.eligibility`, `app.core.history`. `build_candidates(ctx, request)` использует эти функции для допуска, примерки, цели и истории. `RecommendationService.recommend(ctx, request)` возвращает `RecommendationResult` из общего контракта. A1 проверяет версии snapshot до и после вызова и возвращает HTTP 409 при изменении.

Для допустимых полезных активностей `G = target_gain/gap_total`, `H = (completed+1)/(completed+skipped+declined+2)`, `P = 1` при явно выбранном типе. Базовый балл `0.80G+0.15H+0.05P`. `H` — сглаженная инженерная эвристика, не вероятность участия. Кандидаты сортируются по баллу, `target_gain`, `event_id`; в shortlist не больше восьми, и событие с максимальным `target_gain` сохраняется. Модель выбирает порядок и reason codes только среди aliases `C1`–`C8`. Она не вычисляет уровни навыков, проценты, причины поведения или шанс повышения.

Основной провайдер — OpenAI Responses API, `gpt-4.1-mini-2025-04-14`, `store=false`, `stream=false`, Structured Outputs, `max_output_tokens=512`, `temperature=0`. Опциональный локальный провайдер — Ollama `/api/chat`, `qwen2.5:1.5b`, JSON Schema, `num_predict=512`, `temperature=0`. Выбор делается переменной `AI_PROVIDER` при старте; автоматического каскада и повторов нет. Код не отправляет `employee_id`, `history_id` и полный датасет. Описание события ограничено 300 символами, а JSON контекста — 12 KiB. Внешнему API отправляется минимальный контекст одного синтетического профиля; перед использованием официальных данных нужно проверить условия их обработки.

Ответ модели принимается только при точном числе choices, уникальных aliases из shortlist, обязательном `TARGET_GAP`, подтверждённых reason codes и сохранении события с максимальным `target_gain`. Отказ, неполный ответ, неизвестный alias, ложное основание, HTTP-ошибка и превышение времени отклоняют весь ответ. В таком случае первые до трёх кандидатов по базовому баллу выдаются с `source=deterministic_fallback` и конкретным `fallback_reason`. Успешный путь помечается `source=llm`. Пустые состояния не вызывают модель.

Каждая карточка собирается кодом с `GRADE_TARGET`, `SKILL_GAP`, `HISTORY`; при явном предпочтении добавляется `PREFERENCE`. Ссылки `refs` ведут к grade, требованиям, skill, gain и агрегату истории. История пропусков сообщается фактически, без вывода о мотивации. Для сравнения основной карточки используется следующий полезный кандидат по баллу либо первое другое допустимое событие.

Общий таймаут AI — 8 секунд, включая очередь. Лимит одновременных вызовов: OpenAI 3, Ollama 1. Кэш в памяти: 500 записей, 15 минут для успешного ответа и 15 секунд для fallback. Ключ содержит ID и версии состояния, UI-исключения, предпочтение, prompt version, provider и модель. Платные попытки резервируются до OpenAI-запроса в `/app/runtime/ai-usage.json` (или `AI_USAGE_PATH` для отдельной локальной проверки), с пределом `AI_MAX_PAID_CALLS=2000`. Счётчик сохраняется после перезапуска. Неизвестный usage увеличивает `unknown_usage_attempts` и не считается бесплатным. Повреждённый файл закрывает платные вызовы до исправления оператором.

## Текущее доказательство и ограничения

На 2026-09-23 локальные unit-тесты проходят: 11 тестов, 6 подслучаев, без сети. Q1–Q3 проверены и с имитацией core, и с настоящими контрактами и core A1; provider в обоих вариантах FakeProvider. Независимые контрольные Q1–Q3 записаны в `data/acceptance/q1-q3.json` до настройки prompt. Серверный `OPENAI_API_KEY` отсутствует; доступность модели, квота, реальные ответы Q1–Q3 и стоимость не проверены. На `localhost:8080` путь `/health` ответил HTTP 404, поэтому живой backend ШАГРА не подтверждён; серия из 30 запросов и p95 не измерены. `docs/validation/ai.json` и `latency.json` фиксируют блокирующий статус. Требования «Q1–Q3 с реальной моделью <10 секунд», «не менее 90% валидных LLM-ответов из 30» и «p95 <10 секунд» остаются незакрытыми.

## Воспроизведение

После поставки A1 `app.contracts`, `app.core`, зависимостей и server `.env` из корня проекта:

```bash
python -m pytest backend/tests/recommendations -q
python tools/evaluate_recommendations.py --live --output docs/validation/ai.json
python tools/benchmark.py --base-url http://localhost:8080 --output docs/validation/latency.json
```

`evaluate_recommendations.py` использует реальные контракты, core и выбранный provider. Для OpenAI ключ задаётся только в окружении backend; скрипт не просит и не печатает его. Он пишет выбранные синтетические ID, источник, длительность, полноту evidence и накопленный usage. `benchmark.py` входит как HR с `DEMO_HR_PASSWORD`, передаёт `Origin`, выбирает 30 разных активных профилей с полезными событиями и отдельно повторяет их для cache hits. Отчёт содержит p50/p95/max, число LLM-ответов, fallback и их причины. Синтетические ID профилей в отчёт задержки не попадают.

## Интеграция

A1: импортировать `RecommendationService` из `app.recommendations` и передать его в `create_app(recommendation_service=...)` либо создать при bootstrap; сейчас в `app.state.recommendation_service` сохраняется только переданный параметр. Сервисный конструктор принимает `provider`, `model`, `prompt_version`, а без них берёт `AI_PROVIDER` и параметры моделей из env. Проверить версии context до/после `recommend`; startup probe OpenAI должен использовать тот же `OpenAIProvider` и лимитер, а `GET /health` сам запросы не отправляет. Для устойчивости при нескольких worker-процессах нужен отдельный межпроцессный lock лимитера; текущий MVP рассчитывает на один backend-процесс.

A3: пользовательские значения `status`: `ready`, `no_next_grade`, `target_met`, `incomplete_skills`, `no_eligible_events`, `all_candidates_excluded`. Для `ready` показывать `source=llm` как AI-результат, `source=deterministic_fallback` как резервный расчёт с `fallback_reason`: `timeout`, `unavailable`, `invalid_output`, `busy`, `context_too_large`, `rate_limited`, `call_limit`. `cache_hit` указывает повторный результат. Каждый item уже содержит preview, три обязательных evidence с `refs` и `comparison_event_id`; UI не должен пересчитывать рейтинг или интерпретировать пропуски. Для `THIRD_PARTY.md`: OpenAI API — внешний сервис с тарификацией по токенам; Ollama и локальная модель используются только в опциональном режиме, сведения о версии и лицензии нужно подтвердить при финальной сборке.
