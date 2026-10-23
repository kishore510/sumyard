import { describe, expect, it } from 'vitest'
import { fromPence, type Money, type Ratio, toPence } from '@/lib/money'
import { PERIODS_PER_YEAR } from '@/lib/periods'
import { budget } from './calc'
import { between, generator, out, randomInputs } from './fixtures/inputs'
import type { BudgetInputs, BudgetResult } from './types'

/* Properties of the household budget engine over seeded random inputs (a failure names its case). Amounts are made up. */

const CASES = 300
const p = (m: Money) => toPence(m)

function run(i: BudgetInputs): BudgetResult {
  const outcome = budget(i)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const each = (seed: number, test: (c: BudgetInputs, random: () => number) => void) => {
  const random = generator(seed)
  for (let index = 0; index < CASES; index++) {
    const c = randomInputs(random)
    try {
      test(c, random)
    } catch (error) {
      throw new Error(`case ${index} ${JSON.stringify(c)}: ${(error as Error).message}`)
    }
  }
}

/** a + b === 1 exactly, in BigInt. */
const sumIsOne = (a: Ratio, b: Ratio) =>
  BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator) ===
  BigInt(a.denominator) * BigInt(b.denominator)

const shuffle = <T>(random: () => number, list: readonly T[]): T[] => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = between(random, 0, i)
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

describe('properties', () => {
  it('kind totals add up to outgoings, exactly', () =>
    each(1, (c) => {
      const r = run(c)
      expect(r.perKind.reduce((sum, t) => sum + p(t.year), 0)).toBe(p(r.outgoings.year))
    }))

  it('each line’s year is its amount times its periods, and the lines add up to the totals', () =>
    each(2, (c) => {
      const r = run(c)
      for (const l of [...r.incomeLines, ...r.outgoingLines]) expect(p(l.year)).toBe(p(l.line.amount) * PERIODS_PER_YEAR[l.line.period])
      expect(r.incomeLines.reduce((sum, l) => sum + p(l.year), 0)).toBe(p(r.income.year))
      expect(r.outgoingLines.reduce((sum, l) => sum + p(l.year), 0)).toBe(p(r.outgoings.year))
    }))

  it('leftover is income less outgoings, exactly', () =>
    each(3, (c) => {
      const r = run(c)
      expect(p(r.leftover.year)).toBe(p(r.income.year) - p(r.outgoings.year))
    }))

  it('the outgoings share and the leftover share add up to one exactly (or both are n/a with no income)', () =>
    each(4, (c) => {
      const r = run(c)
      if (p(r.income.year) === 0) {
        expect(r.outgoings.share).toBeNull()
        expect(r.leftover.share).toBeNull()
      } else expect(sumIsOne(r.outgoings.share!, r.leftover.share!)).toBe(true)
    }))

  it('adding a spending line never raises leftover', () =>
    each(5, (c, random) => {
      const before = run(c)
      const after = run({ ...c, outgoings: [...c.outgoings, { ...out(0, 'spending'), amount: fromPence(between(random, 0, 100_000)) }] })
      expect(p(after.leftover.year)).toBeLessThanOrEqual(p(before.leftover.year))
      expect(p(after.leftover.month)).toBeLessThanOrEqual(p(before.leftover.month))
    }))

  it('line order never changes the totals', () =>
    each(6, (c, random) => {
      const a = run(c)
      const b = run({ income: shuffle(random, c.income), outgoings: shuffle(random, c.outgoings) })
      expect(b.income).toEqual(a.income)
      expect(b.outgoings).toEqual(a.outgoings)
      expect(b.leftover).toEqual(a.leftover)
      expect(b.perKind).toEqual(a.perKind)
      expect(b.savingsRate).toEqual(a.savingsRate)
    }))

  it('every month figure is within half a penny of its year divided by the months', () =>
    each(7, (c) => {
      const r = run(c)
      for (const x of [r.income, r.outgoings, r.leftover, ...r.perKind, ...r.outgoingLines])
        expect(Math.abs(p(x.month) * PERIODS_PER_YEAR.monthly - p(x.year)) * 2).toBeLessThanOrEqual(PERIODS_PER_YEAR.monthly)
    }))
})
