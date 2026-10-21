import { add, compare, fromPounds, type Money, max, min, mulRound, subtract, toPence, ZERO } from '@/lib/money'
import { ZOOM_MARGIN } from '@/lib/sweep'
import { type BreakdownPeriod, perPeriod } from './breakdown'
import type { ChartView } from './chartData'
import type { Cliff, OptimiseResult, OptimiserPoint, PensionMethod, ThresholdContribution, ThresholdId } from './types'

/*
 * Reading optimise()'s result on the take-home page (part 1b-ii-b): the
 * point at the current contribution, the point nearest a chosen one, and
 * each point's change against now, for the page's period, and the zoomed
 * range around the current contribution. Pure; no tax figure here, and no
 * point is called the best.
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

/** Each point's value for the period less the value at `now` for the period: signed, nothing at now. */
export function changeVsNow(points: readonly OptimiserPoint[], now: OptimiserPoint, view: ChartView, period: BreakdownPeriod): Money[] {
  const base = perPeriod(now[view], period)
  return points.map((point) => subtract(perPeriod(point[view], period), base))
}

export interface ZoomRange {
  readonly from: Money
  readonly to: Money
}

/**
 * The chart's default range: from a margin below the current contribution to
 * a margin past the furthest threshold point ahead of it (any threshold the
 * engine places above the current contribution and within the modelled
 * range), inside nothing to the maximum. The margin is ZOOM_MARGIN of that
 * span, at least two sweep steps. Null when no threshold point lies ahead or
 * the range would be the whole sweep: the chart then shows every point.
 */
export function zoomRange(result: OptimiseResult): ZoomRange | null {
  const current = result.currentContribution
  const ahead = result.thresholds.flatMap((t) =>
    t.contribution !== null && compare(t.contribution, current) > 0 && compare(t.contribution, result.maximumContribution) <= 0
      ? [t.contribution]
      : [],
  )
  if (ahead.length === 0) return null
  const top = max(ahead[0]!, ...ahead)
  const margin = max(mulRound(subtract(top, current), ZOOM_MARGIN, 'nearest'), add(result.step, result.step))
  const from = max(ZERO, subtract(current, margin))
  const to = min(result.maximumContribution, add(top, margin))
  if (compare(from, ZERO) === 0 && compare(to, result.maximumContribution) === 0) return null
  return { from, to }
}

/** The points and cliffs inside a range (both ends included); all of them for no range. */
export function pointsIn(
  result: OptimiseResult,
  range: ZoomRange | null,
): { readonly points: readonly OptimiserPoint[]; readonly cliffs: readonly Cliff[] } {
  if (range === null) return { points: result.points, cliffs: result.cliffs }
  const inside = (amount: Money) => compare(amount, range.from) >= 0 && compare(amount, range.to) <= 0
  return {
    points: result.points.filter((point) => inside(point.contribution)),
    cliffs: result.cliffs.filter((cliff) => inside(cliff.from) && inside(cliff.to)),
  }
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
  const fullCharge =
    threshold.threshold === 'hicbcFullCharge'
      ? ' At the full-charge point the whole charge still applies: it first falls a penny below it.'
      : ''
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
