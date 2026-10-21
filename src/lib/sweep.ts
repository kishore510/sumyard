import { fromPence, fromPounds, type Money, toPence } from './money'

/*
 * Defaults for the optimiser's contribution sweep (decision G13 in
 * docs/modelling-decisions.md). They are display choices, not tax figures:
 * how finely the take-home curve is drawn and how many points it may have.
 * They live outside the engine so its literal guard holds.
 */

/** Distance between sweep points: a contribution every this many pence. */
export const DEFAULT_SWEEP_STEP: Money = fromPounds(500)

/** The most sweep points one call may produce. */
export const MAX_SWEEP_POINTS = 10_000

/** The most sweep points the take-home page asks for, so the chart and its table stay quick to draw on a phone. */
export const PAGE_SWEEP_POINTS = 400

/**
 * The page's sweep step for contributions from nothing to `range`: the
 * default step, or the smallest whole multiple of it that keeps the sweep
 * within PAGE_SWEEP_POINTS.
 */
export function pageSweepStep(range: Money): Money {
  // floor(range / (k × step)) + 1 points fit the budget exactly when k × step × PAGE_SWEEP_POINTS > range.
  const times = Math.floor(Math.max(0, toPence(range)) / (toPence(DEFAULT_SWEEP_STEP) * PAGE_SWEEP_POINTS)) + 1
  return fromPence(toPence(DEFAULT_SWEEP_STEP) * times)
}
