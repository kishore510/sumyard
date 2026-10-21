import { fromPence, type Money, type Ratio, ratio } from '@/lib/money'
import type { ContributionFrequency, Frequency } from '@/lib/periods'
import type { CompoundInputs } from '../types'

/*
 * Inputs for the compound interest tests (test-only). Every figure is made up
 * to exercise the engine; none is a tax figure or a forecast.
 */

/** Nothing invested, nothing grows: tests override what they need. */
export function inputs(overrides: Partial<CompoundInputs> = {}): CompoundInputs {
  return {
    lumpSum: fromPence(0),
    contribution: fromPence(0),
    contributionFrequency: 'annual',
    timing: 'end',
    years: 1,
    contributionIncrease: ratio(0, 1),
    growthRate: ratio(0, 1),
    compounding: 'annual',
    feeRate: ratio(0, 1),
    inflationRate: ratio(0, 1),
    ...overrides,
  }
}

/** Mulberry32: a small seeded generator for repeatable samples. */
export function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual']
export const CONTRIBUTION_FREQUENCIES: readonly ContributionFrequency[] = ['weekly', 'monthly', 'quarterly', 'annual']

/** A whole number from low to high inclusive. */
export const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

/** A rate in basis points of a percent (hundredths of a percent) as an exact Ratio. */
export const basisPoints = (n: number): Ratio => ratio(n, 10_000)

const pick = <T>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)]!

export interface RandomOptions {
  readonly maxYears: number
}

/** Seeded random inputs across every frequency and timing, within the engine's bounds. */
export function randomInputs(random: () => number, options: RandomOptions): CompoundInputs {
  const money = (max: number): Money => fromPence(between(random, 0, max))
  return inputs({
    lumpSum: money(100_000_000),
    contribution: money(500_000),
    contributionFrequency: pick(random, CONTRIBUTION_FREQUENCIES),
    timing: random() < 0.5 ? 'start' : 'end',
    years: between(random, 1, options.maxYears),
    contributionIncrease: basisPoints(random() < 0.3 ? 0 : between(random, 0, 1_000)),
    growthRate: basisPoints(between(random, -1_500, 2_000)),
    compounding: pick(random, FREQUENCIES),
    feeRate: basisPoints(random() < 0.3 ? 0 : between(random, 0, 300)),
    inflationRate: basisPoints(between(random, -300, 1_000)),
  })
}
