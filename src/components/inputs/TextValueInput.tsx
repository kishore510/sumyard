import { type ReactNode, useState } from 'react'
import type { Parsed } from '@/lib/parse'
import { boxClass, describedBy, Field } from './Field'

/*
 * A text box that holds a typed value (an amount, a percentage, a number).
 * The person types freely; each change is parsed, and only a valid value is
 * passed to onChange. An invalid one shows its message inline (and the
 * calculator shows no results until it is fixed: onValidityChange). On blur
 * a valid value is shown in its tidy form ("1,234.50"). When `value`
 * changes from outside (a scenario loaded), the text follows it. With
 * `allowEmpty`, an empty box is valid and its value is null (not entered).
 */

export interface TextValueProps<T> {
  id: string
  label: string
  hint?: ReactNode
  value: T
  onChange: (value: T) => void
  onValidityChange?: (valid: boolean) => void
  disabled?: boolean
  /** Shown in an empty box. */
  placeholder?: string
  /** What an empty box is: valid, this value; and this value shows as an empty box. */
  emptyValue?: T
}

/** A typed input's props: a value always, or (with `allowEmpty`) a value or null for an empty box. */
export type Emptyable<T> = (TextValueProps<T> & { allowEmpty?: false }) | (TextValueProps<T | null> & { allowEmpty: true })

export function TextValueInput<T extends string | number | null>({
  id,
  label,
  hint,
  value,
  onChange,
  onValidityChange,
  disabled,
  parse: parseText,
  format: formatValue,
  prefix,
  suffix,
  inputMode,
  allowEmpty = false,
}: TextValueProps<T> & {
  parse: (text: string) => Parsed<T>
  format: (value: T) => string
  allowEmpty?: boolean
  prefix?: string
  suffix?: string
  inputMode: 'decimal' | 'numeric' | 'text'
}) {
  const parse = (next: string): Parsed<T> => (allowEmpty && !next.trim() ? { ok: true, value: null as T } : parseText(next))
  const format = (next: T) => (next === null ? '' : formatValue(next))
  const [text, setText] = useState(() => format(value))
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(value)

  // The value changed from outside (not from typing here): show it.
  if (value !== shown) {
    setShown(value)
    setText(format(value))
    setError(null)
  }

  const change = (next: string) => {
    setText(next)
    const parsed = parse(next)
    if (parsed.ok) {
      setError(null)
      setShown(parsed.value)
      onValidityChange?.(true)
      if (parsed.value !== value) onChange(parsed.value)
    } else {
      setError(parsed.error)
      onValidityChange?.(false)
    }
  }

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className={boxClass(!!error)}>
        {prefix && (
          <span aria-hidden="true" className="pl-3 text-text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error })}
          onChange={(e) => change(e.currentTarget.value)}
          onBlur={() => {
            const parsed = parse(text)
            if (parsed.ok) setText(format(parsed.value))
          }}
          className="min-h-touch w-full min-w-0 flex-1 rounded-md bg-transparent px-3 tabular-nums outline-none disabled:opacity-50"
        />
        {suffix && (
          <span aria-hidden="true" className="pr-3 text-text-muted">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  )
}
