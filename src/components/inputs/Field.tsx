import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * The frame every shared input uses: a visible label, an optional hint and an
 * inline error, both tied to the control with aria-describedby (see
 * describedBy). The control itself is passed as children.
 */

export const hintId = (id: string) => `${id}-hint`
export const errorId = (id: string) => `${id}-error`

/** The ids a control should list in aria-describedby: its error first (read first), then its hint. */
export function describedBy(id: string, { hint, error }: { hint?: ReactNode; error?: string | null }): string | undefined {
  const ids = [error ? errorId(id) : null, hint ? hintId(id) : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId(id)} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId(id)} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Shared look for text boxes: 44 px tall, token colours, a danger border when invalid. */
export const boxClass = (invalid: boolean) =>
  cn(
    'flex min-h-touch w-full items-center rounded-md border bg-surface text-sm text-text shadow-sm',
    'focus-within:border-focus',
    invalid ? 'border-danger' : 'border-border-strong',
  )
