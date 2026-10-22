/*
 * Money as integer pence (decided in slice 0.5; see docs/money.md). A Money
 * is a JavaScript number that is always a safe integer, branded so a plain
 * number can't be passed where pence are meant. Every operation checks its
 * inputs and its result, and throws MoneyError rather than lose precision.
 *
 * Multiplying by a rate never uses a float: factors are Ratios of safe
 * integers, and mulRound works in BigInt with an explicit rounding mode.
 * No other file does arithmetic on amounts.
 */

declare const PENCE: unique symbol

/** A whole number of pence (a safe integer). Make one with fromPence or fromPounds. */
export type Money = number & { readonly [PENCE]: true }

/** An exact factor, numerator / denominator, both safe integers, denominator above zero. */
export interface Ratio {
  readonly numerator: number
  readonly denominator: number
}

/**
 * How a result between two pence is settled:
 * - `nearest`: the nearer penny; an exact half goes away from zero (so -x rounds to -(x rounded)).
 * - `down`: towards minus infinity (floor).
 * - `up`: towards plus infinity (ceiling).
 * Which mode each tax step needs is to be verified in slice 1a, not assumed.
 */
export type RoundingMode = 'nearest' | 'down' | 'up'

export class MoneyError extends RangeError {
  override name = 'MoneyError'
}

const isSafe = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

function checked(pence: unknown, what: string): Money {
  if (!isSafe(pence)) throw new MoneyError(`${what}: ${String(pence)} is not a safe whole number of pence`)
  return (pence === 0 ? 0 : pence) as Money
}

const assertMoney = (amount: Money, what: string) => checked(amount, what)

export function fromPence(pence: number): Money {
  return checked(pence, 'fromPence')
}

const POUNDS = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

/**
 * Pounds to pence, exactly. Takes a safe whole number of pounds, or a string
 * of digits with at most two decimal places ("12", "12.3", "-0.05"). Anything
 * else (grouping commas, a £ sign, more decimals) throws: parsing what a
 * person typed belongs to the input components, and nothing is rounded here.
 */
export function fromPounds(pounds: number | string): Money {
  if (typeof pounds === 'number') {
    if (!isSafe(pounds)) throw new MoneyError(`fromPounds: ${pounds} is not a safe whole number of pounds`)
    return checked(pounds * 100, 'fromPounds')
  }
  const match = typeof pounds === 'string' ? POUNDS.exec(pounds) : null
  if (!match) throw new MoneyError(`fromPounds: ${JSON.stringify(pounds)} is not an amount like "12" or "12.34"`)
  const [, sign, whole, fraction = ''] = match
  const pence = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))
  return fromBigInt(sign ? -pence : pence, 'fromPounds')
}

export const ZERO: Money = fromPence(0)

/** The integer number of pence, for storage or display code that needs the plain number. */
export function toPence(amount: Money): number {
  return assertMoney(amount, 'toPence')
}

function fromBigInt(pence: bigint, what: string): Money {
  if (pence > BigInt(Number.MAX_SAFE_INTEGER) || pence < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyError(`${what}: the result (${pence} pence) is past the safe-integer range`)
  }
  return checked(Number(pence), what)
}

export function add(a: Money, b: Money): Money {
  return checked(assertMoney(a, 'add') + assertMoney(b, 'add'), 'add')
}

export function subtract(a: Money, b: Money): Money {
  return checked(assertMoney(a, 'subtract') - assertMoney(b, 'subtract'), 'subtract')
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  const x = assertMoney(a, 'compare')
  const y = assertMoney(b, 'compare')
  return x < y ? -1 : x > y ? 1 : 0
}

export function min(first: Money, ...rest: Money[]): Money {
  return rest.reduce((lowest, next) => (compare(next, lowest) < 0 ? next : lowest), assertMoney(first, 'min'))
}

export function max(first: Money, ...rest: Money[]): Money {
  return rest.reduce((highest, next) => (compare(next, highest) > 0 ? next : highest), assertMoney(first, 'max'))
}

