import { describe, expect, it } from 'vitest'
import { compareExact, type ExactPence, exact, exactAdd, exactMul, exactSubtract, fromPence, ratio, roundExact, toPence } from '@/lib/money'
import { compareOptions, costBridge, ownershipCost } from './calc'
import { CASH, flat, generator, KEEP, KINDS, keepOwing, NO_RUNNING, option, pcpOf, randomCase, randomOwingCase, shared } from './fixtures/inputs'
import type { Breakdown, CarOption, OwnershipResult, Shared, ValueCase } from './types'

/*
 * Session 3d-2: the cost bridge (F55). The difference in average cost per
 * month owned between two options that both cover the horizon, split by the
 * engine's breakdown parts. Every figure is made up.
 */

const PARTS: readonly (keyof Breakdown)[] = [
  'interestAndFees',
  'depreciation',
  'equityHandedBack',
  'fuel',
  'insurance',
  'maintenance',
  'ved',
  'other',
  'opportunityCost',
]
const CASES: readonly ValueCase[] = ['low', 'expected', 'high']

function cost(o: CarOption, s: Shared): OwnershipResult {
  const outcome = ownershipCost(o, s)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const zero = exact(fromPence(0))
const sumExact = (amounts: readonly ExactPence[]) => amounts.reduce(exactAdd, zero)
const neg = (a: ExactPence) => exactSubtract(zero, a)

describe('the cost bridge (F55)', () => {
  const s = shared({ horizonMonths: 36, savingsReturn: ratio(4, 100) })
  const buy = option(CASH, { value: fromPence(2_000_000), horizonValue: flat(fromPence(1_100_000)) })
  const kept = option(KEEP, { value: fromPence(800_000), horizonValue: flat(fromPence(400_000)), running: NO_RUNNING })

  it('splits the difference in average cost per month owned by part: each part the difference of the two parts over the months', () => {
    const a = cost(buy, s)
    const b = cost(kept, s)
    const bridge = costBridge(a, b, 'expected')!
    expect(bridge.months).toBe(36)
    expect(bridge.parts.map((p) => p.id)).toEqual(PARTS)
    for (const part of bridge.parts) {
      const diff = toPence(a.cases.expected.breakdown[part.id]) - toPence(b.cases.expected.breakdown[part.id])
      expect(part.exact).toEqual(exactMul(exact(fromPence(diff)), ratio(1, 36)))
    }
    const gap = toPence(a.cases.expected.netCost) - toPence(b.cases.expected.netCost)
    // Per month owned, not the totals.
    expect(bridge.total.exact).toEqual(exactMul(exact(fromPence(gap)), ratio(1, 36)))
    expect(bridge.total.shown).toBe(roundExact(exactMul(exact(fromPence(gap)), ratio(1, 36)), 'nearest'))
  })

  it('a worked example: the depreciation part is £9,000 less £4,000 over 36 months, no interest either side', () => {
    const bridge = costBridge(cost(buy, s), cost(kept, s), 'expected')!
    const depreciation = bridge.parts.find((p) => p.id === 'depreciation')!
    // (2,000,000 − 1,100,000) − (800,000 − 400,000) = 500,000 pence over 36 months.
    expect(depreciation.exact).toEqual(exactMul(exact(fromPence(500_000)), ratio(1, 36)))
    expect(toPence(bridge.parts.find((p) => p.id === 'interestAndFees')!.shown)).toBe(0)
  })

  it('null when either option covers less than the horizon', () => {
    const handBack = option(pcpOf('hand-back', fromPence(100_000), 24, ratio(5, 100), fromPence(800_000)), {
      value: fromPence(2_000_000),
      horizonValue: flat(fromPence(1_100_000)),
    })
    const partial = cost(handBack, s)
    expect(partial.fullCoverage).toBe(false)
    expect(costBridge(partial, cost(buy, s), 'expected')).toBeNull()
    expect(costBridge(cost(buy, s), partial, 'expected')).toBeNull()
  })

  it('a PCP handed back at the end of a term equal to the horizon covers it, and its equity handed back is a part', () => {
    const handBack = option(pcpOf('hand-back', fromPence(100_000), 36, ratio(5, 100), fromPence(800_000)), {
      value: fromPence(2_000_000),
      horizonValue: flat(fromPence(1_100_000)),
    })
    const a = cost(handBack, s)
    expect(a.fullCoverage).toBe(true)
    const bridge = costBridge(a, cost(buy, s), 'expected')!
    expect(compareExact(bridge.parts.find((p) => p.id === 'equityHandedBack')!.exact, zero)).not.toBe(0)
    expect(sumExact(bridge.parts.map((p) => p.exact))).toEqual(bridge.total.exact)
  })
})

describe('bridge properties on seeded options of every kind, keep with finance owed among them', () => {
  const random = generator(55_055)
  const groups: { options: CarOption[]; s: Shared }[] = []
  let k = 0
  while (groups.length < 40) {
    const pick = () => (k++ % 7 === 6 ? randomOwingCase(random) : randomCase(random, KINDS[k % KINDS.length]!))
    const first = pick()
    const options = [first.option, pick().option, pick().option]
    const s = first.shared
    if (options.every((o) => ownershipCost(o, s).ok)) groups.push({ options, s })
  }

  it.each(groups.map((g, i) => [i, g] as const))('group %i', (_i, { options, s }) => {
    const outcome = compareOptions(options, s)
    if (!outcome.ok) throw new Error('refused')
    const results = outcome.result.options
    for (const valueCase of CASES) {
      for (const a of results) {
        for (const b of results) {
          const bridge = costBridge(a, b, valueCase)
          if (!a.fullCoverage || !b.fullCoverage) {
            expect(bridge).toBeNull()
            continue
          }
          if (!bridge) throw new Error('no bridge')
          const months = s.horizonMonths
          const gap = toPence(a.cases[valueCase].netCost) - toPence(b.cases[valueCase].netCost)
          // The exact parts add up to the exact difference of the two averages.
          expect(sumExact(bridge.parts.map((p) => p.exact))).toEqual(bridge.total.exact)
          expect(bridge.total.exact).toEqual(exactMul(exact(fromPence(gap)), ratio(1, months)))
          // The shown parts add up to the shown total exactly, each within a penny of its exact value.
          expect(bridge.parts.reduce((sum, p) => sum + toPence(p.shown), 0)).toBe(toPence(bridge.total.shown))
          for (const p of bridge.parts) {
            const off = exactSubtract(exact(p.shown), p.exact)
            expect(compareExact(off, exact(fromPence(1)))).toBeLessThan(0)
            expect(compareExact(off, exact(fromPence(-1)))).toBeGreaterThan(0)
          }
          // Swapping the pair turns every figure to its negative.
          const swapped = costBridge(b, a, valueCase)!
          expect(swapped.total.exact).toEqual(neg(bridge.total.exact))
          expect(toPence(swapped.total.shown)).toBe(-toPence(bridge.total.shown) || 0)
          swapped.parts.forEach((p, j) => {
            expect(p.exact).toEqual(neg(bridge.parts[j]!.exact))
            expect(toPence(p.shown)).toBe(-toPence(bridge.parts[j]!.shown) || 0)
          })
          // An option against itself: nothing in every part.
          if (a === b) {
            expect(toPence(bridge.total.shown)).toBe(0)
            for (const p of bridge.parts) expect(toPence(p.shown)).toBe(0)
          }
        }
      }
    }
  })

  it('a kept car with finance owed against cash: interest is a part, and the parts add up', () => {
    const s = shared({ horizonMonths: 24, savingsReturn: ratio(3, 100) })
    const owing = option(keepOwing(fromPence(600_000), fromPence(30_000), 22), {
      value: fromPence(900_000),
      horizonValue: flat(fromPence(500_000)),
    })
    const bridge = costBridge(cost(owing, s), cost(option(CASH), s), 'expected')!
    expect(sumExact(bridge.parts.map((p) => p.exact))).toEqual(bridge.total.exact)
    expect(compareExact(bridge.parts.find((p) => p.id === 'interestAndFees')!.exact, zero)).toBeGreaterThan(0)
  })
})
