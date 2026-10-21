import { describe, expect, it } from 'vitest'
import {
  compareFactor,
  compareFine,
  FACTOR_ONE,
  type Factor,
  FINE_DIGITS,
  FINE_ZERO,
  factor,
  factorAdd,
  factorDivide,
  factorMul,
  factorPow,
  factorRoot,
  factorSubtract,
  factorToRatio,
  fine,
  fineAdd,
  fineDivide,
  fineMul,
  fineSubtract,
  fromPence,
  MoneyError,
  RATE_RATIO_DIGITS,
  ratio,
  roundFine,
  toPence,
} from './money'

/*
 * Fine fixed point (decision C9). Every figure is made up to exercise the
 * arithmetic. A unit is 10^-FINE_DIGITS.
 */

const SCALE = 10n ** BigInt(FINE_DIGITS)
const unit = (n: bigint) => n as Factor
const abs = (n: bigint) => (n < 0n ? -n : n)

describe('fine pence', () => {
  it('holds Money exactly and rounds back once', () => {
    const f = fine(fromPence(12_345))
    expect(f).toBe(12_345n * SCALE)
    expect(toPence(roundFine(f, 'nearest'))).toBe(12_345)
    expect(FINE_ZERO).toBe(0n)
    expect(FACTOR_ONE).toBe(SCALE)
  })

  it('adds, subtracts and compares', () => {
    const a = fine(fromPence(300))
    const b = fine(fromPence(-120))
    expect(toPence(roundFine(fineAdd(a, b), 'nearest'))).toBe(180)
    expect(toPence(roundFine(fineSubtract(a, b), 'nearest'))).toBe(420)
    expect(compareFine(a, b)).toBe(1)
    expect(compareFine(b, a)).toBe(-1)
    expect(compareFine(a, a)).toBe(0)
  })

  it('multiplies and divides by a factor to the nearest unit', () => {
    const third = factor(ratio(1, 3))
    const a = fine(fromPence(100))
    // 100 / 3 pence: 33.333… rounds to 33p; the fine value keeps the fraction.
    expect(toPence(roundFine(fineMul(a, third), 'nearest'))).toBe(33)
    expect(toPence(roundFine(fineMul(fineMul(a, third), factor(ratio(3, 1))), 'nearest'))).toBe(100)
    expect(toPence(roundFine(fineDivide(a, factor(ratio(4, 1))), 'nearest'))).toBe(25)
    expect(() => fineDivide(a, factor(ratio(0, 1)))).toThrow(MoneyError)
  })

  it('rounds by mode, halves away from zero for nearest', () => {
    const half = fineMul(fine(fromPence(5)), factor(ratio(1, 2))) // 2.5p
    expect(toPence(roundFine(half, 'nearest'))).toBe(3)
    expect(toPence(roundFine(half, 'down'))).toBe(2)
    expect(toPence(roundFine(half, 'up'))).toBe(3)
    const minusHalf = fineSubtract(FINE_ZERO, half)
    expect(toPence(roundFine(minusHalf, 'nearest'))).toBe(-3)
    expect(toPence(roundFine(minusHalf, 'down'))).toBe(-3)
    expect(toPence(roundFine(minusHalf, 'up'))).toBe(-2)
  })

  it('refuses a result past the safe range', () => {
    const big = fine(fromPence(Number.MAX_SAFE_INTEGER))
    expect(() => roundFine(fineAdd(big, big), 'nearest')).toThrow(MoneyError)
  })
})

