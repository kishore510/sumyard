import { describe, expect, it } from 'vitest'
import {
  add,
  compare,
  compareExact,
  compareRatio,
  exact,
  exactAdd,
  exactMul,
  exactSubtract,
  fromPence,
  fromPounds,
  MoneyError,
  max,
  min,
  mulRound,
  percent,
  type RoundingMode,
  ratio,
  roundExact,
  roundToPounds,
  subtract,
  subtractRatio,
  toPence,
  ZERO,
} from './money'

/*
 * Money is integer pence. Every figure here is made up to exercise the
 * arithmetic; none is a tax rate, threshold or allowance.
 */

const p = fromPence
const MAX = Number.MAX_SAFE_INTEGER

describe('constructors', () => {
  it('fromPence takes a safe integer number of pence', () => {
    expect(toPence(p(0))).toBe(0)
    expect(toPence(p(12_345))).toBe(12_345)
    expect(toPence(p(-7))).toBe(-7)
    expect(toPence(p(MAX))).toBe(MAX)
    expect(toPence(p(-MAX))).toBe(-MAX)
  })

  it('fromPence normalises -0 to 0', () => {
    expect(Object.is(toPence(p(-0)), 0)).toBe(true)
  })

  it.each([0.5, -1.25, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, MAX + 1, -(MAX + 1), 2 ** 60])(
    'fromPence rejects %s',
    (value) => {
      expect(() => p(value)).toThrow(MoneyError)
    },
  )

  it('fromPence rejects values that are not numbers (untrusted input)', () => {
    expect(() => p('12' as unknown as number)).toThrow(MoneyError)
    expect(() => p(null as unknown as number)).toThrow(MoneyError)
  })

  it.each<[string | number, number]>([
    [0, 0],
    [12, 1200],
    [-3, -300],
    ['0', 0],
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['0.05', 5],
    ['-0.05', -5],
    ['-12.34', -1234],
    ['007.10', 710],
    ['-0', 0],
    ['90071992547409.91', MAX],
  ])('fromPounds(%j) is %d pence', (input, pence) => {
    expect(toPence(fromPounds(input))).toBe(pence)
  })

  it.each(['', ' ', '12.345', '1,234', '£12', '12.', '.5', '+12', '1e3', '12 ', 'abc', '--1', '90071992547409.92', '100000000000000'])(
    'fromPounds rejects the string %j (no silent rounding or parsing)',
    (input) => {
      expect(() => fromPounds(input)).toThrow(MoneyError)
    },
  )

  it.each([12.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, 90_071_992_547_410])('fromPounds rejects the number %s', (input) => {
    expect(() => fromPounds(input)).toThrow(MoneyError)
  })

  it('ZERO is zero pence', () => {
    expect(toPence(ZERO)).toBe(0)
  })
})

describe('add and subtract', () => {
  it('add and subtract in pence', () => {
    expect(toPence(add(p(150), p(275)))).toBe(425)
    expect(toPence(add(p(150), p(-275)))).toBe(-125)
    expect(toPence(subtract(p(150), p(275)))).toBe(-125)
    expect(toPence(subtract(p(-150), p(-150)))).toBe(0)
  })

  it('never produces a float error (the 0.1 + 0.2 case)', () => {
    expect(toPence(add(fromPounds('0.1'), fromPounds('0.2')))).toBe(30)
  })

  it('reaches the safe-integer edges exactly', () => {
    expect(toPence(add(p(MAX - 1), p(1)))).toBe(MAX)
    expect(toPence(subtract(p(-MAX + 1), p(1)))).toBe(-MAX)
  })

  it('throws rather than lose precision past them', () => {
    expect(() => add(p(MAX), p(1))).toThrow(MoneyError)
    expect(() => subtract(p(-MAX), p(1))).toThrow(MoneyError)
    expect(() => add(p(MAX), p(MAX))).toThrow(MoneyError)
  })

  it('checks inputs that were forged with a cast', () => {
    expect(() => add(0.5 as unknown as ReturnType<typeof p>, p(1))).toThrow(MoneyError)
    expect(() => subtract(p(1), Number.NaN as unknown as ReturnType<typeof p>)).toThrow(MoneyError)
  })
})

