import { compare, type Money, subtract, toPence } from '@/lib/money'
import { type BreakdownPeriod, perPeriod } from './breakdown'
import type { ChartView } from './chartData'
import type { OptimiseResult, OptimiserPoint } from './types'

/*
 * Reading optimise()'s result on the take-home page (part 1b-ii-b): the
 * point at the current contribution, the point nearest a chosen one, and
 * each point's change against now, for the page's period. Pure; no tax
 * figure here, and no point is called the best.
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
