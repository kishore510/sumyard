import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import { compare, type Money, type Ratio, ratio, subtract, subtractRatio, toPence, ZERO } from '@/lib/money'
import { MAX_SWEEP_POINTS, pageSweepStep } from '@/lib/sweep'
import { perPeriod } from './breakdown'
import { optimise } from './calc'
import type { ModellingPolicy, OptimiseOptions, OptimiserInputs, OptimiserPoint } from './types'

/*
 * The contribution now against a target (the compare redesign): for your
 * own contribution, the total paid into your pension and take-home, the
 * figures now and at the target for the year and a month, the change and
 * the percentage change, plus the share of pensionable pay and the average
 * take-home given up per pound more into the pension. Both points are the
 * engine's (optimise() at each contribution); everything here is arithmetic
 * through money.ts, with no tax rule and no config read. A month is the
 * year's figure divided by MONTHS_PER_YEAR to the nearest penny (perPeriod),
 * and a month's change is worked out from the two month figures shown, so
 * each row adds up to the penny (docs/money.md).
 */

/** One figure now and at the target, and the change (new less now). */
export interface PeriodFigures {
  readonly now: Money
  readonly new: Money
  readonly change: Money
}

export interface MeasureComparison {
  /** The year; percentChange is the change over the figure now, null when that is nothing or below. */
  readonly annual: PeriodFigures & { readonly percentChange: Ratio | null }
  readonly monthly: PeriodFigures
}

/** Shares of pensionable pay, and the change between them in percentage points (a difference of shares, not a change on the figure now). */
export interface ShareOfPay {
  readonly now: Ratio
  readonly new: Ratio
  readonly changeInPoints: Ratio
}

export interface ContributionComparison {
  readonly ok: true
  /** Your own contribution: what comes out of pay (a salary sacrifice counts here); share of pay null with no pensionable pay. */
  readonly ownContribution: MeasureComparison & { readonly shareOfPay: ShareOfPay | null }
  /** The engine's pension total: your contribution, any relief your provider adds and other employer contributions. */
  readonly totalIntoPension: MeasureComparison
  readonly takeHome: MeasureComparison
  /** Average over the range: take-home given up per pound more into the pension, now to the target; null when the total does not change. */
  readonly costPerPound: Ratio | null
  /** The engine's marginal rate at the target: the share of each extra pound since its previous sweep point not out of spendable. */
  readonly marginalAtTarget: Ratio | null
  /** The engine's net cost per pound at the target: spendable given up per pound more, against no contribution. */
  readonly netCostPerPoundAtTarget: Ratio | null
}

/** An exact ratio of two amounts in lowest terms, the sign on the numerator; the denominator must not be nothing. */
function amountRatio(numerator: Money, denominator: Money): Ratio {
  const negative = compare(denominator, ZERO) < 0
  const top = negative ? subtract(ZERO, numerator) : numerator
  const bottom = negative ? subtract(ZERO, denominator) : denominator
  // Subtracting nothing returns the same ratio in lowest terms.
  return subtractRatio(ratio(toPence(top), toPence(bottom)), ratio(0, 1))
}

function measure(now: Money, next: Money): MeasureComparison {
  const monthNow = perPeriod(now, 'month')
  const monthNew = perPeriod(next, 'month')
  const change = subtract(next, now)
  return {
    annual: { now, new: next, change, percentChange: compare(now, ZERO) > 0 ? amountRatio(change, now) : null },
    monthly: { now: monthNow, new: monthNew, change: subtract(monthNew, monthNow) },
  }
}

/** The comparison of two engine points: arithmetic only. `pensionablePay` gives the share of pay (null or nothing: none). */
export function comparePoints(baseline: OptimiserPoint, target: OptimiserPoint, pensionablePay: Money | null): ContributionComparison {
  const share =
    pensionablePay !== null && compare(pensionablePay, ZERO) > 0
      ? (() => {
          const now = amountRatio(baseline.contribution, pensionablePay)
          const next = amountRatio(target.contribution, pensionablePay)
          return { now, new: next, changeInPoints: subtractRatio(next, now) }
        })()
      : null
  const extraPension = subtract(target.pension.total, baseline.pension.total)
  return {
    ok: true,
    ownContribution: { ...measure(baseline.contribution, target.contribution), shareOfPay: share },
    totalIntoPension: measure(baseline.pension.total, target.pension.total),
    takeHome: measure(baseline.takeHome, target.takeHome),
    costPerPound: compare(extraPension, ZERO) === 0 ? null : amountRatio(subtract(baseline.takeHome, target.takeHome), extraPension),
    marginalAtTarget: target.marginalRate,
    netCostPerPoundAtTarget: target.netCostPerPound,
  }
}

/**
 * The engine's point at a contribution: optimise() with that as the
 * current contribution, its point there. The marginal rate is measured from
 * the previous point of the sweep at `options.step` (the page's step by
 * default, from gross pay).
 */
export function pointAt(
  inputs: OptimiserInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  contribution: Money,
  options: OptimiseOptions = { step: pageSweepStep(inputs.grossPay), maxPoints: MAX_SWEEP_POINTS },
): OptimiserPoint | Refusal {
  const result = optimise({ ...inputs, pension: { method: inputs.pension.method, contribution } }, config, policy, options)
  if (!result.ok) return result
  return result.points.find((point) => compare(point.contribution, contribution) === 0)!
}

/** The contribution `baseline` against `target`, each worked out by the engine; a refusal if the config refuses either. */
export function compareContributions(
  inputs: OptimiserInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  baseline: Money,
  target: Money,
  options: { readonly pensionablePay: Money | null; readonly step?: Money },
): ContributionComparison | Refusal {
  const sweep = { step: options.step ?? pageSweepStep(inputs.grossPay), maxPoints: MAX_SWEEP_POINTS }
  const now = pointAt(inputs, config, policy, baseline, sweep)
  if (!('contribution' in now)) return now
  const next = pointAt(inputs, config, policy, target, sweep)
  if (!('contribution' in next)) return next
  return comparePoints(now, next, options.pensionablePay)
}
