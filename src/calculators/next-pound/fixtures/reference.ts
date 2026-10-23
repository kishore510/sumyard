import type { TaxYearConfig } from '@/config/tax/schema'
import type { Money, Ratio } from '@/lib/money'
import { closedFormBalance, closedFormPayment, type ReplayRow, replayMonthly, twelfth } from '../../mortgage/fixtures/reference'
import { referenceAllowanceCharge, referenceAnnualAllowance, referenceTakeHome, referenceTaxable } from '../../optimiser/fixtures/reference'
import type { ModellingPolicy, OptimiserInputs } from '../../optimiser/types'

/*
 * An independent reference for the next pound composer (C1, test-only). It
 * shares no code with next-pound/calc.ts, compound-interest/calc.ts or
 * src/lib/money.ts: exact rational arithmetic in BigInt fractions, rounded
 * once where docs/money.md rounds.
 *
 *   growth           X ((1 + r)(1 − f))^N, compounded once a year, the fee
 *                    after each year's growth; to the nearest penny
 *   today's money    amount / (1 + i)^N, to the nearest penny
 *   tax split        tax-free = min(⌊pot × share⌋, allowance available);
 *                    tax = (pot − tax-free) × rate to the nearest penny
 *   break-even       its own bisection on rates k / D over the growth above
 *   access age       the horizon date by its own calendar sum, the age now
 *                    plus the years against the age on that date
 *   pension cost     spendable income from the optimiser's own reference
 *                    (take-home, Child Benefit, the annual allowance charge)
 *                    at two contributions
 *   mortgage leg     a single-rate, monthly-interest repayment mortgage
 *                    replayed month by month by the mortgage reference, and
 *                    its balance against the mortgage reference's closed form
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

const make = (n: bigint, d = 1n): Fraction => {
  const sign = d < 0n ? -1n : 1n
  const g = gcd(n, d) || 1n
  return { n: (sign * n) / g, d: (sign * d) / g }
}

const of = (r: Ratio): Fraction => make(BigInt(r.numerator), BigInt(r.denominator))
const plus = (a: Fraction, b: Fraction) => make(a.n * b.d + b.n * a.d, a.d * b.d)
const minus = (a: Fraction, b: Fraction) => make(a.n * b.d - b.n * a.d, a.d * b.d)
const times = (a: Fraction, b: Fraction) => make(a.n * b.n, a.d * b.d)
const over = (a: Fraction, b: Fraction) => make(a.n * b.d, a.d * b.n)
const ONE = make(1n)

function power(a: Fraction, n: number): Fraction {
  let result = ONE
  for (let k = 0; k < n; k++) result = times(result, a)
  return result
}

/** To the nearest whole penny, a half away from zero. */
export function nearest(a: Fraction): number {
  const sign = a.n < 0n ? -1n : 1n
  const n = sign * a.n
  const q = n / a.d
  const twice = 2n * (n % a.d)
  return Number(sign * (twice >= a.d ? q + 1n : q))
}

/** Down to the whole penny (the fraction is never below nothing here). */
const floor = (a: Fraction): number => Number(a.n / a.d)

/** The exact pot after N years: X ((1 + r)(1 − f))^N. */
export function exactGrowth(lumpSum: number, rate: Ratio, fee: Ratio, years: number): Fraction {
  const year = times(plus(ONE, of(rate)), minus(ONE, of(fee)))
  return times(make(BigInt(lumpSum)), power(year, years))
}

export const referenceGrowth = (lumpSum: number, rate: Ratio, fee: Ratio, years: number): number =>
  nearest(exactGrowth(lumpSum, rate, fee, years))

/** Today's money of an exact amount: divided by (1 + i)^N, to the nearest penny. */
export const referenceDeflate = (amount: number | Fraction, inflation: Ratio, years: number): number =>
  nearest(over(typeof amount === 'number' ? make(BigInt(amount)) : amount, power(plus(ONE, of(inflation)), years)))

