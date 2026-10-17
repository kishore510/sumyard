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
  void amount
  void step
  throw new MoneyError('wholeSteps: not implemented yet')
}
