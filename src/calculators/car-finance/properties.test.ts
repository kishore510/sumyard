import { describe, expect, it } from 'vitest'
import { compareRatio, factor, factorToRatio, fromPence, fromPounds, type Money, type Ratio, ratio, toPence } from '@/lib/money'
import { annualRate, hirePurchase, loan, monthlyFactor, outstandingBalance, pcp } from './calc'
import { atRate, generator, hpInputs, loanInputs, pcpInputs, type RandomAgreement, randomAgreement } from './fixtures/inputs'
import type { FinanceOutcome, FinanceResult, RateBasis } from './types'

/*
 * Properties of the car finance engine on seeded random agreements
 * (decisions F5 to F12 in docs/modelling-decisions-car.md).
 */

const pence = (amount: Money) => toPence(amount)
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0)

function ok(outcome: FinanceOutcome): FinanceResult {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

function run(agreement: RandomAgreement): FinanceOutcome {
  if (agreement.product === 'loan') return loan(agreement.inputs)
  if (agreement.product === 'hire-purchase') return hirePurchase(agreement.inputs)
  return pcp(agreement.inputs)
}

/** Seeded agreements the engine accepts (a rounding refusal, F13, is skipped and counted). */
function sample(seed: number, count: number, maxTerm = 120) {
  const random = generator(seed)
  const cases: { agreement: RandomAgreement; result: FinanceResult }[] = []
  while (cases.length < count) {
    const agreement = randomAgreement(random, maxTerm)
    const outcome = run(agreement)
    if (outcome.ok) cases.push({ agreement, result: outcome.result })
  }
  return cases
}

const cases = sample(20_261_022, 150)

describe('the schedule adds up (F7)', () => {
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_i, { result }) => {
    const { rows, finalPayment } = result.schedule
    rows.forEach((row, index) => {
      expect(pence(row.closing)).toBe(pence(row.opening) + pence(row.interest) - pence(row.payment))
      if (index > 0) expect(pence(row.opening)).toBe(pence(rows[index - 1]!.closing))
    })
    expect(pence(rows[0]!.opening)).toBe(pence(result.balanceFinanced))
    expect(pence(rows.at(-1)!.closing)).toBe(pence(finalPayment))
    const payments = sum(rows.map((row) => pence(row.payment)))
    const interest = sum(rows.map((row) => pence(row.interest)))
    expect(payments).toBe(pence(result.schedule.totalPayments))
    expect(interest).toBe(pence(result.schedule.totalInterest))
    expect(payments + pence(finalPayment)).toBe(pence(result.balanceFinanced) + interest)
    expect(rows.slice(0, -1).every((row) => pence(row.payment) === pence(result.schedule.regularPayment))).toBe(true)
    expect(pence(rows.at(-1)!.payment)).toBe(pence(result.schedule.lastPayment))
  })
})

describe('totals', () => {
  it.each(cases.map((c, i) => [i, c] as const))(
    'case %i: the cost of the owning path is the cash price plus the cost of credit',
    (_i, { agreement, result }) => {
      const price = agreement.product === 'loan' ? agreement.inputs.amount : agreement.inputs.cashPrice
      expect(pence(result.own.totalCost)).toBe(pence(price) + pence(result.costOfCredit))
      expect(pence(result.amountFinanced) + pence(result.deposit)).toBe(pence(price))
    },
  )

  it('the outstanding balance follows the schedule', () => {
    for (const { result } of cases.slice(0, 30)) {
      const term = result.schedule.rows.length
      expect(pence(outstandingBalance(result, 0))).toBe(pence(result.balanceFinanced))
      expect(pence(outstandingBalance(result, term))).toBe(pence(result.schedule.finalPayment))
      expect(pence(outstandingBalance(result, term + 1))).toBe(0)
      for (let month = 1; month <= term; month++) {
        expect(pence(outstandingBalance(result, month))).toBe(pence(result.schedule.rows[month - 1]!.closing))
      }
    }
  })
})

/** Agreements large enough that a penny of rounding cannot reverse a comparison. */
function priced(random: () => number) {
  const amount = fromPence(100_000 + Math.floor(random() * 5_000_000))
  const term = 2 + Math.floor(random() * 100)
  const rate = ratio(100 + Math.floor(random() * 3_000), 10_000)
  const basis: RateBasis = random() < 0.5 ? 'monthly' : 'annual'
  return { amount, term, rate, basis }
}

