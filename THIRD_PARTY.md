# Сторонние компоненты и источники

Фактически установленные прямые frontend-зависимости из `frontend/package-lock.json` (23.09.2026):

| Компонент | Версия | Лицензия | Назначение |
|---|---:|---|---|
| React, React DOM | 19.3.0 | MIT | Интерфейс |
| React Router DOM | 7.18.4 | MIT | Маршруты |
| lucide-react | 1.47.0 | ISC, производные Feather — MIT | Библиотека иконок из общего UI-слоя |
| Vite | 7.3.6 | MIT | Сборка |
| Tailwind CSS, @tailwindcss/vite | 4.3.3 | MIT | Стили |
| TypeScript | 5.9.3 | Apache-2.0 | Проверка типов |
| @playwright/test | 1.63.0 | Apache-2.0 | Браузерные проверки |
| @types/react, @types/react-dom | 19.3.0 | MIT | TypeScript-типы |

Backend использует версии из `backend/requirements.lock`: FastAPI 0.116.1, Pydantic 2.11.7, uvicorn 0.35.0, httpx 0.28.1, itsdangerous 2.2.0, python-multipart 0.0.20, pytest 8.4.1 и их транзитивные зависимости. Полный состав и лицензии проверяются по lock-файлам и пакетам перед распространением.

В конфигурации предусмотрены OpenAI API с моделью `gpt-4.1-mini-2025-04-14` и локальный Ollama с `qwen2.5:1.5b`. Сервис рекомендаций подключён к backend. Локальный запуск без ключа использует `deterministic_fallback`; успешные вызовы реальной модели отдельно зафиксированы в [AI-отчёте](docs/validation/ai.json). Не заявляется обучение модели, уникальность алгоритма или проверенная точность.

Проектирование опиралось на [Gagné и Deci (2005)](https://selfdeterminationtheory.org/SDT/documents/2005_GagneDeci_JOB_SDTtheory.pdf), [Large Language Models are Zero-Shot Rankers (2023)](https://arxiv.org/abs/2305.08845), [Microsoft Counterfactual Analysis](https://learn.microsoft.com/en-us/azure/machine-learning/concept-counterfactual-analysis), [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf), [SQLite Appropriate Uses](https://www.sqlite.org/whentouse.html) и документацию [FastAPI](https://fastapi.tiangolo.com/tutorial/bigger-applications/). Эти источники объясняют решения, но не доказывают эффективность продукта. Синтетический набор создан проектом и не является данными Halyk Bank.

В разработке интерфейса использован OpenAI Codex как помощник по коду и тексту. Визуальный ориентир `docs/implementation/a3-template.jpg` предоставлен пользователем; интерфейс использует компоновку мобильных карточек и цвета из проектного ТЗ, не копирует содержимое изображения.

Для исторического прототипа редизайна в `docs/validation/ui/redesign` добавлены следующие локальные ресурсы; шрифты затем перенесены и в рабочий frontend:

| Ресурс | Пакет и версия | Лицензия | Использование |
|---|---|---|---|
| IBM Plex Sans | @fontsource/ibm-plex-sans 5.3.0 | SIL OFL 1.1 | Кириллица и основной текст, 400/500/600 |
| IBM Plex Mono | @fontsource/ibm-plex-mono 5.3.0 | SIL OFL 1.1 | Числа и короткие метаданные, 400/500 |
| Lucide SVG | lucide-static 1.47.0 | ISC; производные Feather — MIT | Контурные иконки |

Тексты лицензий поставляются рядом с ресурсами: [IBM Plex Sans](docs/validation/ui/redesign/assets/LICENSE-ibm-plex-sans.txt), [IBM Plex Mono](docs/validation/ui/redesign/assets/LICENSE-ibm-plex-mono.txt), [Lucide и Feather](docs/validation/ui/redesign/assets/LICENSE-lucide.txt). Шрифты загружаются с того же origin, внешнего CDN нет. Версии подтверждены содержимым npm-пакетов и записаны в [assets-manifest.json](docs/validation/ui/redesign/assets-manifest.json).

[Требования к дизайну](docs/implementation/frontend-design-requirements.md) определили тёмную палитру. Четыре сохранённых HTML-макета относятся к этапу согласования; текущий React-интерфейс уже внедрён, его [живые скриншоты](docs/validation/ui/simple/README.md) хранятся отдельно.

Последующее указание пользователя расширило дизайн переключаемой светлой темой, языками RU/KZ/EN и более простыми экранами. Эта версия внедрена в `frontend/src/app`, `pages`, `features`, `entities` и `shared`. IBM Plex Sans/Mono указанных выше версий теперь используются в production; локальные WOFF2 и лицензии находятся в [`frontend/src/shared/styles/fonts`](frontend/src/shared/styles/fonts/). Дубли в `frontend/public/fonts` удалены; оригинальные тексты лицензий сохранены рядом с используемыми ресурсами. CSS использует только включённые WOFF2, без ссылок на отсутствующие WOFF. Контурные SVG заданы в общем компоненте Icon; уведомления о лицензиях Lucide/Feather также сохранены рядом с ресурсами.

Переводы элементов интерфейса RU/KK/EN поставляются в `frontend/src/shared/lib/messages.ts`. Названия из API используют переводы каталога и явный fallback; текст evidence сервера не выдаётся за переведённый. Prettier 3.6.2 (MIT) использован только как инструмент форматирования, в runtime-зависимости не добавлен.
