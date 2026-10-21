import { add, compare, fromPounds, type Money, max, min, mulRound, subtract, toPence, ZERO } from '@/lib/money'
import { ZOOM_MARGIN } from '@/lib/sweep'
import { type BreakdownPeriod, perPeriod } from './breakdown'
import type { ChartView } from './chartData'
import type { Cliff, OptimiseResult, OptimiserPoint } from './types'

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
