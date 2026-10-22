import { compare, fromPounds, type Money, mulRound, subtract, toPence } from '@/lib/money'
import { type BreakdownPeriod, perPeriod } from './breakdown'
import type {
  ChildcareScheme,
  EngineWarning,
  OptimiseResult,
  OptimiserPoint,
  PensionMethod,
  ThresholdContribution,
  ThresholdId,
} from './types'

/*
 * Reading optimise()'s result on the take-home page (part 1b-ii-b; the
 * compare redesign removed the zoomed range, the change against now and the
 * compare rows): the point at the current contribution, the point nearest a
 * chosen one, the cost of more pension, thresholds in words, and warnings
 * and childcare by run. Pure; no tax figure here, and no point is called
 * the best.
 */

/** The point at the current contribution (optimise() always includes it). */
export function currentPoint(result: OptimiseResult): OptimiserPoint {
  return result.points.find((point) => compare(point.contribution, result.currentContribution) === 0) ?? result.points[0]!
}

/** The point whose contribution is nearest `contribution`; the lower one on a tie. `points` is in order and not empty. */
export function nearestPoint(points: readonly OptimiserPoint[], contribution: Money): OptimiserPoint {
  let best = points[0]!
  for (const point of points) {
    const gap = Math.abs(toPence(subtract(point.contribution, contribution)))
    if (gap < Math.abs(toPence(subtract(best.contribution, contribution)))) best = point
  }
  return best
}

/** The unit the cost of more pension is said in. */
export const ONE_POUND: Money = fromPounds(1)

export interface CostOfMore {
  /** Spendable given up per pound into the pension, against no contribution (the engine's net cost per pound); null at none. */
  readonly sinceNothing: Money | null
  /** Since the previous point (from): of each extra pound into the pension, what did not come out of spendable (kept) and what did (cost). */
  readonly sincePrevious: { readonly from: Money; readonly kept: Money; readonly cost: Money } | null
}

/**
 * The cost of a pound more pension at a point, from the engine's
 * netCostPerPound and marginalRate, as pence of a pound to the nearest penny.
 * `points` is the whole sweep, so "previous" is the engine's previous point.
 */
export function costOfMore(points: readonly OptimiserPoint[], point: OptimiserPoint): CostOfMore {
  const index = points.indexOf(point)
  const previous = index > 0 ? points[index - 1]! : null
  const kept = point.marginalRate === null ? null : mulRound(ONE_POUND, point.marginalRate, 'nearest')
  return {
    sinceNothing: point.netCostPerPound === null ? null : mulRound(ONE_POUND, point.netCostPerPound, 'nearest'),
    sincePrevious: kept === null || previous === null ? null : { from: previous.contribution, kept, cost: subtract(ONE_POUND, kept) },
  }
}

/** Each threshold's name, for the list in words. */
export const THRESHOLD_NAMES: Record<ThresholdId, string> = {
  personalAllowanceTaperStart: 'Personal allowance taper start',
  personalAllowanceTaperEnd: 'Personal allowance taper end (no allowance left)',
  hicbcThreshold: 'Child Benefit charge threshold',
  hicbcFullCharge: 'Child Benefit charge full-charge point',
  taxFreeChildcareLimit: 'Tax-Free Childcare income limit',
  thirtyHoursLimit: 'Free Childcare for Working Parents income limit',
  annualAllowanceThresholdIncome: 'Annual allowance taper: threshold income limit',
}

const MEASURE_WORDS: Record<ThresholdContribution['measure'], string> = {
  adjustedNetIncome: 'adjusted net income',
  thresholdIncome: 'threshold income',
}

const METHOD_WORDS: Record<PensionMethod, string> = {
  salarySacrifice: 'salary sacrifice',
  netPay: 'a net pay arrangement',
  reliefAtSource: 'relief at source',
}

/** Said with the Child Benefit charge's full-charge point: the whole charge still applies there. */
export const FULL_CHARGE_NOTE = 'At the full-charge point the whole charge still applies: it first falls a penny below it.'

export interface ThresholdWords {
  readonly name: string
  readonly status: 'alreadyUnder' | 'contributeMore' | 'outOfReach'
  readonly text: string
}

