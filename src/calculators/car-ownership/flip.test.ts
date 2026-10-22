import { describe, expect, it } from 'vitest'
import { fromPence, type Money, type Ratio, ratio, toPence } from '@/lib/money'
import { flipPoints, ownershipCost } from './calc'
import { CASH, flat, generator, KEEP, KINDS, NONE, option, pcpOf, randomCase, shared } from './fixtures/inputs'
import type { CarOption, Flip, Lower, Shared, ValueCase } from './types'

/*
 * Flip points (decisions F22 and F29): where two options' net costs per month
 * of coverage are equal. Checked by costing both options again either side
 * of each threshold. Every figure is made up.
 */

const p = (pence: number) => fromPence(pence)

/** Which option is lower per month of coverage, compared exactly (net × the other's coverage). */
function lower(a: CarOption, b: CarOption, s: Shared, valueCase: ValueCase): Lower {
  const ra = ownershipCost(a, s)
  const rb = ownershipCost(b, s)
  if (!ra.ok || !rb.ok) throw new Error('refused')
  const left = BigInt(toPence(ra.result.cases[valueCase].netCost)) * BigInt(rb.result.coverageMonths)
  const right = BigInt(toPence(rb.result.cases[valueCase].netCost)) * BigInt(ra.result.coverageMonths)
  return left < right ? 0 : left > right ? 1 : 'tie'
}

const withEnd = (o: CarOption, valueCase: ValueCase, amount: Money): CarOption => ({
  ...o,
  car: { ...o.car, horizonValue: { ...o.car.horizonValue, [valueCase]: amount } },
})
const withMileage = (o: CarOption, miles: number): CarOption => ({ ...o, car: { ...o.car, annualMileage: miles } })

function flips(a: CarOption, b: CarOption, s: Shared, valueCase: ValueCase = 'expected') {
  const outcome = flipPoints([a, b], s, valueCase)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

function crossing<T>(flip: Flip<T>) {
  if (flip.kind !== 'crossing') throw new Error('no crossing')
  return flip
}

describe('horizon value: closed form (F29)', () => {
  const s = shared({ horizonMonths: 36 })
  const buy = option(CASH, { value: p(2_000_000), horizonValue: flat(p(800_000)) })
  const keep = option(KEEP, { value: p(1_500_000), horizonValue: flat(p(500_000)) })

  it('cash at a price of 20,000 pounds equals keeping (a net cost of 10,000 pounds) at an end value of 10,000 pounds', () => {
    const f = crossing(flips(buy, keep, s).horizonValue[0])
    expect(toPence(f.below)).toBe(1_000_000)
    expect(toPence(f.above)).toBe(1_000_000)
    expect(f.lowerBelow).toBe(1)
    expect(f.lowerAbove).toBe(0)
    expect(lower(withEnd(buy, 'expected', p(999_999)), keep, s, 'expected')).toBe(1)
    expect(lower(withEnd(buy, 'expected', p(1_000_000)), keep, s, 'expected')).toBe('tie')
    expect(lower(withEnd(buy, 'expected', p(1_000_001)), keep, s, 'expected')).toBe(0)
  })

  it('outside the range: no crossing', () => {
    const dear = option(CASH, { value: p(2_000_000), horizonValue: flat(p(800_000)) })
    // The other option's net cost (10,000,000 pence) is above anything the first can reach by its end value.
    const huge = option(CASH, { value: p(10_000_000), horizonValue: flat(p(0)) })
    const f = flips(dear, huge, s).horizonValue[0]
    expect(f).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 0 })
  })

  it('a car handed back before the horizon does not depend on its value: no crossing', () => {
    const handBack = option(pcpOf('hand-back', p(100_000), 24, NONE, p(400_000)), { value: p(1_000_000), horizonValue: flat(p(500_000)) })
    expect(flips(handBack, keep, s).horizonValue[0].kind).toBe('no-crossing-in-range')
  })

  it('two identical options tie throughout the shared searches, and cross at their own horizon value', () => {
    const f = flips(keep, keep, s)
    expect(f.savingsReturn).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 'tie' })
    expect(f.annualMileage).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 'tie' })
    expect(f.horizonValue[0]).toEqual({ kind: 'crossing', below: p(500_000), above: p(500_000), lowerBelow: 1, lowerAbove: 0 })
  })
})

