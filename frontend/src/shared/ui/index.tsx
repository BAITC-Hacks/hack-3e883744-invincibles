import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean
}
export type PanelProps = HTMLAttributes<HTMLElement> & { children: ReactNode }
export type PageHeaderProps = { title: string; description?: string; actions?: ReactNode }
export type StatProps = { label: string; value: ReactNode; hint?: ReactNode }
export type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }
export type EmptyStateProps = { title: string; description?: string; action?: ReactNode }
export type ErrorStateProps = { message: string; onRetry?: () => void; busy?: boolean }
export type SkeletonProps = HTMLAttributes<HTMLDivElement>

export function Button({ variant = 'secondary', busy = false, disabled, className = '', children, ...rest }: ButtonProps) {
  return <button {...rest} className={`sh-button sh-button-${variant} ${className}`.trim()} disabled={disabled || busy} aria-busy={busy || undefined}>{children}</button>
}

export function Panel({ className = '', children, ...rest }: PanelProps) {
  return <section {...rest} className={`sh-panel ${className}`.trim()}>{children}</section>
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return <div className="sh-page-header"><div><h1>{title}</h1>{description && <p className="sh-muted">{description}</p>}</div>{actions && <div className="sh-page-actions">{actions}</div>}</div>
}

export function Stat({ label, value, hint }: StatProps) {
  return <div className="sh-stat"><span className="sh-stat-label">{label}</span><strong className="sh-stat-value">{value}</strong>{hint && <span className="sh-stat-hint">{hint}</span>}</div>
}

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  return <div className={`sh-field ${className}`.trim()}>
    <label htmlFor={inputId}>{label}</label>
    <input {...rest} id={inputId} className="sh-input" aria-invalid={!!error || undefined} aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined} />
    {hint && <small id={hintId} className="sh-muted">{hint}</small>}
    {error && <small id={errorId} className="sh-error" role="alert">{error}</small>}
  </div>
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <div className="sh-empty-state"><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ message, onRetry, busy = false }: ErrorStateProps) {
  return <div className="sh-error-state" role="alert"><span>{message}</span>{onRetry && <Button type="button" onClick={onRetry} busy={busy}>Повторить</Button>}</div>
}

export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  return <div {...rest} className={`sh-skeleton ${className}`.trim()} aria-hidden="true" />
}

export { Dialog } from './Dialog'
