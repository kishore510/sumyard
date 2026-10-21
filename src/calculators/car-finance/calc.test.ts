import { describe, expect, it } from 'vitest'
import { FIGURE } from '@/calculators/fixtures/literalGuard'
import { MAX_EXCESS_PER_MILE, MAX_FINANCE_RATE, MAX_FINANCE_TERM_MONTHS, MAX_INPUT_AMOUNT, MAX_MILEAGE } from '@/lib/inputLimits'
import { compareRatio, factorToRatio, fromPence, fromPounds, type Money, type Ratio, ratio, toPence } from '@/lib/money'
import { EngineInputError, hirePurchase, loan, monthlyFactor, outstandingBalance, pcp, solveRate } from './calc'
import { atRate, byPayment, hpInputs, loanInputs, pcpInputs } from './fixtures/inputs'
import type { FinanceOutcome, FinanceResult } from './types'

/*
 * Hand-checkable cases, edge cases and refusals for the car finance engine
 * (slice 3a, decisions F5 to F14 in docs/modelling-decisions-car.md). Every
 * expected figure here is worked by hand in the comment beside it.
 */

const P = (pence: number) => fromPence(pence)
const pence = (amount: Money) => toPence(amount)
const TWELVE_PERCENT = ratio(12, 100)
/** Fifteen decimal places, as factorToRatio gives. */
const at15 = (numerator: number) => ratio(numerator, 1_000_000_000_000_000)
const sameRate = (a: Ratio, b: Ratio) => compareRatio(a, b) === 0