describe('savings return and mileage: bounded search (F29)', () => {
  const s = shared({ horizonMonths: 48 })
  // Cash up front against a PCP paid monthly: a higher return makes the cash dearer.
  const cash = option(CASH, { value: p(2_000_000), horizonValue: flat(p(1_100_000)) })
  const pcp = option(pcpOf('buy', p(100_000), 36, ratio(3, 100), p(900_000)), { value: p(2_000_000), horizonValue: flat(p(1_100_000)) })

  it('finds the savings return where the order changes, either side of one step', () => {
    const f = crossing(flips(cash, pcp, s).savingsReturn)
    expect(f.lowerBelow).not.toBe(f.lowerAbove)
    expect(lower(cash, pcp, { ...s, savingsReturn: f.below }, 'expected')).toBe(f.lowerBelow)
    expect(lower(cash, pcp, { ...s, savingsReturn: f.above }, 'expected')).toBe(f.lowerAbove)
    const step = (r: Ratio) => r.numerator / r.denominator
    expect(step(f.above) - step(f.below)).toBeCloseTo(1e-9, 15)
  })

  // A cheap thirsty car against a dear frugal one: more miles favour the frugal one.
  const thirsty = option(CASH, {
    value: p(1_000_000),
    horizonValue: flat(p(500_000)),
    fuel: { kind: 'per-mile', pencePerMile: ratio(20, 1) },
  })
  const frugal = option(CASH, {
    value: p(1_500_000),
    horizonValue: flat(p(800_000)),
    fuel: { kind: 'per-mile', pencePerMile: ratio(5, 1) },
  })

  it('finds the mileage where the order changes, between neighbouring whole miles', () => {
    const f = crossing(flips(thirsty, frugal, s).annualMileage)
    expect(f.above).toBe(f.below + 1)
    expect(f.lowerBelow).toBe(0)
    expect(f.lowerAbove).toBe(1)
    expect(lower(withMileage(thirsty, f.below), withMileage(frugal, f.below), s, 'expected')).not.toBe(1)
    expect(lower(withMileage(thirsty, f.above), withMileage(frugal, f.above), s, 'expected')).toBe(1)
  })

  it('one option lower throughout: no crossing', () => {
    const always = option(CASH, {
      value: p(500_000),
      horizonValue: flat(p(400_000)),
      fuel: { kind: 'per-mile', pencePerMile: ratio(1, 1) },
    })
    expect(flips(always, frugal, s).annualMileage).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 0 })
  })
})

describe('flip points on seeded pairs: the order flips either side of each threshold', () => {
  const random = generator(31_316)
  const pairs: { a: CarOption; b: CarOption; s: Shared }[] = []
  while (pairs.length < 12) {
    const first = randomCase(random, KINDS[pairs.length % KINDS.length]!)
    const second = randomCase(random, KINDS[(pairs.length + 3) % KINDS.length]!)
    const s = { ...first.shared, horizonMonths: Math.max(first.shared.horizonMonths, 12) }
    if (ownershipCost(first.option, s).ok && ownershipCost(second.option, s).ok) pairs.push({ a: first.option, b: second.option, s })
  }

  it.each(pairs.map((pair, i) => [i, pair] as const))('pair %i', (_i, { a, b, s }) => {
    const f = flips(a, b, s)
    f.horizonValue.forEach((flip, which) => {
      if (flip.kind !== 'crossing') return
      const at = (x: Money) =>
        which === 0 ? lower(withEnd(a, 'expected', x), b, s, 'expected') : lower(a, withEnd(b, 'expected', x), s, 'expected')
      const limit = (toPence((which === 0 ? a : b).car.value) * 3) / 2
      const x = toPence(flip.below)
      if (x - 1 >= 0) expect(at(p(x - 1))).toBe(flip.lowerBelow)
      if (x + 1 <= limit) expect(at(p(x + 1))).toBe(flip.lowerAbove)
    })
    if (f.savingsReturn.kind === 'crossing') {
      expect(lower(a, b, { ...s, savingsReturn: f.savingsReturn.below }, 'expected')).toBe(f.savingsReturn.lowerBelow)
      expect(lower(a, b, { ...s, savingsReturn: f.savingsReturn.above }, 'expected')).toBe(f.savingsReturn.lowerAbove)
    }
    if (f.annualMileage.kind === 'crossing') {
      const { below, above } = f.annualMileage
      expect(above).toBe(below + 1)
      expect(lower(withMileage(a, below), withMileage(b, below), s, 'expected')).toBe(f.annualMileage.lowerBelow)
      expect(lower(withMileage(a, above), withMileage(b, above), s, 'expected')).toBe(f.annualMileage.lowerAbove)
    }
  })
})

describe('flip refusals', () => {
  it('passes on problems in either option', () => {
    const bad = option(CASH, { annualMileage: -1 })
    const outcome = flipPoints([option(CASH), bad], shared(), 'expected')
    expect(outcome.ok ? [] : outcome.problems).toContainEqual({ field: 'annualMileage', reason: 'below-minimum', option: 1 })
  })
})