export interface ReferenceSplit {
  readonly taxFree: number
  readonly tax: number
  readonly afterTax: number
}

/** The pot split into its tax-free part, capped at the allowance available, and the tax on the rest at one rate. */
export function referenceSplit(pot: number, share: Ratio, allowanceAvailable: number, rate: Ratio): ReferenceSplit {
  const taxFree = Math.min(floor(times(make(BigInt(pot)), of(share))), allowanceAvailable)
  const tax = nearest(times(make(BigInt(pot - taxFree)), of(rate)))
  return { taxFree, tax, afterTax: pot - tax }
}

export type ReferenceBreakEven = { kind: 'rate'; k: number } | { kind: 'above-highest' } | { kind: 'below-lowest' }

/** The largest k in [−bound, bound] with the ISA at k / D at most the target, by its own bisection. */
export function referenceBreakEven(lumpSum: number, fee: Ratio, years: number, target: number, bound: number, D: number) {
  const isa = (k: number) => referenceGrowth(lumpSum, { numerator: k, denominator: D }, fee, years)
  if (isa(bound) < target) return { kind: 'above-highest' } as const
  if (isa(-bound) > target) return { kind: 'below-lowest' } as const
  if (isa(bound) <= target) return { kind: 'rate', k: bound } as const
  let lo = -bound
  let hi = bound
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (isa(mid) <= target) lo = mid
    else hi = mid
  }
  return { kind: 'rate', k: lo } as const
}

