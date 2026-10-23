import { describe, expect, it } from 'vitest'
import { fromPence, type Money, ratio, toPence } from '@/lib/money'
import { overpay } from './calc'
import { between, generator, inputs, randomDate, randomRate } from './fixtures/inputs'
import {
  absFraction,
  closedFormBalance,
  closedFormPayment,
  closedFormPayoff,
  compareFraction,
  distanceFromHalf,
  type Fraction,
  frac,
  minus,
  nearest,
  replayDaily,
  replayMonthly,
  roundingBound,
  times,
  twelfth,
} from './fixtures/reference'
import type { MortgageInputs, MortgageResult } from './types'

/*
 * The engine against the independent exact-fraction reference
 * (fixtures/reference.ts) on 300 seeded random mortgages at one rate:
 *
 * - the payment equals the closed form rounded to the nearest penny (except
 *   within NEAR_HALF of a half penny, where fine fixed point may round the
 *   other way: none of these seeds is that close);
 * - the monthly schedule equals the reference's month-by-month replay
 *   exactly, with lump sums too (reduce-term);
 * - every balance is within half a penny a month of interest rounding,
 *   compounded, of the closed-form balance, and the payoff month after a
 *   lump sum is the closed form's (one either side only where the balance is
 *   within that bound of nothing);
 * - the daily schedule equals a day-by-day replay with the reference's own
 *   day numbers, both day counts.
 */

const CASES = 300
const SEED = 20_261_024
const NEAR_HALF: Fraction = { n: 1n, d: 10n ** 12n }
const big = (amount: Money) => BigInt(toPence(amount))

/** A mortgage at one rate: the fixed rate to the end of the term. */
function oneRate(random: () => number): MortgageInputs {
  const rate = randomRate(random)
  return inputs({
    startDate: randomDate(random),
    balance: fromPence(between(random, 100_000, 100_000_000)),
    termMonths: between(random, 1, 480),
    fixedRate: rate,
    reversionRate: rate,
    policy: { interestMethod: 'monthly', dayCount: 'actual/365' },
  })
}

