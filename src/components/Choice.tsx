import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Mutually exclusive text choices, e.g. the theme (lifted from Chalkline's
 * src/settings/Choice.tsx). `stacked` puts long labels one per row, so they
 * wrap instead of being cut off at large text sizes. `hint` is read out with
 * the group.
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  stacked = false,
  hint,
  id,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  stacked?: boolean
  hint?: string
  id: string
}) {
  return (
    <fieldset aria-describedby={hint ? `${id}-hint` : undefined} className="flex min-w-0 flex-col gap-1.5">
      <legend className="pb-1.5 text-sm font-medium text-text">{label}</legend>
      <div className={cn('flex gap-1', stacked && 'flex-col')}>
        {options.map((o) => (
          <Button
            key={o.value}
            variant="secondary"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-w-0 flex-1 px-2 aria-pressed:border-accent aria-pressed:bg-accent-subtle aria-pressed:text-accent',
              stacked && 'h-auto min-h-touch justify-start px-3 py-2 text-left whitespace-normal',
            )}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </fieldset>
  )
}
