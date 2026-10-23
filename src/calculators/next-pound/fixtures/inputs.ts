import type { IsoDate } from '@/lib/isoDate'
import { fromPence, fromPounds, percent, type Ratio, ratio, toPence, ZERO } from '@/lib/money'
import { PENSION_METHODS, REGIONS, STUDENT_LOAN_PLANS } from '../../optimiser/types'
import type { MortgageLegInputs, NextPoundInputs, PensionLegInputs } from '../types'

/*
 * Test inputs for the next pound composer (test-only). Pay, balances and
 * rates here are made up for tests: they are not tax figures, market rates
 * or anyone's finances. Tax figures always come from the config.
 */

export function pensionInputs(overrides: Partial<PensionLegInputs> = {}): PensionLegInputs {
  return {
    optimiser: {
      grossPay: fromPounds(60_000),
      region: 'rUK',
      studentLoans: [],
      pension: { method: 'netPay', contribution: fromPounds(3_000) },
      savings: { employerContribution: fromPounds(3_000), carryForward: [], moneyPurchaseAnnualAllowance: false },
      checkChildcare: false,
    },
    employerMatch: ZERO,
    ageNow: 40,
    schemeAccessAge: null,
    retirementTaxRate: null,
    otherPensionsUseAllowance: false,
    ...overrides,
  }
}

export function mortgageInputs(overrides: Partial<MortgageLegInputs> = {}): MortgageLegInputs {
  return {
    startDate: '2026-11-01',
    balance: fromPounds(200_000),
    termMonths: 300,
    repaymentType: 'repayment',
    fixedRate: percent('4.5'),
    fixedEndMonth: 24,
    reversionRate: percent('7'),
    erc: null,
    policy: { interestMethod: 'monthly', dayCount: 'actual/365' },
    ...overrides,
  }
}

export function inputs(overrides: Partial<NextPoundInputs> = {}): NextPoundInputs {
  return {
    lumpSum: fromPounds(10_000),
    horizonYears: 20,
    asOf: '2026-10-23',
    inflationRate: percent('2'),
    growth: { low: percent('2'), mid: percent('5'), high: percent('8') },
    feeRate: percent('0.5'),
    pension: pensionInputs(),
    mortgage: mortgageInputs(),
    isa: { paidThisYear: ZERO },
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

export const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))
const pick = <T>(random: () => number, list: readonly T[]): T => list[between(random, 0, list.length - 1)]!
/** A rate in hundredths of a percent, from `low` to `high` hundredths. */
export const basisPoints = (random: () => number, low: number, high: number): Ratio => ratio(between(random, low, high), 10_000)

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A mortgage the reference can replay: repayment, one rate for the whole
 * term (the fixed period runs to the end), monthly interest, and an
 * optional charge on the first year's overpayment above an amount allowance.
 */
export function simpleMortgage(random: () => number): MortgageLegInputs {
  const termMonths = between(random, 1, 360)
  const rate = basisPoints(random, 0, 1_200)
  return mortgageInputs({
    startDate: `${between(random, 2026, 2030)}-${pad(between(random, 1, 12))}-${pad(between(random, 1, 28))}` as IsoDate,
    balance: fromPence(between(random, 100_000, 60_000_000)),
    termMonths,
    fixedRate: rate,
    fixedEndMonth: termMonths,
    reversionRate: rate,
    erc:
      random() < 0.5
        ? {
            rate: basisPoints(random, 0, 500),
            endMonth: between(random, 1, termMonths),
            allowance: { kind: 'amount', amount: fromPence(between(random, 0, 2_000_000)) },
          }
        : null,
  })
}

/** A random case across pay, methods, Child Benefit, the annual allowance, ages, rates, mortgages and X. */
export function randomInputs(random: () => number): NextPoundInputs {
  const grossPay = fromPence(between(random, 0, 25_000_000))
  const children = random() < 0.3 ? between(random, 1, 3) : 0
  const low = between(random, -1_000, 800)
  const mid = between(random, low, 1_200)
  const high = between(random, mid, 1_500)
  return inputs({
    lumpSum: fromPence(random() < 0.05 ? 0 : between(random, 1, 5_000_000)),
    horizonYears: between(random, 1, 40),
    asOf: `${between(random, 2026, 2030)}-${pad(between(random, 1, 12))}-${pad(between(random, 1, 28))}` as IsoDate,
    inflationRate: basisPoints(random, -200, 800),
    growth: { low: ratio(low, 10_000), mid: ratio(mid, 10_000), high: ratio(high, 10_000) },
    feeRate: basisPoints(random, 0, 200),
    pension: pensionInputs({
      optimiser: {
        grossPay,
        region: pick(random, REGIONS),
        studentLoans: random() < 0.3 ? [pick(random, STUDENT_LOAN_PLANS)] : [],
        pension: { method: pick(random, PENSION_METHODS), contribution: fromPence(between(random, 0, Math.floor(toPence(grossPay) / 5))) },
        ...(children > 0 ? { childBenefit: { children, payments: 'claimed' as const } } : {}),
        savings: {
          employerContribution: random() < 0.5 ? fromPence(between(random, 0, 3_000_000)) : ZERO,
          carryForward: random() < 0.2 ? [{ yearsAgo: between(random, 1, 3), amount: fromPence(between(random, 0, 3_000_000)) }] : [],
          moneyPurchaseAnnualAllowance: random() < 0.1,
        },
        checkChildcare: random() < 0.2,
      },
      employerMatch: random() < 0.3 ? fromPence(between(random, 0, 1_000_000)) : ZERO,
      ageNow: between(random, 18, 75),
      schemeAccessAge: random() < 0.2 ? between(random, 50, 65) : null,
      retirementTaxRate: random() < 0.5 ? null : basisPoints(random, 0, 5_000),
      otherPensionsUseAllowance: random() < 0.2,
    }),
    mortgage: random() < 0.15 ? null : simpleMortgage(random),
    isa: { paidThisYear: fromPence(between(random, 0, 2_500_000)) },
  })
}
