/*
 * An independent reference for the mortgage engine (test-only). It shares no
 * code with calc.ts, src/lib/amortising.ts or src/lib/calendar.ts: exact
 * rational arithmetic in BigInt fractions (no fine fixed point), and its own
 * day numbers from the civil-calendar formula (no Date).
 *
 *   payment (closed form)        P = A i / (1 − (1 + i)^−n), A / n when i = 0,
 *                                to the nearest penny
 *   balance after k payments     A (1 + i)^k − P ((1 + i)^k − 1) / i
 *   payoff month                 the first k where that reaches nothing
 *   monthly replay               interest = opening × r / 12 to the nearest
 *                                penny; payment, then lump sums up to what
 *                                is owed; the last month takes the remainder
 *   daily replay                 day by day: each day's interest is the
 *                                balance × r / (365 or the day's year length),
 *                                summed exactly and rounded once on the
 *                                payment date
 */

export interface Fraction {
  readonly n: bigint
  readonly d: bigint
}

const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b]
  while (y) [x, y] = [y, x % y]
  return x
}

/** A fraction, the denominator above nothing (not reduced: the closed forms grow too large for that to pay). */
export const frac = (n: bigint, d = 1n): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d })

/** A fraction in lowest terms, for sums whose denominators repeat (the daily replay). */
export function reduce(a: Fraction): Fraction {
  const divisor = gcd(a.n, a.d) || 1n
  return { n: a.n / divisor, d: a.d / divisor }
}

export const plus = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
export const minus = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d)
export const times = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d)
export const over = (a: Fraction, b: Fraction) => frac(a.n * b.d, a.d * b.n)
const ONE = frac(1n)
const power = (a: Fraction, k: number) => frac(a.n ** BigInt(k), a.d ** BigInt(k))
export const compareFraction = (a: Fraction, b: Fraction) => {
  const left = a.n * b.d
  const right = b.n * a.d
  return left < right ? -1 : left > right ? 1 : 0
}
export const absFraction = (a: Fraction) => (a.n < 0n ? frac(-a.n, a.d) : a)

/** The nearest whole number, halves away from nothing. */
export function nearest(a: Fraction): bigint {
  const twice = 2n * (a.n < 0n ? -a.n : a.n)
  const rounded = (twice + a.d) / (2n * a.d)
  return a.n < 0n ? -rounded : rounded
}

/** How far a value is from the nearest half (x + one half, x whole); on a half: nothing. */
export function distanceFromHalf(a: Fraction): Fraction {
  const shifted = minus(a, frac(1n, 2n))
  const floor = shifted.n >= 0n ? shifted.n / shifted.d : -((-shifted.n + shifted.d - 1n) / shifted.d)
  const above = minus(shifted, frac(floor))
  const below = minus(frac(floor + 1n), shifted)
  return compareFraction(above, below) < 0 ? above : below
}

/** The monthly rate of an annual rate given as numerator / denominator: a twelfth, exactly. */
export const twelfth = (numerator: number, denominator: number) => frac(BigInt(numerator), BigInt(denominator) * 12n)

/** The closed-form level payment in pence, to the nearest penny. */
export function closedFormPayment(balance: bigint, i: Fraction, n: number): bigint {
  if (i.n === 0n) return nearest(frac(balance, BigInt(n)))
  const growth = power(plus(ONE, i), n)
  // A i / (1 − (1 + i)^−n) = A i g / (g − 1)
  return nearest(over(times(times(frac(balance), i), growth), minus(growth, ONE)))
}

/** The closed-form balance after k level payments of P (no rounding of interest). */
export function closedFormBalance(balance: bigint, i: Fraction, payment: bigint, k: number): Fraction {
  if (i.n === 0n) return frac(balance - payment * BigInt(k))
  const growth = power(plus(ONE, i), k)
  return minus(times(frac(balance), growth), over(times(frac(payment), minus(growth, ONE)), i))
}

/** The first month whose closed-form balance is nothing or less; null if none up to the limit. */
export function closedFormPayoff(balance: bigint, i: Fraction, payment: bigint, limit: number): number | null {
  if (i.n === 0n) {
    const k = (balance + payment - 1n) / payment
    return k <= BigInt(limit) ? Number(k) : null
  }
  // A g − P (g − 1) / i ≤ 0, g = (1 + i)^k, is A g i ≤ P (g − 1); g is grown one month at a time.
  let growth = ONE
  const step = plus(ONE, i)
  for (let k = 1; k <= limit; k++) {
    growth = times(growth, step)
    if (compareFraction(times(times(frac(balance), growth), i), times(frac(payment), minus(growth, ONE))) <= 0) return k
  }
  return null
}

/** Half a penny of rounding a month, grown at the rate: ½ ((1 + i)^k − 1) / i (½ k with no interest), the most the replay can drift after k months. */
export function roundingBound(i: Fraction, k: number): Fraction {
  if (i.n === 0n) return frac(BigInt(k), 2n)
  return times(over(minus(power(plus(ONE, i), k), ONE), i), frac(1n, 2n))
}