export function ratio(numerator: number, denominator: number): Ratio {
  if (!isSafe(numerator) || !isSafe(denominator) || denominator <= 0) {
    throw new MoneyError(`ratio: ${numerator} / ${denominator} needs safe integers and a denominator above zero`)
  }
  return { numerator, denominator }
}

const PERCENT = /^(\d+)(?:\.(\d+))?$/

/** A percentage written in decimal ("7", "7.5", "12.25") as an exact Ratio: "7.5" is 75 / 1000. */
export function percent(text: string): Ratio {
  const match = typeof text === 'string' ? PERCENT.exec(text) : null
  if (!match) throw new MoneyError(`percent: ${JSON.stringify(text)} is not a percentage like "7" or "7.5"`)
  const [, whole, fraction = ''] = match
  const numerator = BigInt(whole! + fraction)
  const denominator = 100n * 10n ** BigInt(fraction.length)
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyError(`percent: ${JSON.stringify(text)} has too many digits`)
  }
  return ratio(Number(numerator), Number(denominator))
}

/** n / d (d > 0) rounded to an integer by `mode`. Shared with lib/format. */
export function divideRound(n: bigint, d: bigint, mode: RoundingMode): bigint {
  const quotient = n / d // truncates towards zero
  const remainder = n % d // has the sign of n
  if (remainder === 0n) return quotient
  switch (mode) {
    case 'down':
      return n < 0n ? quotient - 1n : quotient
    case 'up':
      return n > 0n ? quotient + 1n : quotient
    case 'nearest': {
      const twice = remainder < 0n ? -2n * remainder : 2n * remainder
      if (twice < d) return quotient
      return n < 0n ? quotient - 1n : quotient + 1n
    }
    default:
      throw new MoneyError(`unknown rounding mode ${JSON.stringify(mode)}`)
  }
}

/** amount × factor, rounded to a whole penny by `mode`. Exact: no float is involved. */
export function mulRound(amount: Money, factor: Ratio, mode: RoundingMode): Money {
  const pence = assertMoney(amount, 'mulRound')
  const { numerator, denominator } = factor ?? {}
  if (!isSafe(numerator) || !isSafe(denominator) || denominator <= 0) {
    throw new MoneyError('mulRound: the factor must be a Ratio of safe integers with a denominator above zero')
  }
  if (mode !== 'nearest' && mode !== 'down' && mode !== 'up')
    throw new MoneyError(`mulRound: unknown rounding mode ${JSON.stringify(mode)}`)
  return fromBigInt(divideRound(BigInt(pence) * BigInt(numerator), BigInt(denominator), mode), 'mulRound')
}

/** The amount rounded to whole pounds (a multiple of 100 pence) by `mode`. */
export function roundToPounds(amount: Money, mode: RoundingMode): Money {
  const pence = assertMoney(amount, 'roundToPounds')
  return fromBigInt(divideRound(BigInt(pence), 100n, mode) * 100n, 'roundToPounds')
}

const ratioParts = (r: Ratio, what: string): [bigint, bigint] => {
  const { numerator, denominator } = r ?? {}
  if (!isSafe(numerator) || !isSafe(denominator) || denominator <= 0) throw new MoneyError(`${what}: not a Ratio`)
  return [BigInt(numerator), BigInt(denominator)]
}

/** Exact comparison of two Ratios (rates and percentages, not amounts). */
export function compareRatio(a: Ratio, b: Ratio): -1 | 0 | 1 {
  const [an, ad] = ratioParts(a, 'compareRatio')
  const [bn, bd] = ratioParts(b, 'compareRatio')
  const left = an * bd
  const right = bn * ad
  return left < right ? -1 : left > right ? 1 : 0
}

const gcd = (a: bigint, b: bigint): bigint => {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b]
  while (y) [x, y] = [y, x % y]
  return x
}