function ok(outcome: FinanceOutcome): FinanceResult {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

function effective(result: FinanceResult) {
  if (!result.effectiveRate.ok) throw new Error(`no effective rate: ${result.effectiveRate.reason}`)
  return result.effectiveRate
}

const problems = (outcome: FinanceOutcome) => (outcome.ok ? [] : outcome.problems)

describe('hand-checkable loans', () => {
  it('no interest: £1,200 over twelve months is £100 a month', () => {
    const r = ok(loan(loanInputs()))
    expect(pence(r.schedule.regularPayment)).toBe(10_000)
    expect(pence(r.schedule.lastPayment)).toBe(10_000)
    expect(pence(r.schedule.totalInterest)).toBe(0)
    expect(r.schedule.rows).toHaveLength(12)
    expect(pence(r.schedule.rows[5]!.closing)).toBe(60_000)
    expect(pence(r.costOfCredit)).toBe(0)
    expect(pence(r.own.totalCost)).toBe(120_000)
    expect(r.own.ownsCar).toBe(true)
    expect(r.handBack).toBeNull()
    expect(sameRate(effective(r).monthly, ratio(0, 1))).toBe(true)
    expect(sameRate(effective(r).annual, ratio(0, 1))).toBe(true)
  })

  it('one payment: £1,000 for a month at twelve per cent nominal (one per cent a month) is £1,010', () => {
    const r = ok(loan(loanInputs({ amount: fromPounds(1_000), term: 1, pricing: atRate(TWELVE_PERCENT) })))
    expect(r.schedule.rows).toEqual([{ month: 1, opening: P(100_000), interest: P(1_000), payment: P(101_000), closing: P(0) }])
    expect(sameRate(r.monthlyRate, ratio(1, 100))).toBe(true)
    expect(sameRate(effective(r).monthly, ratio(1, 100))).toBe(true)
    // 1.01^12 − 1 = 0.126825030131969720661201, to fifteen places
    expect(sameRate(effective(r).annual, at15(126_825_030_131_970))).toBe(true)
  })

  it('two payments: £201 over two months at one per cent a month is £102.01 a month', () => {
    // P = 201 × 1.01² × 0.01 / (1.01² − 1) = 201 × 0.010201 / 0.0201 = 102.01
    const r = ok(loan(loanInputs({ amount: P(20_100), term: 2, pricing: atRate(TWELVE_PERCENT) })))
    expect(r.schedule.rows).toEqual([
      { month: 1, opening: P(20_100), interest: P(201), payment: P(10_201), closing: P(10_100) },
      { month: 2, opening: P(10_100), interest: P(101), payment: P(10_201), closing: P(0) },
    ])
    expect(pence(r.schedule.totalInterest)).toBe(302)
  })

  it('the last payment takes the rounding: £100 over three months with no interest is 33.33, 33.33, 33.34', () => {
    const r = ok(loan(loanInputs({ amount: fromPounds(100), term: 3 })))
    expect(r.schedule.rows.map((row) => pence(row.payment))).toEqual([3_333, 3_333, 3_334])
    expect(pence(r.schedule.regularPayment)).toBe(3_333)
    expect(pence(r.schedule.lastPayment)).toBe(3_334)
  })

  it('interest is on the opening balance, rounded to the nearest penny', () => {
    // £1,000.50 at one per cent a month: 1,000.50 × 0.01 = 10.005 → 10.01 (half away from zero)
    const r = ok(loan(loanInputs({ amount: P(100_050), term: 1, pricing: atRate(TWELVE_PERCENT) })))
    expect(pence(r.schedule.rows[0]!.interest)).toBe(1_001)
  })
})

describe('the rate basis (F6)', () => {
  it("'monthly' charges a twelfth of the nominal rate each month", () => {
    expect(sameRate(factorToRatio(monthlyFactor(TWELVE_PERCENT, 'monthly')), ratio(1, 100))).toBe(true)
  })

  it("'annual' charges the twelfth root: one hundred per cent a year is 2^(1/12) − 1 a month", () => {
    // 2^(1/12) = 1.059463094359295264561825…
    expect(sameRate(factorToRatio(monthlyFactor(ratio(1, 1), 'annual')), at15(59_463_094_359_295))).toBe(true)
    const r = ok(loan(loanInputs({ pricing: atRate(ratio(1, 1), 'annual') })))
    expect(sameRate(r.monthlyRate, at15(59_463_094_359_295))).toBe(true)
  })

  it('a rate of nothing is nothing either way', () => {
    expect(sameRate(factorToRatio(monthlyFactor(ratio(0, 1), 'annual')), ratio(0, 1))).toBe(true)
  })
})

describe('fees (F10)', () => {
  it('a fee paid at the start is not financed but counts in the effective rate', () => {
    // credit received 990; one payment of 1,010: 1,010 / 990 − 1 = 2/99 a month
    const r = ok(loan(loanInputs({ amount: fromPounds(1_000), term: 1, pricing: atRate(TWELVE_PERCENT), arrangementFee: fromPounds(10) })))
    expect(pence(r.balanceFinanced)).toBe(100_000)
    expect(pence(r.schedule.regularPayment)).toBe(101_000)
    expect(sameRate(effective(r).monthly, at15(20_202_020_202_020))).toBe(true)
    expect(pence(r.costOfCredit)).toBe(2_000)
    expect(pence(r.own.totalCost)).toBe(102_000)
  })

  it('a fee added to the balance earns interest and is paid in the instalments', () => {
    // balance 1,010; payment 1,010 × 1.01 = 1,020.10; credit 1,000: 2.01% a month
    const r = ok(
      loan(
        loanInputs({
          amount: fromPounds(1_000),
          term: 1,
          pricing: atRate(TWELVE_PERCENT),
          arrangementFee: fromPounds(10),
          arrangementFeeTiming: 'added',
        }),
      ),
    )
    expect(pence(r.balanceFinanced)).toBe(101_000)
    expect(pence(r.amountFinanced)).toBe(100_000)
    expect(pence(r.schedule.regularPayment)).toBe(102_010)
    expect(sameRate(effective(r).monthly, ratio(201, 10_000))).toBe(true)
    expect(pence(r.costOfCredit)).toBe(2_010)
    expect(pence(r.own.totalCost)).toBe(102_010)
  })

  it('fees larger than the interest: £50 on £1,000 at no interest still gives a rate', () => {
    // 1,000 / 950 − 1 = 1/19 a month
    const r = ok(loan(loanInputs({ amount: fromPounds(1_000), term: 1, arrangementFee: fromPounds(50) })))
    expect(pence(r.schedule.totalInterest)).toBe(0)
    expect(pence(r.costOfCredit)).toBe(5_000)
    expect(sameRate(effective(r).monthly, at15(52_631_578_947_368))).toBe(true)
  })

  it('a fee at the start as large as the loan leaves no credit, so no effective rate', () => {
    const r = ok(loan(loanInputs({ amount: fromPounds(1_000), term: 1, arrangementFee: fromPounds(1_000) })))
    expect(r.effectiveRate).toEqual({ ok: false, reason: 'no-solution' })
  })
})

describe('hire purchase (F11)', () => {
  it('the option fee is paid with the last payment, and the car is owned at the end', () => {
    // £9,000 over twelve months with no interest: £750 a month; £10 option fee
    const r = ok(hirePurchase(hpInputs({ optionFee: fromPounds(10) })))
    expect(pence(r.amountFinanced)).toBe(900_000)
    expect(pence(r.schedule.regularPayment)).toBe(75_000)
    expect(pence(r.own.purchaseFee)).toBe(1_000)
    expect(pence(r.own.totalCost)).toBe(1_001_000)
    expect(pence(r.costOfCredit)).toBe(1_000)
    expect(r.own.ownsCar).toBe(true)
    expect(r.handBack).toBeNull()
    expect(compareRatio(effective(r).monthly, ratio(0, 1))).toBe(1)
  })

  it('a balloon is owed after the last monthly payment and paid at the end', () => {
    // £9,000 less a £3,000 balloon over twelve months with no interest: £500 a month
    const r = ok(hirePurchase(hpInputs({ balloon: fromPounds(3_000) })))
    expect(pence(r.schedule.regularPayment)).toBe(50_000)
    expect(pence(r.schedule.rows.at(-1)!.closing)).toBe(300_000)
    expect(pence(r.own.finalPayment)).toBe(300_000)
    expect(pence(r.own.totalCost)).toBe(1_000_000)
  })
})

describe('PCP (F11)', () => {
  // £18,000 financed, £9,000 final payment, 36 months, no interest: £250 a month
  const base = { excessPerMile: fromPence(10), expectedMileage: 33_000, purchaseFee: fromPounds(10) }

  it('buying pays the final payment and the purchase fee and owns the car', () => {
    const r = ok(pcp(pcpInputs(base)))
    expect(pence(r.schedule.regularPayment)).toBe(25_000)
    expect(r.own).toEqual({
      ownsCar: true,
      finalPayment: P(900_000),
      purchaseFee: P(1_000),
      excessMiles: 0,
      excessMileageCharge: P(0),
      totalCost: P(2_001_000),
    })
  })

  it('handing back pays only the excess mileage: 3,000 miles over at 10p is £300', () => {
    const r = ok(pcp(pcpInputs(base)))
    expect(r.handBack).toEqual({
      ownsCar: false,
      finalPayment: P(0),
      purchaseFee: P(0),
      excessMiles: 3_000,
      excessMileageCharge: P(30_000),
      totalCost: P(1_130_000),
    })
  })

  it('no excess when the miles are within the allowance', () => {
    const r = ok(pcp(pcpInputs({ ...base, expectedMileage: 10_000 })))
    expect(r.handBack?.excessMiles).toBe(0)
    expect(pence(r.handBack!.excessMileageCharge)).toBe(0)
  })

  it('a balloon equal to the amount financed: interest only, the balance never falls', () => {
    const r = ok(
      pcp(
        pcpInputs({
          cashPrice: fromPounds(10_000),
          deposit: P(0),
          finalPayment: fromPounds(10_000),
          term: 12,
          pricing: atRate(TWELVE_PERCENT),
        }),
      ),
    )
    expect(pence(r.schedule.regularPayment)).toBe(10_000)
    expect(r.schedule.rows.every((row) => pence(row.interest) === 10_000 && pence(row.closing) === 1_000_000)).toBe(true)
    expect(sameRate(effective(r).monthly, ratio(1, 100))).toBe(true)
  })
})

describe('the outstanding balance (F12)', () => {
  const r = ok(pcp(pcpInputs()))

  it('is the balance financed at month 0, the schedule balance after each payment, the final payment at the end, nothing after', () => {
    expect(pence(outstandingBalance(r, 0))).toBe(1_800_000)
    expect(pence(outstandingBalance(r, 12))).toBe(1_500_000)
    expect(pence(outstandingBalance(r, 36))).toBe(900_000)
    expect(pence(outstandingBalance(r, 37))).toBe(0)
  })

  it('throws for a month that is not a whole number from nothing', () => {
    expect(() => outstandingBalance(r, -1)).toThrow(EngineInputError)
    expect(() => outstandingBalance(r, 1.5)).toThrow(EngineInputError)
  })
})

describe('priced by the payment (F6, F9)', () => {
  it('a payment that exactly covers the loan with no interest gives a rate of nothing', () => {
    const r = ok(loan(loanInputs({ pricing: byPayment(fromPounds(100)) })))
    expect(sameRate(r.monthlyRate, ratio(0, 1))).toBe(true)
    expect(pence(r.schedule.lastPayment)).toBe(10_000)
  })

  it('one payment of £1,010 on £1,000 is one per cent a month', () => {
    const r = ok(loan(loanInputs({ amount: fromPounds(1_000), term: 1, pricing: byPayment(fromPounds(1_010)) })))
    expect(sameRate(r.monthlyRate, ratio(1, 100))).toBe(true)
    expect(pence(r.schedule.rows[0]!.interest)).toBe(1_000)
  })

  it('refuses a payment that does not cover the balance with no interest', () => {
    expect(problems(loan(loanInputs({ pricing: byPayment(fromPounds(99)) })))).toEqual([{ field: 'payment', reason: 'below-minimum' }])
  })

  it('refuses a payment that would need a rate above one hundred per cent a month', () => {
    expect(problems(loan(loanInputs({ amount: fromPounds(100), term: 1, pricing: byPayment(fromPounds(300)) })))).toEqual([
      { field: 'payment', reason: 'above-maximum' },
    ])
  })
})

describe('the rate solver (F9)', () => {
  it('refuses with no credit, or payments below the credit', () => {
    expect(solveRate({ credit: P(0), payments: [P(100)] })).toEqual({ ok: false, reason: 'no-solution' })
    expect(solveRate({ credit: P(1_000), payments: [P(500), P(400)] })).toEqual({ ok: false, reason: 'no-solution' })
  })

  it('gives exactly nothing when the payments equal the credit', () => {
    const solved = solveRate({ credit: P(1_000), payments: [P(500), P(500)] })
    expect(solved.ok && sameRate(factorToRatio(solved.rate), ratio(0, 1))).toBe(true)
  })

  it('a single payment of double the credit is one hundred per cent a period (the top of the bracket)', () => {
    const solved = solveRate({ credit: P(1_000), payments: [P(2_000)] })
    expect(solved.ok && sameRate(factorToRatio(solved.rate), ratio(1, 1))).toBe(true)
  })
})

describe('refusals (F13)', () => {
  it.each([
    ['a term of nothing', { term: 0 }, 'term', 'below-minimum'],
    ['part of a month', { term: 1.5 }, 'term', 'not-whole'],
    ['a term past the bound', { term: MAX_FINANCE_TERM_MONTHS + 1 }, 'term', 'above-maximum'],
    ['an amount of nothing', { amount: P(0) }, 'amount', 'below-minimum'],
    ['a negative amount', { amount: P(-1) }, 'amount', 'below-minimum'],
    ['part of a penny', { amount: 1.5 as Money }, 'amount', 'not-money'],
    ['an unsafe amount', { amount: (2 ** 53) as Money }, 'amount', 'not-money'],
    ['an amount past the bound', { amount: P(MAX_INPUT_AMOUNT + 1) }, 'amount', 'above-maximum'],
    ['a negative rate', { pricing: atRate(ratio(-1, 100)) }, 'rate', 'below-minimum'],
    [
      'a rate past the bound',
      { pricing: atRate(ratio(MAX_FINANCE_RATE.numerator + 1, MAX_FINANCE_RATE.denominator)) },
      'rate',
      'above-maximum',
    ],
    [
      'a rate that is not a Ratio',
      { pricing: { kind: 'rate', rate: { numerator: 1, denominator: 0 }, basis: 'monthly' } },
      'rate',
      'not-a-rate',
    ],
    ['an unknown basis', { pricing: { kind: 'rate', rate: TWELVE_PERCENT, basis: 'weekly' } }, 'basis', 'not-a-choice'],
    ['an unknown pricing', { pricing: { kind: 'flat' } }, 'pricing', 'not-a-choice'],
    ['a negative payment', { pricing: byPayment(P(-1)) }, 'payment', 'below-minimum'],
    ['a negative fee', { arrangementFee: P(-1) }, 'arrangementFee', 'below-minimum'],
    ['an unknown fee timing', { arrangementFeeTiming: 'later' }, 'arrangementFeeTiming', 'not-a-choice'],
  ])('a loan with %s', (_name, overrides, field, reason) => {
    expect(problems(loan(loanInputs(overrides as never)))).toEqual([{ field, reason }])
  })

  it.each([
    ['a deposit equal to the price', { deposit: fromPounds(10_000) }, 'deposit', 'above-maximum'],
    ['a deposit above the price', { deposit: fromPounds(10_001) }, 'deposit', 'above-maximum'],
    ['a balloon above the amount financed', { balloon: P(900_001) }, 'balloon', 'above-maximum'],
    ['a negative option fee', { optionFee: P(-1) }, 'optionFee', 'below-minimum'],
  ])('HP with %s', (_name, overrides, field, reason) => {
    expect(problems(hirePurchase(hpInputs(overrides as never)))).toEqual([{ field, reason }])
  })

  it.each([
    ['a final payment above the amount financed', { finalPayment: P(1_800_001) }, 'finalPayment', 'above-maximum'],
    ['negative miles', { mileageAllowance: -1 }, 'mileageAllowance', 'below-minimum'],
    ['part of a mile', { expectedMileage: 0.5 }, 'expectedMileage', 'not-whole'],
    ['miles past the bound', { expectedMileage: MAX_MILEAGE + 1 }, 'expectedMileage', 'above-maximum'],
    ['a charge per mile past the bound', { excessPerMile: P(MAX_EXCESS_PER_MILE + 1) }, 'excessPerMile', 'above-maximum'],
    ['a negative purchase fee', { purchaseFee: P(-1) }, 'purchaseFee', 'below-minimum'],
  ])('PCP with %s', (_name, overrides, field, reason) => {
    expect(problems(pcp(pcpInputs(overrides as never)))).toEqual([{ field, reason }])
  })

  it('names every problem at once, in the order of the fields', () => {
    expect(problems(hirePurchase(hpInputs({ deposit: P(-1), term: 0, optionFee: P(-1) })))).toEqual([
      { field: 'deposit', reason: 'below-minimum' },
      { field: 'term', reason: 'below-minimum' },
      { field: 'optionFee', reason: 'below-minimum' },
    ])
  })

  it('refuses a schedule whose rounded payment would leave the last payment below nothing', () => {
    // 60p over 120 months with no interest: 0.5p a month rounds to 1p, so 119 payments pass the 60p
    const outcome = pcp(pcpInputs({ cashPrice: P(1_060), deposit: P(0), finalPayment: P(1_000), term: 120 }))
    expect(problems(outcome)).toEqual([{ field: 'result', reason: 'not-payable' }])
  })
})

describe('edge cases', () => {
  it('a very long term at the top rate, either basis, runs and clears', () => {
    for (const basis of ['monthly', 'annual'] as const) {
      const r = ok(loan(loanInputs({ amount: MAX_INPUT_AMOUNT, term: MAX_FINANCE_TERM_MONTHS, pricing: atRate(MAX_FINANCE_RATE, basis) })))
      expect(r.schedule.rows).toHaveLength(MAX_FINANCE_TERM_MONTHS)
      expect(pence(r.schedule.rows.at(-1)!.closing)).toBe(0)
      expect(r.effectiveRate.ok).toBe(true)
    }
  })

  it('the largest inputs everywhere stay within the safe range (no overflow)', () => {
    const r = ok(
      pcp(
        pcpInputs({
          cashPrice: MAX_INPUT_AMOUNT,
          deposit: P(0),
          finalPayment: MAX_INPUT_AMOUNT,
          term: MAX_FINANCE_TERM_MONTHS,
          pricing: atRate(MAX_FINANCE_RATE),
          arrangementFee: MAX_INPUT_AMOUNT,
          arrangementFeeTiming: 'added',
          purchaseFee: MAX_INPUT_AMOUNT,
          mileageAllowance: 0,
          expectedMileage: MAX_MILEAGE,
          excessPerMile: MAX_EXCESS_PER_MILE,
        }),
      ),
    )
    expect(Number.isSafeInteger(pence(r.own.totalCost))).toBe(true)
    expect(pence(r.handBack!.excessMileageCharge)).toBe(MAX_MILEAGE * MAX_EXCESS_PER_MILE)
  })
})

describe('assumptions', () => {
  it.each([
    ['loan', ok(loan(loanInputs()))],
    ['HP', ok(hirePurchase(hpInputs()))],
    ['PCP', ok(pcp(pcpInputs()))],
  ])('%s: listed, with no figures, and the rate is said not to be the statutory APR', (_name, r) => {
    expect(r.assumptions.length).toBeGreaterThan(3)
    expect(r.assumptions.filter((text) => FIGURE.test(text))).toEqual([])
    expect(r.assumptions.some((text) => text.includes('not the statutory APR'))).toBe(true)
  })

  it('only PCP mentions handing the car back', () => {
    expect(ok(pcp(pcpInputs())).assumptions.some((text) => text.includes('hand'))).toBe(true)
    expect(ok(loan(loanInputs())).assumptions.some((text) => text.includes('hand'))).toBe(false)
  })
})