export interface ReplayRow {
  readonly month: number
  readonly interest: bigint
  readonly payment: bigint
  readonly overpayment: bigint
  readonly closing: bigint
}

/**
 * Month by month at one rate with a twelfth a month: the level payment, then
 * lump sums (month → pence) up to what is still owed; the term's last month
 * takes the remainder. Stops at the payoff.
 */
export function replayMonthly(
  balance: bigint,
  i: Fraction,
  payment: bigint,
  term: number,
  lumps: ReadonlyMap<number, bigint> = new Map(),
): ReplayRow[] {
  const rows: ReplayRow[] = []
  let owed = balance
  for (let month = 1; month <= term && owed > 0n; month++) {
    const interest = nearest(times(frac(owed), i))
    const due = owed + interest
    const paid = month === term || due <= payment ? due : payment
    const extra = lumps.get(month) ?? 0n
    const used = extra < due - paid ? extra : due - paid
    owed = due - paid - used
    rows.push({ month, interest, payment: paid, overpayment: used, closing: owed })
  }
  return rows
}

/** Days since 1970-01-01 by the civil-calendar formula (proleptic Gregorian), no Date. */
export function civilDay(iso: string): number {
  const [y0, m, d] = iso.split('-').map(Number) as [number, number, number]
  const y = m <= 2 ? y0 - 1 : y0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

/** The civil date of a day number, the inverse of civilDay. */
export function civilDate(day: number): { year: number; month: number; day: number } {
  const z = day + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp + (mp < 10 ? 3 : -9)
  return { year: era * 400 + yoe + (m <= 2 ? 1 : 0), month: m, day: d }
}

const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
const monthLength = (year: number, month: number) => (month === 2 ? (leap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31)

/** The k-th payment date's day number: the start day each month, or the month's last day. */
export function paymentDay(start: string, k: number): number {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) + k
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const day = Math.min(d, monthLength(year, month))
  return civilDay(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

/**
 * Day by day at one rate: every day from the last payment date (counted) to
 * this one (not counted) accrues balance × r / basis, where basis is 365, or
 * with 'actual/actual' the length of that day's year; the month's sum is
 * rounded to the nearest penny on the payment date. Level payment; the
 * term's last month takes the remainder.
 */
export function replayDaily(
  start: string,
  balance: bigint,
  rate: Fraction,
  payment: bigint,
  term: number,
  dayCount: 'actual/365' | 'actual/actual',
): ReplayRow[] {
  const rows: ReplayRow[] = []
  let owed = balance
  let from = paymentDay(start, 0)
  for (let month = 1; month <= term && owed > 0n; month++) {
    const to = paymentDay(start, month)
    let accrued = frac(0n)
    for (let day = from; day < to; day++) {
      const basis = dayCount === 'actual/actual' && leap(civilDate(day).year) ? 366n : 365n
      accrued = reduce(plus(accrued, over(times(frac(owed), rate), frac(basis))))
    }
    const interest = nearest(accrued)
    const due = owed + interest
    const paid = month === term || due <= payment ? due : payment
    owed = due - paid
    rows.push({ month, interest, payment: paid, overpayment: 0n, closing: owed })
    from = to
  }
  return rows
}

export interface ReferenceCharge {
  /** A share of the excess, numerator over denominator. */
  readonly rate: Fraction
  readonly endMonth: number
  /** A share of the balance at each allowance year's start, rounded down; or an amount in pence. */
  readonly allowance: { readonly share: Fraction } | { readonly pence: bigint }
  /** Already overpaid in the allowance year running at the start. */
  readonly used: bigint
  /** Payments left in that year; nothing (or twelve with nothing used) is a fresh year from the first payment. */
  readonly toReset: number
}

/**
 * The early repayment charge month by month (MO7, MO16), from each month's
 * opening balance and the overpayment used. Allowance years are laid out by
 * listing their first months, not by the engine's arithmetic: the first
 * year runs to the reset, then one every twelve payments. Each year's
 * allowance is fixed at its first month; the charge is the rate × the
 * year's excess over it, newly reached this month, to the nearest penny.
 */
export function referenceCharges(
  rows: readonly { readonly opening: bigint; readonly overpayment: bigint }[],
  charge: ReferenceCharge,
): bigint[] {
  const firstMonths = new Set<number>([1])
  for (let start = (charge.toReset === 0 ? 12 : charge.toReset) + 1; start <= rows.length; start += 12) firstMonths.add(start)
  const out: bigint[] = []
  let allowance = 0n
  let overpaid = 0n
  rows.forEach((row, index) => {
    const month = index + 1
    if (firstMonths.has(month)) {
      allowance = 'pence' in charge.allowance ? charge.allowance.pence : (row.opening * charge.allowance.share.n) / charge.allowance.share.d
      overpaid = month === 1 && charge.toReset !== 0 ? charge.used : 0n
    }
    if (month > charge.endMonth || row.overpayment === 0n) {
      out.push(0n)
      return
    }
    const over = (amount: bigint) => (amount > allowance ? amount - allowance : 0n)
    const before = over(overpaid)
    overpaid += row.overpayment
    out.push(nearest(times(frac(over(overpaid) - before), charge.rate)))
  })
  return out
}
