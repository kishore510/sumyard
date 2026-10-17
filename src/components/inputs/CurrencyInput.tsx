import { formatAmountInput } from '@/lib/format'
import type { Money } from '@/lib/money'
import { parseMoneyText } from '@/lib/parse'
import { TextValueInput, type TextValueProps } from './TextValueInput'

/**
 * An amount in pounds, held as Money (integer pence). Accepts what people
 * paste ("£1,234.56", "−5"), refuses more than two decimals, and checks
 * `min` and `max`. The numeric keypad with a decimal point on phones.
 */
export function CurrencyInput({ min, max, ...props }: TextValueProps<Money> & { min?: Money; max?: Money }) {
  return (
    <TextValueInput<Money>
      {...props}
      inputMode="decimal"
      prefix="£"
      parse={(text) => parseMoneyText(text, { min, max })}
      format={formatAmountInput}
    />
  )
}
