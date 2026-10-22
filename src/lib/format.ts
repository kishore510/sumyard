import type { AmountStyle } from '@/settings/settings'
import { type IsoDate, isIsoDate } from './isoDate'
import { divideRound, type Money, type Ratio, toPence } from './money'

/*
 * Display formatting, locale en-GB (see docs/money.md). Amounts are formatted
 * from integer pence with BigInt, never by dividing a float, so the digits are
 * exact at any size. Display rounding is to the nearest unit with halves away
 * from zero; it is for showing results only and is not a tax rounding rule.
 */

const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0, useGrouping: true })
const group = (whole: bigint) => GROUPED.format(whole)

const signed = (negative: boolean, body: string) => (negative ? `-£${body}` : `£${body}`)

/**
 * GBP for the Settings choice: `pence` shows pounds and pence (£1,234.56);
 * `pounds` shows the nearest whole pound (£1,235). Never "-£0".
 */
export function formatGBP(amount: Money, style: AmountStyle): string {
  const pence = BigInt(toPence(amount))
  if (style === 'pounds') {
    const pounds = divideRound(pence, 100n, 'nearest')
    return signed(pounds < 0n, group(pounds < 0n ? -pounds : pounds))
  }
  const size = pence < 0n ? -pence : pence
  return signed(pence < 0n, `${group(size / 100n)}.${String(size % 100n).padStart(2, '0')}`)
}

const COMPACT_UNITS: [suffix: string, pence: bigint][] = [
  ['k', 100_000n],
  ['m', 100_000_000n],
  ['bn', 100_000_000_000n],
]

/**
 * A short label for chart axes: £950, £1.2k, £12k, £1.5m, £3bn. One decimal
 * below ten of a unit, none from ten up; rounded to nearest, halves away from
 * zero, moving up a unit when rounding reaches a thousand.
 */
export function formatGBPCompact(amount: Money): string {
  const pence = BigInt(toPence(amount))
  const size = pence < 0n ? -pence : pence
  const pounds = divideRound(size, 100n, 'nearest')
  const negative = pence < 0n && pounds > 0n
  if (pounds < 1000n) return signed(negative, group(pounds))
  for (const [index, [suffix, unit]] of COMPACT_UNITS.entries()) {
    const tenths = divideRound(size * 10n, unit, 'nearest')
    if (tenths < 100n) return signed(negative, `${tenths / 10n}${tenths % 10n === 0n ? '' : `.${tenths % 10n}`}${suffix}`)
    const whole = divideRound(size, unit, 'nearest')
    if (whole < 1000n || index === COMPACT_UNITS.length - 1) return signed(negative, `${group(whole)}${suffix}`)
  }
  throw new Error('unreachable')
}

/** A Ratio as a percentage, to at most `maxDecimals` places, trailing zeros dropped: 7%, 7.5%, 33.33%. */
export function formatPercent(rate: Ratio, maxDecimals = 2): string {
  const scale = 10n ** BigInt(maxDecimals)
  const scaled = divideRound(BigInt(rate.numerator) * 100n * scale, BigInt(rate.denominator), 'nearest')
  const size = scaled < 0n ? -scaled : scaled
  const whole = size / scale
  const fraction =
    maxDecimals > 0
      ? String(size % scale)
          .padStart(maxDecimals, '0')
          .replace(/0+$/, '')
      : ''
  return `${scaled < 0n ? '-' : ''}${group(whole)}${fraction ? `.${fraction}` : ''}%`
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "2 January 2098" from "2098-01-02", the same in every time zone. */
export function formatIsoDate(date: IsoDate): string {
  if (!isIsoDate(date)) return 'invalid date'
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return DATE.format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * What an amount field shows for a value: grouped pounds, with pence only
 * when there are any ("1,234", "1,234.50", "-5"). No £ sign: the field shows
 * it beside the box.
 */
export function formatAmountInput(amount: Money): string {
  const pence = BigInt(toPence(amount))
  const size = pence < 0n ? -pence : pence
  const fraction = size % 100n
  return `${pence < 0n ? '-' : ''}${group(size / 100n)}${fraction === 0n ? '' : `.${String(fraction).padStart(2, '0')}`}`
}

/** A change in an amount, signed: "+£12.34", "-£12.34", or "£0.00" (no sign when it shows as zero). */
export function formatGBPDelta(amount: Money, style: AmountStyle): string {
  const text = formatGBP(amount, style)
  return toPence(amount) > 0 && /[1-9]/.test(text) ? `+${text}` : text
}

/** A change in a rate, in percentage points: "+2.5 percentage points", "-1 percentage point", "No change". */
export function formatPercentPointDelta(change: Ratio, maxDecimals = 2): string {
  const text = formatPercent(change, maxDecimals).replace('%', '')
  if (!/[1-9]/.test(text)) return 'No change'
  const unit = text.replace('-', '') === '1' ? 'percentage point' : 'percentage points'
  return `${change.numerator > 0 ? '+' : ''}${text} ${unit}`
}

/* Stub (red). */
export function formatPence(_amount: { readonly numerator: bigint; readonly denominator: bigint }, _maxDecimals = 2): string {
  return ''
}
