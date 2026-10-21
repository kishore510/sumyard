import { MONTHS_PER_YEAR } from '@/lib/periods'
import type { RateBasis } from '../types'

/*
 * An independent reference for the car finance engine (test-only). It shares
 * no code with calc.ts and works in exact rational arithmetic (BigInt
 * fractions), not fine fixed point.
 *
 *   monthly rate, basis 'monthly'   i = r / 12 (exact)
 *   monthly rate, basis 'annual'    i = (1 + r)^(1/12) − 1, a root found by
 *                                   bisection on a binary fraction with
 *                                   ROOT_BITS bits (the engine uses Newton)
 *   payment (closed form)           P = (A − B v^n) i / (1 − v^n), v = 1/(1+i);
 *                                   (A − B) / n when i = 0
 *   balance after k payments of P   A (1+i)^k − P ((1+i)^k − 1) / i
 *   the schedule (decision F7)      replayed month by month: interest is the
 *                                   opening balance times i, to the nearest
 *                                   penny; the last payment brings the
 *                                   balance to B
 *   present value                   Σ payment_t (1+i)^−t, exactly
 */

export interface Fraction {
  readonly n: bigint
  readonly d: bigint
}

const ROOT_BITS = 224n

export const frac = (n: bigint, d = 1n): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d })
const plus = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const minus = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d)
const times = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d)
const over = (a: Fraction, b: Fraction) => frac(a.n * b.d, a.d * b.n)
const ONE = frac(1n)
const ZERO = frac(0n)
const power = (a: Fraction, k: number) => frac(a.n ** BigInt(k), a.d ** BigInt(k))
const isZero = (a: Fraction) => a.n === 0n

/** The nearest whole number, halves away from zero. */
export function nearest(a: Fraction): bigint {
  const twice = 2n * (a.n < 0n ? -a.n : a.n)
  const rounded = (twice + a.d) / (2n * a.d)
  return a.n < 0n ? -rounded : rounded
}

/** How far a value is from the nearest half (a value exactly on a half is 0). */
export function distanceFromHalf(a: Fraction): Fraction {
  const shifted = minus(a, frac(1n, 2n))
  const floor = shifted.n >= 0n ? shifted.n / shifted.d : -((-shifted.n + shifted.d - 1n) / shifted.d)
  const above = minus(shifted, frac(floor))
  const below = minus(frac(floor + 1n), shifted)
  return above.n * below.d < below.n * above.d ? above : below
}

/** The 12th root of a positive fraction as X / 2^ROOT_BITS, X found by bisection (the floor). */
function twelfthRoot(a: Fraction): Fraction {
  const K = BigInt(MONTHS_PER_YEAR)
  const scale = 1n << ROOT_BITS
  const target = a.n * scale ** K
  const fits = (x: bigint) => x ** K * a.d <= target
  let low = 0n
  let high = scale
  while (fits(high)) high *= 2n
  while (high - low > 1n) {
    const mid = (low + high) / 2n
    if (fits(mid)) low = mid
    else high = mid
  }
  return frac(low, scale)
}

export function monthlyRate(rate: { numerator: number; denominator: number }, basis: RateBasis): Fraction {
  const r = frac(BigInt(rate.numerator), BigInt(rate.denominator))
  if (basis === 'monthly') return over(r, frac(BigInt(MONTHS_PER_YEAR)))
  return minus(twelfthRoot(plus(ONE, r)), ONE)
}

/** The exact payment: (A − B v^n) i / (1 − v^n), or (A − B) / n with no interest. */
export function payment(balance: bigint, i: Fraction, term: number, final: bigint): Fraction {
  if (isZero(i)) return frac(balance - final, BigInt(term))
  const v = over(ONE, plus(ONE, i))
  const vn = power(v, term)
  return over(times(minus(frac(balance), times(frac(final), vn)), i), minus(ONE, vn))
}

/** The exact balance after k payments of p (no rounding anywhere). */
export function closedFormBalance(balance: bigint, i: Fraction, k: number, p: bigint): Fraction {
  if (isZero(i)) return frac(balance - BigInt(k) * p)
  const g = power(plus(ONE, i), k)
  return minus(times(frac(balance), g), over(times(frac(p), minus(g, ONE)), i))
}

export interface Row {
  readonly opening: bigint
  readonly interest: bigint
  readonly payment: bigint
  readonly closing: bigint
}

/** F7 replayed in exact fractions: interest to the nearest penny on the opening balance; the last payment lands on the final payment. */
export function replay(balance: bigint, i: Fraction, term: number, p: bigint, final: bigint): Row[] {
  const rows: Row[] = []
  let opening = balance
  for (let month = 1; month <= term; month++) {
    const interest = nearest(times(frac(opening), i))
    const pay = month === term ? opening + interest - final : p
    const closing = opening + interest - pay
    rows.push({ opening, interest, payment: pay, closing })
    opening = closing
  }
  return rows
}

/** The interest amounts the replay rounded, exactly, to check none sits near a half penny. */
export function exactInterests(rows: readonly Row[], i: Fraction): Fraction[] {
  return rows.map((row) => times(frac(row.opening), i))
}

/** Σ payment_t (1 + i)^−t, t from one, exactly (Horner's rule from the last payment). */
export function presentValue(payments: readonly bigint[], i: Fraction): Fraction {
  const v = over(ONE, plus(ONE, i))
  let acc = ZERO
  for (let t = payments.length - 1; t >= 0; t--) acc = times(plus(frac(payments[t]!), acc), v)
  return acc
}

export const compareFraction = (a: Fraction, b: Fraction): -1 | 0 | 1 => {
  const left = a.n * b.d
  const right = b.n * a.d
  return left < right ? -1 : left > right ? 1 : 0
}

export const subtractFraction = minus
export const absFraction = (a: Fraction) => frac(a.n < 0n ? -a.n : a.n, a.d)
