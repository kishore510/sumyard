import { describe, expect, it } from 'vitest'
import { compareRatio, type Factor, FINE_DIGITS, factorToRatio, fromPence, type Money, RATE_SOLVE_DIGITS, toPence } from '@/lib/money'
import { annualRate, hirePurchase, loan, pcp, solveRate } from './calc'
import { byPayment, generator, type RandomAgreement, randomAgreement } from './fixtures/inputs'
import { absFraction, compareFraction, type Fraction, frac, presentValue, subtractFraction } from './fixtures/reference'
import type { CashFlows, FinanceOutcome, FinanceResult } from './types'

/*
 * The rate solver's round trip (decisions F8 and F9) on 300 seeded
 * agreements, half priced by their rate and half by a payment: the cash flows
 * are rebuilt from the result, the rate is solved, and the payments are
 * discounted at that rate in exact fractions (fixtures/reference.ts).
 *
 * Tolerance (docs/money.md, "Car finance (slice 3a)"): the solver stops
 * within 10^-RATE_SOLVE_DIGITS of the root, so the discounted payments equal
 * the credit received within ROUND_TRIP (10^-9 of a penny), and the root lies
 * strictly between the rate less and plus that tolerance.
 */

const CASES = 300
const SEED = 3_030
const ROUND_TRIP: Fraction = { n: 1n, d: 10n ** 9n }
const TOLERANCE: Fraction = { n: 1n, d: 10n ** BigInt(RATE_SOLVE_DIGITS) }
const big = (amount: Money) => BigInt(toPence(amount))
const asFraction = (rate: Factor): Fraction => frac(rate as bigint, 10n ** BigInt(FINE_DIGITS))

function run(agreement: RandomAgreement): FinanceOutcome {
  if (agreement.product === 'loan') return loan(agreement.inputs)
  if (agreement.product === 'hire-purchase') return hirePurchase(agreement.inputs)
  return pcp(agreement.inputs)
}

/** The same agreement priced by a payment near the one its rate gives. */
function byNearbyPayment(agreement: RandomAgreement, result: FinanceResult, random: () => number): RandomAgreement {
  const nudged = fromPence(toPence(result.schedule.regularPayment) + Math.floor(random() * 2_001) - 1_000)
  const pricing = byPayment(nudged)
  if (agreement.product === 'loan') return { product: 'loan', inputs: { ...agreement.inputs, pricing } }
  if (agreement.product === 'hire-purchase') return { product: 'hire-purchase', inputs: { ...agreement.inputs, pricing } }
  return { product: 'pcp', inputs: { ...agreement.inputs, pricing } }
}

/** The cash flows behind the effective rate, rebuilt from the result and its inputs (F8). */
function flowsOf(agreement: RandomAgreement, result: FinanceResult): CashFlows {
  const startFee = agreement.inputs.arrangementFeeTiming === 'start' ? toPence(agreement.inputs.arrangementFee) : 0
  const payments = result.schedule.rows.map((row) => toPence(row.payment))
  payments[payments.length - 1]! += toPence(result.own.finalPayment) + toPence(result.own.purchaseFee)
  return { credit: fromPence(toPence(result.amountFinanced) - startFee), payments: payments.map(fromPence) }
}

function sample() {
  const random = generator(SEED)
  const cases: { agreement: RandomAgreement; result: FinanceResult }[] = []
  while (cases.length < CASES) {
    const first = randomAgreement(random)
    const outcome = run(first)
    if (!outcome.ok || !outcome.result.effectiveRate.ok) continue
    if (cases.length % 2 === 0) {
      cases.push({ agreement: first, result: outcome.result })
      continue
    }
    const second = byNearbyPayment(first, outcome.result, random)
    const again = run(second)
    if (again.ok && again.result.effectiveRate.ok) cases.push({ agreement: second, result: again.result })
  }
  return cases
}

describe('rate round trip (300 seeded agreements)', () => {
  const cases = sample()

  it('half are priced by a payment', () => {
    expect(cases.filter((c) => c.agreement.inputs.pricing.kind === 'payment').length).toBe(CASES / 2)
  })

  it.each(cases.map((c, index) => [index, c] as const))('case %i', (_index, { agreement, result }) => {
    const flows = flowsOf(agreement, result)
    const solved = solveRate(flows)
    if (!solved.ok) throw new Error(solved.reason)
    if (!result.effectiveRate.ok) throw new Error('no effective rate')
    expect(compareRatio(result.effectiveRate.monthly, factorToRatio(solved.rate))).toBe(0)
    expect(compareRatio(result.effectiveRate.annual, annualRate(solved.rate))).toBe(0)

    const payments = flows.payments.map(big)
    const credit = frac(big(flows.credit))
    const rate = asFraction(solved.rate)
    const gap = absFraction(subtractFraction(presentValue(payments, rate), credit))
    expect(compareFraction(gap, ROUND_TRIP) <= 0, 'discounting returns the credit').toBe(true)
    if (rate.n > 0n) {
      // The present value falls as the rate rises, so the root lies between these two.
      expect(compareFraction(presentValue(payments, subtractFraction(rate, TOLERANCE)), credit)).toBe(1)
    }
    expect(compareFraction(presentValue(payments, frac(rate.n * TOLERANCE.d + rate.d, rate.d * TOLERANCE.d)), credit)).toBe(-1)
  })
})
