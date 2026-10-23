import type { ChartMarker, ChartSeries } from '@/components/Chart/types'
import { addMonths } from '@/lib/calendar'
import { formatPercent } from '@/lib/format'
import { MORTGAGE_DRIFT_SHARE } from '@/lib/inputLimits'
import type { IsoDate } from '@/lib/isoDate'
import { add, compare, type Money, mulRound, type Ratio, subtract, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { DAY_COUNT_LABELS } from './definition'
import type { AllowanceYear, MortgageInputs, MortgageResult, RatePeriod } from './types'

/*
 * The mortgage page's readings of the engine's result (M2): the balance
 * chart's points, the data behind each warning and the return per rate
 * period with what it is measured against. Pure; every figure is the
 * engine's, and nothing here works out money of its own beyond comparing it.
 */

export const START_LABEL = 'Start'

export interface ChartData {
  readonly categories: readonly string[]
  readonly xValues: readonly number[]
  readonly series: readonly ChartSeries[]
  readonly markers: readonly ChartMarker[]
}

/** The balance a year from the start to the end of the term (the last point at the term), without and with overpaying. */
export function chartData(result: MortgageResult, inputs: MortgageInputs): ChartData {
  const { termMonths: term, fixedEndMonth: fixedEnd } = inputs
  const years = Math.ceil(term / MONTHS_PER_YEAR)
  const xValues = Array.from({ length: years + 1 }, (_, year) => year)
  const at = (year: number) => result.balances[Math.min(year * MONTHS_PER_YEAR, term)]!
  return {
    categories: xValues.map((year) => (year === 0 ? START_LABEL : String(year))),
    xValues,
    series: [
      {
        id: 'baseline',
        label: 'Without overpaying',
        kind: 'line',
        style: 'contrast',
        values: xValues.map((year) => toPence(at(year).baseline)),
      },
      { id: 'overpaying', label: 'Overpaying', kind: 'line', style: 'accent', values: xValues.map((year) => toPence(at(year).overpaying)) },
    ],
    markers: fixedEnd > 0 && fixedEnd < term ? [{ x: fixedEnd / MONTHS_PER_YEAR, label: 'Fixed rate ends' }] : [],
  }
}

/**
 * With daily interest the level payment comes from a twelfth of the rate (MO2, MO4), so a long schedule drifts and
 * its last payment takes the difference (M1 README, "Known behaviour"). True when the schedule without overpayments
 * ends on a payment further from the level payment before it than MORTGAGE_DRIFT_SHARE of it.
 */
export function drifts(result: MortgageResult, inputs: MortgageInputs): boolean {
  if (inputs.policy.interestMethod !== 'daily' || inputs.repaymentType !== 'repayment') return false
  const { rows, payoffMonth } = result.baseline
  if (payoffMonth === null || payoffMonth < 2) return false
  const last = rows[payoffMonth - 1]!.payment
  const level = rows[payoffMonth - 2]!.payment
  const gap = compare(last, level) > 0 ? subtract(last, level) : subtract(level, last)
  return compare(gap, mulRound(level, MORTGAGE_DRIFT_SHARE, 'down')) > 0
}

/** Overpayments asked for but not needed, because they would take the balance below nothing (MO8); null if none. */
export function unusedOverpayments(result: MortgageResult): { readonly firstMonth: number; readonly total: Money } | null {
  const rows = result.overpaying.rows.filter((row) => compare(row.unused, ZERO) > 0)
  if (rows.length === 0) return null
  return { firstMonth: rows[0]!.month, total: rows.reduce((total, row) => add(total, row.unused), ZERO) }
}

/** The allowance years with a charge (MO7, MO16). */
export const overAllowance = (result: MortgageResult): readonly AllowanceYear[] =>
  result.allowances.filter((year) => compare(year.charged, ZERO) > 0)

/** A note on where the fixed rate's end falls against the term: past it, or before the first payment. */
export function fixedRateNote(inputs: MortgageInputs, fixed: boolean): 'past-term' | 'already-ended' | null {
  if (!fixed) return null
  if (inputs.fixedEndMonth === 0) return 'already-ended'
  if (inputs.fixedEndMonth >= inputs.termMonths) return 'past-term'
  return null
}

export interface ReturnLine {
  readonly period: RatePeriod
  readonly rate: Ratio
  readonly effective: Ratio
  readonly from: IsoDate
  readonly to: IsoDate
  /** What the return is measured against, in words. */
  readonly against: string
}

/** One effective guaranteed return per rate period (MO9), each with its dates and what it is measured against. */
export function returnLines(result: MortgageResult, inputs: MortgageInputs): readonly ReturnLine[] {
  const { startDate, fixedEndMonth, termMonths, policy } = inputs
  const charged = policy.interestMethod === 'monthly' ? 'charged monthly' : `charged daily, ${DAY_COUNT_LABELS[policy.dayCount]}`
  return result.returns.map(({ period, rate, effective }) => {
    const from = period === 'fixed' ? startDate : addMonths(startDate, fixedEndMonth)
    const to = period === 'fixed' ? addMonths(startDate, fixedEndMonth) : addMonths(startDate, termMonths)
    const against =
      period === 'fixed'
        ? `The interest you would otherwise pay at the fixed rate of ${formatPercent(rate)}, ${charged}, while it lasts.`
        : `The interest you would otherwise pay at your guess of ${formatPercent(rate)} after the fixed rate, ${charged}, to the end of the term. It rests on that guess.`
    return { period, rate, effective, from, to, against }
  })
}
