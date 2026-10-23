import { describe, expect, it } from 'vitest'
import * as carFinance from '@/calculators/car-finance/calc'
import { annualRate, EngineInputError, interestOn, monthlyFactor, monthlyRate, regularPayment } from './amortising'
import { MAX_FINANCE_RATE } from './inputLimits'
import { compareRatio, factor, factorToRatio, fromPence, ratio, toPence } from './money'

/*
 * The shared schedule helpers (MO15), moved out of car finance so the
 * mortgage engine can use them without importing another calculator. The
 * behaviour is car finance's own: its tests pass unchanged against these.
 */

const TWELVE_PERCENT = ratio(12, 100)

describe('shared schedule helpers', () => {
  it('car finance calls the shared helpers, not copies of them', () => {
    expect(carFinance.monthlyFactor).toBe(monthlyFactor)
    expect(carFinance.annualRate).toBe(annualRate)
    expect(carFinance.regularPayment).toBe(regularPayment)
    expect(carFinance.EngineInputError).toBe(EngineInputError)
  })

  it('a monthly rate on the monthly basis is an exact twelfth', () => {
    const rate = monthlyRate(TWELVE_PERCENT, 'monthly')
    expect(rate.exact).toEqual(ratio(12, 1200))
    expect(compareRatio(factorToRatio(rate.factor), ratio(1, 100))).toBe(0)
  })

  it('a monthly rate on the annual basis has no exact form', () => {
    expect(monthlyRate(TWELVE_PERCENT, 'annual').exact).toBeNull()
  })

  it('interest on a balance rounds to the nearest penny, halves away from nothing', () => {
    const rate = monthlyRate(TWELVE_PERCENT, 'monthly')
    expect(toPence(interestOn(fromPence(150), rate))).toBe(2)
    expect(toPence(interestOn(fromPence(149), rate))).toBe(1)
    expect(toPence(interestOn(fromPence(0), rate))).toBe(0)
  })

  it('interest on the annual basis goes through the factor', () => {
    const rate = monthlyRate(ratio(0, 1), 'annual')
    expect(toPence(interestOn(fromPence(1_000_000), rate))).toBe(0)
  })

  it('the payment with no interest is the balance over the months, to the nearest penny', () => {
    expect(toPence(regularPayment(fromPence(1_000), factor(ratio(0, 1)), 3, fromPence(0)))).toBe(333)
    expect(toPence(regularPayment(fromPence(1_000), factor(ratio(0, 1)), 1, fromPence(0)))).toBe(1_000)
  })

  it('the payment at one percent a month over one month is the balance plus a month of interest', () => {
    const monthly = monthlyFactor(TWELVE_PERCENT, 'monthly')
    expect(toPence(regularPayment(fromPence(100_000), monthly, 1, fromPence(0)))).toBe(101_000)
  })

  it('the payment takes no upper bound on the term', () => {
    const monthly = monthlyFactor(TWELVE_PERCENT, 'monthly')
    expect(() => regularPayment(fromPence(100_000), monthly, 480, fromPence(0))).not.toThrow()
  })

  it('annualRate of a twelfth compounds twelve months', () => {
    expect(compareRatio(annualRate(monthlyFactor(TWELVE_PERCENT, 'monthly')), TWELVE_PERCENT)).toBe(1)
  })

  it('refuses a rate outside the bounds and a term under a month', () => {
    expect(() => monthlyFactor(ratio(-1, 100), 'monthly')).toThrow(EngineInputError)
    expect(() => monthlyRate(ratio(MAX_FINANCE_RATE.numerator + 1, MAX_FINANCE_RATE.denominator), 'monthly')).toThrow(EngineInputError)
    expect(() => monthlyFactor(TWELVE_PERCENT, 'weekly' as never)).toThrow(EngineInputError)
    expect(() => regularPayment(fromPence(100), factor(ratio(0, 1)), 0, fromPence(0))).toThrow(EngineInputError)
    expect(() => regularPayment(fromPence(100), factor(ratio(0, 1)), 1.5, fromPence(0))).toThrow(EngineInputError)
  })
})