/** a − b as an exact Ratio in lowest terms (for showing a change in a rate). Throws past the safe range. */
export function subtractRatio(a: Ratio, b: Ratio): Ratio {
  const [an, ad] = ratioParts(a, 'subtractRatio')
  const [bn, bd] = ratioParts(b, 'subtractRatio')
  let numerator = an * bd - bn * ad
  let denominator = ad * bd
  const divisor = gcd(numerator, denominator)
  numerator /= divisor || 1n
  denominator /= divisor || 1n
  if (numerator === 0n) denominator = 1n
  const limit = BigInt(Number.MAX_SAFE_INTEGER)
  if (numerator > limit || numerator < -limit || denominator > limit)
    throw new MoneyError('subtractRatio: the result is past the safe range')
  return ratio(Number(numerator), Number(denominator))
}

/** r rounded to `digits` decimal places (zero to RATE_RATIO_DIGITS) by `mode`, as a Ratio over 10^digits. For showing a rate. */
export function roundRatio(r: Ratio, digits: number, mode: RoundingMode): Ratio {
  const [n, d] = ratioParts(r, 'roundRatio')
  if (!isSafe(digits) || digits < 0 || digits > RATE_RATIO_DIGITS)
    throw new MoneyError(`roundRatio: ${String(digits)} is not a digit count`)
  const denominator = 10n ** BigInt(digits)
  return ratio(Number(divideRound(n * denominator, d, mode)), Number(denominator))
}

/**
 * An exact amount of pence as a fraction: numerator / denominator, in BigInt,
 * denominator above zero, in lowest terms. For a rule that leaves part of a
 * penny before the one rounding at output (docs/money.md, "Rounding per
 * calculation"). It becomes Money only through roundExact.
 */
export interface ExactPence {
  readonly numerator: bigint
  readonly denominator: bigint
}

function reduced(numerator: bigint, denominator: bigint): ExactPence {
  if (denominator <= 0n) throw new MoneyError('exact pence: the denominator must be above zero')
  const divisor = gcd(numerator, denominator) || 1n
  return numerator === 0n ? { numerator: 0n, denominator: 1n } : { numerator: numerator / divisor, denominator: denominator / divisor }
}

/** A Money as exact pence. */
export function exact(amount: Money): ExactPence {
  return { numerator: BigInt(assertMoney(amount, 'exact')), denominator: 1n }
}

/** amount × factor, exactly. */
export function exactMul(amount: ExactPence, factor: Ratio): ExactPence {
  const [n, d] = ratioParts(factor, 'exactMul')
  return reduced(amount.numerator * n, amount.denominator * d)
}

export function exactAdd(a: ExactPence, b: ExactPence): ExactPence {
  return reduced(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator)
}

export function exactSubtract(a: ExactPence, b: ExactPence): ExactPence {
  return reduced(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator)
}

export function compareExact(a: ExactPence, b: ExactPence): -1 | 0 | 1 {
  const left = a.numerator * b.denominator
  const right = b.numerator * a.denominator
  return left < right ? -1 : left > right ? 1 : 0
}

/** Exact pence rounded to a whole penny by `mode`: the one rounding at output. Throws past the safe range. */
export function roundExact(amount: ExactPence, mode: RoundingMode): Money {
  if (amount.denominator <= 0n) throw new MoneyError('roundExact: the denominator must be above zero')
  return fromBigInt(divideRound(amount.numerator, amount.denominator, mode), 'roundExact')
}

/**
 * How many whole `step`s fit in an exact amount: the amount divided by the
 * step, rounded down. For a rule that counts complete steps of income (the
 * High Income Child Benefit Charge). The amount must be zero or more and the
 * step above zero.
 */
export function wholeSteps(amount: ExactPence, step: Money): number {
  const size = BigInt(assertMoney(step, 'wholeSteps'))
  if (size <= 0n) throw new MoneyError('wholeSteps: the step must be above zero')
  if (amount.denominator <= 0n) throw new MoneyError('wholeSteps: the denominator must be above zero')
  if (amount.numerator < 0n) throw new MoneyError('wholeSteps: the amount must be zero or more')
  const count = amount.numerator / (amount.denominator * size)
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError('wholeSteps: the count is past the safe-integer range')
  return Number(count)
}

