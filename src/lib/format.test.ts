import { describe, expect, it } from 'vitest'
import {
  formatAmountInput,
  formatGBP,
  formatGBPCompact,
  formatGBPDelta,
  formatIsoDate,
  formatPence,
  formatPercent,
  formatPercentFixed,
  formatPercentPointDelta,
} from './format'
import { exact, fromPence, ratio } from './money'

/* Made-up amounts and rates; none is a tax figure. */

const p = fromPence
const MAX = Number.MAX_SAFE_INTEGER

describe('formatGBP, pounds and pence', () => {
  it.each<[number, string]>([
    [0, '£0.00'],
    [5, '£0.05'],
    [50, '£0.50'],
    [100, '£1.00'],
    [123_456, '£1,234.56'],
    [100_000_000, '£1,000,000.00'],
    [-5, '-£0.05'],
    [-123_456, '-£1,234.56'],
    [MAX, '£90,071,992,547,409.91'],
    [-MAX, '-£90,071,992,547,409.91'],
  ])('%d pence is %s', (pence, text) => {
    expect(formatGBP(p(pence), 'pence')).toBe(text)
  })
})

describe('formatGBP, whole pounds', () => {
  it.each<[number, string]>([
    [0, '£0'],
    [49, '£0'],
    [50, '£1'],
    [149, '£1'],
    [150, '£2'],
    [123_456, '£1,235'],
    [123_449, '£1,234'],
    [-49, '£0'],
    [-50, '-£1'],
    [-123_456, '-£1,235'],
    [MAX, '£90,071,992,547,410'],
  ])('%d pence is %s (nearest pound, halves away from zero)', (pence, text) => {
    expect(formatGBP(p(pence), 'pounds')).toBe(text)
  })

  it('never shows "-£0"', () => {
    for (let pence = -49; pence <= 0; pence++) expect(formatGBP(p(pence), 'pounds')).toBe('£0')
  })
})

describe('formatGBPCompact (for chart axes)', () => {
  it.each<[number, string]>([
    [0, '£0'],
    [99_900, '£999'],
    [99_949, '£999'],
    [99_950, '£1k'],
    [100_000, '£1k'],
    [120_000, '£1.2k'],
    [125_000, '£1.3k'],
    [995_000, '£10k'],
    [1_234_500, '£12k'],
    [12_345_600, '£123k'],
    [99_949_900, '£999k'],
    [99_950_000, '£1m'],
    [150_000_000, '£1.5m'],
    [2_500_000_000, '£25m'],
    [99_950_000_000, '£1bn'],
    [123_400_000_000_00, '£123bn'],
    [MAX, '£90,072bn'],
    [-120_000, '-£1.2k'],
    [-49, '£0'],
  ])('%d pence is %s', (pence, text) => {
    expect(formatGBPCompact(p(pence))).toBe(text)
  })
})

describe('formatPercent', () => {
  it.each<[number, number, string]>([
    [0, 1, '0%'],
    [7, 100, '7%'],
    [75, 1000, '7.5%'],
    [1225, 10000, '12.25%'],
    [1, 1, '100%'],
    [1, 3, '33.33%'],
    [2, 3, '66.67%'],
    [1, 200000, '0%'],
    [1, 2000, '0.05%'],
    [-1, 8, '-12.5%'],
    [-1, 300000, '0%'],
  ])('%d / %d is %s', (n, d, text) => {
    expect(formatPercent(ratio(n, d))).toBe(text)
  })

  it('takes a maximum number of decimals', () => {
    expect(formatPercent(ratio(1, 3), 0)).toBe('33%')
    expect(formatPercent(ratio(1, 3), 4)).toBe('33.3333%')
    expect(formatPercent(ratio(1, 8), 1)).toBe('12.5%')
  })
})

describe('formatIsoDate', () => {
  it('shows an ISO date as an en-GB date, whatever the time zone', () => {
    expect(formatIsoDate('2099-01-01')).toBe('1 January 2099')
    expect(formatIsoDate('2098-12-31')).toBe('31 December 2098')
  })

  it('shows an invalid date as such rather than guessing', () => {
    expect(formatIsoDate('2099-02-30' as never)).toBe('invalid date')
  })
})

describe('formatAmountInput (what an amount field shows)', () => {
  it.each<[number, string]>([
    [0, '0'],
    [100, '1'],
    [123_400, '1,234'],
    [123_456, '1,234.56'],
    [123_450, '1,234.50'],
    [5, '0.05'],
    [-500, '-5'],
    [-123_456, '-1,234.56'],
  ])('%d pence shows as %s', (pence, text) => {
    expect(formatAmountInput(p(pence))).toBe(text)
  })
})

describe('deltas', () => {
  it('formatGBPDelta signs every non-zero difference', () => {
    expect(formatGBPDelta(p(1234), 'pence')).toBe('+£12.34')
    expect(formatGBPDelta(p(-1234), 'pence')).toBe('-£12.34')
    expect(formatGBPDelta(p(0), 'pence')).toBe('£0.00')
    expect(formatGBPDelta(p(1234), 'pounds')).toBe('+£12')
    // Rounds to £0 in whole pounds: no sign.
    expect(formatGBPDelta(p(-40), 'pounds')).toBe('£0')
  })

  it('formatPercentPointDelta says percentage points', () => {
    expect(formatPercentPointDelta(ratio(25, 1000))).toBe('+2.5 percentage points')
    expect(formatPercentPointDelta(ratio(-1, 100))).toBe('-1 percentage point')
    expect(formatPercentPointDelta(ratio(0, 1))).toBe('No change')
  })
})

describe('formatPence (slice 3c-1: a cost per mile)', () => {
  it('shows exact pence to at most the places asked, trailing zeros dropped, halves away from zero', () => {
    expect(formatPence({ numerator: 1_363_827n, denominator: 100_000n })).toBe('13.64p')
    expect(formatPence({ numerator: 1_363_827n, denominator: 100_000n }, 1)).toBe('13.6p')
    expect(formatPence(exact(fromPence(12)))).toBe('12p')
    expect(formatPence({ numerator: 25n, denominator: 1000n })).toBe('0.03p')
    expect(formatPence({ numerator: -25n, denominator: 10n })).toBe('-2.5p')
    expect(formatPence({ numerator: 123_456_789n, denominator: 1n })).toBe('123,456,789p')
  })
})

describe('formatPercentFixed (slice 3c-1: an APR to one fixed place)', () => {
  it('keeps trailing zeros to the places asked', () => {
    expect(formatPercentFixed(ratio(1, 10), 1)).toBe('10.0%')
    expect(formatPercentFixed(ratio(79, 1_000), 1)).toBe('7.9%')
    expect(formatPercentFixed(ratio(0, 1), 1)).toBe('0.0%')
    expect(formatPercentFixed(ratio(12_345, 100), 1)).toBe('12,345.0%')
  })
})
