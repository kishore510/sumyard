import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { hintId } from './Field'

/** An on/off switch: one button (role switch) holding its label, the whole row 44 px tall and tappable. */
export function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId(id) : undefined}
        onClick={() => onChange(!checked)}
        className="flex min-h-touch w-full items-center justify-between gap-3 rounded-md text-left text-sm font-medium text-text"
      >
        <span className="min-w-0">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
            checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-muted',
          )}
        >
          <span
            className={cn(
              'inline-block size-4 rounded-full shadow-sm transition-transform',
              checked ? 'translate-x-6 bg-on-accent' : 'translate-x-1 bg-text-muted',
            )}
          />
        </span>
      </button>
      {hint && (
        <p id={hintId(id)} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
