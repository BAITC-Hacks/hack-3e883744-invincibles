import type { LocalizedText } from '../api/types'

export const localized = (value: LocalizedText): string => value.ru || value.kk || value.en

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export const formatPercent = (value: number | null): string => value === null ? 'нет данных' : `${number.format(value)}%`

export const formatDate = (value: string): string => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Almaty',
}).format(new Date(value))

export const formatNumber = (value: number): string => number.format(value)

export const eventTypeLabel = { course: 'Курс', workshop: 'Практикум', mentoring: 'Наставничество' } as const
export const historyStatusLabel = { completed: 'Выполнено', skipped: 'Пропущено', declined: 'Отклонено' } as const

export const fallbackReasonLabel: Record<string, string> = {
  timeout: 'AI не ответил вовремя', unavailable: 'AI недоступен', invalid_output: 'ответ AI не прошёл проверку',
  busy: 'AI занят', context_too_large: 'контекст превысил лимит', rate_limited: 'лимит запросов',
  call_limit: 'достигнут лимит обращений',
}
