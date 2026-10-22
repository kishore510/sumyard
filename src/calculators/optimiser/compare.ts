import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { Money, Ratio } from '@/lib/money'
import type { ModellingPolicy, OptimiseOptions, OptimiserInputs, OptimiserPoint } from './types'

/*
 * The contribution now against a target (the compare redesign, 0.21.0).
 * Stub: the red commit's tests import these names.
 */

/** One figure now and at the target, and the change (new less now). */
export interface PeriodFigures {
  readonly now: Money
  readonly new: Money
  readonly change: Money
}

export interface MeasureComparison {
  readonly annual: PeriodFigures & { readonly percentChange: Ratio | null }
  readonly monthly: PeriodFigures
}

export interface ShareOfPay {
  readonly now: Ratio
  readonly new: Ratio
  readonly changeInPoints: Ratio
}

export interface ContributionComparison {
  readonly ok: true
  readonly ownContribution: MeasureComparison & { readonly shareOfPay: ShareOfPay | null }
  readonly totalIntoPension: MeasureComparison
  readonly takeHome: MeasureComparison
  readonly costPerPound: Ratio | null
  readonly marginalAtTarget: Ratio | null
  readonly netCostPerPoundAtTarget: Ratio | null
}

export function pointAt(
  _inputs: OptimiserInputs,
  _config: TaxYearConfig,
  _policy: ModellingPolicy,
  _contribution: Money,
  _options?: OptimiseOptions,
): OptimiserPoint | Refusal {
  throw new Error('not built yet')
}

export function comparePoints(_baseline: OptimiserPoint, _target: OptimiserPoint, _pensionablePay: Money | null): ContributionComparison {
  throw new Error('not built yet')
}

export function compareContributions(
  _inputs: OptimiserInputs,
  _config: TaxYearConfig,
  _policy: ModellingPolicy,
  _baseline: Money,
  _target: Money,
  _options: { readonly pensionablePay: Money | null; readonly step?: Money },
): ContributionComparison | Refusal {
  throw new Error('not built yet')
}
