import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { IsoDate } from '@/lib/isoDate'
import type { Money, Ratio } from '@/lib/money'
import type { ModellingPolicy } from '../optimiser/types'
import type { BreakEven, NextPoundInputs, NextPoundProblems, NextPoundResult, PensionAccess } from './types'

/* The next pound composer (C1): not built yet. The tests describe it. */

const notYet = (): never => {
  throw new Error('the next pound composer is not built yet')
}

export function pensionAfterTax(
  _pot: Money,
  _share: Ratio,
  _allowance: Money,
  _rate: Ratio,
): { readonly taxFree: Money; readonly tax: Money; readonly afterTax: Money } {
  return notYet()
}

export interface MinimumAges {
  readonly current: number
  readonly announced: number
  readonly announcedFrom: IsoDate
}

export function accessAt(_asOf: IsoDate, _years: number, _ageNow: number, _scheme: number | null, _ages: MinimumAges): PensionAccess {
  return notYet()
}

export function breakEvenRate(_lumpSum: Money, _fee: Ratio, _years: number, _inflation: Ratio, _target: Money): BreakEven {
  return notYet()
}

export function nextPound(
  _inputs: NextPoundInputs,
  _config: TaxYearConfig,
  _policy: ModellingPolicy,
): NextPoundResult | NextPoundProblems | Refusal {
  return notYet()
}
