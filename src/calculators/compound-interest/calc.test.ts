import { describe, expect, it } from 'vitest'
import {
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_CONTRIBUTION_INCREASE,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
} from '@/lib/inputLimits'
import { fromPence, fromPounds, type Money, ratio, toPence } from '@/lib/money'
import { checkInputs, EngineInputError, effectiveAnnualRate, feeDrag, futureValue, periodRate, project, realRate } from './calc'
import { inputs } from './fixtures/inputs'
import type { CompoundInputs, CompoundResult, Projection } from './types'

/*
 * Hand-checkable cases, the rate convention (C2), edge cases and refusals
 * (C8). Every figure is made up; the working is in each test's comment.
 */

const pence = (m: Money) => toPence(m)
const RATE_DENOMINATOR = 10 ** 15

function run(overrides: Partial<CompoundInputs>): CompoundResult {
  const outcome = project(inputs(overrides))
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const rowPence = (projection: Projection) =>
  projection.rows.map((r) => ({
    year: r.year,
    opening: pence(r.opening),
    contributions: pence(r.contributions),
    growth: pence(r.growth),
    fees: pence(r.fees),
    closing: pence(r.closing),
  }))

describe('one year, one period (hand-checkable)', () => {
  it('a lump sum grows by the rate', () => {
    // £1,000 at a twentieth a year, compounded yearly: £1,050.
    const result = run({ lumpSum: fromPounds(1000), growthRate: ratio(1, 20) })
    expect(rowPence(result.withFee.nominal)).toEqual([
      { year: 1, opening: 100_000, contributions: 0, growth: 5_000, fees: 0, closing: 105_000 },
    ])
    expect(pence(result.withFee.nominal.closing)).toBe(105_000)
  })

  it('a start-of-period contribution earns the period’s growth; an end-of-period one does not (C3)', () => {
    // (£1,000 + £100) × 1.05 = £1,155; £1,000 × 1.05 + £100 = £1,150.
    const start = run({ lumpSum: fromPounds(1000), contribution: fromPounds(100), timing: 'start', growthRate: ratio(1, 20) })
    const end = run({ lumpSum: fromPounds(1000), contribution: fromPounds(100), timing: 'end', growthRate: ratio(1, 20) })
    expect(rowPence(start.withFee.nominal)[0]).toMatchObject({ contributions: 10_000, growth: 5_500, closing: 115_500 })
    expect(rowPence(end.withFee.nominal)[0]).toMatchObject({ contributions: 10_000, growth: 5_000, closing: 115_000 })
  })

  it('the fee is charged after growth, on the grown balance (C4)', () => {
    // £10,000 grows a tenth to £11,000; the fee, a hundredth of £11,000, is £110; £10,890 remains.
    const result = run({ lumpSum: fromPounds(10_000), growthRate: ratio(1, 10), feeRate: ratio(1, 100) })
    expect(rowPence(result.withFee.nominal)[0]).toMatchObject({ growth: 100_000, fees: 11_000, closing: 1_089_000 })
    expect(pence(result.noFee.nominal.closing)).toBe(1_100_000)
    expect(pence(result.noFee.nominal.fees)).toBe(0)
    expect(pence(result.feeDrag.nominal)).toBe(11_000)
  })

  it('the fee each compounding period is on the balance after that period’s growth (monthly)', () => {
    // £12,000; one per cent growth then half a per cent fee each month for twelve months.
    // Fees: Σ B × 1.01 × 0.005 = 74,732.84p; closing 1,200,000 × (1.01 × 0.995)^12 = 1,273,252.98p;
    // growth takes the rest: 147,985.81p. Charging the fee before growth would give fees of 73,992.91p.
    const result = run({
      lumpSum: fromPounds(12_000),
      growthRate: ratio(3, 25),
      feeRate: ratio(3, 50),
      compounding: 'monthly',
      contributionFrequency: 'monthly',
    })
    expect(rowPence(result.withFee.nominal)[0]).toMatchObject({ fees: 74_733, closing: 1_273_253, growth: 147_986 })
  })

  it('an end-of-period contribution pays no fee for that period', () => {
    // No growth; a hundredth fee on £1,000 is £10; the £100 paid at the end pays none.
    const result = run({ lumpSum: fromPounds(1000), contribution: fromPounds(100), feeRate: ratio(1, 100) })
    expect(rowPence(result.withFee.nominal)[0]).toMatchObject({ fees: 1_000, closing: 109_000 })
  })

  it('real values divide by inflation over the year (C5)', () => {
    // £1,000 with no growth and a quarter inflation is worth £800 in today’s money.
    const result = run({ lumpSum: fromPounds(1000), inflationRate: ratio(1, 4) })
    expect(rowPence(result.withFee.real)).toEqual([
      { year: 1, opening: 100_000, contributions: 0, growth: -20_000, fees: 0, closing: 80_000 },
    ])
    expect(pence(result.withFee.nominal.closing)).toBe(100_000)
  })

  it('monthly compounding with monthly contributions: the annuity, end and start', () => {
    // £100 a month at twelve per cent nominal compounded monthly (one per cent a month):
    // end: 10,000 × (1.01^12 − 1) / 0.01 = 126,825.03p; start: × 1.01 = 128,093.28p.
    const base = {
      contribution: fromPounds(100),
      contributionFrequency: 'monthly',
      compounding: 'monthly',
      growthRate: ratio(3, 25),
    } as const
    expect(pence(run({ ...base, timing: 'end' }).withFee.nominal.closing)).toBe(126_825)
    expect(pence(run({ ...base, timing: 'start' }).withFee.nominal.closing)).toBe(128_093)
  })

  it('contributions rise once a year by the increase', () => {
    // £1,000 a year at the end, rising a tenth a year, no growth: £1,000, £1,100, £1,210.
    const result = run({ contribution: fromPounds(1000), contributionIncrease: ratio(1, 10), years: 3 })
    expect(rowPence(result.withFee.nominal).map((r) => r.contributions)).toEqual([100_000, 110_000, 121_000])
    expect(pence(result.withFee.nominal.closing)).toBe(331_000)
  })

  it('the increase with growth', () => {
    // Year 1: £1,000 paid at the end. Year 2: £1,000 × 1.1 + £1,100 = £2,200.
    const result = run({ contribution: fromPounds(1000), contributionIncrease: ratio(1, 10), growthRate: ratio(1, 10), years: 2 })
    expect(rowPence(result.withFee.nominal).map((r) => r.closing)).toEqual([100_000, 220_000])
  })
})

describe('rate convention (C2), as worked in docs/modelling-decisions-compound.md', () => {
  const rate = (numerator: number) => ({ numerator, denominator: RATE_DENOMINATOR })

  it('the effective annual rate of a nominal rate compounded monthly', () => {
    // 1.01^12 − 1 = 0.126825030131969720…, to fifteen places …970.
    expect(effectiveAnnualRate(ratio(3, 25), 'monthly')).toEqual(rate(126_825_030_131_970))
    expect(effectiveAnnualRate(ratio(3, 25), 'annual')).toEqual(rate(120_000_000_000_000))
  })

  it('the equivalent rate per contribution period', () => {
    // Monthly compounding, monthly contributions: the monthly rate itself.
    expect(periodRate(ratio(3, 25), 'monthly', 'monthly')).toEqual(rate(10_000_000_000_000))
    // Six per cent compounded monthly, quarterly contributions: 1.005^3 − 1 = 0.015075125.
    expect(periodRate(ratio(3, 50), 'monthly', 'quarterly')).toEqual(rate(15_075_125_000_000))
    // Weekly contributions: 1.005^(12/52) − 1 = 0.0011516337393842…
    expect(periodRate(ratio(3, 50), 'monthly', 'weekly')).toEqual(rate(1_151_633_739_384))
    // Annual compounding, monthly contributions: 1.06^(1/12) − 1 = 0.0048675505653430…
    expect(periodRate(ratio(3, 50), 'annual', 'monthly')).toEqual(rate(4_867_550_565_343))
  })

  it('the result reports the rates before and after fees, per period, and real', () => {
    const result = run({ growthRate: ratio(1, 10), feeRate: ratio(1, 100), inflationRate: ratio(1, 20) })
    expect(result.effectiveAnnualRate).toEqual(rate(100_000_000_000_000))
    // 1.1 × 0.99 − 1 = 0.089.
    expect(result.effectiveAnnualRateAfterFees).toEqual(rate(89_000_000_000_000))
    expect(result.periodRate).toEqual(rate(100_000_000_000_000))
    // Fisher: 1.089 / 1.05 − 1 = 0.0371428571428571…
    expect(result.realAnnualRate).toEqual(rate(37_142_857_142_857))
  })

  it('the real rate is the Fisher relation, not a subtraction', () => {
    // 1.1 / 1.05 − 1 = 1/21 = 0.047619047619047619…; subtracting would give 0.05.
    expect(realRate(ratio(1, 10), ratio(1, 20))).toEqual(rate(47_619_047_619_048))
    expect(realRate(ratio(1, 50), ratio(1, 50))).toEqual(rate(0))
  })

  it('a lump sum over a year grows by the effective rate whatever the contribution frequency', () => {
    for (const contributionFrequency of ['weekly', 'monthly', 'quarterly', 'annual'] as const) {
      // £10,000 at twelve per cent compounded monthly: 1,000,000 × 1.01^12 = 1,126,825.03p.
      const result = run({ lumpSum: fromPounds(10_000), growthRate: ratio(3, 25), compounding: 'monthly', contributionFrequency })
      expect(pence(result.withFee.nominal.closing)).toBe(1_126_825)
    }
  })
})

describe('futureValue and feeDrag', () => {
  it('futureValue is the nominal closing balance with the fee', () => {
    const overrides = { lumpSum: fromPounds(10_000), growthRate: ratio(1, 10), feeRate: ratio(1, 100) }
    expect(pence(futureValue(inputs(overrides)))).toBe(1_089_000)
  })

  it('feeDrag is the closing balance without the fee less the one with it, nominal and real', () => {
    const result = run({
      lumpSum: fromPounds(10_000),
      growthRate: ratio(1, 10),
      feeRate: ratio(1, 100),
      inflationRate: ratio(1, 10),
      years: 3,
    })
    const drag = feeDrag(result.withFee, result.noFee)
    expect(drag).toEqual(result.feeDrag)
    expect(pence(drag.nominal)).toBe(pence(result.noFee.nominal.closing) - pence(result.withFee.nominal.closing))
    expect(pence(drag.real)).toBe(pence(result.noFee.real.closing) - pence(result.withFee.real.closing))
    // Fee drag includes the growth the fees would have earned.
    expect(pence(drag.nominal)).toBeGreaterThan(pence(result.withFee.nominal.fees))
  })
})

describe('edge cases', () => {
  it('zero rate: the lump sum plus contributions, no growth', () => {
    const result = run({ lumpSum: fromPounds(500), contribution: fromPounds(25), contributionFrequency: 'weekly', years: 2 })
    expect(pence(result.withFee.nominal.closing)).toBe(50_000 + 2 * 52 * 2_500)
    expect(pence(result.withFee.nominal.growth)).toBe(0)
  })

  it('a negative rate shrinks the balance', () => {
    // £1,000 falling a tenth a year for two years: £810.
    const result = run({ lumpSum: fromPounds(1000), growthRate: ratio(-1, 10), years: 2 })
    expect(rowPence(result.withFee.nominal).map((r) => r.closing)).toEqual([90_000, 81_000])
    expect(pence(result.withFee.nominal.growth)).toBe(-19_000)
  })

  it('a fee larger than growth shrinks the balance, and the fees exceed the growth', () => {
    const result = run({ lumpSum: fromPounds(1000), growthRate: ratio(1, 100), feeRate: ratio(1, 20), years: 5 })
    const nominal = result.withFee.nominal
    expect(pence(nominal.closing)).toBeLessThan(100_000)
    expect(pence(nominal.growth)).toBeGreaterThan(0)
    expect(pence(nominal.fees)).toBeGreaterThan(pence(nominal.growth))
  })

  it('a 100-year horizon with weekly contributions and daily compounding', () => {
    const result = run({
      lumpSum: fromPounds(1000),
      contribution: fromPounds(10),
      contributionFrequency: 'weekly',
      compounding: 'daily',
      growthRate: ratio(1, 20),
      feeRate: ratio(1, 200),
      inflationRate: ratio(1, 50),
      contributionIncrease: ratio(1, 50),
      years: MAX_PROJECTION_YEARS,
    })
    expect(result.withFee.nominal.rows).toHaveLength(MAX_PROJECTION_YEARS)
    expect(result.withFee.real.rows).toHaveLength(MAX_PROJECTION_YEARS)
    expect(pence(result.withFee.nominal.closing)).toBeGreaterThan(pence(result.withFee.real.closing))
  })

  it('huge amounts up to the safe-integer guard: a sum that fits is exact', () => {
    // No growth: the largest lump sum and the largest weekly contribution for the longest horizon.
    const result = run({
      lumpSum: MAX_INPUT_AMOUNT,
      contribution: MAX_INPUT_AMOUNT,
      contributionFrequency: 'weekly',
      years: MAX_PROJECTION_YEARS,
    })
    expect(pence(result.withFee.nominal.closing)).toBe(pence(MAX_INPUT_AMOUNT) * (1 + 52 * MAX_PROJECTION_YEARS))
  })

  it('huge amounts past the safe-integer guard: a typed refusal, not a number', () => {
    const outcome = project(
      inputs({
        lumpSum: MAX_INPUT_AMOUNT,
        contribution: MAX_INPUT_AMOUNT,
        contributionFrequency: 'weekly',
        compounding: 'daily',
        growthRate: GROWTH_RATE_BOUND,
        years: MAX_PROJECTION_YEARS,
      }),
    )
    expect(outcome).toEqual({ ok: false, problems: [{ field: 'result', reason: 'too-large' }] })
    expect(() => futureValue(inputs({ lumpSum: MAX_INPUT_AMOUNT, growthRate: GROWTH_RATE_BOUND, years: MAX_PROJECTION_YEARS }))).toThrow(
      EngineInputError,
    )
  })

  it('the bounds themselves are accepted, including a negative growth rate at the bound', () => {
    const negative = { numerator: -GROWTH_RATE_BOUND.numerator, denominator: GROWTH_RATE_BOUND.denominator }
    expect(project(inputs({ growthRate: negative, lumpSum: fromPounds(1) })).ok).toBe(true)
    expect(project(inputs({ feeRate: MAX_FEE_RATE, inflationRate: INFLATION_RATE_BOUND })).ok).toBe(true)
    expect(project(inputs({ contributionIncrease: MAX_CONTRIBUTION_INCREASE, years: 2 })).ok).toBe(true)
  })
})

describe('refusals (C8)', () => {
  const problems = (overrides: Partial<CompoundInputs>) => checkInputs(inputs(overrides))
  const just = (field: string, reason: string) => [{ field, reason }]
  const above = (bound: { numerator: number; denominator: number }) => ratio(bound.numerator * 101, bound.denominator * 100)
  const below = (bound: { numerator: number; denominator: number }) => ratio(-bound.numerator * 101, bound.denominator * 100)

  it('accepts the defaults', () => {
    expect(problems({})).toEqual([])
  })

  it('years: zero, negative, part of a year, past the cap', () => {
    expect(problems({ years: 0 })).toEqual(just('years', 'below-minimum'))
    expect(problems({ years: -3 })).toEqual(just('years', 'below-minimum'))
    expect(problems({ years: 1.5 })).toEqual(just('years', 'not-whole'))
    expect(problems({ years: Number.NaN })).toEqual(just('years', 'not-whole'))
    expect(problems({ years: MAX_PROJECTION_YEARS + 1 })).toEqual(just('years', 'above-maximum'))
  })

  it('amounts: negative, not whole pence, past the input limit', () => {
    expect(problems({ lumpSum: fromPence(-1) })).toEqual(just('lumpSum', 'below-minimum'))
    expect(problems({ contribution: 1.5 as Money })).toEqual(just('contribution', 'not-money'))
    expect(problems({ contribution: fromPence(pence(MAX_INPUT_AMOUNT) + 1) })).toEqual(just('contribution', 'above-maximum'))
  })

  it('rates beyond their bounds; a negative growth rate within the bound is allowed', () => {
    expect(problems({ growthRate: above(GROWTH_RATE_BOUND) })).toEqual(just('growthRate', 'above-maximum'))
    expect(problems({ growthRate: below(GROWTH_RATE_BOUND) })).toEqual(just('growthRate', 'below-minimum'))
    expect(problems({ growthRate: ratio(-1, 10) })).toEqual([])
    expect(problems({ inflationRate: above(INFLATION_RATE_BOUND) })).toEqual(just('inflationRate', 'above-maximum'))
    expect(problems({ inflationRate: below(INFLATION_RATE_BOUND) })).toEqual(just('inflationRate', 'below-minimum'))
    expect(problems({ feeRate: ratio(-1, 100) })).toEqual(just('feeRate', 'below-minimum'))
    expect(problems({ feeRate: above(MAX_FEE_RATE) })).toEqual(just('feeRate', 'above-maximum'))
    expect(problems({ contributionIncrease: ratio(-1, 100) })).toEqual(just('contributionIncrease', 'below-minimum'))
    expect(problems({ contributionIncrease: above(MAX_CONTRIBUTION_INCREASE) })).toEqual(just('contributionIncrease', 'above-maximum'))
  })

  it('a rate that is not a Ratio', () => {
    expect(problems({ growthRate: { numerator: 1, denominator: 0 } })).toEqual(just('growthRate', 'not-a-rate'))
    expect(problems({ feeRate: { numerator: 0.5, denominator: 1 } })).toEqual(just('feeRate', 'not-a-rate'))
  })

  it('a frequency or timing that is not a choice', () => {
    expect(problems({ compounding: 'fortnightly' as never })).toEqual(just('compounding', 'not-a-choice'))
    expect(problems({ contributionFrequency: 'daily' as never })).toEqual(just('contributionFrequency', 'not-a-choice'))
    expect(problems({ timing: 'middle' as never })).toEqual(just('timing', 'not-a-choice'))
  })

  it('lists every problem, and project refuses with them', () => {
    const outcome = project(inputs({ years: 0, feeRate: ratio(-1, 100) }))
    expect(outcome).toEqual({
      ok: false,
      problems: [
        { field: 'years', reason: 'below-minimum' },
        { field: 'feeRate', reason: 'below-minimum' },
      ],
    })
  })

  it('the helpers throw EngineInputError on the same conditions', () => {
    expect(() => effectiveAnnualRate(above(GROWTH_RATE_BOUND), 'monthly')).toThrow(EngineInputError)
    expect(() => effectiveAnnualRate(ratio(1, 10), 'fortnightly' as never)).toThrow(EngineInputError)
    expect(() => periodRate(ratio(1, 10), 'monthly', 'daily' as never)).toThrow(EngineInputError)
    expect(() => realRate(ratio(1, 10), above(INFLATION_RATE_BOUND))).toThrow(EngineInputError)
    expect(() => futureValue(inputs({ years: 0 }))).toThrow(EngineInputError)
  })
})

describe('assumptions', () => {
  it('lists plain-language assumptions with no figures', () => {
    const { assumptions } = run({})
    expect(assumptions.length).toBeGreaterThan(5)
    for (const text of assumptions) expect(text).not.toMatch(/\d|%|£/)
  })

  it('every result is an estimate', () => {
    expect(run({}).estimate).toBe(true)
  })
})
