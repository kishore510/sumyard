import { describe, expect, it } from 'vitest'
import { MAX_SAVINGS_RETURN } from '@/lib/inputLimits'
import { fromPence, type Money, ratio, roundFine, toPence } from '@/lib/money'
import { project } from '../compound-interest/calc'
import { futureValueOfFlows, ownershipCost } from './calc'
import { CASH, flat, generator, KEEP, KINDS, type Kind, NO_RUNNING, NONE, randomCase } from './fixtures/inputs'
import type { Breakdown, CarOption, OwnershipResult, Shared } from './types'

/*
 * Properties of the car ownership engine on seeded random options of every
 * kind (decisions F16 to F31 in docs/modelling-decisions-car.md).
 */

const pence = (amount: Money) => toPence(amount)
const sumBreakdown = (b: Breakdown) =>
  [b.depreciation, b.interestAndFees, b.equityHandedBack, b.fuel, b.insurance, b.maintenance, b.ved, b.other, b.opportunityCost].reduce(
    (a, x) => a + pence(x),
    0,
  )

function sample(seed: number, count: number) {
  const random = generator(seed)
  const cases: { kind: Kind; option: CarOption; shared: Shared; result: OwnershipResult; random: number }[] = []
  let index = 0
  while (cases.length < count) {
    const kind = KINDS[index % KINDS.length]!
    const { option, shared } = randomCase(random, kind)
    const outcome = ownershipCost(option, shared)
    if (outcome.ok) {
      cases.push({ kind, option, shared, result: outcome.result, random: random() })
      index++
    }
  }
  return cases
}

