import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
} from 'react'
import { usePreferences, type Language } from '../lib/preferences'
import type { MessageKey } from '../lib/messages'

export { BrandMark } from './BrandMark'

const paths = {
  home: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  skills: (
    <>
      <path d="M4 20V10m8 10V4m8 16v-7" />
      <path d="M2 20h20" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
} satisfies Record<string, ReactNode>
export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="sh-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
export function PreferencesControls() {
  const { language, theme, setLanguage, toggleTheme, t } = usePreferences()
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])
  return (
    <div className="sh-preferences" aria-label={t('settings')}>
      <div className="sh-languages" role="group" aria-label={t('language')}>
        {(['ru', 'kk', 'en'] as Language[]).map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            aria-pressed={language === value}
            onClick={() => {
              setLanguage(value)
              setToast(value === 'kk' ? 'KZ' : value.toUpperCase())
            }}
          >
            {value === 'kk' ? 'KZ' : value.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        className="sh-theme-button"
        type="button"
        aria-label={t(theme === 'dark' ? 'light' : 'dark')}
        title={t(theme === 'dark' ? 'light' : 'dark')}
        onClick={() => {
          setToast(t(theme === 'dark' ? 'light' : 'dark'))
          toggleTheme()
        }}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        <span>{t(theme === 'dark' ? 'light' : 'dark')}</span>
      </button>
      {toast && (
        <div className="sh-toast" role="status" aria-live="polite" aria-atomic="true">
          <Icon name="check" />
          <span>{t('preferenceSaved', { value: toast })}</span>
        </div>
      )}
    </div>
  )
}
export type PanelProps = HTMLAttributes<HTMLElement> & { children: ReactNode }
export function Panel({ children, className = '', ...rest }: PanelProps) {
  return <section {...rest} className={`sh-panel ${className}`}>{children}</section>
}
export type PageHeaderProps = { title: string; description?: string; aside?: ReactNode; actions?: ReactNode }
export function PageHeader({
  title,
  description,
  aside,
  actions,
}: PageHeaderProps) {
  return (
    <div className="sh-page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="sh-muted">{description}</p>}
      </div>
      {actions || aside}
    </div>
  )
}
export type EmptyStateProps = { title: string; description?: string; children?: ReactNode; action?: ReactNode }
export function EmptyState({
  title,
  description,
  children,
  action,
}: EmptyStateProps) {
  return (
    <div className="sh-empty">
      <Icon name="check" />
      <h3>{title}</h3>
      {description && <p className="sh-muted">{description}</p>}
      {action || children}
    </div>
  )
}
export type ErrorStateProps = { error?: unknown; message?: string; onRetry?: () => void; busy?: boolean }
export function ErrorState({
  error,
  message,
  onRetry,
  busy = false,
}: ErrorStateProps) {
  const { t, error: errorMessage } = usePreferences()
  return (
    <div className="sh-notice sh-error" role="alert">
      <p>{message || errorMessage(error)}</p>
      {onRetry && (
        <button className="sh-button sh-secondary" onClick={onRetry} disabled={busy} aria-busy={busy || undefined}>
          {t('retry')}
        </button>
      )}
      {error instanceof Error && (
        <details className="sh-technical">
          <summary>{t('serverDetails')}</summary>
          <p>{error.message}</p>
        </details>
      )}
    </div>
  )
}
export type SkeletonProps = HTMLAttributes<HTMLDivElement>
export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  const { t } = usePreferences()
  return (
    <div
      {...rest}
      className={`sh-skeleton ${className}`}
      role="status"
      aria-label={t('loading')}
    />
  )
}
export type StatProps = { label: string; value: ReactNode; hint?: ReactNode }
export function Stat({
  label,
  value,
  hint,
}: StatProps) {
  return (
    <div className="sh-stat">
      <span className="sh-muted">{label}</span>
      <strong className="sh-number">{value}</strong>
      {hint && <small className="sh-muted">{hint}</small>}
    </div>
  )
}
export function Progress({
  value,
  label,
}: {
  value: number | null
  label: string
}) {
  const { percent } = usePreferences()
  return (
    <div
      className="sh-progress"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={percent(value)}
    >
      <span style={{ width: `${Math.max(0, Math.min(value ?? 0, 100))}%` }} />
    </div>
  )
}
export function Disclosure({
  title,
  children,
  className = '',
}: {
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <details className={`sh-disclosure ${className}`}>
      <summary>
        <span>{title}</span>
        <Icon name="down" />
      </summary>
      <div className="sh-disclosure-content">{children}</div>
    </details>
  )
}

export function Dialog({
  title,
  onClose,
  busy = false,
  children,
  footer,
  compact = false,
}: {
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
  footer?: ReactNode
  compact?: boolean
}) {
  const { t } = usePreferences()
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const pending = useRef(busy)
  useLayoutEffect(() => {
    close.current = onClose
    pending.current = busy
  }, [onClose, busy])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const root = document.getElementById('sh-shell')
    root?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending.current) {
        event.preventDefault()
        close.current()
      }
      if (event.key !== 'Tab' || !ref.current) return
      const elements = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], summary, [tabindex="0"]',
        ),
      ).filter(
        (node) => node.getClientRects().length > 0 && !node.closest('[inert]'),
      )
      const first = elements[0],
        last = elements.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', listener)
    return () => {
      root?.removeAttribute('inert')
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', listener)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return (
    <div
      className="sh-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`sh-dialog ${compact ? 'sh-dialog-compact' : ''}`}
      >
        <header className="sh-dialog-heading">
          <h2 id={id}>{title}</h2>
          <button
            className="sh-icon-button"
            disabled={busy}
            aria-label={t('close')}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="sh-dialog-body">{children}</div>
        {footer && <footer className="sh-dialog-footer">{footer}</footer>}
      </div>
    </div>
  )
}
export function CatalogNote() {
  const { language, t } = usePreferences()
  return language === 'kk' ? (
    <p className="sh-catalog-note">{t('catalogLanguage')}</p>
  ) : null
}
export function Reason({ reason }: { reason: MessageKey }) {
  const { t } = usePreferences()
  return <p className="sh-muted">{t(reason)}</p>
}

// Keep the shared Button and Field APIs from the parallel UI foundation.
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  busy?: boolean
}
export function Button({
  variant = 'secondary',
  busy = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const style =
    variant === 'primary'
      ? 'sh-primary'
      : variant === 'ghost'
        ? 'sh-ghost'
        : variant === 'danger'
          ? 'sh-danger'
          : 'sh-secondary'
  return (
    <button
      {...rest}
      className={`sh-button ${style} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  )
}
export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}
export function Field({
  label,
  hint,
  error,
  id,
  className = '',
  ...rest
}: FieldProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  return (
    <div className={`sh-field ${className}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [hint && `${inputId}-hint`, error && `${inputId}-error`]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {hint && (
        <small id={`${inputId}-hint`} className="sh-muted">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${inputId}-error`} role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
