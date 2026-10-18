import type { Money } from '@/lib/money'
import { ZERO } from '@/lib/money'
import type { PeriodView } from './types'

/* STUB (red commit): the breakdown for a year or a month (decision B14). */

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

export function breakdown(annual: PeriodView, period: BreakdownPeriod): Breakdown {
  const rows = Object.fromEntries(DEDUCTION_ROWS.map((row) => [row, annual[row]])) as Record<DeductionRow, Money>
  return { period, gross: annual.gross, rows, takeHome: annual.net, evenShare: annual.net, difference: ZERO }
}
