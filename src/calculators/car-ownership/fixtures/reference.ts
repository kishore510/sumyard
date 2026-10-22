import { MONTHS_PER_YEAR } from '@/lib/periods'
import { LITRES_PER_GALLON } from '@/lib/units'
import { outstandingBalance } from '../../car-finance/calc'
import type { FinanceResult } from '../../car-finance/types'
import type { CarOption, FuelCost, Shared, ValueCase } from '../types'

/*
 * An independent reference for the car ownership engine (test-only). It
 * shares no code with calc.ts. It takes the finance schedule from the 3a
 * engine (which has its own exact reference) and recomputes everything else:
 *
 *   running costs, fuel   exact fractions: annual × (1 + change)^year / 12,
 *                         rounded to the nearest penny each month
 *   value curve           q = (VH / V0)^(1/H) as a binary fraction of BITS
 *                         bits (bisection, the floor); V(m) = V0 q^m, each
 *                         power truncated to BITS bits
 *   opportunity cost      g = (1 + s)^(1/12) the same way; F(m) = F(m−1) g + c_m,
 *                         truncated to BITS bits; opportunity = F(m) − Σ c
 *
 * A figure rounded from an irrational value is compared only when it is more
 * than NEAR_HALF from a half penny (`Approx.nearHalf`).
 */

export interface Fraction {
  readonly n: bigint
  readonly d: bigint
}

const BITS = 256n
const SCALE = 1n << BITS
const NEAR_HALF: Fraction = { n: 1n, d: 10n ** 12n }

const frac = (n: bigint, d = 1n): Fraction => (d < 0n ? { n: -n, d: -d } : { n, d })
const plus = (a: Fraction, b: Fraction) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const minus = (a: Fraction, b: Fraction) => frac(a.n * b.d - b.n * a.d, a.d * b.d)
const times = (a: Fraction, b: Fraction) => frac(a.n * b.n, a.d * b.d)
const over = (a: Fraction, b: Fraction) => frac(a.n * b.d, a.d * b.n)
const fromRatio = (r: { numerator: number; denominator: number }) => frac(BigInt(r.numerator), BigInt(r.denominator))
const ONE = frac(1n)
const power = (a: Fraction, k: number) => frac(a.n ** BigInt(k), a.d ** BigInt(k))

/** The nearest whole number, halves away from zero. */
export function nearest(a: Fraction): bigint {
  const twice = 2n * (a.n < 0n ? -a.n : a.n)
  const rounded = (twice + a.d) / (2n * a.d)
  return a.n < 0n ? -rounded : rounded
}

/** Whether a value is within NEAR_HALF of a half (so its rounding is not compared). */
function nearHalf(a: Fraction): boolean {
  const fractional = minus(a, frac(a.n >= 0n ? a.n / a.d : -((-a.n + a.d - 1n) / a.d)))
  const distance = minus(fractional, frac(1n, 2n))
  const abs = frac(distance.n < 0n ? -distance.n : distance.n, distance.d)
  return abs.n * NEAR_HALF.d < NEAR_HALF.n * abs.d
}

/** A rounded value, or null when it sits too near a half to compare. */
export interface Approx {
  readonly pence: bigint
  readonly nearHalf: boolean
}
const approx = (a: Fraction): Approx => ({ pence: nearest(a), nearHalf: nearHalf(a) })

/** Truncate to BITS binary places (towards nothing for a value of nothing or more). */
const truncate = (a: Fraction): Fraction => frac((a.n * SCALE) / a.d, SCALE)

/** The k-th root of a fraction of nothing or more, as the floor on BITS binary places. */
function root(a: Fraction, k: number): Fraction {
  const K = BigInt(k)
  const target = a.n * SCALE ** K
  const fits = (x: bigint) => x ** K * a.d <= target
  let low = 0n
  let high = SCALE
  while (fits(high)) high *= 2n
  while (high - low > 1n) {
    const mid = (low + high) / 2n
    if (fits(mid)) low = mid
    else high = mid
  }
  return frac(low, SCALE)
}

export function costPerMile(fuel: FuelCost): Fraction {
  if (fuel.kind === 'per-mile') return fromRatio(fuel.pencePerMile)
  if (fuel.kind === 'fuel') return over(times(fromRatio(fuel.pencePerLitre), fromRatio(LITRES_PER_GALLON)), fromRatio(fuel.milesPerGallon))
  const home = fromRatio(fuel.homeShare)
  const blended = plus(times(home, fromRatio(fuel.homePencePerKwh)), times(minus(ONE, home), fromRatio(fuel.publicPencePerKwh)))
  return over(blended, fromRatio(fuel.milesPerKwh))
}

/** Each month's amount, months 1 to `months`: annual × (1 + change)^year / 12, to the nearest penny. */
function monthly(annual: Fraction, change: { numerator: number; denominator: number }, months: number): bigint[] {
  const out: bigint[] = [0n]
  for (let m = 1; m <= months; m++) {
    const year = Math.floor((m - 1) / MONTHS_PER_YEAR)
    out.push(nearest(over(times(annual, power(plus(ONE, fromRatio(change)), year)), frac(BigInt(MONTHS_PER_YEAR)))))
  }
  return out
}

