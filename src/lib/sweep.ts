import { fromPence, fromPounds, type Money, toPence } from './money'
import { MONTHS_PER_YEAR } from './periods'

/*
 * Defaults for the optimiser's contribution sweep (decision G13 in
 * docs/modelling-decisions.md). They are display choices, not tax figures:
 * how finely the take-home curve is drawn and how many points it may have.
 * They live outside the engine so its literal guard holds.
 */

/** Distance between sweep points: a contribution every this many pence. */
export const DEFAULT_SWEEP_STEP: Money = fromPounds(500)

/** The sweep step in the take-home page's month view, a month: a round monthly amount (1b-ii-b). */
export const DEFAULT_MONTHLY_SWEEP_STEP: Money = fromPounds(50)

/** The most sweep points one call may produce. */
export const MAX_SWEEP_POINTS = 10_000

/** The most sweep points the take-home page asks for, so the chart and its table stay quick to draw on a phone. */
export const PAGE_SWEEP_POINTS = 400

/**
 * The page's sweep step (for the year) for contributions from nothing to
 * `range`: the default step, or the smallest whole multiple of it that keeps
 * the sweep within PAGE_SWEEP_POINTS. In the month view the base step is the
 * monthly step for a year, so each point is a round amount a month.
 */
export function pageSweepStep(range: Money, period: 'year' | 'month' = 'year'): Money {
  const base = period === 'month' ? toPence(DEFAULT_MONTHLY_SWEEP_STEP) * MONTHS_PER_YEAR : toPence(DEFAULT_SWEEP_STEP)
  // floor(range / (k × step)) + 1 points fit the budget exactly when k × step × PAGE_SWEEP_POINTS > range.
  const times = Math.floor(Math.max(0, toPence(range)) / (base * PAGE_SWEEP_POINTS)) + 1
  return fromPence(base * times)
}

/**
 * Next pound (C1, CP3): the step of the finer scan between two neighbouring
 * sweep points, before the search in whole pence. A dip in the cost of a
 * contribution narrower than this (a HICBC step, a penny effect) between two
 * sweep points can be passed over; the search is exact within the last step.
 */
export const NEXT_POUND_REFINE_STEP: Money = fromPounds(10)