describe('monotone properties', () => {
  const random = generator(7_303)
  const draws = Array.from({ length: 60 }, () => priced(random))

  it('a higher rate never lowers the payment', () => {
    for (const { amount, term, rate, basis } of draws) {
      const low = ok(loan(loanInputs({ amount, term, pricing: atRate(rate, basis) })))
      const high = ok(loan(loanInputs({ amount, term, pricing: atRate(ratio(rate.numerator + 50, rate.denominator), basis) })))
      expect(pence(high.schedule.regularPayment)).toBeGreaterThanOrEqual(pence(low.schedule.regularPayment))
      expect(pence(high.schedule.totalInterest)).toBeGreaterThan(pence(low.schedule.totalInterest))
    }
  })

  it('a longer term lowers the payment and raises the total interest', () => {
    for (const { amount, term, rate, basis } of draws) {
      const short = ok(loan(loanInputs({ amount, term, pricing: atRate(rate, basis) })))
      const long = ok(loan(loanInputs({ amount, term: term + 12, pricing: atRate(rate, basis) })))
      expect(pence(long.schedule.regularPayment)).toBeLessThan(pence(short.schedule.regularPayment))
      expect(pence(long.schedule.totalInterest)).toBeGreaterThan(pence(short.schedule.totalInterest))
    }
  })

  it('a balloon lowers the payments and raises the final cost of owning', () => {
    for (const { amount, term, rate, basis } of draws) {
      const price = fromPence(pence(amount) + 100_000)
      const balloon = fromPence(Math.floor(pence(amount) / 3))
      const none = ok(hirePurchase(hpInputs({ cashPrice: price, deposit: fromPounds(1_000), term, pricing: atRate(rate, basis) })))
      const some = ok(hirePurchase(hpInputs({ cashPrice: price, deposit: fromPounds(1_000), term, pricing: atRate(rate, basis), balloon })))
      expect(pence(some.schedule.regularPayment)).toBeLessThan(pence(none.schedule.regularPayment))
      expect(pence(some.own.totalCost)).toBeGreaterThan(pence(none.own.totalCost))
      const pcpSome = ok(
        pcp(pcpInputs({ cashPrice: price, deposit: fromPounds(1_000), term, pricing: atRate(rate, basis), finalPayment: balloon })),
      )
      expect(pence(pcpSome.schedule.regularPayment)).toBe(pence(some.schedule.regularPayment))
    }
  })

  it('with a fee, the effective annual rate is above the rate entered', () => {
    for (const { amount, term, rate, basis } of draws) {
      for (const arrangementFeeTiming of ['start', 'added'] as const) {
        const r = ok(loan(loanInputs({ amount, term, pricing: atRate(rate, basis), arrangementFee: fromPounds(10), arrangementFeeTiming })))
        expect(r.effectiveRate.ok).toBe(true)
        if (r.effectiveRate.ok) expect(compareRatio(r.effectiveRate.annual, rate)).toBe(1)
      }
    }
  })

  it('with no fee and the annual basis, the effective annual rate is the rate entered, to within the payment rounding', () => {
    for (const { amount, term, rate } of draws) {
      const r = ok(loan(loanInputs({ amount, term, pricing: atRate(rate, 'annual') })))
      if (!r.effectiveRate.ok) throw new Error('no rate')
      const gap = Math.abs(r.effectiveRate.annual.numerator / r.effectiveRate.annual.denominator - rate.numerator / rate.denominator)
      expect(gap).toBeLessThan(0.0005)
    }
  })

  it('a rate of nothing gives the balance over the term, and no interest', () => {
    for (const { amount, term } of draws) {
      const r = ok(loan(loanInputs({ amount, term })))
      expect(pence(r.schedule.totalInterest)).toBe(0)
      expect(Math.abs(pence(r.schedule.regularPayment) * term - pence(amount))).toBeLessThanOrEqual(term)
      expect(compareRatio(r.monthlyRate, ratio(0, 1))).toBe(0)
    }
  })
})

describe('the monthly and annual rates', () => {
  it('annualRate compounds twelve months: it undoes the annual basis', () => {
    const random = generator(99)
    for (let k = 0; k < 40; k++) {
      const rate: Ratio = ratio(Math.floor(random() * 10_000), 10_000)
      const back = annualRate(monthlyFactor(rate, 'annual'))
      // fifteen places: the rate's ten-thousandths times 10^11
      expect(back.denominator).toBe(10 ** 15)
      expect(Math.abs(back.numerator - rate.numerator * 10 ** 11)).toBeLessThanOrEqual(1)
    }
  })

  it('the monthly basis compounds to more than the nominal rate', () => {
    expect(compareRatio(annualRate(monthlyFactor(ratio(12, 100), 'monthly')), ratio(12, 100))).toBe(1)
    expect(compareRatio(factorToRatio(factor(ratio(1, 100))), factorToRatio(monthlyFactor(ratio(12, 100), 'monthly')))).toBe(0)
  })
})
