import { formatGBP, formatPercent } from './format'
import { type IsoDate, isIsoDate } from './isoDate'
import { compare, compareRatio, fromPounds, type Money, MoneyError, type Ratio, ratio } from './money'

/*
 * Parsing what a person types (or pastes) into an input. Pure: text in, a
 * value or a plain-language error out. Amounts become Money through
 * fromPounds (so nothing is rounded and no float is involved), percentages
 * become exact Ratios. Shared by the input components (src/components/inputs)
 * and by calculators that store a percentage as its canonical text.
 *
 * Accepted:
 * - amounts: optional sign (also the Unicode minus) before or after an
 *   optional £, digits with optional thousands commas ("1,234"), at most two
 *   decimals; "5." and ".5" are fine, as are leading zeros;
 * - percentages: optional sign, digits and decimals, an optional trailing %;
 * - decimals (miles per gallon, pence per litre): as percentages, with
 *   thousands commas and no %;
 * - whole numbers: optional sign, digits with optional thousands commas.
 * Everything else is refused with a message; values past the safe-integer
 * range are refused, never rounded.
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

const fail = (error: string): Parsed<never> => ({ ok: false, error })

/** Unicode minus (U+2212), small and full-width hyphen-minus, read as "-". */
const normaliseMinus = (text: string) => text.replace(/[−﹣－]/g, '-')

const GROUPED = /^\d{1,3}(?:,\d{3})+$/

/** "1,234" → "1234"; null if commas are misplaced. */
function wholeDigits(text: string): string | null {
  if (!text.includes(',')) return text
  return GROUPED.test(text) ? text.replaceAll(',', '') : null
}

export interface MoneyLimits {
  min?: Money
  max?: Money
}

const AMOUNT_HELP = 'Enter an amount in pounds, like 1,234.56.'

export function parseMoneyText(text: string, limits: MoneyLimits = {}): Parsed<Money> {
  const s = normaliseMinus(text).trim()
  if (!s) return fail('Enter an amount.')
  const match = /^([+-]?)\s*(?:£\s*)?([+-]?)([\d,]*)(?:\.(\d*))?$/.exec(s)
  if (!match) return fail(AMOUNT_HELP)
  const [, before = '', after = '', grouped = '', fraction = ''] = match
  if (before && after) return fail(AMOUNT_HELP)
  const whole = wholeDigits(grouped)
  if (whole === null || (!whole && !fraction)) return fail(AMOUNT_HELP)
  if (fraction.length > 2) return fail(`Use at most ${decimalPlaces(2)}.`)
  const negative = (before || after) === '-'
  const digits = whole.replace(/^0+(?=\d)/, '') || '0'
  if (digits.length > 16) return fail('That amount is too large.')
  let value: Money
  try {
    value = fromPounds(`${negative ? '-' : ''}${digits}${fraction ? `.${fraction}` : ''}`)
  } catch (error) {
    if (error instanceof MoneyError) return fail('That amount is too large.')
    throw error
  }
  if (limits.min !== undefined && compare(value, limits.min) < 0) return fail(`Enter at least ${formatGBP(limits.min, 'pence')}.`)
  if (limits.max !== undefined && compare(value, limits.max) > 0) return fail(`Enter no more than ${formatGBP(limits.max, 'pence')}.`)
  return { ok: true, value }
}

export interface PercentLimits {
  min?: Ratio
  max?: Ratio
  /** Decimal places allowed. Default 2. */
  maxDecimals?: number
}

export interface PercentValue {
  readonly ratio: Ratio
  /** The canonical text: no leading zeros, no trailing decimal zeros, no %. What calculators store. */
  readonly text: string
}

const WORDS = ['no', 'one', 'two', 'three', 'four']
const decimalPlaces = (n: number) => `${WORDS[n] ?? n} decimal place${n === 1 ? '' : 's'}`

const PERCENT_HELP = 'Enter a percentage, like 7.5.'

export function parsePercentText(text: string, limits: PercentLimits = {}): Parsed<PercentValue> {
  const { maxDecimals = 2 } = limits
  const s = normaliseMinus(text).trim()
  if (!s) return fail('Enter a percentage.')
  const match = /^([+-]?)(\d*)(?:\.(\d*))?\s*%?$/.exec(s)
  if (!match) return fail(PERCENT_HELP)
  const [, sign = '', whole = '', fraction = ''] = match
  if (!whole && !fraction) return fail(PERCENT_HELP)
  if (fraction.length > maxDecimals) return fail(`Use at most ${decimalPlaces(maxDecimals)}.`)
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '') || '0'
  const trimmedFraction = fraction.replace(/0+$/, '')
  const numerator = BigInt(`${trimmedWhole}${trimmedFraction}`)
  const denominator = 100n * 10n ** BigInt(trimmedFraction.length)
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    return fail('That percentage is too large.')
  }
  const negative = sign === '-' && numerator !== 0n
  const value = ratio(Number(negative ? -numerator : numerator), Number(denominator))
  if (limits.min && compareRatio(value, limits.min) < 0) return fail(`Enter at least ${formatPercent(limits.min)}.`)
  if (limits.max && compareRatio(value, limits.max) > 0) return fail(`Enter no more than ${formatPercent(limits.max)}.`)
  const canonical = `${negative ? '-' : ''}${trimmedWhole}${trimmedFraction ? `.${trimmedFraction}` : ''}`
  return { ok: true, value: { ratio: value, text: canonical } }
}

const CANONICAL_PERCENT = /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/

