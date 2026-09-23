# Сторонние компоненты и источники

Фактически установленные прямые frontend-зависимости из `frontend/package-lock.json` (23.09.2026):

| Компонент | Версия | Лицензия | Назначение |
|---|---:|---|---|
| React, React DOM | 19.3.0 | MIT | Интерфейс |
| React Router DOM | 7.18.4 | MIT | Маршруты |
| Vite | 7.3.6 | MIT | Сборка |
| Tailwind CSS, @tailwindcss/vite | 4.3.3 | MIT | Стили |
| TypeScript | 5.9.3 | Apache-2.0 | Проверка типов |
| @playwright/test | 1.63.0 | Apache-2.0 | Браузерные проверки |
| @types/react, @types/react-dom | 19.3.0 | MIT | TypeScript-типы |

Backend использует версии из `backend/requirements.lock`: FastAPI 0.116.1, Pydantic 2.11.7, uvicorn 0.35.0, httpx 0.28.1, itsdangerous 2.2.0, python-multipart 0.0.20, pytest 8.4.1 и их транзитивные зависимости. Полный состав и лицензии проверяются по lock-файлам и пакетам перед распространением.

В конфигурации предусмотрены OpenAI API с моделью `gpt-4.1-mini-2025-04-14` и локальный Ollama с `qwen2.5:1.5b`. A2-сервис подключён к backend. Проверенный локальный запуск без ключа использовал `deterministic_fallback`; успешный вызов модели с реальным ключом в этой среде не подтверждён. Не заявляется обучение модели, уникальность алгоритма или проверенная точность.

Проектирование опиралось на [Gagné и Deci (2005)](https://selfdeterminationtheory.org/SDT/documents/2005_GagneDeci_JOB_SDTtheory.pdf), [Large Language Models are Zero-Shot Rankers (2023)](https://arxiv.org/abs/2305.08845), [Microsoft Counterfactual Analysis](https://learn.microsoft.com/en-us/azure/machine-learning/concept-counterfactual-analysis), [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf), [SQLite Appropriate Uses](https://www.sqlite.org/whentouse.html) и документацию [FastAPI](https://fastapi.tiangolo.com/tutorial/bigger-applications/). Эти источники объясняют решения, но не доказывают эффективность продукта. Синтетический набор создан проектом и не является данными Halyk Bank.

В разработке интерфейса использован OpenAI Codex как помощник по коду и тексту. Визуальный ориентир `docs/implementation/a3-template.jpg` предоставлен пользователем; интерфейс использует компоновку мобильных карточек и цвета из проектного ТЗ, не копирует содержимое изображения.