/**
 * A threshold from optimise() in words, for the period: already under at
 * the contribution now, the extra to contribute (a month, rounded up to the
 * penny, so that much a month is enough), or out of reach with the reason.
 * The limit is the engine's, a year's figure as the measure is.
 */
export function thresholdWords(
  threshold: ThresholdContribution,
  method: PensionMethod,
  period: BreakdownPeriod,
  gbp: (amount: Money) => string,
): ThresholdWords {
  const name = THRESHOLD_NAMES[threshold.threshold]
  const measure = MEASURE_WORDS[threshold.measure]
  const limit = `${gbp(threshold.limit)} for the year`
  const suffix = period === 'year' ? ' a year' : ' a month'
  const more = (extra: Money) => `${gbp(perPeriod(extra, period, 'up'))} more${suffix}`
  const fullCharge = threshold.threshold === 'hicbcFullCharge' ? ` ${FULL_CHARGE_NOTE}` : ''
  if (threshold.status === 'alreadyMet')
    return {
      name,
      status: 'alreadyUnder',
      text: `Already under: at your contribution now, ${measure} is at or under ${limit}.${fullCharge}`,
    }
  if (threshold.status === 'reachable' && threshold.extra !== null)
    return {
      name,
      status: 'contributeMore',
      text: `Contribute ${more(threshold.extra)} to bring ${measure} down to ${limit}.${fullCharge}`,
    }
  const reason =
    threshold.reason === 'notLoweredByMethod'
      ? `${METHOD_WORDS[method]} does not lower ${measure} (a salary sacrifice is added back to it).`
      : threshold.reason === 'overAllowance' && threshold.extra !== null
        ? `${more(threshold.extra)} would bring ${measure} down to ${limit}, but your pension savings would then be over the annual allowance available, with a charge (shown in the warnings, not stopped).`
        : threshold.extra !== null
          ? `it would take ${more(threshold.extra)}: going into your pension, gross, that is more than your pay.`
          : 'going into your pension, gross, it would take more than your pay.'
  return { name, status: 'outOfReach', text: `Out of reach: ${reason}${fullCharge}` }
}

export interface ContributionRun {
  readonly from: Money
  readonly to: Money
}

/** Runs of neighbouring points (in sweep order) for which `holds` is true, by contribution. */
function runsWhere(points: readonly OptimiserPoint[], holds: (point: OptimiserPoint) => boolean): ContributionRun[] {
  const runs: { from: Money; to: Money }[] = []
  let open = false
  for (const point of points) {
    if (!holds(point)) open = false
    else if (open) runs[runs.length - 1]!.to = point.contribution
    else {
      runs.push({ from: point.contribution, to: point.contribution })
      open = true
    }
  }
  return runs
}

export interface WarningRun {
  readonly code: EngineWarning['code']
  readonly message: string
  readonly runs: readonly ContributionRun[]
}

/** Every warning any point carries, in order of first appearance, with each run of neighbouring points carrying it. Nothing is left out. */
export function warningRuns(points: readonly OptimiserPoint[]): WarningRun[] {
  const first = new Map<EngineWarning['code'], string>()
  for (const point of points) for (const warning of point.warnings) if (!first.has(warning.code)) first.set(warning.code, warning.message)
  return [...first].map(([code, message]) => ({
    code,
    message,
    runs: runsWhere(points, (point) => point.warnings.some((w) => w.code === code)),
  }))
}

/** Per childcare scheme checked, the runs of points eligible on income (adjusted net income at or under the limit); empty when not checked. */
export function childcareRuns(
  points: readonly OptimiserPoint[],
): { readonly scheme: ChildcareScheme; readonly eligible: readonly ContributionRun[] }[] {
  const schemes = points[0]?.childcare.map((c) => c.scheme) ?? []
  return schemes.map((scheme) => ({
    scheme,
    eligible: runsWhere(points, (point) => point.childcare.some((c) => c.scheme === scheme && c.eligibleOnIncome)),
  }))
}

/** What the childcare check leaves out: it is eligibility on income only. */
export const CHILDCARE_NOT_CHECKED =
  'Eligibility on your adjusted net income only. Not checked: a partner’s income, minimum expected earnings, the child’s age and circumstances, immigration status, Universal Credit or childcare vouchers, and for Free Childcare for Working Parents living in England. The support itself is not counted in spendable.'