/** The Ratio for a canonical percentage text (as parsePercentText returns). Throws on anything else. */
export function percentRatio(text: string): Ratio {
  if (typeof text !== 'string' || !CANONICAL_PERCENT.test(text) || text === '-0') {
    throw new MoneyError(`percentRatio: ${JSON.stringify(text)} is not a canonical percentage`)
  }
  const parsed = parsePercentText(text, { maxDecimals: 15 })
  if (!parsed.ok) throw new MoneyError(`percentRatio: ${parsed.error}`)
  return parsed.value.ratio
}

/** True if `text` is a canonical percentage within the limits. For validating stored inputs. */
export function isCanonicalPercent(text: unknown, limits: PercentLimits = {}): text is string {
  if (typeof text !== 'string' || !CANONICAL_PERCENT.test(text) || text === '-0') return false
  const parsed = parsePercentText(text, limits)
  return parsed.ok && parsed.value.text === text
}

export interface IntegerLimits {
  min?: number
  max?: number
}

export function parseIntegerText(text: string, limits: IntegerLimits = {}): Parsed<number> {
  const s = normaliseMinus(text).trim()
  if (!s) return fail('Enter a number.')
  const match = /^([+-]?)([\d,]+)$/.exec(s)
  const whole = match ? wholeDigits(match[2]!) : null
  if (!match || whole === null) return fail('Enter a whole number.')
  const digits = whole.replace(/^0+(?=\d)/, '')
  const big = BigInt(digits) * (match[1] === '-' ? -1n : 1n)
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < -BigInt(Number.MAX_SAFE_INTEGER)) return fail('That number is too large.')
  const value = Number(big) || 0
  if (limits.min !== undefined && value < limits.min) return fail(`Enter at least ${limits.min}.`)
  if (limits.max !== undefined && value > limits.max) return fail(`Enter no more than ${limits.max}.`)
  return { ok: true, value }
}

export interface DecimalLimits extends PercentLimits {
  /** Refuse the minimum itself ("above nothing"). */
  minExclusive?: boolean
}

const DECIMAL_HELP = 'Enter a number, like 45.5.'
const plain = (r: Ratio) => formatPercent(ratio(r.numerator, r.denominator * 100), 15).replace('%', '')

/** A plain decimal ("45.5", "1,234.56") as an exact Ratio and its canonical text, within the limits. */
export function parseDecimalText(text: string, limits: DecimalLimits = {}): Parsed<PercentValue> {
  const { maxDecimals = 2 } = limits
  const s = normaliseMinus(text).trim()
  if (!s) return fail('Enter a number.')
  const match = /^([+-]?)([\d,]*)(?:\.(\d*))?$/.exec(s)
  if (!match) return fail(DECIMAL_HELP)
  const [, sign = '', grouped = '', fraction = ''] = match
  const whole = wholeDigits(grouped)
  if (whole === null || (!whole && !fraction)) return fail(DECIMAL_HELP)
  if (fraction.length > maxDecimals) return fail(`Use at most ${decimalPlaces(maxDecimals)}.`)
  const trimmedWhole = whole.replace(/^0+(?=\d)/, '') || '0'
  const trimmedFraction = fraction.replace(/0+$/, '')
  const numerator = BigInt(`${trimmedWhole}${trimmedFraction}`)
  const denominator = 10n ** BigInt(trimmedFraction.length)
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) return fail('That number is too large.')
  const negative = sign === '-' && numerator !== 0n
  const value = ratio(Number(negative ? -numerator : numerator), Number(denominator))
  if (limits.min) {
    const below = compareRatio(value, limits.min)
    if (limits.minExclusive && below <= 0) return fail(`Enter more than ${plain(limits.min)}.`)
    if (below < 0) return fail(`Enter at least ${plain(limits.min)}.`)
  }
  if (limits.max && compareRatio(value, limits.max) > 0) return fail(`Enter no more than ${plain(limits.max)}.`)
  const canonical = `${negative ? '-' : ''}${trimmedWhole}${trimmedFraction ? `.${trimmedFraction}` : ''}`
  return { ok: true, value: { ratio: value, text: canonical } }
}

/** The Ratio for a canonical decimal text (as parseDecimalText returns). Throws on anything else. */
export function decimalRatio(text: string): Ratio {
  if (typeof text !== 'string' || !CANONICAL_PERCENT.test(text) || text === '-0') {
    throw new MoneyError(`decimalRatio: ${JSON.stringify(text)} is not a canonical decimal`)
  }
  const parsed = parseDecimalText(text, { maxDecimals: 15 })
  if (!parsed.ok) throw new MoneyError(`decimalRatio: ${parsed.error}`)
  return parsed.value.ratio
}

/** True if `text` is a canonical decimal within the limits. For validating stored inputs. */
export function isCanonicalDecimal(text: unknown, limits: DecimalLimits = {}): text is string {
  if (typeof text !== 'string' || !CANONICAL_PERCENT.test(text) || text === '-0') return false
  const parsed = parseDecimalText(text, limits)
  return parsed.ok && parsed.value.text === text
}

const ISO_DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/
const UK_DATE_TEXT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * A date, typed year-month-day (2026-01-15) or day/month/year as written in
 * the UK (15/01/2026), as its ISO string. The day must exist (isIsoDate).
 */
export function parseDateText(text: string): Parsed<IsoDate> {
  const s = text.trim()
  const uk = UK_DATE_TEXT.exec(s)
  const iso = uk ? `${uk[3]}-${uk[2]!.padStart(2, '0')}-${uk[1]!.padStart(2, '0')}` : ISO_DATE_TEXT.test(s) ? s : null
  if (!s) return fail('Enter a date.')
  if (iso === null) return fail('Enter a date as day/month/year or year-month-day.')
  return isIsoDate(iso) ? { ok: true, value: iso } : fail('That date doesn’t exist.')
}
