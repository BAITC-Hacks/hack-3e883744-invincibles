import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type DialogProps = {
  title: string
  onClose: () => void
  busy?: boolean
  compact?: boolean
  children: ReactNode
  footer?: ReactNode
}

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function Dialog({ title, onClose, busy = false, compact = false, children, footer }: DialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const target = dialogRef.current?.querySelector<HTMLElement>(focusable) || dialogRef.current
    target?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) { event.preventDefault(); closeRef.current() }
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusable))
      if (!nodes.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; previous?.focus() }
  }, [])

  return createPortal(<div className="sh-dialog-layer" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className={`sh-dialog ${compact ? 'sh-dialog-compact' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
      <div className="sh-dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="sh-icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} /></button></div>
      {children}
      {footer && <div className="sh-dialog-actions">{footer}</div>}
    </section>
  </div>, document.body)
}
