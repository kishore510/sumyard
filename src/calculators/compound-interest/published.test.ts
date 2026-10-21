import { describe, expect, it } from 'vitest'
import { fromPounds, type Money, mulRound, ratio, roundToPounds, toPence } from '@/lib/money'
import { project, realRate } from './calc'
import { inputs } from './fixtures/inputs'
import type { CompoundInputs, CompoundResult } from './types'

/*
 * Published worked examples (docs/worked-examples.md, "Compound growth and
 * deflation (slice 2a)"). The figures are the page's own illustration, not
 * rates for any year. Source: HM Treasury, The Green Book (2026), Table 8,
 * https://www.gov.uk/government/publications/the-green-book--2/the-green-book-2026
 */

function run(overrides: Partial<CompoundInputs>): CompoundResult {
  const outcome = project(inputs(overrides))
  if (!outcome.ok) throw new Error('refused')
  return outcome.result
}

const pounds = (amount: Money) => toPence(roundToPounds(amount, 'nearest')) / 100
const twoPerCent = ratio(1, 50)
const threeAndAHalfPerCent = ratio(7, 200)

describe('GB-1: £1,000 rising by 2% a year in nominal terms, with a 2% GDP deflator', () => {
  it('the nominal values are £1,020, £1,040, £1,061, £1,082, £1,104', () => {
    const result = run({ lumpSum: fromPounds(1000), growthRate: twoPerCent, years: 5 })
    expect(result.withFee.nominal.rows.map((r) => pounds(r.closing))).toEqual([1020, 1040, 1061, 1082, 1104])
  })

  it('"The social benefits are therefore constant in real terms": £1,000 every year', () => {
    const result = run({ lumpSum: fromPounds(1000), growthRate: twoPerCent, inflationRate: twoPerCent, years: 5 })
    expect(result.withFee.real.rows.map((r) => toPence(r.closing))).toEqual([100_000, 100_000, 100_000, 100_000, 100_000])
    expect(realRate(twoPerCent, twoPerCent)).toEqual({ numerator: 0, denominator: 10 ** 15 })
  })

  it('the GDP deflator factors 0.9804, 0.9612, 0.9423, 0.9238, 0.9057', () => {
    // £10,000 with no growth, in today’s money: the factor to four places is the real value in units of £1.
    const result = run({ lumpSum: fromPounds(10_000), inflationRate: twoPerCent, years: 5 })
    const factors = result.withFee.real.rows.map((r) => toPence(mulRound(r.closing, ratio(1, 100), 'nearest')))
    expect(factors).toEqual([9804, 9612, 9423, 9238, 9057])
  })
})

describe('GB-2: discounting at 3.5% a year (the STPR, "3.50% in real terms for years 1 to 30")', () => {
  it('the discount factors 0.9662, 0.9335, 0.9019, 0.8714, 0.8420', () => {
    const result = run({ lumpSum: fromPounds(10_000), inflationRate: threeAndAHalfPerCent, years: 5 })
    const factors = result.withFee.real.rows.map((r) => toPence(mulRound(r.closing, ratio(1, 100), 'nearest')))
    expect(factors).toEqual([9662, 9335, 9019, 8714, 8420])
  })

  it('the present values £966, £934, £902, £871, £842 of the nominal values, deflated then discounted', () => {
    // Deflating by 2% and then discounting by 3.5% is one deflation by (1.02 × 1.035) − 1 = 0.0557 (Fisher),
    // not by the sum of the two, which the page warns "will produce a mathematically incorrect result".
    const combined = ratio(557, 10_000)
    const result = run({ lumpSum: fromPounds(1000), growthRate: twoPerCent, inflationRate: combined, years: 5 })
    expect(result.withFee.real.rows.map((r) => pounds(r.closing))).toEqual([966, 934, 902, 871, 842])
  })
})
