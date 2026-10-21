import type { Ratio } from '@/lib/money'
import { PERIODS_PER_YEAR } from '@/lib/periods'
import type { CompoundInputs } from '../types'

/*
 * An independent reference for the compound interest engine (test-only). It
 * shares no code with calc.ts and does not step period by period: it uses the
 * closed forms, in exact rational arithmetic (BigInt fractions).
 *
 *   per-compounding factor  a = (1 + r/m)(1 − f/m)
 *   per-contribution factor v = a^(m/p)              (C2, C4)
 *   per-year factor         V = v^p = a^m
 *   lump sum                L × V^n
 *   year k's contributions  c × h^(k−1), h = 1 + increase
 *   one year's annuity      s = (V − 1)/(v − 1) (immediate, end of period),
 *                           s × v (due, start of period); p when v = 1
 *   all contributions       c × s × Σ h^(k−1) V^(n−k)
 *                           = c × s × (V^n − h^n)/(V − h), or n V^(n−1) when V = h
 *   real                    nominal / (1 + π)^n      (C5)
 *
 * v is rational when m is a whole multiple of p. Otherwise it is a p-th root
 * (of a^m), found here by bisection on a binary fraction with ROOT_BITS bits,
 * a different method from the engine's Newton iteration; its error, about
 * 2^-ROOT_BITS relative, is far below anything that can move a penny.
 */

export interface Fraction {
  readonly n: bigint
  readonly d: bigint
}

const ROOT_BITS = 224n

const frac = (n: bigint, d = 1n): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d })
const fromRatio = (r: Ratio) => frac(BigInt(r.numerator), BigInt(r.denominator))
const plus = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const minus = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d)
const times = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d)
const over = (a: Fraction, b: Fraction) => frac(a.n * b.d, a.d * b.n)
const same = (a: Fraction, b: Fraction) => a.n * b.d === b.n * a.d
const ONE = frac(1n)

function power(a: Fraction, k: number): Fraction {
  return frac(a.n ** BigInt(k), a.d ** BigInt(k))
}

/** The k-th root of a positive fraction as X / 2^ROOT_BITS, X found by bisection (the floor). */
function root(a: Fraction, k: number): Fraction {
  const K = BigInt(k)
  const scale = 1n << ROOT_BITS
  // X^k / scale^k <= a.n / a.d  ⇔  X^k × a.d <= a.n × scale^k
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

/** The per-contribution-period factor (1 + r/m)^(m/p) × (1 − f/m)^(m/p), exact where rational. */
function perPeriod(inputs: CompoundInputs, withFee: boolean): Fraction {
  const m = PERIODS_PER_YEAR[inputs.compounding]
  const p = PERIODS_PER_YEAR[inputs.contributionFrequency]
  const r = fromRatio(inputs.growthRate)
  const f = withFee ? fromRatio(inputs.feeRate) : frac(0n)
  const M = frac(BigInt(m))
  const a = times(plus(ONE, over(r, M)), minus(ONE, over(f, M)))
  if (m % p === 0) return power(a, m / p)
  return root(power(a, m), p)
}

export interface Reference {
  /** Exact closing balance in pence, nominal. */
  readonly closing: Fraction
  /** Exact closing balance in today's pence. */
  readonly realClosing: Fraction
  /** Exact total contributions in pence. */
  readonly contributions: Fraction
}

export function reference(inputs: CompoundInputs, withFee: boolean): Reference {
  const p = PERIODS_PER_YEAR[inputs.contributionFrequency]
  const n = inputs.years
  const v = perPeriod(inputs, withFee)
  const V = power(v, p)
  const h = plus(ONE, fromRatio(inputs.contributionIncrease))
  const L = frac(BigInt(inputs.lumpSum))
  const c = frac(BigInt(inputs.contribution))

  const immediate = same(v, ONE) ? frac(BigInt(p)) : over(minus(V, ONE), minus(v, ONE))
  const s = inputs.timing === 'start' ? times(immediate, v) : immediate
  const Vn = power(V, n)
  const hn = power(h, n)
  const yearsSum = same(V, h) ? times(frac(BigInt(n)), power(V, n - 1)) : over(minus(Vn, hn), minus(V, h))
  const closing = plus(times(L, Vn), times(times(c, s), yearsSum))

  const deflator = power(plus(ONE, fromRatio(inputs.inflationRate)), n)
  const realClosing = over(closing, deflator)

  const increaseSum = same(h, ONE) ? frac(BigInt(n)) : over(minus(hn, ONE), minus(h, ONE))
  const contributions = times(times(c, frac(BigInt(p))), increaseSum)
  return { closing, realClosing, contributions }
}

/** The fraction rounded to the nearest whole penny, halves away from zero. */
export function nearest(a: Fraction): bigint {
  const q = a.n / a.d
  const r = a.n % a.d
  const twice = 2n * (r < 0n ? -r : r)
  if (twice < a.d) return q
  return a.n < 0n ? q - 1n : q + 1n
}

/** How far the fraction is from the nearest half penny, as a fraction of a penny (for the tolerance near a tie). */
export function distanceFromHalf(a: Fraction): Fraction {
  const twice = frac(2n * a.n, a.d)
  const floor = twice.n >= 0n ? twice.n / twice.d : -((-twice.n + twice.d - 1n) / twice.d)
  // Half pennies sit at odd multiples of one half: the nearest odd number to 2a.
  const odd = floor % 2n === 0n ? [floor - 1n, floor + 1n] : [floor, floor + 2n]
  const distances = odd.map((o) => {
    const diff = minus(twice, frac(o))
    return frac(diff.n < 0n ? -diff.n : diff.n, 2n * diff.d)
  })
  const [x, y] = distances as [Fraction, Fraction]
  return x.n * y.d <= y.n * x.d ? x : y
}