describe('compare, min and max', () => {
  it('compare returns -1, 0 or 1', () => {
    expect(compare(p(1), p(2))).toBe(-1)
    expect(compare(p(2), p(2))).toBe(0)
    expect(compare(p(3), p(2))).toBe(1)
    expect(compare(p(-3), p(2))).toBe(-1)
    expect(compare(p(-MAX), p(MAX))).toBe(-1)
  })

  it('min and max take one or more amounts', () => {
    expect(toPence(min(p(5)))).toBe(5)
    expect(toPence(min(p(5), p(-2), p(9)))).toBe(-2)
    expect(toPence(max(p(5), p(-2), p(9)))).toBe(9)
    expect(toPence(max(p(-5), p(-2)))).toBe(-2)
  })

  it('compare, min and max check their inputs', () => {
    expect(() => compare(p(1), 1.5 as unknown as ReturnType<typeof p>)).toThrow(MoneyError)
    expect(() => min(p(1), Number.NaN as unknown as ReturnType<typeof p>)).toThrow(MoneyError)
    expect(() => max(Number.POSITIVE_INFINITY as unknown as ReturnType<typeof p>)).toThrow(MoneyError)
  })
})

describe('ratio and percent', () => {
  it('ratio takes safe integers with a positive denominator', () => {
    expect(ratio(1, 3)).toEqual({ numerator: 1, denominator: 3 })
    expect(ratio(0, 7)).toEqual({ numerator: 0, denominator: 7 })
    expect(ratio(-1, 4)).toEqual({ numerator: -1, denominator: 4 })
  })

  it.each<[number, number]>([
    [1, 0],
    [1, -2],
    [0.5, 2],
    [1, 2.5],
    [Number.NaN, 1],
    [1, Number.POSITIVE_INFINITY],
    [MAX + 1, 1],
  ])('ratio(%s, %s) is rejected', (n, d) => {
    expect(() => ratio(n, d)).toThrow(MoneyError)
  })

  it.each<[string, number, number]>([
    ['0', 0, 100],
    ['7', 7, 100],
    ['7.5', 75, 1000],
    ['12.25', 1225, 10000],
    ['100', 100, 100],
    ['0.001', 1, 100000],
  ])('percent(%j) is %d / %d, read without floats', (text, numerator, denominator) => {
    expect(percent(text)).toEqual({ numerator, denominator })
  })

  it.each(['', '7%', '-7', '1e2', '.5', '7.', ' 7', '0.0000000000000000001'])('percent rejects %j', (text) => {
    expect(() => percent(text)).toThrow(MoneyError)
  })
})

