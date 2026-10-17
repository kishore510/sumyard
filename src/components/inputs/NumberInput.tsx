import { parseIntegerText } from '@/lib/parse'
import { TextValueInput, type TextValueProps } from './TextValueInput'

/** A whole number within `min` and `max` (a count, a number of years). */
export function NumberInput({ min, max, suffix, ...props }: TextValueProps<number> & { min?: number; max?: number; suffix?: string }) {
  return (
    <TextValueInput<number>
      {...props}
      inputMode="numeric"
      suffix={suffix}
      parse={(text) => parseIntegerText(text, { min, max })}
      format={(v) => new Intl.NumberFormat('en-GB').format(v)}
    />
  )
}
