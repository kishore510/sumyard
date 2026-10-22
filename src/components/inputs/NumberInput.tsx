import { parseIntegerText } from '@/lib/parse'
import { type Emptyable, TextValueInput, type TextValueProps } from './TextValueInput'

/** A whole number within `min` and `max` (a count, a number of years). With `allowEmpty`, an empty box is null (not entered). */
export function NumberInput({ min, max, suffix, ...props }: Emptyable<number> & { min?: number; max?: number; suffix?: string }) {
  return (
    <TextValueInput<number | null>
      {...(props as TextValueProps<number | null> & { allowEmpty?: boolean })}
      inputMode="numeric"
      suffix={suffix}
      parse={(text) => parseIntegerText(text, { min, max })}
      format={(v) => new Intl.NumberFormat('en-GB').format(v as number)}
    />
  )
}
