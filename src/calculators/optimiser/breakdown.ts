import { type Money, mulRound, ratio, subtract, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import type { PeriodView } from './types'

/*
 * The take-home breakdown for a year or a month (decision B14 in
 * docs/modelling-decisions.md). A month is each yearly row divided by
 * MONTHS_PER_YEAR (a calendar divisor from src/lib/periods.ts) to the
 * nearest penny; take-home is gross less those rounded rows, so the month
 * always adds up, and the difference from the year's take-home divided
 * evenly is reported for the page to state. No tax figure here.
 */

export const BREAKDOWN_PERIODS = ['year', 'month'] as const
export type BreakdownPeriod = (typeof BREAKDOWN_PERIODS)[number]

/** The rows taken from gross pay, in the order shown. */
export const DEDUCTION_ROWS = [
  'benefitSacrifice',
  'incomeTax',
  'nationalInsurance',
  'studentLoan',
  'pension',
  'hicbc',
  'benefitPayments',
  'postTaxDeductions',
] as const
export type DeductionRow = (typeof DEDUCTION_ROWS)[number]

export interface Breakdown {
  readonly period: BreakdownPeriod
  readonly gross: Money
  readonly rows: Readonly<Record<DeductionRow, Money>>
  /** Gross less every row: the rows always add up. */
  readonly takeHome: Money
  /** Take-home for the year divided evenly (the month), to the nearest penny; take-home itself for the year. */
  readonly evenShare: Money
  /** Take-home less the even share: the pennies the rounding of each row moves it by. */
  readonly difference: Money
}

const MONTH = ratio(1, MONTHS_PER_YEAR)

/** The breakdown of a take-home result's annual view, for the year or for a month. */
export function breakdown(annual: PeriodView, period: BreakdownPeriod): Breakdown {
  const part = (amount: Money) => (period === 'year' ? amount : mulRound(amount, MONTH, 'nearest'))
  const gross = part(annual.gross)
  const rows = Object.fromEntries(DEDUCTION_ROWS.map((row) => [row, part(annual[row])])) as Record<DeductionRow, Money>
  const takeHome = DEDUCTION_ROWS.reduce((left, row) => subtract(left, rows[row]), gross)
  const evenShare = part(annual.net)
  return { period, gross, rows, takeHome, evenShare, difference: period === 'year' ? ZERO : subtract(takeHome, evenShare) }
}
