import { describe, expect, it } from 'vitest'
import { compareRatio, fromPence, fromPounds, type Money, ratio, toPence } from '@/lib/money'
import { project } from './calc'
import { basisPoints, between, generator, inputs, randomInputs } from './fixtures/inputs'
import { nearest, reference } from './fixtures/reference'
import type { CompoundInputs, CompoundResult, Projection } from './types'

/*
 * Properties over seeded random inputs (a failure names its case). Every
 * figure is made up.
 */

const CASES = 150
const pence = (m: Money) => toPence(m)

function run(i: CompoundInputs): CompoundResult {
  const outcome = project(i)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

function sample(seed: number, count = CASES, maxYears = 25): CompoundInputs[] {
  const random = generator(seed)
  return Array.from({ length: count }, () => randomInputs(random, { maxYears }))
}

const each = (seed: number, test: (c: CompoundInputs, random: () => number) => void) => {
  const random = generator(seed + 1)
  for (const [index, c] of sample(seed).entries()) {
    try {
      test(c, random)
    } catch (error) {
      throw new Error(`case ${index} ${JSON.stringify(c)}: ${(error as Error).message}`)
    }
  }
}

function addsUp(projection: Projection) {
  let opening = projection.lumpSum
  let contributions = 0
  let growth = 0
  let fees = 0
  for (const row of projection.rows) {
    expect(row.opening).toBe(opening)
    expect(pence(row.opening) + pence(row.contributions) + pence(row.growth) - pence(row.fees)).toBe(pence(row.closing))
    contributions += pence(row.contributions)
    growth += pence(row.growth)
    fees += pence(row.fees)
    expect(pence(row.cumulativeContributions)).toBe(contributions)
    expect(pence(row.cumulativeGrowth)).toBe(growth)
    expect(pence(row.cumulativeFees)).toBe(fees)
    opening = row.closing
  }
  expect(pence(projection.contributions)).toBe(contributions)
  expect(pence(projection.growth)).toBe(growth)
  expect(pence(projection.fees)).toBe(fees)
  expect(projection.closing).toBe(opening)
  expect(pence(projection.lumpSum) + contributions + growth - fees).toBe(pence(projection.closing))
}

describe('properties', () => {
  it('zero growth and no fee: the lump sum plus contributions, nothing else', () => {
    each(101, (c) => {
      const r = run({ ...c, growthRate: ratio(0, 1), feeRate: ratio(0, 1) })
      const nominal = r.withFee.nominal
      expect(pence(nominal.growth)).toBe(0)
      expect(pence(nominal.closing)).toBe(pence(c.lumpSum) + pence(nominal.contributions))
    })
  })

  it('more contributions never lower the result', () => {
    each(102, (c, random) => {
      const more = { ...c, contribution: fromPence(pence(c.contribution) + between(random, 1, 100_000)) }
      expect(pence(run(more).withFee.nominal.closing)).toBeGreaterThanOrEqual(pence(run(c).withFee.nominal.closing))
      const bigger = { ...c, lumpSum: fromPence(pence(c.lumpSum) + between(random, 1, 100_000)) }
      expect(pence(run(bigger).withFee.nominal.closing)).toBeGreaterThanOrEqual(pence(run(c).withFee.nominal.closing))
    })
  })

  it('a higher growth rate never lowers the result (no fee)', () => {
    each(103, (c, random) => {
      const base = { ...c, feeRate: ratio(0, 1) }
      const higher = { ...base, growthRate: basisPoints(Math.min(5_000, c.growthRate.numerator + between(random, 1, 500))) }
      expect(pence(run(higher).noFee.nominal.closing)).toBeGreaterThanOrEqual(pence(run(base).noFee.nominal.closing))
    })
  })

  it('with the fee never above without it; fee drag is the difference and never negative', () => {
    each(104, (c) => {
      const r = run(c)
      expect(pence(r.withFee.nominal.closing)).toBeLessThanOrEqual(pence(r.noFee.nominal.closing))
      expect(pence(r.withFee.real.closing)).toBeLessThanOrEqual(pence(r.noFee.real.closing))
      expect(pence(r.feeDrag.nominal)).toBe(pence(r.noFee.nominal.closing) - pence(r.withFee.nominal.closing))
      expect(pence(r.feeDrag.real)).toBe(pence(r.noFee.real.closing) - pence(r.withFee.real.closing))
      expect(pence(r.feeDrag.nominal)).toBeGreaterThanOrEqual(0)
    })
  })

  it('real never above nominal when inflation is positive, year by year', () => {
    each(105, (c) => {
      if (compareRatio(c.inflationRate, ratio(0, 1)) <= 0) return
      const r = run(c)
      r.withFee.real.rows.forEach((row, k) => {
        expect(pence(row.closing)).toBeLessThanOrEqual(pence(r.withFee.nominal.rows[k]!.closing))
      })
    })
  })

  it('yearly rows add up to the totals, in every view', () => {
    each(106, (c) => {
      const r = run(c)
      for (const projection of [r.withFee.nominal, r.withFee.real, r.noFee.nominal, r.noFee.real]) {
        expect(projection.rows).toHaveLength(c.years)
        addsUp(projection)
      }
      expect(r.noFee.nominal.fees).toBe(fromPence(0))
    })
  })

  it('start-of-period at least end-of-period when the balance grows; at most when it shrinks', () => {
    each(107, (c) => {
      const start = run({ ...c, timing: 'start', feeRate: ratio(0, 1) }).noFee.nominal.closing
      const end = run({ ...c, timing: 'end', feeRate: ratio(0, 1) }).noFee.nominal.closing
      const sign = compareRatio(c.growthRate, ratio(0, 1))
      if (sign >= 0) expect(pence(start)).toBeGreaterThanOrEqual(pence(end))
      else expect(pence(start)).toBeLessThanOrEqual(pence(end))
    })
  })

  it('a year’s nominal contributions are the same whatever the rate, fee or timing', () => {
    each(108, (c) => {
      const a = run(c).withFee.nominal.contributions
      const b = run({ ...c, growthRate: ratio(0, 1), feeRate: ratio(0, 1), timing: c.timing === 'start' ? 'end' : 'start' }).withFee.nominal
        .contributions
      expect(a).toBe(b)
    })
  })
})

describe('matching and mismatched frequencies', () => {
  const closing = (overrides: Partial<CompoundInputs>) => pence(run(inputs(overrides)).withFee.nominal.closing)
  const exact = (overrides: Partial<CompoundInputs>) => Number(nearest(reference(inputs(overrides), true).closing))

  it('monthly compounding with monthly contributions equals the closed form, start and end', () => {
    for (const timing of ['start', 'end'] as const) {
      const overrides = {
        lumpSum: fromPounds(2500),
        contribution: fromPounds(150),
        contributionFrequency: 'monthly',
        compounding: 'monthly',
        growthRate: ratio(7, 100),
        feeRate: ratio(3, 1000),
        timing,
        years: 20,
      } as const
      expect(closing(overrides)).toBe(exact(overrides))
    }
  })

  it('weekly contributions with monthly compounding (a root): a lump sum still grows by the monthly rate', () => {
    // 52 weekly steps at the equivalent rate make up exactly a year of monthly compounding.
    const overrides = {
      lumpSum: fromPounds(10_000),
      contributionFrequency: 'weekly',
      compounding: 'monthly',
      growthRate: ratio(1, 20),
      years: 10,
    } as const
    expect(closing(overrides)).toBe(exact({ ...overrides, contributionFrequency: 'monthly' }))
  })

  it('weekly contributions with monthly compounding: between paying the year at its start and at its end', () => {
    const base = {
      contribution: fromPounds(52),
      contributionFrequency: 'weekly',
      compounding: 'monthly',
      growthRate: ratio(1, 20),
      years: 1,
    } as const
    const weekly = closing(base)
    const atStart = closing({ ...base, contribution: fromPounds(2704), contributionFrequency: 'annual', timing: 'start' })
    const atEnd = closing({ ...base, contribution: fromPounds(2704), contributionFrequency: 'annual', timing: 'end' })
    expect(weekly).toBeGreaterThan(atEnd)
    expect(weekly).toBeLessThan(atStart)
    expect(weekly).toBe(exact(base))
  })

  it('annual contributions with monthly compounding, and monthly contributions with annual compounding', () => {
    const a = {
      contribution: fromPounds(1200),
      contributionFrequency: 'annual',
      compounding: 'monthly',
      growthRate: ratio(1, 20),
      timing: 'start',
      years: 15,
    } as const
    expect(closing(a)).toBe(exact(a))
    const b = {
      contribution: fromPounds(100),
      contributionFrequency: 'monthly',
      compounding: 'annual',
      growthRate: ratio(1, 20),
      years: 15,
    } as const
    expect(closing(b)).toBe(exact(b))
    // Monthly payments at the end earn a little within each year, so they beat one payment at the year end.
    expect(closing(b)).toBeGreaterThan(closing({ ...b, contribution: fromPounds(1200), contributionFrequency: 'annual' }))
  })

  it('daily compounding with weekly contributions over a long horizon', () => {
    const overrides = {
      lumpSum: fromPounds(1000),
      contribution: fromPounds(20),
      contributionFrequency: 'weekly',
      compounding: 'daily',
      growthRate: ratio(1, 25),
      years: 5,
    } as const
    expect(closing(overrides)).toBe(exact(overrides))
  })
})