function result(i: MortgageInputs): MortgageResult {
  const outcome = overpay({ ...i, fixedEndMonth: i.termMonths })
  if (!outcome.ok) throw new Error(`refused ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

describe('engine against the closed-form reference (300 seeded cases)', () => {
  const random = generator(SEED)
  const cases = Array.from({ length: CASES }, () => oneRate(random))

  it('the payment is the closed form to the nearest penny', () => {
    for (const c of cases) {
      const i = twelfth(c.fixedRate.numerator, c.fixedRate.denominator)
      const n = BigInt(c.termMonths)
      const exact = i.n === 0n ? frac(big(c.balance), n) : null
      if (exact && compareFraction(distanceFromHalf(exact), NEAR_HALF) < 0) continue
      expect(big(result(c).baseline.paymentNow), JSON.stringify(c)).toBe(closedFormPayment(big(c.balance), i, c.termMonths))
    }
  })

  it('the monthly schedule is the reference replay, penny for penny', () => {
    for (const c of cases) {
      const r = result(c)
      const i = twelfth(c.fixedRate.numerator, c.fixedRate.denominator)
      const replay = replayMonthly(big(c.balance), i, big(r.baseline.paymentNow), c.termMonths)
      expect(
        r.baseline.rows.slice(0, replay.length).map((row) => [big(row.interest), big(row.payment), big(row.closing)]),
        JSON.stringify(c),
      ).toEqual(replay.map((row) => [row.interest, row.payment, row.closing]))
    }
  })

  it('every balance is within the rounding bound of the closed form', () => {
    for (const c of cases) {
      const r = result(c)
      const i = twelfth(c.fixedRate.numerator, c.fixedRate.denominator)
      const P = big(r.baseline.paymentNow)
      for (let k = 1; k < c.termMonths; k += Math.max(1, Math.floor(c.termMonths / 12))) {
        const gap = absFraction(minus(frac(big(r.baseline.rows[k - 1]!.closing)), closedFormBalance(big(c.balance), i, P, k)))
        expect(compareFraction(gap, roundingBound(i, k)), `${JSON.stringify(c)} month ${k}`).toBeLessThanOrEqual(0)
      }
    }
  })

  it('a lump sum with reduce-term: the replay, and the closed-form payoff month', () => {
    for (const c of cases) {
      if (c.termMonths < 3) continue
      const month = 1 + Math.floor(c.termMonths / 3)
      const amount = big(c.balance) / 5n
      const withLump = { ...c, lumpSums: [{ month, amount: fromPence(Number(amount)) }] }
      const r = result(withLump)
      const i = twelfth(c.fixedRate.numerator, c.fixedRate.denominator)
      const P = big(r.baseline.paymentNow)
      const replay = replayMonthly(big(c.balance), i, P, c.termMonths, new Map([[month, amount]]))
      expect(
        r.overpaying.rows
          .slice(0, replay.length)
          .map((row) => [big(row.interest), big(row.payment), big(row.overpayment), big(row.closing)]),
        JSON.stringify(withLump),
      ).toEqual(replay.map((row) => [row.interest, row.payment, row.overpayment, row.closing]))

      // From the balance after the lump sum, the closed form gives the months still to pay.
      const after = big(r.overpaying.rows[month - 1]!.closing)
      if (after === 0n) continue
      const left = closedFormPayoff(after, i, P, c.termMonths - month)
      const engine = r.overpaying.payoffMonth! - month
      if (left === null) {
        expect(engine).toBe(c.termMonths - month)
        continue
      }
      const bound = roundingBound(i, left)
      const near = (k: number) => compareFraction(absFraction(closedFormBalance(after, i, P, k)), bound) <= 0
      if (near(left) || near(left - 1)) expect(Math.abs(engine - left)).toBeLessThanOrEqual(1)
      else expect(engine, JSON.stringify(withLump)).toBe(left)
    }
  })
})

describe('daily interest against a day-by-day replay (100 seeded cases each day count)', () => {
  for (const dayCount of ['actual/365', 'actual/actual'] as const) {
    it(`${dayCount}: penny for penny`, () => {
      const random = generator(SEED + (dayCount === 'actual/365' ? 1 : 2))
      for (let n = 0; n < 100; n++) {
        const c = {
          ...oneRate(random),
          startDate: random() < 0.3 ? (`${between(random, 2027, 2031)}-01-${between(random, 29, 31)}` as const) : randomDate(random),
          termMonths: between(random, 1, 60),
          policy: { interestMethod: 'daily', dayCount },
        } satisfies MortgageInputs
        const r = result(c)
        const rate = frac(BigInt(c.fixedRate.numerator), BigInt(c.fixedRate.denominator))
        const replay = replayDaily(c.startDate, big(c.balance), rate, big(r.baseline.paymentNow), c.termMonths, dayCount)
        expect(
          r.baseline.rows.slice(0, replay.length).map((row) => [big(row.interest), big(row.payment), big(row.closing)]),
          JSON.stringify(c),
        ).toEqual(replay.map((row) => [row.interest, row.payment, row.closing]))
      }
    })
  }

  it('in a leap year, the two day counts differ by exactly the leap days’ share, before rounding', () => {
    // 1 February 2028 to 1 March 2028: 29 leap-year days. The unrounded difference is B r × 29 × (1/365 − 1/366).
    const c = inputs({
      startDate: '2028-02-01',
      balance: fromPence(123_456_789),
      fixedRate: ratio(537, 10_000),
      termMonths: 12,
      fixedEndMonth: 12,
    })
    const a = result({ ...c, policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    const b = result({ ...c, policy: { interestMethod: 'daily', dayCount: 'actual/actual' } })
    const Br = times(frac(123_456_789n), frac(537n, 10_000n))
    const exact365 = times(Br, frac(29n, 365n))
    const exact366 = times(Br, frac(29n, 366n))
    expect(minus(exact365, exact366)).toEqual(times(Br, minus(frac(29n, 365n), frac(29n, 366n))))
    expect(big(a.baseline.rows[0]!.interest)).toBe(nearest(exact365))
    expect(big(b.baseline.rows[0]!.interest)).toBe(nearest(exact366))
  })
})
