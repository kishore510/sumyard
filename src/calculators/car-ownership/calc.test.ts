import { describe, expect, it } from 'vitest'
import {
  MAX_ANNUAL_MILEAGE,
  MAX_CAR_OPTIONS,
  MAX_HORIZON_MONTHS,
  MAX_INPUT_AMOUNT,
  MAX_MILES_PER_GALLON,
  MAX_PENCE_PER_UNIT,
  MAX_SAVINGS_RETURN,
  PRICE_CHANGE_BOUND,
} from '@/lib/inputLimits'
import { compareRatio, type ExactPence, FINE_DIGITS, fromPence, type Money, type Ratio, ratio, toPence } from '@/lib/money'
import { compareOptions, costPerMile, futureValueOfFlows, ownershipCost, valueCurve } from './calc'
import { CASH, type car, flat, hpOf, KEEP, loanOf, NO_RUNNING, NONE, option, pcpOf, shared } from './fixtures/inputs'
import type { CarOption, OwnershipOutcome, OwnershipResult, Shared, ValueCase } from './types'

/*
 * Hand-checkable cases, edge cases and refusals for the car ownership engine
 * (slice 3b, decisions F16 to F31 in docs/modelling-decisions-car.md). Every
 * figure is made up; amounts are in pence.
 */

const p = (pence: number) => fromPence(pence)
const pence = (amount: Money) => toPence(amount)

