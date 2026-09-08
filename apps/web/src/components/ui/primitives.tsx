'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AlertIcon, CheckCircleIcon, ClockIcon, CloseIcon, ErrorIcon, InfoIcon } from './icons'

export type Tone = 'ok' | 'warn' | 'risk' | 'info' | 'neutral'

const toneIcon: Record<Tone, typeof CheckCircleIcon> = {
  ok: CheckCircleIcon,
  warn: AlertIcon,
  risk: ErrorIcon,
  info: InfoIcon,
  neutral: ClockIcon,
}

/* Estado: siempre ícono + palabra. El color solo refuerza. */
export function StatusPill({ tone, label, title }: { tone: Tone; label: string; title?: string }) {
  const Icon = toneIcon[tone]
  return (
    <span className={`status status-${tone}`} title={title}>
      <Icon size={12} />
      {label}
    </span>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: Tone
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  const Icon = toneIcon[tone]
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === 'risk' ? 'alert' : 'status'}
      aria-live={tone === 'risk' ? 'assertive' : 'polite'}
    >
      <span className="alert-icon">
        <Icon size={18} />
      </span>
      <div className="alert-body">
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
        {actions ? <div className="alert-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-mark">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

/*
Diálogo modal accesible: foco atrapado, Escape cierra, el fondo no se
desplaza y el título anuncia el contenido. Sustituye a window.confirm
porque publicar nómina exige mostrar consecuencias, no una línea gris
del navegador.
*/
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    restoreRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    focusable()[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="dialog"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
      >
        <div className="dialog-head">
          <div className="row-between">
            <h2 className="title-page" id="dialog-title">
              {title}
            </h2>
            <button
              className="button button-quiet button-small"
              onClick={onClose}
              aria-label="Cerrar"
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          </div>
          {description ? (
            <p className="meta" id="dialog-description">
              {description}
            </p>
          ) : null}
        </div>
        {children ? <div className="dialog-body">{children}</div> : null}
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="progress-value" style={{ width: `${percent}%` }} />
    </div>
  )
}

export function Skeleton({ block }: { block?: boolean }) {
  return <div className={block ? 'skeleton skeleton-block' : 'skeleton'} />
}
