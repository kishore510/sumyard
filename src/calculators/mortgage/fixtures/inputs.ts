import type { IsoDate } from '@/lib/isoDate'
import { fromPence, fromPounds, percent, type Ratio, ratio, toPence } from '@/lib/money'
import type { MortgageInputs } from '../types'

/*
 * Test inputs for the mortgage engine (test-only). Contract figures here are
 * made up for tests; they are not market rates or anyone's mortgage.
 */

export function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return {
    startDate: '2026-01-15',
    balance: fromPounds(200_000),
    termMonths: 300,
    repaymentType: 'repayment',
    fixedRate: percent('4.5'),
    fixedEndMonth: 24,
    reversionRate: percent('7'),
    effect: 'reduce-term',
    regular: null,
    lumpSums: [],
    erc: null,
    policy: { interestMethod: 'monthly', dayCount: 'actual/365' },
    ...overrides,
  }
}

/** Mulberry32: a small seeded generator for repeatable samples. */
export function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number from low to high inclusive. */
export const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

/** A rate in hundredths of a percent, up to `most` hundredths. */
export const randomRate = (random: () => number, most = 1_500): Ratio => ratio(between(random, 0, most), 10_000)

const pad = (n: number) => String(n).padStart(2, '0')

export const randomDate = (random: () => number): IsoDate =>
  `${between(random, 2024, 2040)}-${pad(between(random, 1, 12))}-${pad(between(random, 1, 28))}` as IsoDate

/** A random mortgage with overpayments of every kind; `withCharge` adds an early repayment charge. */
export function randomInputs(random: () => number, withCharge = random() < 0.5): MortgageInputs {
  const termMonths = between(random, 1, 480)
  const fixedEndMonth = random() < 0.2 ? 0 : between(random, 0, termMonths)
  const balance = fromPence(between(random, 100_000, 100_000_000))
  const regularOn = random() < 0.6
  const from = between(random, 1, termMonths)
  const lumps = between(random, 0, 3)
  return inputs({
    startDate: random() < 0.15 ? (`2027-01-${between(random, 29, 31)}` as IsoDate) : randomDate(random),
    balance,
    termMonths,
    repaymentType: random() < 0.2 ? 'interest-only' : 'repayment',
    fixedRate: randomRate(random),
    fixedEndMonth,
    reversionRate: randomRate(random),
    effect: random() < 0.5 ? 'reduce-term' : 'reduce-payment',
    regular: regularOn
      ? { amount: fromPence(between(random, 0, 200_000)), fromMonth: from, toMonth: between(random, from, termMonths) }
      : null,
    lumpSums: Array.from({ length: lumps }, () => ({
      month: between(random, 1, termMonths),
      amount: fromPence(between(random, 0, toPence(balance))),
    })),
    erc: withCharge
      ? {
          rate: ratio(between(random, 0, 500), 10_000),
          endMonth: between(random, 0, termMonths),
          allowance:
            random() < 0.5
              ? { kind: 'rate', rate: ratio(between(random, 0, 2_000), 10_000) }
              : { kind: 'amount', amount: fromPence(between(random, 0, 5_000_000)) },
        }
      : null,
    policy: {
      interestMethod: random() < 0.5 ? 'daily' : 'monthly',
      dayCount: random() < 0.5 ? 'actual/365' : 'actual/actual',
    },
  })
}
