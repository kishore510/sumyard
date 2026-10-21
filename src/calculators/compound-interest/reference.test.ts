import { describe, expect, it } from 'vitest'
import { toPence } from '@/lib/money'
import { PERIODS_PER_YEAR } from '@/lib/periods'
import { project } from './calc'
import { generator, randomInputs } from './fixtures/inputs'
import { distanceFromHalf, type Fraction, nearest, reference } from './fixtures/reference'
import type { CompoundInputs, CompoundResult } from './types'

/*
 * The engine against the independent closed-form reference
 * (fixtures/reference.ts) on 300 seeded random cases across every compounding
 * and contribution frequency, timing, fee, increase and inflation.
 *
 * Tolerance (docs/money.md, "Compound interest (slice 2a)"): the engine is
 * within about 10^-18 of a penny of the exact value (decision C9), so its one
 * rounding to the penny must equal the exact value rounded to the nearest
 * penny. The only exception allowed is an exact value within NEAR_HALF of a
 * half penny, where the two roundings may fall either side; then they may
 * differ by one penny. No seed here lands that close.
 */

const CASES = 300
const SEED = 20_261_021
const NEAR_HALF: Fraction = { n: 1n, d: 10n ** 12n }

const lessThan = (a: Fraction, b: Fraction) => a.n * b.d < b.n * a.d

function agrees(engine: number, exact: Fraction): boolean {
  const want = nearest(exact)
  if (BigInt(engine) === want) return true
  return lessThan(distanceFromHalf(exact), NEAR_HALF) && (BigInt(engine) - want === 1n || want - BigInt(engine) === 1n)
}

/** Root cases (m not a multiple of p) carry long binary fractions; keep their horizons shorter so the reference stays quick. */
const isRootCase = (i: CompoundInputs) => PERIODS_PER_YEAR[i.compounding] % PERIODS_PER_YEAR[i.contributionFrequency] !== 0

function sample(): CompoundInputs[] {
  const random = generator(SEED)
  const cases: CompoundInputs[] = []
  while (cases.length < CASES) {
    const candidate = randomInputs(random, { maxYears: 30 })
    cases.push(isRootCase(candidate) ? { ...candidate, years: Math.min(candidate.years, 12) } : candidate)
  }
  return cases
}

function result(i: CompoundInputs): CompoundResult {
  const outcome = project(i)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

describe('engine against the closed-form reference (300 seeded cases)', () => {
  const cases = sample()

  it('covers every compounding frequency, contribution frequency and timing, and root cases', () => {
    expect(new Set(cases.map((c) => c.compounding)).size).toBe(5)
    expect(new Set(cases.map((c) => c.contributionFrequency)).size).toBe(4)
    expect(new Set(cases.map((c) => c.timing)).size).toBe(2)
    expect(cases.filter(isRootCase).length).toBeGreaterThan(30)
    expect(cases.filter((c) => c.growthRate.numerator < 0).length).toBeGreaterThan(10)
  })

  it.each(cases.map((c, index) => [index, c] as const))('case %i', (_index, c) => {
    const r = result(c)
    for (const [views, withFee] of [
      [r.withFee, true],
      [r.noFee, false],
    ] as const) {
      const ref = reference(c, withFee)
      expect(agrees(toPence(views.nominal.closing), ref.closing), `nominal closing, fee ${withFee}`).toBe(true)
      expect(agrees(toPence(views.real.closing), ref.realClosing), `real closing, fee ${withFee}`).toBe(true)
      expect(agrees(toPence(views.nominal.contributions), ref.contributions), 'contributions').toBe(true)
    }
  })
})

describe('the tolerance helpers', () => {
  it('a value a whole penny from any half is not near a half', () => {
    expect(lessThan(distanceFromHalf({ n: 7n, d: 1n }), NEAR_HALF)).toBe(false)
    expect(lessThan(distanceFromHalf({ n: 15n, d: 2n }), NEAR_HALF)).toBe(true)
    expect(nearest({ n: 15n, d: 2n })).toBe(8n)
    expect(nearest({ n: -15n, d: 2n })).toBe(-8n)
  })
})