describe('factors', () => {
  it('makes a factor from a Ratio, to the nearest unit', () => {
    expect(factor(ratio(1, 2))).toBe(SCALE / 2n)
    expect(factor(ratio(-1, 4))).toBe(-SCALE / 4n)
    expect(abs(factor(ratio(2, 3)) - (2n * SCALE) / 3n)).toBeLessThanOrEqual(1n)
  })

  it('adds, subtracts, multiplies, divides and compares', () => {
    const a = factor(ratio(3, 2))
    const b = factor(ratio(1, 4))
    expect(factorAdd(a, b)).toBe(factor(ratio(7, 4)))
    expect(factorSubtract(a, b)).toBe(factor(ratio(5, 4)))
    expect(factorMul(a, b)).toBe(factor(ratio(3, 8)))
    expect(factorDivide(a, b)).toBe(factor(ratio(6, 1)))
    expect(compareFactor(a, b)).toBe(1)
    expect(() => factorDivide(a, factor(ratio(0, 1)))).toThrow(MoneyError)
  })

  it('raises to a whole power', () => {
    expect(factorPow(factor(ratio(3, 2)), 0)).toBe(FACTOR_ONE)
    expect(factorPow(factor(ratio(3, 2)), 1)).toBe(factor(ratio(3, 2)))
    expect(factorPow(factor(ratio(3, 2)), 5)).toBe(factor(ratio(243, 32)))
    expect(factorPow(factor(ratio(11, 10)), 3)).toBe(factor(ratio(1331, 1000)))
    expect(() => factorPow(FACTOR_ONE, -1)).toThrow(MoneyError)
    expect(() => factorPow(FACTOR_ONE, 1.5)).toThrow(MoneyError)
  })

  it('stays within a few units over many squarings', () => {
    // (1 + 1/1000)^365 against the exact rational value, computed in BigInt.
    const n = 365
    const exactN = 1001n ** BigInt(n)
    const exactD = 1000n ** BigInt(n)
    const want = (exactN * SCALE) / exactD
    expect(abs(factorPow(factor(ratio(1001, 1000)), n) - want)).toBeLessThanOrEqual(BigInt(n))
  })

  it('takes a root to the nearest unit', () => {
    expect(factorRoot(factor(ratio(9, 4)), 2)).toBe(factor(ratio(3, 2)))
    expect(factorRoot(factor(ratio(1331, 1000)), 3)).toBe(factor(ratio(11, 10)))
    expect(factorRoot(FACTOR_ONE, 52)).toBe(FACTOR_ONE)
    // The square root of two: the nearest unit, checked from both sides.
    const r = factorRoot(factor(ratio(2, 1)), 2)
    const two = 2n * SCALE * SCALE
    expect((2n * r - 1n) ** 2n <= 4n * two).toBe(true)
    expect((2n * r + 1n) ** 2n >= 4n * two).toBe(true)
    expect(() => factorRoot(FACTOR_ONE, 0)).toThrow(MoneyError)
    expect(() => factorRoot(factor(ratio(-1, 2)), 2)).toThrow(MoneyError)
  })

  it('a root then the same power returns within a few units', () => {
    const f = factor(ratio(1061677811864, 1000000000000))
    const back = factorPow(factorRoot(f, 52), 52)
    expect(abs(back - f)).toBeLessThanOrEqual(100n)
  })

  it('a factor below one keeps its root below one', () => {
    const f = factor(ratio(1, 2))
    const r = factorRoot(f, 12)
    expect(compareFactor(r, FACTOR_ONE)).toBe(-1)
    expect(abs(factorPow(r, 12) - f)).toBeLessThanOrEqual(100n)
  })

  it('shows a factor as a Ratio over the rate denominator', () => {
    const denominator = 10 ** RATE_RATIO_DIGITS
    expect(factorToRatio(factor(ratio(1, 4)))).toEqual({ numerator: denominator / 4, denominator })
    expect(factorToRatio(factor(ratio(-1, 4)))).toEqual({ numerator: -denominator / 4, denominator })
    const third = factorToRatio(factor(ratio(1, 3)))
    expect(third.denominator).toBe(denominator)
    expect(third.numerator).toBe(333_333_333_333_333)
    expect(() => factorToRatio(unit(100n * SCALE))).toThrow(MoneyError)
  })
})
