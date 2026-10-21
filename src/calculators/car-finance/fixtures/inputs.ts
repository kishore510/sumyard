import { fromPence, fromPounds, type Money, type Ratio, ratio } from '@/lib/money'
import type { HirePurchaseInputs, LoanInputs, PcpInputs, Pricing, RateBasis } from '../types'

/*
 * Inputs for the car finance tests (test-only). Every figure is made up to
 * exercise the engine; none is a market rate or a tax figure.
 */

export const atRate = (rate: Ratio, basis: RateBasis = 'monthly'): Pricing => ({ kind: 'rate', rate, basis })
export const byPayment = (payment: Money): Pricing => ({ kind: 'payment', payment })
export const ZERO_RATE = atRate(ratio(0, 1))

/** A loan with no fee and no interest: tests override what they need. */
export function loanInputs(overrides: Partial<LoanInputs> = {}): LoanInputs {
  return {
    amount: fromPounds(1_200),
    term: 12,
    pricing: ZERO_RATE,
    arrangementFee: fromPence(0),
    arrangementFeeTiming: 'start',
    ...overrides,
  }
}

export function hpInputs(overrides: Partial<HirePurchaseInputs> = {}): HirePurchaseInputs {
  return {
    cashPrice: fromPounds(10_000),
    deposit: fromPounds(1_000),
    term: 12,
    pricing: ZERO_RATE,
    arrangementFee: fromPence(0),
    arrangementFeeTiming: 'start',
    balloon: fromPence(0),
    optionFee: fromPence(0),
    ...overrides,
  }
}

export function pcpInputs(overrides: Partial<PcpInputs> = {}): PcpInputs {
  return {
    cashPrice: fromPounds(20_000),
    deposit: fromPounds(2_000),
    term: 36,
    pricing: ZERO_RATE,
    arrangementFee: fromPence(0),
    arrangementFeeTiming: 'start',
    finalPayment: fromPounds(9_000),
    purchaseFee: fromPence(0),
    mileageAllowance: 30_000,
    expectedMileage: 30_000,
    excessPerMile: fromPence(0),
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

const whole = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

/** An annual rate from nothing to forty per cent, in hundredths of a per cent (and sometimes exactly nothing). */
export function randomRate(random: () => number): Ratio {
  return random() < 0.08 ? ratio(0, 1) : ratio(whole(random, 1, 4_000), 10_000)
}

export type RandomAgreement =
  | { readonly product: 'loan'; readonly inputs: LoanInputs }
  | { readonly product: 'hire-purchase'; readonly inputs: HirePurchaseInputs }
  | { readonly product: 'pcp'; readonly inputs: PcpInputs }

/**
 * A random agreement priced by its rate: a loan, HP (sometimes with a balloon
 * and an option fee) or PCP, amounts from a hundred pounds to a hundred
 * thousand, terms from one month to `maxTerm`, either rate basis, a fee
 * sometimes, at the start or added.
 */
export function randomAgreement(random: () => number, maxTerm = 120): RandomAgreement {
  const term = whole(random, 1, maxTerm)
  const basis: RateBasis = random() < 0.5 ? 'monthly' : 'annual'
  const pricing = atRate(randomRate(random), basis)
  const arrangementFee = fromPence(random() < 0.5 ? 0 : whole(random, 1, 50_000))
  const arrangementFeeTiming = random() < 0.5 ? 'start' : 'added'
  const cashPrice = fromPence(whole(random, 10_000, 10_000_000))
  const deposit = fromPence(whole(random, 0, Math.floor(cashPrice / 2)))
  const financed = cashPrice - deposit
  const pick = random()
  if (pick < 1 / 3) return { product: 'loan', inputs: { amount: cashPrice, term, pricing, arrangementFee, arrangementFeeTiming } }
  if (pick < 2 / 3) {
    const balloon = fromPence(random() < 0.5 ? 0 : whole(random, 0, Math.floor((financed * 3) / 5)))
    return {
      product: 'hire-purchase',
      inputs: {
        cashPrice,
        deposit,
        term,
        pricing,
        arrangementFee,
        arrangementFeeTiming,
        balloon,
        optionFee: fromPence(whole(random, 0, 50_000)),
      },
    }
  }
  return {
    product: 'pcp',
    inputs: {
      cashPrice,
      deposit,
      term,
      pricing,
      arrangementFee,
      arrangementFeeTiming,
      finalPayment: fromPence(whole(random, 0, Math.floor((financed * 4) / 5))),
      purchaseFee: fromPence(whole(random, 0, 50_000)),
      mileageAllowance: whole(random, 0, 100_000),
      expectedMileage: whole(random, 0, 120_000),
      excessPerMile: fromPence(whole(random, 0, 50)),
    },
  }
}