/*
 * Fine fixed point (slice 2a, decision C9 in docs/modelling-decisions-compound.md).
 * For a calculation whose factors can be irrational (a root of a growth
 * factor), where ExactPence cannot hold the value. A FinePence is pence and a
 * Factor a plain number, each as a BigInt count of units of 10^-FINE_DIGITS.
 * Every product and quotient rounds to the nearest unit at that scale; no
 * float is involved. A FinePence becomes Money only through roundFine.
 */

declare const FINE: unique symbol
declare const FACTOR: unique symbol

/** Pence in units of 10^-FINE_DIGITS of a penny. Make one with fine(). */
export type FinePence = bigint & { readonly [FINE]: true }

/** A plain number in units of 10^-FINE_DIGITS. Make one with factor(). */
export type Factor = bigint & { readonly [FACTOR]: true }

/** Decimal places held by FinePence and Factor. */
export const FINE_DIGITS = 40

/** Decimal places of the Ratio factorToRatio gives (for showing a rate). */
export const RATE_RATIO_DIGITS = 15

/** A rate solver (slice 3a, decision F9 in docs/modelling-decisions-car.md) stops within 10^-RATE_SOLVE_DIGITS a period. */
export const RATE_SOLVE_DIGITS = 24

/**
 * Decimal places an APR is shown to, as a fraction: one decimal place of a
 * percentage, the least the APR rule allows, a following figure of five or
 * more rounding up (slice 3a.1, F15; docs/verification-log.md, CR-3).
 */
export const APR_DISPLAY_DIGITS = 3

/** The most bisection steps a rate solver takes before it refuses (F9). */
export const RATE_SOLVE_MAX_STEPS = 200

const FINE_SCALE = 10n ** BigInt(FINE_DIGITS)
const RATE_RATIO_DENOMINATOR = 10n ** BigInt(RATE_RATIO_DIGITS)

const isBig = (value: unknown): value is bigint => typeof value === 'bigint'
const fineOf = (value: unknown, what: string): bigint => {
  if (!isBig(value)) throw new MoneyError(`${what}: not a fine amount`)
  return value
}
const factorOf = (value: unknown, what: string): bigint => {
  if (!isBig(value)) throw new MoneyError(`${what}: not a factor`)
  return value
}
const positive = (value: bigint, what: string): bigint => {
  if (value <= 0n) throw new MoneyError(`${what}: the divisor must be above zero`)
  return value
}
const wholeCount = (n: number, least: number, what: string): bigint => {
  if (!isSafe(n) || n < least) throw new MoneyError(`${what}: ${String(n)} must be a whole number from ${least}`)
  return BigInt(n)
}

export const FINE_ZERO = 0n as FinePence
export const FACTOR_ONE = FINE_SCALE as Factor

/** The rate solver's tolerance as a Factor: 10^-RATE_SOLVE_DIGITS (F9). */
export const RATE_SOLVE_TOLERANCE = (10n ** BigInt(FINE_DIGITS - RATE_SOLVE_DIGITS)) as Factor

/** A Money as fine pence, exactly. */
export function fine(amount: Money): FinePence {
  return (BigInt(assertMoney(amount, 'fine')) * FINE_SCALE) as FinePence
}

export function fineAdd(a: FinePence, b: FinePence): FinePence {
  return (fineOf(a, 'fineAdd') + fineOf(b, 'fineAdd')) as FinePence
}

export function fineSubtract(a: FinePence, b: FinePence): FinePence {
  return (fineOf(a, 'fineSubtract') - fineOf(b, 'fineSubtract')) as FinePence
}

export function compareFine(a: FinePence, b: FinePence): -1 | 0 | 1 {
  const [x, y] = [fineOf(a, 'compareFine'), fineOf(b, 'compareFine')]
  return x < y ? -1 : x > y ? 1 : 0
}

/** amount × f, to the nearest unit. */
export function fineMul(amount: FinePence, f: Factor): FinePence {
  return divideRound(fineOf(amount, 'fineMul') * factorOf(f, 'fineMul'), FINE_SCALE, 'nearest') as FinePence
}

/** amount ÷ f (f above zero), to the nearest unit. */
export function fineDivide(amount: FinePence, f: Factor): FinePence {
  const divisor = positive(factorOf(f, 'fineDivide'), 'fineDivide')
  return divideRound(fineOf(amount, 'fineDivide') * FINE_SCALE, divisor, 'nearest') as FinePence
}