/** The date N years on, by its own calendar: the same day, or 28 February for 29 February in a common year. */
export function referenceYearsOn(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const year = y + years
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const day = m === 2 && d === 29 && !leap ? 28 : d
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export interface ReferenceAccess {
  readonly horizonDate: string
  readonly minimumAge: number
  readonly accessAge: number
  readonly accessible: boolean
}

/** CP4: the normal minimum pension age on the horizon date (the announced age on or after its date), the scheme's age if later. */
export function referenceAccess(
  asOf: string,
  years: number,
  ageNow: number,
  schemeAge: number | null,
  ages: { current: number; announced: number; announcedFrom: string },
): ReferenceAccess {
  const horizonDate = referenceYearsOn(asOf, years)
  // ISO dates of four-digit years sort as strings.
  const minimumAge = horizonDate >= ages.announcedFrom ? ages.announced : ages.current
  const accessAge = schemeAge !== null && schemeAge > minimumAge ? schemeAge : minimumAge
  return { horizonDate, minimumAge, accessAge, accessible: ageNow + years >= accessAge }
}

export interface ReferencePoint {
  readonly spendable: number
  readonly total: number
}

/** Spendable income and the pension total at one contribution, from the optimiser's own reference. */
export function referencePoint(
  inputs: OptimiserInputs,
  contribution: number,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): ReferencePoint {
  const at = { ...inputs, pension: { method: inputs.pension.method, contribution: contribution as Money } }
  const home = referenceTakeHome(at, config, policy)
  const allowance = referenceAnnualAllowance(at, inputs.savings, config)
  const { taxable, extension } = referenceTaxable(at, config, policy)
  const charge = referenceAllowanceCharge(allowance.excess, taxable, extension, inputs.region, config).total
  return { spendable: home.net + home.childBenefit - charge, total: allowance.counted }
}

/** The pension leg's cost and pension added for an extra contribution E (CP3), the match added to the employer's when E is above nothing. */
export function referencePensionCost(
  inputs: OptimiserInputs,
  extra: number,
  match: number,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): { cost: number; pensionAdded: number } {
  const current = inputs.pension.contribution as number
  const base = referencePoint(inputs, current, config, policy)
  const matched =
    extra > 0 && match > 0
      ? { ...inputs, savings: { ...inputs.savings, employerContribution: (inputs.savings.employerContribution + match) as Money } }
      : inputs
  const after = referencePoint(matched, current + extra, config, policy)
  return { cost: base.spendable - after.spendable, pensionAdded: after.total - base.total }
}

export interface ReferenceMortgage {
  readonly overpayment: number
  readonly used: number
  readonly unused: number
  readonly erc: number
  readonly leftoverCash: number
  readonly baselineBalance: number
  readonly overpayingBalance: number
  readonly paymentsFreed: number
  readonly nominal: number
  /** The baseline balance at the horizon by the closed form, before any rounding of interest. */
  readonly closedFormBaseline: Fraction
}

/** A charge on the part of a first-month overpayment above an amount allowance, to the nearest penny (MO7). */
export interface ReferenceCharge {
  readonly rate: Ratio
  readonly allowance: number
}

/**
 * The mortgage leg (CP5) for a repayment mortgage at one rate with monthly
 * interest: the most O with O plus its charge within X, the overpayment in
 * the first month up to what is owed, the balances and payments replayed by
 * the mortgage reference, read at month k.
 */
export function referenceMortgage(
  lumpSum: number,
  balance: number,
  rate: Ratio,
  term: number,
  k: number,
  charge: ReferenceCharge | null,
): ReferenceMortgage {
  const i = twelfth(rate.numerator, rate.denominator)
  const payment = closedFormPayment(BigInt(balance), i, term)
  const baseline = replayMonthly(BigInt(balance), i, payment, term)
  // What the first month's overpayment can use: the balance after its interest and payment, or in a
  // one-month term (the last month) everything owed, since there the overpayment goes first (MO8).
  const first = baseline[0]!
  const room = term === 1 ? Number(first.payment) : Number(first.closing)
  const ercOn = (o: number) => {
    if (charge === null) return 0
    const used = Math.min(o, room)
    return used > charge.allowance ? nearest(times(make(BigInt(used - charge.allowance)), of(charge.rate))) : 0
  }
  let overpayment = lumpSum
  if (lumpSum + ercOn(lumpSum) > lumpSum) {
    let lo = 0
    let hi = lumpSum
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2)
      if (mid + ercOn(mid) <= lumpSum) lo = mid
      else hi = mid
    }
    overpayment = lo
  }
  const overpaying =
    term === 1
      ? lastMonthFirst(first, BigInt(overpayment))
      : replayMonthly(BigInt(balance), i, payment, term, new Map([[1, BigInt(overpayment)]]))
  const used = Number(overpaying[0]!.overpayment)
  const erc = ercOn(overpayment)
  const closing = (rows: typeof baseline, month: number) => (month <= rows.length ? Number(rows[month - 1]!.closing) : 0)
  const paid = (rows: typeof baseline, month: number) => rows.slice(0, month).reduce((sum, row) => sum + Number(row.payment), 0)
  const leftoverCash = lumpSum - overpayment - erc + (overpayment - used)
  const baselineBalance = closing(baseline, k)
  const overpayingBalance = closing(overpaying, k)
  const paymentsFreed = paid(baseline, k) - paid(overpaying, k)
  return {
    overpayment,
    used,
    unused: overpayment - used,
    erc,
    leftoverCash,
    baselineBalance,
    overpayingBalance,
    paymentsFreed,
    nominal: baselineBalance - overpayingBalance + paymentsFreed + leftoverCash,
    closedFormBaseline: closedFormBalance(BigInt(balance), i, payment, k),
  }
}

/** A one-month term's only month with an overpayment: the overpayment first, up to what is owed, and the payment what remains (MO8). */
function lastMonthFirst(row: ReplayRow, overpayment: bigint): ReplayRow[] {
  const due = row.payment
  const used = overpayment < due ? overpayment : due
  return [{ ...row, payment: due - used, overpayment: used, closing: 0n }]
}

/** |a − b| for a fraction and whole pence. */
export const distance = (a: Fraction, pence: number): Fraction => {
  const d = minus(a, make(BigInt(pence)))
  return d.n < 0n ? make(-d.n, d.d) : d
}

export const lessOrEqual = (a: Fraction, b: Fraction) => a.n * b.d <= b.n * a.d
