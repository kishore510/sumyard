import { describe, expect, it } from 'vitest'
import { formatPercent } from '@/lib/format'
import { factorToRatio, fromPence, fromPounds, type Money, mulRound, roundToPounds, toPence } from '@/lib/money'
import { buildSchedule, hirePurchase, solveRate } from './calc'
import { byPayment, hpInputs } from './fixtures/inputs'

/*
 * Published worked examples (docs/worked-examples.md, "Car finance (slice
 * 3a)"), read on www.gov.uk on 21 October 2026. None gives an APR, and none
 * is a PCP: they test the rate solver (F9), the schedule (F7) and HP totals.
 */

const pounds = (amount: Money) => toPence(roundToPounds(amount, 'nearest')) / 100

function solved(credit: Money, payments: readonly Money[]) {
  const outcome = solveRate({ credit, payments })
  if (!outcome.ok) throw new Error(outcome.reason)
  return outcome.rate
}

describe('EIR-1: CFM21180, Example 1 (https://www.gov.uk/hmrc-internal-manuals/corporate-finance-manual/cfm21180)', () => {
  it('£100,000 grows to £110,000 in one period: 10%', () => {
    expect(formatPercent(factorToRatio(solved(fromPounds(100_000), [fromPounds(110_000)])), 15)).toBe('10%')
  })

  it('£121,000 in two periods is also 10%', () => {
    expect(formatPercent(factorToRatio(solved(fromPounds(100_000), [fromPence(0), fromPounds(121_000)])), 15)).toBe('10%')
  })
})

describe('EIR-2: CFM21180, Example 2 (https://www.gov.uk/hmrc-internal-manuals/corporate-finance-manual/cfm21180)', () => {
  const rate = factorToRatio(
    solved(fromPounds(95_788), [fromPounds(5_000), fromPounds(5_000), fromPounds(5_000), fromPounds(5_000), fromPounds(105_000)]),
  )

  it('"an effective interest rate of 6%"', () => {
    expect(formatPercent(rate, 0)).toBe('6%')
  })

  it('year 1: "a return of £5,747 (£95,788 x 6%)"', () => {
    expect(pounds(mulRound(fromPounds(95_788), rate, 'nearest'))).toBe(5_747)
  })
})

describe('EIR-3: BLM15505 (https://www.gov.uk/hmrc-internal-manuals/business-leasing-manual/blm15505)', () => {
  const rent = fromPounds(12_400)
  const rate = solved(fromPounds(50_000), [rent, rent, rent, rent, rent])

  it('"an effective interest rate of 7.63%"', () => {
    expect(formatPercent(factorToRatio(rate), 2)).toBe('7.63%')
  })

  const schedule = buildSchedule(fromPounds(50_000), { factor: rate, exact: null }, 5, rent, fromPence(0), 'last-interest')
  if (!schedule) throw new Error('not payable')
  const interest = schedule.rows.map((row) => pounds(row.interest))
  const capital = schedule.rows.map((row) => pounds(fromPence(toPence(row.payment) - toPence(row.interest))))

  it('years 1 to 4: the interest and capital elements, to the pound', () => {
    expect(interest.slice(0, 4)).toEqual([3_814, 3_159, 2_454, 1_695])
    expect(capital.slice(0, 4)).toEqual([8_586, 9_241, 9_946, 10_705])
    expect(schedule.rows.every((row) => toPence(row.payment) === toPence(rent))).toBe(true)
  })

  it('year 5 within the pound the published table moves there so its whole pounds add up ("878", "11,522")', () => {
    // In pence the engine has 878.74 and 11,521.26; rounding each year to the pound would total
    // 12,001 of interest, so the table shows 878 and 11,522. The totals below are exact.
    expect(Math.abs(interest[4]! - 878)).toBeLessThanOrEqual(1)
    expect(Math.abs(capital[4]! - 11_522)).toBeLessThanOrEqual(1)
    expect(toPence(schedule.totalInterest)).toBe(1_200_000)
    expect(toPence(schedule.totalPayments) - toPence(schedule.totalInterest)).toBe(5_000_000)
  })
})

describe('HP-1: VBDR2420 (https://www.gov.uk/hmrc-internal-manuals/vat-bad-debt-relief/vbdr2420)', () => {
  const outcome = hirePurchase(
    hpInputs({ cashPrice: fromPounds(10_000), deposit: fromPounds(1_000), term: 12, pricing: byPayment(fromPounds(900)) }),
  )

  it('"Amount financed £ 9,000"; "Total interest (A) £ 1,800"; "Total amount payable (B) £10,800"', () => {
    if (!outcome.ok) throw new Error('refused')
    const r = outcome.result
    expect(toPence(r.amountFinanced)).toBe(900_000)
    expect(toPence(r.schedule.totalInterest)).toBe(180_000)
    expect(toPence(r.schedule.totalPayments)).toBe(1_080_000)
    expect(r.schedule.rows.every((row) => toPence(row.payment) === 90_000)).toBe(true)
    expect(toPence(r.own.totalCost)).toBe(1_180_000)
  })

  it('no rate is published, so none is mirrored; the solved one is above nothing', () => {
    if (!outcome.ok) throw new Error('refused')
    expect(outcome.result.monthlyRate.numerator).toBeGreaterThan(0)
  })
})
