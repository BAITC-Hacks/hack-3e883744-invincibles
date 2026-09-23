import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { messages, type MessageKey } from './messages'
import type { LocalizedText } from '../api/types'
import { ApiError } from '../api/client'

export type Language = 'ru' | 'kk' | 'en'
type Theme = 'dark' | 'light'
function stored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Preferences still work for this visit. */
  }
}
const index = { ru: 0, kk: 1, en: 2 } as const
const locales = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' } as const
function translations(language: Language) {
  const t = (key: MessageKey, values: Record<string, string | number> = {}) => {
    let result: string = messages[key][index[language]]
    for (const [name, value] of Object.entries(values))
      result = result.replaceAll(`{${name}}`, String(value))
    return result
  }
  const number = (value: number) =>
    new Intl.NumberFormat(locales[language], {
      maximumFractionDigits: 1,
    }).format(value)
  return {
    language,
    t,
    number,
    label: (value: LocalizedText) =>
      value[language] || value.en || value.ru || '',
    percent: (value: number | null) =>
      value === null ? t('noData') : `${number(value)}%`,
    share: (value: number | null) =>
      value === null ? t('noData') : `${number(value * 100)}%`,
    date: (value: string, time = false) =>
      new Intl.DateTimeFormat(
        locales[language],
        time
          ? { dateStyle: 'short', timeStyle: 'short' }
          : { dateStyle: 'medium' },
      ).format(new Date(value)),
    error: (cause: unknown) => {
      if (cause instanceof ApiError) {
        if (cause.code === 'STALE_CONTEXT' || cause.status === 409)
          return t('stale')
        if (cause.status === 401) return t('loginError')
        if (cause.status === 403) return t('forbidden')
        if (cause.status === 404) return t('notFound')
        if (cause.status === 410) return t('expired')
      }
      return t(cause instanceof TypeError ? 'networkError' : 'genericError')
    },
  }
}
type Preferences = ReturnType<typeof translations> & {
  theme: Theme
  setLanguage: (language: Language) => void
  toggleTheme: () => void
}
const Context = createContext<Preferences | null>(null)
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const value = stored('shagra.language')
    return value === 'kk' || value === 'en' ? value : 'ru'
  })
  const [theme, setTheme] = useState<Theme>(() =>
    stored('shagra.theme') === 'light' ? 'light' : 'dark',
  )
  useLayoutEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#101112' : '#f7f8fa')
    save('shagra.language', language)
    save('shagra.theme', theme)
  }, [language, theme])
  const value = useMemo(
    () => ({
      ...translations(language),
      theme,
      setLanguage,
      toggleTheme: () =>
        setTheme((previous) => (previous === 'dark' ? 'light' : 'dark')),
    }),
    [language, theme],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function usePreferences() {
  const value = useContext(Context)
  if (!value) throw new Error('PreferencesProvider missing')
  return value
}
export function reasonKey(value: string | null | undefined): MessageKey {
  return value && value in messages
    ? (value as MessageKey)
    : 'no_eligible_events'
}
