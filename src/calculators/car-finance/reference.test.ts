import { describe, expect, it } from 'vitest'
import { type Money, toPence } from '@/lib/money'
import { hirePurchase, loan, pcp } from './calc'
import { generator, type RandomAgreement, randomAgreement } from './fixtures/inputs'
import {
  absFraction,
  closedFormBalance,
  compareFraction,
  distanceFromHalf,
  exactInterests,
  type Fraction,
  frac,
  monthlyRate,
  nearest,
  payment,
  replay,
  subtractFraction,
} from './fixtures/reference'
import type { FinanceOutcome, FinanceResult, Pricing } from './types'

/*
 * The engine against the independent exact-fraction reference
 * (fixtures/reference.ts) on 300 seeded random agreements priced by their
 * rate: loans, HP and PCP, either rate basis, fees at the start or added.
 *
 * Tolerance (docs/money.md, "Car finance (slice 3a)"): the engine's payment
 * is within about 10^-30 of a penny of the exact closed form, so its one
 * rounding must equal the exact payment rounded to the nearest penny, except
 * within NEAR_HALF of a half penny (none of these seeds is that close). The
 * schedule must equal the reference's month-by-month replay of decision F7
 * exactly, and stay within half a penny per month of interest rounding,
 * compounded, of the unrounded closed-form balance.
 */

const CASES = 300
const SEED = 20_261_021
const NEAR_HALF: Fraction = { n: 1n, d: 10n ** 12n }
const nearHalf = (a: Fraction) => compareFraction(distanceFromHalf(a), NEAR_HALF) < 0
const big = (amount: Money) => BigInt(toPence(amount))

function run(agreement: RandomAgreement): FinanceOutcome {
  if (agreement.product === 'loan') return loan(agreement.inputs)
  if (agreement.product === 'hire-purchase') return hirePurchase(agreement.inputs)
  return pcp(agreement.inputs)
}

function sample() {
  const random = generator(SEED)
  const cases: { agreement: RandomAgreement; result: FinanceResult }[] = []
  let refused = 0
  while (cases.length < CASES) {
    const agreement = randomAgreement(random)
    const outcome = run(agreement)
    if (outcome.ok) cases.push({ agreement, result: outcome.result })
    else refused++
  }
  return { cases, refused }
}

function balanceOf(agreement: RandomAgreement): bigint {
  const { inputs } = agreement
  const fee = inputs.arrangementFeeTiming === 'added' ? big(inputs.arrangementFee) : 0n
  if (agreement.product === 'loan') return big(agreement.inputs.amount) + fee
  return big(agreement.inputs.cashPrice) - big(agreement.inputs.deposit) + fee
}

function finalOf(agreement: RandomAgreement): bigint {
  if (agreement.product === 'loan') return 0n
  if (agreement.product === 'hire-purchase') return big(agreement.inputs.balloon)
  return big(agreement.inputs.finalPayment)
}

function rateOf(pricing: Pricing): Fraction {
  if (pricing.kind !== 'rate') throw new Error('the sample is priced by rate')
  return monthlyRate(pricing.rate, pricing.basis)
}

describe('engine against the exact-fraction reference (300 seeded agreements)', () => {
  const { cases, refused } = sample()

  it('covers every product, both bases, both fee timings, a rate of nothing and balloons', () => {
    expect(new Set(cases.map((c) => c.agreement.product)).size).toBe(3)
    expect(new Set(cases.map((c) => (c.agreement.inputs.pricing.kind === 'rate' ? c.agreement.inputs.pricing.basis : '')))).toEqual(
      new Set(['monthly', 'annual']),
    )
    expect(new Set(cases.map((c) => c.agreement.inputs.arrangementFeeTiming)).size).toBe(2)
    expect(cases.filter((c) => rateOf(c.agreement.inputs.pricing).n === 0n).length).toBeGreaterThan(5)
    expect(cases.filter((c) => finalOf(c.agreement) > 0n).length).toBeGreaterThan(50)
    expect(refused).toBeLessThan(CASES / 10)
  })

  it.each(cases.map((c, index) => [index, c] as const))('case %i', (_index, { agreement, result }) => {
    const A = balanceOf(agreement)
    const B = finalOf(agreement)
    const i = rateOf(agreement.inputs.pricing)
    const n = agreement.inputs.term
    expect(big(result.balanceFinanced)).toBe(A)

    const exactPayment = payment(A, i, n, B)
    expect(nearHalf(exactPayment), 'the exact payment sits near a half penny').toBe(false)
    const P = big(result.schedule.regularPayment)
    expect(P).toBe(nearest(exactPayment))

    const rows = replay(A, i, n, P, B)
    expect(exactInterests(rows, i).some(nearHalf), 'an exact interest sits near a half penny').toBe(false)
    expect(result.schedule.rows.map((row) => [big(row.opening), big(row.interest), big(row.payment), big(row.closing)])).toEqual(
      rows.map((row) => [row.opening, row.interest, row.payment, row.closing]),
    )

    // Each month's interest is rounded by at most half a penny, which then compounds.
    for (const k of [Math.floor(n / 2), n - 1].filter((k) => k >= 1)) {
      // Σ (1 + i)^j for j below k: the unrounded balance after k payments of minus one penny from nothing
      const growth = closedFormBalance(0n, i, k, -1n)
      const bound = { n: growth.n, d: 2n * growth.d }
      const gap = absFraction(subtractFraction(frac(rows[k - 1]!.closing), closedFormBalance(A, i, k, P)))
      expect(compareFraction(gap, bound) <= 0, `month ${k} within the rounding bound`).toBe(true)
    }
  })
})
