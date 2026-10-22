import { formatPercent } from '@/lib/format'
import { compare, type Money, min, subtract, ZERO } from '@/lib/money'
import { perPeriod } from './breakdown'
import type { ContributionComparison } from './compare'
import { type ContributionRun, FULL_CHARGE_NOTE, THRESHOLD_NAMES, thresholdWords, type WarningRun, warningRuns } from './reading'
import type { EngineWarning, OptimiseResult, OptimiserPoint, PensionMethod, ThresholdContribution, ThresholdId } from './types'

/*
 * The compare redesign's words and choices: the picker's stops (now, each
 * threshold still ahead, the maximum), the target it opens on, clamping, the
 * one-sentence summary, warnings at the target and elsewhere, and the
 * milestones. Pure; no tax figure, and nothing is called the best. Signs are
 * said in words (rises, falls), amounts without a sign.
 */

export interface PickerStop {
  readonly id: 'now' | 'maximum' | ThresholdId
  readonly label: string
  readonly amount: Money
}

/** Thresholds the engine places above the contribution now and within the maximum, nearest first. */
function thresholdsAhead(sweep: OptimiseResult): ThresholdContribution[] {
  return sweep.thresholds
    .filter(
      (t) =>
        t.contribution !== null &&
        compare(t.contribution, sweep.currentContribution) > 0 &&
        compare(t.contribution, sweep.maximumContribution) <= 0,
    )
    .sort((a, b) => compare(a.contribution!, b.contribution!))
}

/** The picker's pills: now, each threshold still ahead (by the engine's thresholds), the maximum. */
export function pickerStops(sweep: OptimiseResult): PickerStop[] {
  return [
    { id: 'now', label: 'Now', amount: sweep.currentContribution },
    ...thresholdsAhead(sweep).map((t) => ({ id: t.threshold, label: THRESHOLD_NAMES[t.threshold], amount: t.contribution! })),
    { id: 'maximum', label: 'Maximum', amount: sweep.maximumContribution },
  ]
}

/** The target the picker opens on: the nearest threshold still ahead, or the contribution now when none is. */
export function defaultTarget(sweep: OptimiseResult): Money {
  return thresholdsAhead(sweep)[0]?.contribution ?? sweep.currentContribution
}

/** A requested target within the maximum, and whether it had to be brought down to it (the page says so). */
export function clampTarget(requested: Money, maximum: Money): { readonly target: Money; readonly clamped: boolean } {
  return { target: min(requested, maximum), clamped: compare(requested, maximum) > 0 }
}

const size = (amount: Money) => (compare(amount, ZERO) < 0 ? subtract(ZERO, amount) : amount)

/** "your take-home falls by £X a month (£Y a year)", the verb from the year's sign. */
function moves(
  subject: string,
  change: { readonly annual: { readonly change: Money }; readonly monthly: { readonly change: Money } },
  gbp: (amount: Money) => string,
) {
  const sign = compare(change.annual.change, ZERO)
  if (sign === 0) return `${subject} doesn’t change`
  return `${subject} ${sign > 0 ? 'rises' : 'falls'} by ${gbp(size(change.monthly.change))} a month (${gbp(size(change.annual.change))} a year)`
}

/** The one-sentence summary of a comparison: where the contribution moves, then take-home and the total paid into your pension. */
export function changeSentence(c: ContributionComparison, gbp: (amount: Money) => string): string {
  const own = c.ownContribution
  if (compare(own.annual.change, ZERO) === 0)
    return 'Your target is your contribution now, so there’s no change to compare. Choose another amount to see one.'
  const from = own.shareOfPay
    ? `Moving from ${formatPercent(own.shareOfPay.now)} to ${formatPercent(own.shareOfPay.new)} of pay`
    : `Moving from ${gbp(own.annual.now)} to ${gbp(own.annual.new)} a year`
  return `${from}: ${moves('your take-home', c.takeHome, gbp)} and ${moves('the total paid into your pension', c.totalIntoPension, gbp)}.`
}

/** The target's own warnings, in full, and every other warning of the sweep with the contributions it applies at. */
export function warningSplit(
  points: readonly OptimiserPoint[],
  target: OptimiserPoint,
): { readonly atTarget: readonly EngineWarning[]; readonly elsewhere: readonly WarningRun[] } {
  const here = new Set(target.warnings.map((w) => w.code))
  return { atTarget: target.warnings, elsewhere: warningRuns(points).filter((run) => !here.has(run.code)) }
}

/** Where a warning applies, said on what the sweep measures: your own contribution, for the year. */
export function runWords(runs: readonly ContributionRun[], maximum: Money, gbp: (amount: Money) => string): string {
  const one = (run: ContributionRun) =>
    compare(run.from, run.to) === 0
      ? `${gbp(run.from)} a year`
      : compare(run.to, maximum) >= 0
        ? `${gbp(run.from)} a year or more`
        : `between ${gbp(run.from)} and ${gbp(run.to)} a year`
  return `if your own contribution is ${runs.map(one).join(', or ')}`
}

export interface MilestoneWords {
  readonly name: string
  readonly status: 'alreadyUnder' | 'contributeMore' | 'outOfReach'
  readonly label: string
  readonly text: string
}

const LABELS: Record<MilestoneWords['status'], string> = {
  alreadyUnder: 'Already under',
  contributeMore: 'Ahead',
  outOfReach: 'Out of reach',
}

/**
 * A threshold as a milestone from the contribution now: already under it,
 * the extra to contribute a year and a month (the month rounded up to the
 * penny, so that much a month is enough), or out of reach with the reason.
 */
export function milestoneWords(t: ThresholdContribution, method: PensionMethod, gbp: (amount: Money) => string): MilestoneWords {
  const name = THRESHOLD_NAMES[t.threshold]
  const fullCharge = t.threshold === 'hicbcFullCharge' ? ` ${FULL_CHARGE_NOTE}` : ''
  if (t.status === 'alreadyMet')
    return { name, status: 'alreadyUnder', label: LABELS.alreadyUnder, text: `Already under at your contribution now.${fullCharge}` }
  if (t.status === 'reachable' && t.extra !== null)
    return {
      name,
      status: 'contributeMore',
      label: LABELS.contributeMore,
      text: `Contribute ${gbp(t.extra)} a year (${gbp(perPeriod(t.extra, 'month', 'up'))} a month) more.${fullCharge}`,
    }
  return { name, status: 'outOfReach', label: LABELS.outOfReach, text: thresholdWords(t, method, 'year', gbp).text }
}