function ok(outcome: OwnershipOutcome): OwnershipResult {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const cost = (o: CarOption, s: Shared = shared()) => ok(ownershipCost(o, s))
const expected = (r: OwnershipResult, c: ValueCase = 'expected') => r.cases[c]
const exactIs = (value: ExactPence, n: bigint, d: bigint) => expect(value.numerator * d).toBe(n * value.denominator)

describe('valueCurve (F17)', () => {
  it('starts and ends exactly on the two values', () => {
    const curve = valueCurve(p(10_000), p(2_500), 24)
    expect(curve.values).toHaveLength(25)
    expect(pence(curve.values[0]!)).toBe(10_000)
    expect(pence(curve.values[24]!)).toBe(2_500)
  })

  it('falls by a constant yearly percentage: a quarter over two years is a half each year', () => {
    const curve = valueCurve(p(10_000), p(2_500), 24)
    expect(pence(curve.values[12]!)).toBe(5_000)
    expect(pence(curve.values[6]!)).toBe(7_071)
    expect(compareRatio(curve.yearlyChange!, ratio(-1, 2))).toBe(0)
  })

  it('stays level with no depreciation, and rises when the horizon value is higher', () => {
    const level = valueCurve(p(10_000), p(10_000), 36)
    expect(level.values.every((v) => pence(v) === 10_000)).toBe(true)
    expect(compareRatio(level.yearlyChange!, NONE)).toBe(0)
    const rising = valueCurve(p(10_000), p(12_100), 24)
    expect(pence(rising.values[12]!)).toBe(11_000)
    expect(compareRatio(rising.yearlyChange!, ratio(1, 10))).toBe(0)
  })

  it('a horizon value of nothing is nothing from month one; a car worth nothing stays so', () => {
    const gone = valueCurve(p(10_000), p(0), 12)
    expect(gone.values.map(pence)).toEqual([10_000, ...Array(12).fill(0)])
    const worthless = valueCurve(p(0), p(0), 12)
    expect(worthless.values.every((v) => pence(v) === 0)).toBe(true)
    expect(worthless.yearlyChange).toBeNull()
  })

  it('a one-month horizon is the two values', () => {
    expect(valueCurve(p(9_000), p(8_000), 1).values.map(pence)).toEqual([9_000, 8_000])
  })
})

describe('costPerMile (F21)', () => {
  it('fuel: price per litre × litres per gallon ÷ miles per gallon', () => {
    exactIs(costPerMile({ kind: 'fuel', milesPerGallon: ratio(50, 1), pencePerLitre: ratio(150, 1) }), 1_363_827n, 100_000n)
  })

  it('electric: the blended price per kWh ÷ miles per kWh', () => {
    const fuel = {
      kind: 'electric',
      milesPerKwh: ratio(4, 1),
      homeShare: ratio(3, 4),
      homePencePerKwh: ratio(8, 1),
      publicPencePerKwh: ratio(60, 1),
    } as const
    exactIs(costPerMile(fuel), 21n, 4n)
  })

  it('a cost per mile as entered', () => {
    exactIs(costPerMile({ kind: 'per-mile', pencePerMile: ratio(123, 10) }), 123n, 10n)
  })
})

describe('futureValueOfFlows (F18)', () => {
  it('compounds a single outflow at the annual rate over whole years', () => {
    const fv = futureValueOfFlows([{ month: 0, amount: p(1_000_000) }], ratio(1, 10), 12)
    const scale = 10n ** BigInt(FINE_DIGITS)
    const gap = (fv as bigint) - 1_100_000n * scale
    expect(gap < scale / 10n ** 20n && gap > -scale / 10n ** 20n).toBe(true)
  })

  it('leaves flows after the month out, and grows nothing at a return of nothing', () => {
    const flows = [
      { month: 0, amount: p(100) },
      { month: 5, amount: p(200) },
      { month: 9, amount: p(400) },
    ]
    const scale = 10n ** BigInt(FINE_DIGITS)
    expect(futureValueOfFlows(flows, NONE, 6)).toBe(300n * scale)
  })
})

describe('textbook cases (F18)', () => {
  it('cash, no running costs, no return: net cost = price − end value', () => {
    const r = cost(option(CASH, { horizonValue: flat(p(1_000_000)), value: p(2_000_000) }))
    const c = expected(r)
    expect(pence(c.netCost)).toBe(1_000_000)
    expect(pence(c.cashOut)).toBe(2_000_000)
    expect(pence(c.netCostPerCoverageMonth)).toBe(20_833)
    expect(r.coverageMonths).toBe(48)
    expect(r.fullCoverage).toBe(true)
    expect(c.breakdown).toEqual({
      depreciation: p(1_000_000),
      interestAndFees: p(0),
      equityHandedBack: p(0),
      fuel: p(0),
      insurance: p(0),
      maintenance: p(0),
      ved: p(0),
      other: p(0),
      opportunityCost: p(0),
    })
  })

  it('keep costs what buying the same car for its value in cash costs, with no cash out', () => {
    const carOf = { value: p(1_500_000), horizonValue: flat(p(700_000)) }
    const s = shared({ savingsReturn: ratio(1, 20) })
    const keep = cost(option(KEEP, carOf), s)
    const cash = cost(option(CASH, carOf), s)
    expect(pence(expected(keep).netCost)).toBe(pence(expected(cash).netCost))
    expect(expected(keep).breakdown).toEqual(expected(cash).breakdown)
    expect(pence(expected(keep).cashOut)).toBe(0)
    expect(pence(keep.forgoneSale)).toBe(1_500_000)
    expect(pence(cash.forgoneSale)).toBe(0)
  })

  it('no depreciation and nothing else: nothing', () => {
    expect(pence(expected(cost(option(CASH, { horizonValue: flat(p(2_000_000)) }))).netCost)).toBe(0)
  })

  it('opportunity cost: a cash price at a tenth a year over one year costs a tenth of it', () => {
    const r = cost(
      option(CASH, { value: p(1_000_000), horizonValue: flat(p(1_000_000)) }),
      shared({ horizonMonths: 12, savingsReturn: ratio(1, 10) }),
    )
    expect(pence(expected(r).breakdown.opportunityCost)).toBe(100_000)
    expect(pence(expected(r).netCost)).toBe(100_000)
  })

  it('running costs rise once a year by the general increase; months are a twelfth, to the penny', () => {
    const running = { ...NO_RUNNING, insurance: p(120_000) }
    const r = cost(
      option(CASH, { running, generalIncrease: ratio(1, 10), horizonValue: flat(p(2_000_000)) }),
      shared({ horizonMonths: 24 }),
    )
    expect(r.timeline.slice(1, 13).every((m) => pence(m.insurance) === 10_000)).toBe(true)
    expect(r.timeline.slice(13).every((m) => pence(m.insurance) === 11_000)).toBe(true)
    expect(pence(expected(r).breakdown.insurance)).toBe(252_000)
    expect(pence(expected(r).netCost)).toBe(252_000)
  })

  it('fuel is cost per mile × annual mileage ÷ 12 a month, with its own price change', () => {
    const fuel = { kind: 'per-mile', pencePerMile: ratio(10, 1) } as const
    const r = cost(
      option(CASH, {
        fuel,
        annualMileage: 12_000,
        fuelPriceChange: ratio(1, 5),
        generalIncrease: ratio(1, 2),
        horizonValue: flat(p(2_000_000)),
      }),
      shared({ horizonMonths: 24 }),
    )
    expect(r.timeline.slice(1, 13).every((m) => pence(m.fuel) === 10_000)).toBe(true)
    expect(r.timeline.slice(13).every((m) => pence(m.fuel) === 12_000)).toBe(true)
    expect(pence(expected(r).breakdown.fuel)).toBe(264_000)
  })

  it('zero mileage costs no fuel', () => {
    const fuel = { kind: 'per-mile', pencePerMile: ratio(50, 1) } as const
    const r = cost(option(CASH, { fuel, annualMileage: 0 }))
    expect(pence(expected(r).breakdown.fuel)).toBe(0)
  })
})

describe('finance on the horizon (F20, F24)', () => {
  const level = { value: p(1_200_000), horizonValue: flat(p(1_200_000)) }

  it('a loan at no interest over the horizon costs nothing; a fee at the start costs the fee', () => {
    expect(pence(expected(cost(option(loanOf(p(1_200_000), 24, NONE), level), shared({ horizonMonths: 24 }))).netCost)).toBe(0)
    const fee = cost(option(loanOf(p(1_200_000), 24, NONE, { arrangementFee: p(20_000) }), level), shared({ horizonMonths: 24 }))
    expect(pence(expected(fee).netCost)).toBe(20_000)
    expect(pence(expected(fee).breakdown.interestAndFees)).toBe(20_000)
  })

  it('a loan below the price: the rest is cash at month 0', () => {
    const r = cost(option(loanOf(p(1_000_000), 24, NONE), level), shared({ horizonMonths: 24 }))
    expect(pence(r.timeline[0]!.acquisition)).toBe(200_000)
    expect(pence(expected(r).netCost)).toBe(0)
  })

  it('horizon inside the term: the balance is still owed and the equity is value less it', () => {
    const r = cost(option(loanOf(p(1_200_000), 24, NONE), level), shared({ horizonMonths: 12 }))
    const c = expected(r)
    expect(pence(c.cashOut)).toBe(600_000)
    const last = c.months.at(-1)!
    expect(pence(last.balance)).toBe(600_000)
    expect(pence(last.equity)).toBe(600_000)
    expect(pence(c.netCost)).toBe(0)
    expect(r.fullCoverage).toBe(true)
  })

  it('horizon inside the term with interest: the net cost is the interest so far', () => {
    const r = cost(option(loanOf(p(1_200_000), 24, ratio(1, 10)), level), shared({ horizonMonths: 12 }))
    const interest = r.finance!.schedule.rows.slice(0, 12).reduce((sum, row) => sum + pence(row.interest), 0)
    expect(pence(expected(r).netCost)).toBe(interest)
    expect(pence(expected(r).breakdown.interestAndFees)).toBe(interest)
  })

  it('horizon equal to the term: nothing owed at the end', () => {
    const r = cost(option(hpOf(p(0), 24, NONE, { balloon: p(300_000), optionFee: p(1_000) }), level), shared({ horizonMonths: 24 }))
    const last = expected(r).months.at(-1)!
    expect(pence(last.balance)).toBe(0)
    expect(pence(last.equity)).toBe(1_200_000)
    expect(pence(expected(r).netCost)).toBe(1_000)
  })

  it('negative equity shows: value below the balance', () => {
    const r = cost(option(hpOf(p(0), 48, NONE), { value: p(2_000_000), horizonValue: flat(p(500_000)) }), shared({ horizonMonths: 12 }))
    const last = expected(r).months.at(-1)!
    expect(pence(last.balance)).toBe(1_499_996)
    expect(pence(last.equity)).toBe(-999_996)
    expect(pence(expected(r).netCost)).toBe(1_500_000)
    expect(pence(expected(r).breakdown.depreciation)).toBe(1_500_000)
  })

  it('PCP buy at the end of the term keeps the car: final payment and purchase fee paid', () => {
    const r = cost(
      option(pcpOf('buy', p(200_000), 24, NONE, p(800_000), { purchaseFee: p(500) }), {
        value: p(2_000_000),
        horizonValue: flat(p(900_000)),
      }),
      shared({ horizonMonths: 36 }),
    )
    expect(r.coverageMonths).toBe(36)
    expect(pence(r.timeline[24]!.acquisition)).toBe(41_659 + 800_000 + 500)
    expect(pence(expected(r).months.at(-1)!.equity)).toBe(900_000)
    expect(pence(expected(r).netCost)).toBe(1_100_500)
  })
})

describe('PCP hand back (F19, F20, F26)', () => {
  const handBack = pcpOf('hand-back', p(200_000), 24, NONE, p(800_000), { mileageAllowance: 20_000, excessPerMile: p(10) })
  const r = cost(
    option(handBack, { value: p(2_000_000), horizonValue: flat(p(600_000)), annualMileage: 12_000 }),
    shared({ horizonMonths: 36 }),
  )
  const c = expected(r)

  it('before the horizon: coverage is the term, flagged as partial', () => {
    expect(r.coverageMonths).toBe(24)
    expect(r.fullCoverage).toBe(false)
    expect(c.months).toHaveLength(25)
  })

  it('pays the excess mileage charge at the term and nothing more; no car, no equity after', () => {
    expect(pence(r.timeline[24]!.acquisition)).toBe(41_659 + 4_000 * 10)
    const last = c.months.at(-1)!
    expect([pence(last.value), pence(last.balance), pence(last.equity)]).toEqual([0, 0, 0])
    expect(pence(c.netCost)).toBe(200_000 + 1_000_000 + 40_000)
  })

  it('splits into depreciation, interest and fees, and the equity handed back', () => {
    const atTerm = pence(c.curve.values[24]!)
    expect(pence(c.breakdown.depreciation)).toBe(2_000_000 - atTerm)
    expect(pence(c.breakdown.equityHandedBack)).toBe(atTerm - 800_000)
    expect(pence(c.breakdown.interestAndFees)).toBe(40_000)
  })

  it('net cost does not depend on the value when the car is handed back', () => {
    const other = cost(
      option(handBack, { value: p(2_000_000), horizonValue: flat(p(100_000)), annualMileage: 12_000 }),
      shared({ horizonMonths: 36 }),
    )
    expect(pence(expected(other).netCost)).toBe(pence(c.netCost))
  })

  it('a hand-back after the horizon is not reached: the car is held with its balance', () => {
    const long = cost(option(handBack, { value: p(2_000_000), horizonValue: flat(p(600_000)) }), shared({ horizonMonths: 12 }))
    expect(long.coverageMonths).toBe(12)
    expect(long.fullCoverage).toBe(true)
    expect(pence(expected(long).months.at(-1)!.balance)).toBeGreaterThan(0)
  })

  it('a hand-back exactly at the horizon covers the horizon', () => {
    const at = cost(option(handBack, { value: p(2_000_000), horizonValue: flat(p(600_000)) }), shared({ horizonMonths: 24 }))
    expect(at.coverageMonths).toBe(24)
    expect(at.fullCoverage).toBe(true)
    expect(pence(expected(at).months.at(-1)!.equity)).toBe(0)
  })
})

describe('the largest inputs (no overflow)', () => {
  it('the longest horizon, the largest amounts, mileage, prices and increases', () => {
    const big = MAX_INPUT_AMOUNT
    const r = ownershipCost(
      option(CASH, {
        value: big,
        horizonValue: flat(big),
        annualMileage: MAX_ANNUAL_MILEAGE,
        fuel: { kind: 'per-mile', pencePerMile: MAX_PENCE_PER_UNIT },
        fuelPriceChange: PRICE_CHANGE_BOUND,
        running: { insurance: big, maintenance: big, ved: big, other: big },
        generalIncrease: PRICE_CHANGE_BOUND,
      }),
      shared({ horizonMonths: MAX_HORIZON_MONTHS, savingsReturn: MAX_SAVINGS_RETURN }),
    )
    if (!r.ok) expect(r.problems).toEqual([{ field: 'result', reason: 'too-large' }])
    else expect(Number.isSafeInteger(pence(r.result.cases.expected.netCost))).toBe(true)
  })
})

describe('refusals (F28)', () => {
  const problems = (outcome: OwnershipOutcome) => (outcome.ok ? [] : outcome.problems)

  it('shared inputs', () => {
    expect(problems(ownershipCost(option(CASH), shared({ horizonMonths: 0 })))).toContainEqual({
      field: 'horizonMonths',
      reason: 'below-minimum',
    })
    expect(problems(ownershipCost(option(CASH), shared({ horizonMonths: MAX_HORIZON_MONTHS + 1 })))).toContainEqual({
      field: 'horizonMonths',
      reason: 'above-maximum',
    })
    expect(problems(ownershipCost(option(CASH), shared({ horizonMonths: 1.5 })))).toContainEqual({
      field: 'horizonMonths',
      reason: 'not-whole',
    })
    expect(problems(ownershipCost(option(CASH), shared({ savingsReturn: ratio(-1, 100) })))).toContainEqual({
      field: 'savingsReturn',
      reason: 'below-minimum',
    })
    expect(problems(ownershipCost(option(CASH), shared({ savingsReturn: ratio(1, 4) })))).toContainEqual({
      field: 'savingsReturn',
      reason: 'above-maximum',
    })
  })

  it('the car', () => {
    const refused = (overrides: Parameters<typeof car>[0]) => problems(ownershipCost(option(CASH, overrides), shared()))
    expect(refused({ value: 1.5 as Money })).toContainEqual({ field: 'value', reason: 'not-money', option: 0 })
    expect(refused({ horizonValue: { low: p(0), expected: p(3_000_001), high: p(0) } })).toContainEqual({
      field: 'horizonValue',
      reason: 'above-maximum',
      option: 0,
    })
    expect(refused({ annualMileage: -1 })).toContainEqual({ field: 'annualMileage', reason: 'below-minimum', option: 0 })
    expect(refused({ annualMileage: MAX_ANNUAL_MILEAGE + 1 })).toContainEqual({
      field: 'annualMileage',
      reason: 'above-maximum',
      option: 0,
    })
    expect(refused({ fuel: { kind: 'fuel', milesPerGallon: NONE, pencePerLitre: ratio(150, 1) } })).toContainEqual({
      field: 'milesPerGallon',
      reason: 'below-minimum',
      option: 0,
    })
    expect(
      refused({ fuel: { kind: 'fuel', milesPerGallon: ratio(MAX_MILES_PER_GALLON.numerator + 1, 1), pencePerLitre: ratio(150, 1) } }),
    ).toContainEqual({
      field: 'milesPerGallon',
      reason: 'above-maximum',
      option: 0,
    })
    const electric = {
      kind: 'electric',
      milesPerKwh: ratio(4, 1),
      homeShare: ratio(5, 4),
      homePencePerKwh: ratio(8, 1),
      publicPencePerKwh: ratio(60, 1),
    } as const
    expect(refused({ fuel: electric })).toContainEqual({ field: 'homeShare', reason: 'above-maximum', option: 0 })
    expect(refused({ fuel: { kind: 'per-mile', pencePerMile: ratio(-1, 1) } })).toContainEqual({
      field: 'pencePerMile',
      reason: 'below-minimum',
      option: 0,
    })
    expect(refused({ fuel: { kind: 'diesel' } as never })).toContainEqual({ field: 'fuel', reason: 'not-a-choice', option: 0 })
    expect(refused({ fuelPriceChange: ratio(3, 4) })).toContainEqual({ field: 'fuelPriceChange', reason: 'above-maximum', option: 0 })
    expect(refused({ generalIncrease: ratio(-3, 4) })).toContainEqual({ field: 'generalIncrease', reason: 'below-minimum', option: 0 })
    expect(refused({ running: { ...NO_RUNNING, ved: p(-1) } })).toContainEqual({ field: 'ved', reason: 'below-minimum', option: 0 })
    expect(refused({ fuelPriceChange: 'x' as unknown as Ratio })).toContainEqual({
      field: 'fuelPriceChange',
      reason: 'not-a-rate',
      option: 0,
    })
  })

  it('the acquisition, with the 3a engine’s problems passed through', () => {
    const refused = (o: CarOption) => problems(ownershipCost(o, shared()))
    expect(refused(option({ kind: 'lease' } as never))).toContainEqual({ field: 'acquisition', reason: 'not-a-choice', option: 0 })
    expect(refused(option(loanOf(p(2_000_001), 24, NONE)))).toContainEqual({ field: 'amount', reason: 'above-maximum', option: 0 })
    expect(refused(option(hpOf(p(0), 0, NONE)))).toContainEqual({ field: 'term', reason: 'below-minimum', option: 0 })
    const pcp = pcpOf('buy', p(0), 24, NONE, p(0))
    expect(refused(option({ ...pcp, end: 'sell' } as never))).toContainEqual({ field: 'end', reason: 'not-a-choice', option: 0 })
  })

  it('compareOptions: from one to four options, each problem with its option', () => {
    const fail = (outcome: ReturnType<typeof compareOptions>) => (outcome.ok ? [] : outcome.problems)
    expect(fail(compareOptions([], shared()))).toContainEqual({ field: 'options', reason: 'below-minimum' })
    expect(fail(compareOptions(Array(MAX_CAR_OPTIONS + 1).fill(option(CASH)), shared()))).toContainEqual({
      field: 'options',
      reason: 'above-maximum',
    })
    expect(fail(compareOptions([option(CASH), option(CASH, { annualMileage: -1 })], shared()))).toContainEqual({
      field: 'annualMileage',
      reason: 'below-minimum',
      option: 1,
    })
  })
})

describe('compareOptions (F27)', () => {
  const s = shared({ horizonMonths: 36 })
  const cheap = option(CASH, { value: p(1_000_000), horizonValue: flat(p(500_000)) })
  const dear = option(CASH, { value: p(2_000_000), horizonValue: flat(p(500_000)) })
  const handBack = option(pcpOf('hand-back', p(100_000), 24, NONE, p(400_000)), { value: p(1_000_000), horizonValue: flat(p(500_000)) })

  it('ranks full coverage by net cost per month of coverage and lists partial coverage apart', () => {
    const outcome = compareOptions([dear, handBack, cheap], s)
    if (!outcome.ok) throw new Error('refused')
    const ranking = outcome.result.ranking.expected
    expect(ranking.full.map((e) => e.option)).toEqual([2, 0])
    expect(ranking.partial.map((e) => e.option)).toEqual([1])
    expect(outcome.result.options).toHaveLength(3)
  })

  it('states ties', () => {
    const outcome = compareOptions([cheap, option(KEEP, { value: p(1_000_000), horizonValue: flat(p(500_000)) }), dear], s)
    if (!outcome.ok) throw new Error('refused')
    const full = outcome.result.ranking.expected.full
    expect(full.map((e) => [e.option, e.tiedWithPrevious])).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ])
  })
})

describe('language (F23)', () => {
  it('assumptions hold no figure and never say best, recommended or should', () => {
    const r = cost(option(pcpOf('hand-back', p(100_000), 24, NONE, p(400_000))))
    const outcome = compareOptions([option(CASH), option(KEEP)], shared())
    const texts = [...r.assumptions, ...(outcome.ok ? outcome.result.assumptions : [])]
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      expect(text).not.toMatch(/\bbest\b|recommend|\bshould\b|optimal|cheapest option/i)
      expect(text).not.toMatch(/£\s*\d|\d\s*%|\d\.\d/)
    }
  })
})
