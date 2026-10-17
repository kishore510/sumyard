import type { TaxYearConfig } from '@/config/tax/schema'
import { type Refusal, requireVerified } from '@/config/tax/sourced'
import type { IsoDate } from '@/lib/isoDate'
import { add, fromPence, type Money, mulRound, type RoundingMode, ratio } from '@/lib/money'
import { percentRatio } from '@/lib/parse'

/*
 * Hello calculator: a PLACEHOLDER that exercises the plumbing (registry,
 * inputs, results, chart, scenarios, compare and the refusal path). Removed
 * when the first real calculator ships. It has no tax logic: amount ×
 * percentage, and a short series that applies the percentage once per step.
 * Pure: inputs and a tax-year config in, results out.
 */

export const ROUNDING_MODES = ['nearest', 'down', 'up'] as const satisfies readonly RoundingMode[]
export const CHART_STYLES = ['line', 'bar'] as const
export type ChartStyle = (typeof CHART_STYLES)[number]

export interface HelloInputs {
  /** Integer pence, 0 to HELLO_LIMITS.maxAmount. */
  readonly amount: Money
  /** A percentage as canonical text ("12.5"), from -100 to 100, at most two decimals. */
  readonly percent: string
  readonly rounding: RoundingMode
  /** How many steps the series has. */
  readonly steps: number
  readonly chart: ChartStyle
  /** Draw a reference line at the starting amount. */
  readonly referenceLine: boolean
  /** Show the tax year's first and last day: needs verified tax data, so it refuses on an unverified year. */
  readonly useTaxYearDates: boolean
}

/** Limits keep every step inside the safe-integer range: at most 2^steps × the amount. */
export const HELLO_LIMITS = {
  minAmount: fromPence(0),
  /** One thousand million pounds, in pence. */
  maxAmount: fromPence(100_000_000_000),
  minPercent: ratio(-1, 1),
  maxPercent: ratio(1, 1),
  minSteps: 2,
  maxSteps: 10,
} as const

/** The only tax values Hello asks for. */
export const HELLO_TAX_PATHS = ['period.start', 'period.end'] as const

export interface HelloResult {
  readonly ok: true
  /** amount × percentage, rounded by the chosen mode. */
  readonly product: Money
  /** amount + product. */
  readonly total: Money
  /** The amount after each step; step k applies the percentage to step k − 1 (step 0 is the amount). */
  readonly series: readonly Money[]
  /** The tax year's dates, when asked for and verified. */
  readonly taxYearDates: { readonly start: IsoDate; readonly end: IsoDate } | null
}

export function calculateHello(inputs: HelloInputs, config: TaxYearConfig): HelloResult | Refusal {
  let taxYearDates: HelloResult['taxYearDates'] = null
  if (inputs.useTaxYearDates) {
    const granted = requireVerified(config, HELLO_TAX_PATHS)
    if (!granted.ok) return granted
    taxYearDates = { start: granted.values['period.start'], end: granted.values['period.end'] }
  }
  const rate = percentRatio(inputs.percent)
  const product = mulRound(inputs.amount, rate, inputs.rounding)
  const series: Money[] = []
  let value = inputs.amount
  for (let step = 1; step <= inputs.steps; step++) {
    value = add(value, mulRound(value, rate, inputs.rounding))
    series.push(value)
  }
  return { ok: true, product, total: add(inputs.amount, product), series, taxYearDates }
}
