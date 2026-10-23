import { MAX_FINANCE_RATE } from './inputLimits'
import {
  compareFactor,
  compareRatio,
  FACTOR_ONE,
  type Factor,
  factor,
  factorAdd,
  factorDivide,
  factorPow,
  factorRoot,
  factorSubtract,
  factorToRatio,
  fine,
  fineDivide,
  fineMul,
  fineSubtract,
  type Money,
  mulRound,
  type Ratio,
  ratio,
  roundFine,
} from './money'
import { MONTHS_PER_YEAR } from './periods'

/*
 * Shared schedule helpers for a loan repaid monthly in arrears: the monthly
 * rate, a month's interest, the amortising payment and the annual rate of a
 * monthly one. Moved from car finance (decision MO15 in
 * docs/modelling-decisions.md) so the mortgage engine never imports another
 * calculator; the behaviour is car finance's F6 and F7
 * (docs/modelling-decisions-car.md), and docs/money.md lists the rounding.
 */

/** A pure helper was given inputs outside what the engine models. */
export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

/** How an annual rate becomes a monthly rate (F6): a twelfth, or the twelfth root. */
export type RateBasis = 'monthly' | 'annual'

const NOTHING = ratio(0, 1)
const FACTOR_ZERO = factor(NOTHING)
const BASES: readonly RateBasis[] = ['monthly', 'annual']

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

/** A Ratio from nothing to MAX_FINANCE_RATE. */
export function isRateInBounds(value: unknown): value is Ratio {
  if (typeof value !== 'object' || value === null) return false
  const { numerator, denominator } = value as Ratio
  if (!isWhole(numerator) || !isWhole(denominator) || denominator <= 0) return false
  return compareRatio(value as Ratio, NOTHING) >= 0 && compareRatio(value as Ratio, MAX_FINANCE_RATE) <= 0
}

function refuseUnless(ok: boolean, what: string): void {
  if (!ok) throw new EngineInputError(what)
}

/** A monthly rate: always as a Factor; also as an exact Ratio when it is rational (the 'monthly' basis), so interest rounds exactly. */
export interface MonthlyRate {
  readonly factor: Factor
  readonly exact: Ratio | null
}

/** The monthly rate an annual rate gives on its basis (F6), as a Factor. */
export function monthlyFactor(rate: Ratio, basis: RateBasis): Factor {
  refuseUnless(isRateInBounds(rate), 'rate out of bounds')
  refuseUnless(BASES.includes(basis), 'unknown rate basis')
  if (basis === 'monthly') return factorDivide(factor(rate), factor(ratio(MONTHS_PER_YEAR, 1)))
  return factorSubtract(factorRoot(factorAdd(FACTOR_ONE, factor(rate)), MONTHS_PER_YEAR), FACTOR_ONE)
}

/** The monthly rate of an annual one on its basis: the Factor, and the exact twelfth on the 'monthly' basis. */
export function monthlyRate(rate: Ratio, basis: RateBasis): MonthlyRate {
  const denominator = rate.denominator * MONTHS_PER_YEAR
  const exact = basis === 'monthly' && Number.isSafeInteger(denominator) ? ratio(rate.numerator, denominator) : null
  return { factor: monthlyFactor(rate, basis), exact }
}

/** The annual effective rate of a monthly one: twelve months compounded (F8), to fifteen decimal places. */
export function annualRate(monthly: Factor): Ratio {
  return factorToRatio(factorSubtract(factorPow(factorAdd(FACTOR_ONE, monthly), MONTHS_PER_YEAR), FACTOR_ONE))
}

/**
 * The amortising payment (F7): (A − B v^n) i / (1 − v^n), v = 1 / (1 + i), or
 * (A − B) / n with no interest; worked in fine fixed point and rounded once
 * to the nearest penny.
 */
export function regularPayment(balance: Money, monthly: Factor, term: number, finalPayment: Money): Money {
  refuseUnless(isWhole(term) && term >= 1, 'the term must be a whole number of months from one')
  const owed = fine(balance)
  if (compareFactor(monthly, FACTOR_ZERO) === 0) {
    return roundFine(fineDivide(fineSubtract(owed, fine(finalPayment)), factor(ratio(term, 1))), 'nearest')
  }
  const discount = factorDivide(FACTOR_ONE, factorPow(factorAdd(FACTOR_ONE, monthly), term))
  const numerator = fineMul(fineSubtract(owed, fineMul(fine(finalPayment), discount)), monthly)
  return roundFine(fineDivide(numerator, factorSubtract(FACTOR_ONE, discount)), 'nearest')
}

/** A month's interest on its opening balance (F7), to the nearest penny: exact on the 'monthly' basis, through the Factor otherwise. */
export const interestOn = (opening: Money, rate: MonthlyRate): Money =>
  rate.exact ? mulRound(opening, rate.exact, 'nearest') : roundFine(fineMul(fine(opening), rate.factor), 'nearest')
