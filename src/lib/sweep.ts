import { fromPounds, type Money } from './money'

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
