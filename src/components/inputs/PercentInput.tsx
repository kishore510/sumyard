import type { Ratio } from '@/lib/money'
import { type Parsed, parsePercentText } from '@/lib/parse'
import { type Emptyable, TextValueInput, type TextValueProps } from './TextValueInput'

/**
 * A percentage, held as its canonical text ("7.5"; see percentRatio for the
 * exact Ratio). Accepts a trailing %, a sign and up to `maxDecimals` places.
 * With `allowEmpty`, an empty box is null (not entered).
 */
export function PercentInput({
  min,
  max,
  maxDecimals = 2,
  ...props
}: Emptyable<string> & { min?: Ratio; max?: Ratio; maxDecimals?: number }) {
  const parse = (text: string): Parsed<string | null> => {
    const parsed = parsePercentText(text, { min, max, maxDecimals })
    return parsed.ok ? { ok: true, value: parsed.value.text } : parsed
  }
  return (
    <TextValueInput<string | null>
      {...(props as TextValueProps<string | null> & { allowEmpty?: boolean })}
      inputMode="decimal"
      suffix="%"
      parse={parse}
      format={(v) => v ?? ''}
    />
  )
}
