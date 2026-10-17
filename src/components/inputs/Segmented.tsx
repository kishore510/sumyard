import type { ReactNode } from 'react'
import { hintId } from './Field'

/**
 * A few mutually exclusive options side by side, as native radio buttons
 * (arrow keys move between them), each at least 44 px tall. For longer
 * labels or many options, use Select.
 */
export function Segmented<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  hint?: ReactNode
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset aria-describedby={hint ? hintId(id) : undefined} className="flex min-w-0 flex-col gap-1.5">
      <legend className="pb-1.5 text-sm font-medium text-text">{label}</legend>
      <div className="flex gap-1 rounded-md border border-border-strong bg-surface p-1 shadow-sm">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-touch min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-2 text-center text-sm font-medium text-text transition-colors hover:bg-surface-muted has-checked:bg-accent-subtle has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-focus"
          >
            <input
              type="radio"
              name={id}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId(id)} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </fieldset>
  )
}