describe('mulRound', () => {
  const MODES: RoundingMode[] = ['nearest', 'down', 'up']
  const cases: [pence: number, factor: [number, number], nearest: number, down: number, up: number][] = [
    // exact results need no rounding in any mode
    [1000, [7, 100], 70, 70, 70],
    [0, [7, 100], 0, 0, 0],
    [1000, [0, 1], 0, 0, 0],
    // below, at and above the half
    [10, [1, 3], 3, 3, 4],
    [20, [1, 3], 7, 6, 7],
    [25, [1, 10], 3, 2, 3],
    [15, [1, 2], 8, 7, 8],
    [14, [1, 4], 4, 3, 4],
    // negatives: down is towards minus infinity, up towards plus infinity, nearest halves away from zero
    [-10, [1, 3], -3, -4, -3],
    [-20, [1, 3], -7, -7, -6],
    [-25, [1, 10], -3, -3, -2],
    [-15, [1, 2], -8, -8, -7],
    [10, [-1, 3], -3, -4, -3],
    // factors above one
    [333, [3, 2], 500, 499, 500],
  ]

  it.each(cases)('%d pence × %j: nearest %d, down %d, up %d', (pence, [n, d], nearest, down, up) => {
    const factor = ratio(n, d)
    expect(toPence(mulRound(p(pence), factor, 'nearest'))).toBe(nearest)
    expect(toPence(mulRound(p(pence), factor, 'down'))).toBe(down)
    expect(toPence(mulRound(p(pence), factor, 'up'))).toBe(up)
  })

  it('nearest is symmetric: nearest(-x) = -nearest(x)', () => {
    for (let pence = -200; pence <= 200; pence++) {
      for (const [n, d] of [
        [1, 3],
        [1, 2],
        [7, 100],
        [2, 7],
      ] as const) {
        const a = toPence(mulRound(p(pence), ratio(n, d), 'nearest'))
        const b = toPence(mulRound(p(-pence), ratio(n, d), 'nearest'))
        expect(a + b, `${pence} × ${n}/${d}`).toBe(0)
      }
    }
  })

  it('down never exceeds and up never falls short of the exact product', () => {
    for (let pence = -150; pence <= 150; pence += 7) {
      const exact = (pence * 2) / 7
      expect(toPence(mulRound(p(pence), ratio(2, 7), 'down'))).toBeLessThanOrEqual(exact)
      expect(toPence(mulRound(p(pence), ratio(2, 7), 'up'))).toBeGreaterThanOrEqual(exact)
    }
  })

  it('is exact for large amounts, where floats would not be', () => {
    // MAX × 1/3 overflows nothing and rounds in integer arithmetic.
    expect(toPence(mulRound(p(MAX), ratio(1, 3), 'down'))).toBe(3_002_399_751_580_330)
    expect(toPence(mulRound(p(MAX), ratio(1, 3), 'up'))).toBe(3_002_399_751_580_331)
    expect(toPence(mulRound(p(MAX), ratio(1, 1), 'nearest'))).toBe(MAX)
    expect(toPence(mulRound(p(MAX - 1), ratio(MAX, MAX), 'nearest'))).toBe(MAX - 1)
  })

  it('throws when the result is not a safe integer', () => {
    for (const mode of MODES) expect(() => mulRound(p(MAX), ratio(2, 1), mode)).toThrow(MoneyError)
  })

  it('throws on an unknown mode or a forged factor', () => {
    expect(() => mulRound(p(10), ratio(1, 3), 'bankers' as RoundingMode)).toThrow(MoneyError)
    expect(() => mulRound(p(10), { numerator: 0.2, denominator: 1 }, 'nearest')).toThrow(MoneyError)
    expect(() => mulRound(p(10), { numerator: 1, denominator: 0 }, 'nearest')).toThrow(MoneyError)
  })
})

describe('roundToPounds', () => {
  it.each<[number, number, number, number]>([
    [0, 0, 0, 0],
    [1200, 1200, 1200, 1200],
    [1249, 1200, 1200, 1300],
    [1250, 1300, 1200, 1300],
    [1299, 1300, 1200, 1300],
    [-1249, -1200, -1300, -1200],
    [-1250, -1300, -1300, -1200],
    [-1, 0, -100, 0],
  ])('%d pence: nearest %d, down %d, up %d', (pence, nearest, down, up) => {
    expect(toPence(roundToPounds(p(pence), 'nearest'))).toBe(nearest)
    expect(toPence(roundToPounds(p(pence), 'down'))).toBe(down)
    expect(toPence(roundToPounds(p(pence), 'up'))).toBe(up)
  })

  it('does not return -0', () => {
    expect(Object.is(toPence(roundToPounds(p(-1), 'up')), 0)).toBe(true)
    expect(Object.is(toPence(roundToPounds(p(-49), 'nearest')), 0)).toBe(true)
  })

  it('throws when rounding up would pass the safe-integer edge', () => {
    expect(() => roundToPounds(p(MAX), 'up')).toThrow(MoneyError)
  })
})

