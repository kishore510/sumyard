import type { Money } from '@/lib/money'
import type { ContributionComparison } from './compare'
import type { ContributionRun, WarningRun } from './reading'
import type { EngineWarning, OptimiseResult, OptimiserPoint, PensionMethod, ThresholdContribution, ThresholdId } from './types'

/* The compare redesign's words (0.21.0). Stub: the red commit's tests import these names. */

export interface PickerStop {
  readonly id: 'now' | 'maximum' | ThresholdId
  readonly label: string
  readonly amount: Money
}

export function pickerStops(_sweep: OptimiseResult): PickerStop[] {
  throw new Error('not built yet')
}

export function defaultTarget(_sweep: OptimiseResult): Money {
  throw new Error('not built yet')
}

export function clampTarget(_requested: Money, _maximum: Money): { readonly target: Money; readonly clamped: boolean } {
  throw new Error('not built yet')
}

export function changeSentence(_c: ContributionComparison, _gbp: (amount: Money) => string): string {
  throw new Error('not built yet')
}

export function warningSplit(
  _points: readonly OptimiserPoint[],
  _target: OptimiserPoint,
): { readonly atTarget: readonly EngineWarning[]; readonly elsewhere: readonly WarningRun[] } {
  throw new Error('not built yet')
}

export function runWords(_runs: readonly ContributionRun[], _maximum: Money, _gbp: (amount: Money) => string): string {
  throw new Error('not built yet')
}

export interface MilestoneWords {
  readonly name: string
  readonly status: 'alreadyUnder' | 'contributeMore' | 'outOfReach'
  readonly label: string
  readonly text: string
}

export function milestoneWords(_t: ThresholdContribution, _method: PensionMethod, _gbp: (amount: Money) => string): MilestoneWords {
  throw new Error('not built yet')
}