export interface ReferenceCase {
  readonly values: readonly Approx[]
  readonly opportunity: readonly Approx[]
  readonly cashOut: readonly bigint[]
  /** Exact, given the values and opportunity costs from the engine where those are near a half. */
  readonly netCost: (values: readonly bigint[], opportunity: readonly bigint[]) => bigint[]
}

export interface Reference {
  readonly coverage: number
  readonly forgone: bigint
  readonly acquisition: readonly bigint[]
  readonly fuel: readonly bigint[]
  readonly insurance: readonly bigint[]
  readonly maintenance: readonly bigint[]
  readonly ved: readonly bigint[]
  readonly other: readonly bigint[]
  readonly balance: readonly bigint[]
  /** The balance the breakdown uses at the end (at hand-back, the final payment the car settles). */
  readonly endBalance: bigint
  readonly handBack: boolean
  readonly cases: Readonly<Record<ValueCase, ReferenceCase>>
}

/** The reference for one option, given 3a's result for its finance (null for keep and cash). */
export function reference(option: CarOption, shared: Shared, finance: FinanceResult | null): Reference {
  const { car, acquisition } = option
  const H = shared.horizonMonths
  const term = finance ? finance.schedule.rows.length : 0
  const handBack = acquisition.kind === 'pcp' && acquisition.end === 'hand-back' && term <= H
  const coverage = handBack ? term : H
  const v0 = BigInt(car.value)

  const acq: bigint[] = Array.from({ length: coverage + 1 }, () => 0n)
  if (acquisition.kind === 'cash') acq[0] = v0
  if (finance && acquisition.kind !== 'keep' && acquisition.kind !== 'cash') {
    const fee = acquisition.finance.arrangementFeeTiming === 'start' ? BigInt(acquisition.finance.arrangementFee) : 0n
    const down = acquisition.kind === 'loan' ? v0 - BigInt(acquisition.finance.amount) : BigInt(finance.deposit)
    acq[0] = down + fee
    for (let m = 1; m <= Math.min(term, coverage); m++) acq[m] = BigInt(finance.schedule.rows[m - 1]!.payment)
    if (term <= coverage) {
      if (handBack) acq[term]! += BigInt(finance.handBack!.excessMileageCharge)
      else acq[term]! += BigInt(finance.own.finalPayment) + BigInt(finance.own.purchaseFee)
    }
  }
  const forgone = acquisition.kind === 'keep' ? v0 : 0n

  const miles = frac(BigInt(car.annualMileage))
  const fuel = monthly(times(costPerMile(car.fuel), miles), car.fuelPriceChange, coverage)
  const run = (amount: number) => monthly(frac(BigInt(amount)), car.generalIncrease, coverage)
  const insurance = run(car.running.insurance)
  const maintenance = run(car.running.maintenance)
  const ved = run(car.running.ved)
  const other = run(car.running.other)

  const balance: bigint[] = []
  for (let m = 0; m <= coverage; m++) {
    const held = !(handBack && m >= term)
    balance.push(finance && held && m < term ? BigInt(outstandingBalance(finance, m)) : 0n)
  }
  const endBalance = handBack && finance ? BigInt(outstandingBalance(finance, term)) : balance[coverage]!

  const flows = acq.map((a, m) => a + fuel[m]! + insurance[m]! + maintenance[m]! + ved[m]! + other[m]! + (m === 0 ? forgone : 0n))
  const cashOut: bigint[] = []
  let running = 0n
  for (let m = 0; m <= coverage; m++) {
    running += flows[m]! - (m === 0 ? forgone : 0n)
    cashOut.push(running)
  }

  // Opportunity cost (F18).
  const g = root(plus(ONE, fromRatio(shared.savingsReturn)), MONTHS_PER_YEAR)
  const opportunity: Approx[] = []
  let fv = frac(0n)
  let paid = 0n
  for (let m = 0; m <= coverage; m++) {
    fv = m === 0 ? frac(flows[0]!) : plus(truncate(times(fv, g)), frac(flows[m]!))
    paid += flows[m]!
    opportunity.push(approx(minus(fv, frac(paid))))
  }

  const caseOf = (valueCase: ValueCase): ReferenceCase => {
    const vh = BigInt(car.horizonValue[valueCase])
    const values: Approx[] = []
    const q = v0 === 0n || vh === 0n ? frac(0n) : root(frac(vh, v0), H)
    let qm = ONE
    for (let m = 0; m <= coverage; m++) {
      if (m === 0) values.push({ pence: v0, nearHalf: false })
      else if (m === H) values.push({ pence: vh, nearHalf: false })
      else {
        qm = truncate(times(qm, q))
        values.push(approx(times(frac(v0), qm)))
      }
      if (m === 0) qm = ONE
    }
    const netCost = (vals: readonly bigint[], opp: readonly bigint[]) =>
      vals.map((value, m) => {
        const held = !(handBack && m >= term)
        const equity = held ? value - balance[m]! : 0n
        return cashOut[m]! + forgone - equity + opp[m]!
      })
    return { values, opportunity, cashOut, netCost }
  }

  return {
    coverage,
    forgone,
    acquisition: acq,
    fuel,
    insurance,
    maintenance,
    ved,
    other,
    balance,
    endBalance,
    handBack,
    cases: { low: caseOf('low'), expected: caseOf('expected'), high: caseOf('high') },
  }
}
