import { describe, expect, it } from 'vitest'
import { APR_DISPLAY_DIGITS, MoneyError, RATE_RATIO_DIGITS, ratio, roundRatio } from './money'

/*
 * Rounding a Ratio to a number of decimal places (slice 3a.1, decision F15 in
 * docs/modelling-decisions-car.md). Every figure is made up to exercise the
 * arithmetic.
 */

describe('roundRatio', () => {
  it('rounds to the nearest, halves away from zero', () => {
    expect(roundRatio(ratio(1_235, 10_000), 3, 'nearest')).toEqual({ numerator: 124, denominator: 1_000 })
    expect(roundRatio(ratio(12_349_999, 100_000_000), 3, 'nearest')).toEqual({ numerator: 123, denominator: 1_000 })
    expect(roundRatio(ratio(-1_235, 10_000), 3, 'nearest')).toEqual({ numerator: -124, denominator: 1_000 })
    expect(roundRatio(ratio(1, 3), 2, 'nearest')).toEqual({ numerator: 33, denominator: 100 })
    expect(roundRatio(ratio(2, 3), 2, 'nearest')).toEqual({ numerator: 67, denominator: 100 })
  })

  it('rounds down and up by mode', () => {
    expect(roundRatio(ratio(1_239, 10_000), 3, 'down')).toEqual({ numerator: 123, denominator: 1_000 })
    expect(roundRatio(ratio(1_231, 10_000), 3, 'up')).toEqual({ numerator: 124, denominator: 1_000 })
  })

  it('leaves an exact value as it is', () => {
    expect(roundRatio(ratio(1, 10), 3, 'nearest')).toEqual({ numerator: 100, denominator: 1_000 })
    expect(roundRatio(ratio(0, 1), 3, 'nearest')).toEqual({ numerator: 0, denominator: 1_000 })
    expect(roundRatio(ratio(7, 4), 0, 'nearest')).toEqual({ numerator: 2, denominator: 1 })
  })

  it('refuses a malformed ratio or digit count', () => {
    expect(() => roundRatio({ numerator: 1.5, denominator: 2 }, 3, 'nearest')).toThrow(MoneyError)
    expect(() => roundRatio(ratio(1, 3), -1, 'nearest')).toThrow(MoneyError)
    expect(() => roundRatio(ratio(1, 3), 1.5, 'nearest')).toThrow(MoneyError)
    expect(() => roundRatio(ratio(1, 3), RATE_RATIO_DIGITS + 1, 'nearest')).toThrow(MoneyError)
  })

  it('shows an APR to one decimal place of a percentage', () => {
    expect(APR_DISPLAY_DIGITS).toBe(3)
  })
})
