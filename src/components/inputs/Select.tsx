import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { boxClass, describedBy, Field } from './Field'

/** A native select (the platform's own picker on phones), labelled, 44 px tall. */
export function Select<T extends string>({
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
    <Field id={id} label={label} hint={hint}>
      <div className={cn(boxClass(false), 'relative')}>
        <select
          id={id}
          value={value}
          aria-describedby={describedBy(id, { hint })}
          onChange={(e) => onChange(e.currentTarget.value as T)}
          className="min-h-touch w-full min-w-0 appearance-none rounded-md bg-transparent pr-9 pl-3 text-text outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-4 text-text-muted" />
      </div>
    </Field>
  )
}
