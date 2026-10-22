import { describe, expect, it } from 'vitest'
import { type Money, toPence } from '@/lib/money'
import { ownershipCost } from './calc'
import { generator, KINDS, randomCase } from './fixtures/inputs'
import { reference } from './fixtures/reference'
import type { CarOption, OwnershipResult, Shared, ValueCase } from './types'

/*
 * The engine against an independent exact-fraction reference
 * (fixtures/reference.ts) on 300 seeded cases, fifty of each kind: keep,
 * cash, loan, HP, PCP buy and PCP hand back. Every whole-penny figure must
 * agree exactly; a value or opportunity cost rounded from an irrational
 * number is compared unless it sits within 10^-12 of a half penny (counted).
 */

const CASES = 300
const SEED = 3_131
const CASE_NAMES: readonly ValueCase[] = ['low', 'expected', 'high']
const big = (amount: Money) => BigInt(toPence(amount))

function sample() {
  const random = generator(SEED)
  const cases: { kind: string; option: CarOption; shared: Shared; result: OwnershipResult }[] = []
  let refused = 0
  let index = 0
  while (cases.length < CASES) {
    const kind = KINDS[index % KINDS.length]!
    const { option, shared } = randomCase(random, kind)
    const outcome = ownershipCost(option, shared)
    if (outcome.ok) {
      cases.push({ kind, option, shared, result: outcome.result })
      index++
    } else refused++
  }
  return { cases, refused }
}

const { cases, refused } = sample()
let nearHalves = 0

describe('reference (300 seeded cases)', () => {
  it('covers every kind, with few refusals', () => {
    for (const kind of KINDS) expect(cases.filter((c) => c.kind === kind).length).toBe(CASES / KINDS.length)
    expect(refused).toBeLessThan(CASES / 10)
  })

  it.each(cases.map((c, i) => [i, c.kind, c] as const))('case %i (%s)', (_i, _kind, { option, shared, result }) => {
    const ref = reference(option, shared, result.finance)
    expect(result.coverageMonths).toBe(ref.coverage)
    expect(result.fullCoverage).toBe(ref.coverage === shared.horizonMonths)
    expect(big(result.forgoneSale)).toBe(ref.forgone)
    expect(result.timeline).toHaveLength(ref.coverage + 1)
    result.timeline.forEach((month, m) => {
      expect([month.acquisition, month.fuel, month.insurance, month.maintenance, month.ved, month.other].map(big)).toEqual([
        ref.acquisition[m],
        ref.fuel[m],
        ref.insurance[m],
        ref.maintenance[m],
        ref.ved[m],
        ref.other[m],
      ])
    })

    for (const valueCase of CASE_NAMES) {
      const c = result.cases[valueCase]
      const r = ref.cases[valueCase]
      expect(c.months).toHaveLength(ref.coverage + 1)
      const values = c.curve.values.slice(0, ref.coverage + 1).map(big)
      const opportunity = c.months.map((m) => big(m.opportunityCost))
      values.forEach((v, m) => {
        if (r.values[m]!.nearHalf) nearHalves++
        else expect(v, `value at ${m}`).toBe(r.values[m]!.pence)
      })
      opportunity.forEach((o, m) => {
        if (r.opportunity[m]!.nearHalf) nearHalves++
        else expect(o, `opportunity at ${m}`).toBe(r.opportunity[m]!.pence)
      })
      const net = r.netCost(values, opportunity)
      c.months.forEach((point, m) => {
        expect(big(point.cashOut)).toBe(r.cashOut[m])
        const held = !(ref.handBack && m === ref.coverage)
        expect(big(point.balance)).toBe(ref.balance[m])
        expect(big(point.equity)).toBe(held ? values[m]! - ref.balance[m]! : 0n)
        expect(big(point.netCost)).toBe(net[m])
      })

      const E = ref.coverage
      const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n)
      const v0 = big(option.car.value)
      const outlay = sum(ref.acquisition)
      const b = c.breakdown
      expect(big(b.depreciation)).toBe(v0 - values[E]!)
      expect(big(b.interestAndFees)).toBe(outlay + ref.forgone - v0 + ref.endBalance)
      expect(big(b.equityHandedBack)).toBe(ref.handBack ? values[E]! - ref.endBalance : 0n)
      expect([b.fuel, b.insurance, b.maintenance, b.ved, b.other].map(big)).toEqual(
        [ref.fuel, ref.insurance, ref.maintenance, ref.ved, ref.other].map(sum),
      )
      expect(big(b.opportunityCost)).toBe(opportunity[E])
      expect(big(c.netCost)).toBe(net[E])
      expect(big(c.cashOut)).toBe(r.cashOut[E])
    }
  })

  it('few figures sit near a half penny', () => {
    expect(nearHalves).toBeLessThan(10)
  })
})