describe('ratio comparison and difference (added in session D for inputs and compare deltas)', () => {
  it('compareRatio is exact', () => {
    expect(compareRatio(ratio(1, 3), ratio(333, 1000))).toBe(1)
    expect(compareRatio(ratio(-1, 2), ratio(1, 2))).toBe(-1)
    expect(compareRatio(ratio(2, 4), ratio(1, 2))).toBe(0)
  })

  it('subtractRatio is exact and reduced', () => {
    expect(subtractRatio(ratio(75, 1000), ratio(5, 100))).toEqual(ratio(1, 40))
    expect(subtractRatio(ratio(1, 2), ratio(1, 2))).toEqual(ratio(0, 1))
    expect(subtractRatio(ratio(1, 3), ratio(1, 2))).toEqual(ratio(-1, 6))
  })

  it('subtractRatio throws past the safe range', () => {
    expect(() => subtractRatio(ratio(1, 9_007_199_254_740_881), ratio(1, 9_007_199_254_740_847))).toThrow(MoneyError)
  })
})

describe('exact pence (added in slice 1a session F for rules that leave part of a penny before output)', () => {
  const half = ratio(1, 2)
  const third = ratio(1, 3)

  it('exact keeps whole pence, in lowest terms', () => {
    expect(exact(p(7))).toEqual({ numerator: 7n, denominator: 1n })
    expect(exact(p(-3))).toEqual({ numerator: -3n, denominator: 1n })
    expect(() => exact(1.5 as never)).toThrow(MoneyError)
  })

  it('multiplies by a Ratio exactly and reduces', () => {
    expect(exactMul(exact(p(3)), half)).toEqual({ numerator: 3n, denominator: 2n })
    expect(exactMul(exact(p(4)), half)).toEqual({ numerator: 2n, denominator: 1n })
    expect(exactMul(exactMul(exact(p(1)), third), ratio(3, 1))).toEqual({ numerator: 1n, denominator: 1n })
    expect(() => exactMul(exact(p(1)), { numerator: 1, denominator: 0 })).toThrow(MoneyError)
  })

  it('adds, subtracts and compares fractions exactly', () => {
    const a = exactMul(exact(p(1)), half)
    const b = exactMul(exact(p(1)), third)
    expect(exactAdd(a, b)).toEqual({ numerator: 5n, denominator: 6n })
    expect(exactSubtract(a, b)).toEqual({ numerator: 1n, denominator: 6n })
    expect(exactSubtract(b, a)).toEqual({ numerator: -1n, denominator: 6n })
    expect(exactSubtract(a, a)).toEqual({ numerator: 0n, denominator: 1n })
    expect(compareExact(a, b)).toBe(1)
    expect(compareExact(b, a)).toBe(-1)
    expect(compareExact(a, exactMul(exact(p(2)), ratio(1, 4)))).toBe(0)
  })

  it('rounds once, by mode, like mulRound', () => {
    const cases: [number, number, RoundingMode, number][] = [
      [3, 2, 'nearest', 2],
      [3, 2, 'down', 1],
      [3, 2, 'up', 2],
      [-3, 2, 'nearest', -2],
      [-3, 2, 'down', -2],
      [-3, 2, 'up', -1],
      [4, 3, 'nearest', 1],
      [5, 3, 'nearest', 2],
    ]
    for (const [n, d, mode, expected] of cases) expect(roundExact(exactMul(exact(p(n)), ratio(1, d)), mode)).toBe(expected)
    for (const [amount, factor, mode] of [
      [p(12_345), ratio(7, 9), 'nearest'],
      [p(-12_345), ratio(7, 9), 'down'],
      [p(999), ratio(1, 3), 'up'],
    ] as const)
      expect(roundExact(exactMul(exact(amount), factor), mode)).toBe(mulRound(amount, factor, mode))
  })

  it('refuses a result past the safe range', () => {
    expect(() => roundExact(exactMul(exact(p(MAX)), ratio(2, 1)), 'nearest')).toThrow(MoneyError)
    expect(roundExact(exact(p(MAX)), 'nearest')).toBe(MAX)
  })
})
