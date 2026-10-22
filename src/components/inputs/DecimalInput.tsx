import type { Ratio } from '@/lib/money'
import { type Parsed, parseDecimalText } from '@/lib/parse'
import { type Emptyable, TextValueInput, type TextValueProps } from './TextValueInput'

/**
 * A plain decimal with its unit beside the box ("45.5 mpg", "149.9 p"),
 * held as its canonical text (see decimalRatio for the exact Ratio). Up to
 * `maxDecimals` places; `minExclusive` refuses the minimum itself ("above
 * nothing"). With `allowEmpty`, an empty box is null (not entered).
 */
export function DecimalInput({
  min,
  max,
  minExclusive,
  maxDecimals = 2,
  suffix,
  ...props
}: Emptyable<string> & { min?: Ratio; max?: Ratio; minExclusive?: boolean; maxDecimals?: number; suffix?: string }) {
  const parse = (text: string): Parsed<string | null> => {
    const parsed = parseDecimalText(text, { min, max, minExclusive, maxDecimals })
    return parsed.ok ? { ok: true, value: parsed.value.text } : parsed
  }
  return (
    <TextValueInput<string | null>
      {...(props as TextValueProps<string | null> & { allowEmpty?: boolean })}
      inputMode="decimal"
      suffix={suffix}
      parse={parse}
      format={(v) => v ?? ''}
    />
  )
}