/** Fine pence rounded to a whole penny by `mode`: the one rounding at output. Throws past the safe range. */
export function roundFine(amount: FinePence, mode: RoundingMode): Money {
  return fromBigInt(divideRound(fineOf(amount, 'roundFine'), FINE_SCALE, mode), 'roundFine')
}

/** A Ratio as a Factor, to the nearest unit. */
export function factor(r: Ratio): Factor {
  const [n, d] = ratioParts(r, 'factor')
  return divideRound(n * FINE_SCALE, d, 'nearest') as Factor
}

export function factorAdd(a: Factor, b: Factor): Factor {
  return (factorOf(a, 'factorAdd') + factorOf(b, 'factorAdd')) as Factor
}

export function factorSubtract(a: Factor, b: Factor): Factor {
  return (factorOf(a, 'factorSubtract') - factorOf(b, 'factorSubtract')) as Factor
}

export function compareFactor(a: Factor, b: Factor): -1 | 0 | 1 {
  const [x, y] = [factorOf(a, 'compareFactor'), factorOf(b, 'compareFactor')]
  return x < y ? -1 : x > y ? 1 : 0
}

/** a × b, to the nearest unit. */
export function factorMul(a: Factor, b: Factor): Factor {
  return divideRound(factorOf(a, 'factorMul') * factorOf(b, 'factorMul'), FINE_SCALE, 'nearest') as Factor
}

/** a ÷ b (b above zero), to the nearest unit. */
export function factorDivide(a: Factor, b: Factor): Factor {
  const divisor = positive(factorOf(b, 'factorDivide'), 'factorDivide')
  return divideRound(factorOf(a, 'factorDivide') * FINE_SCALE, divisor, 'nearest') as Factor
}

/** f to a whole power n (n zero or more), by repeated squaring, each product to the nearest unit. */
export function factorPow(f: Factor, n: number): Factor {
  let base = factorOf(f, 'factorPow') as Factor
  let count = wholeCount(n, 0, 'factorPow')
  let result = FACTOR_ONE
  while (count > 0n) {
    if (count & 1n) result = factorMul(result, base)
    count >>= 1n
    if (count > 0n) base = factorMul(base, base)
  }
  return result
}

/** The largest x with x^n <= value (value zero or more, n from one), by Newton's iteration from above. */
function integerRoot(value: bigint, n: bigint): bigint {
  if (value < 2n) return value
  let x = 1n << (BigInt(value.toString(2).length) / n + 1n)
  for (;;) {
    const next = ((n - 1n) * x + value / x ** (n - 1n)) / n
    if (next >= x) return x
    x = next
  }
}

/** The n-th root of f (f above zero, n a whole number from one), to the nearest unit. */
export function factorRoot(f: Factor, n: number): Factor {
  const value = positive(factorOf(f, 'factorRoot'), 'factorRoot')
  const k = wholeCount(n, 1, 'factorRoot')
  // root = (f / SCALE)^(1/k) × SCALE = (f × SCALE^(k−1))^(1/k)
  const target = value * FINE_SCALE ** (k - 1n)
  const floor = integerRoot(target, k)
  // Nearest: round up when (floor + ½)^k is below the target, i.e. (2 floor + 1)^k < 2^k target.
  return ((2n * floor + 1n) ** k < 2n ** k * target ? floor + 1n : floor) as Factor
}

/** A Factor as a Ratio over 10^RATE_RATIO_DIGITS, to the nearest. For showing a rate. Throws past the safe range. */
export function factorToRatio(f: Factor): Ratio {
  const numerator = divideRound(factorOf(f, 'factorToRatio') * RATE_RATIO_DENOMINATOR, FINE_SCALE, 'nearest')
  const limit = BigInt(Number.MAX_SAFE_INTEGER)
  if (numerator > limit || numerator < -limit) throw new MoneyError('factorToRatio: the rate is past the safe range')
  return ratio(Number(numerator), Number(RATE_RATIO_DENOMINATOR))
}