const cases = sample(31_314, 120)
const each = cases.map((c, i) => [i, c.kind, c] as const)
const rerun = (option: CarOption, shared: Shared) => {
  const outcome = ownershipCost(option, shared)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

describe('the breakdown adds up to the net cost, to the penny (F26)', () => {
  it.each(each)('case %i (%s)', (_i, _k, { result }) => {
    for (const c of Object.values(result.cases)) {
      expect(sumBreakdown(c.breakdown)).toBe(pence(c.netCost))
      expect(pence(c.months.at(-1)!.netCost)).toBe(pence(c.netCost))
      expect(pence(c.months.at(-1)!.cashOut)).toBe(pence(c.cashOut))
    }
  })
})

describe('coverage never exceeds the horizon (F19)', () => {
  it.each(each)('case %i (%s)', (_i, kind, { shared, result }) => {
    expect(result.coverageMonths).toBeGreaterThanOrEqual(1)
    expect(result.coverageMonths).toBeLessThanOrEqual(shared.horizonMonths)
    expect(result.fullCoverage).toBe(result.coverageMonths === shared.horizonMonths)
    if (kind !== 'pcp-hand-back') expect(result.fullCoverage).toBe(true)
  })
})

describe('a higher end value never raises the net cost (F17)', () => {
  it.each(each)('case %i (%s)', (_i, _k, { result }) => {
    const { low, expected, high } = result.cases
    expect(pence(high.netCost)).toBeLessThanOrEqual(pence(expected.netCost))
    expect(pence(expected.netCost)).toBeLessThanOrEqual(pence(low.netCost))
  })
})

describe('a higher savings return never lowers the opportunity cost (F18)', () => {
  it.each(each)('case %i (%s)', (_i, _k, { option, shared, result, random }) => {
    const higher = Math.min(
      (MAX_SAVINGS_RETURN.numerator * 10_000) / MAX_SAVINGS_RETURN.denominator,
      (shared.savingsReturn.numerator * 10_000) / shared.savingsReturn.denominator + 1 + Math.floor(random * 500),
    )
    const again = rerun(option, { ...shared, savingsReturn: ratio(Math.floor(higher), 10_000) })
    for (const key of ['low', 'expected', 'high'] as const) {
      expect(pence(again.cases[key].breakdown.opportunityCost)).toBeGreaterThanOrEqual(pence(result.cases[key].breakdown.opportunityCost))
    }
  })
})

describe('a longer horizon never lowers total cash out (F24)', () => {
  it.each(each)('case %i (%s)', (_i, _k, { option, shared, result, random }) => {
    const longer = rerun(option, { ...shared, horizonMonths: shared.horizonMonths + 1 + Math.floor(random * 24) })
    expect(pence(longer.cases.expected.cashOut)).toBeGreaterThanOrEqual(pence(result.cases.expected.cashOut))
  })
})

describe('textbook reductions', () => {
  it.each(each)('zero return: no opportunity cost (case %i, %s)', (_i, _k, { option, shared }) => {
    const r = rerun(option, { ...shared, savingsReturn: NONE })
    for (const c of Object.values(r.cases)) expect(c.months.every((m) => pence(m.opportunityCost) === 0)).toBe(true)
  })

  it.each(each)('cash or keep, no running costs, zero return: price less end value (case %i, %s)', (_i, _k, { option, shared }) => {
    for (const acquisition of [CASH, KEEP]) {
      const car = { ...option.car, running: NO_RUNNING, annualMileage: 0 }
      const r = rerun({ car, acquisition }, { ...shared, savingsReturn: NONE })
      for (const key of ['low', 'expected', 'high'] as const) {
        expect(pence(r.cases[key].netCost)).toBe(pence(car.value) - pence(car.horizonValue[key]))
      }
    }
  })

  it.each(each)('keep and cash of the same car agree (case %i, %s)', (_i, _k, { option, shared }) => {
    const keep = rerun({ ...option, acquisition: KEEP }, shared)
    const cash = rerun({ ...option, acquisition: CASH }, shared)
    for (const key of ['low', 'expected', 'high'] as const) {
      expect(keep.cases[key].breakdown).toEqual(cash.cases[key].breakdown)
      expect(pence(keep.cases[key].netCost)).toBe(pence(cash.cases[key].netCost))
    }
    expect(pence(keep.cases.expected.cashOut) + pence(keep.forgoneSale)).toBe(pence(cash.cases.expected.cashOut))
  })
})

describe('equity is value less balance; net cost is cash out + forgone − equity + opportunity (F18, F20)', () => {
  it.each(each)('case %i (%s)', (_i, _k, { result }) => {
    for (const c of Object.values(result.cases)) {
      for (const m of c.months) {
        expect(pence(m.equity)).toBe(pence(m.value) - pence(m.balance))
        expect(pence(m.netCost)).toBe(pence(m.cashOut) + pence(result.forgoneSale) - pence(m.equity) + pence(m.opportunityCost))
      }
    }
  })
})

describe('futureValueOfFlows agrees with the compound engine for level monthly payments (F18)', () => {
  const random = generator(31_315)
  const samples = Array.from({ length: 60 }, () => ({
    payment: 100 + Math.floor(random() * 200_000),
    years: 1 + Math.floor(random() * 10),
    rate: Math.floor(random() * 2_000),
  }))
  it.each(samples.map((s, i) => [i, s] as const))('case %i', (_i, { payment, years, rate }) => {
    const savingsReturn = ratio(rate, 10_000)
    const months = years * 12
    const flows = Array.from({ length: months }, (_, k) => ({ month: k + 1, amount: fromPence(payment) }))
    const ours = roundFine(futureValueOfFlows(flows, savingsReturn, months), 'nearest')
    const outcome = project({
      lumpSum: fromPence(0),
      contribution: fromPence(payment),
      contributionFrequency: 'monthly',
      timing: 'end',
      years,
      contributionIncrease: NONE,
      growthRate: savingsReturn,
      compounding: 'annual',
      feeRate: NONE,
      inflationRate: NONE,
    })
    if (!outcome.ok) throw new Error('refused')
    expect(Math.abs(pence(ours) - pence(outcome.result.withFee.nominal.closing))).toBeLessThanOrEqual(1)
  })
})

describe('zero depreciation: net cost is what was paid beyond the car', () => {
  it.each(each)('case %i (%s)', (_i, _k, { option, shared }) => {
    const car = { ...option.car, horizonValue: flat(option.car.value) }
    const r = rerun({ ...option, car }, shared)
    expect(r.cases.expected.curve.values.every((v) => pence(v) === pence(car.value))).toBe(true)
    expect(pence(r.cases.expected.breakdown.depreciation)).toBe(0)
  })
})
