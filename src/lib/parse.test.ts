import { describe, expect, it } from 'vitest'
import { compareRatio, fromPence, ratio } from './money'
import {
  decimalRatio,
  isCanonicalDecimal,
  parseDateText,
  parseDecimalText,
  parseIntegerText,
  parseMoneyText,
  parsePercentText,
  percentRatio,
} from './parse'

/* Made-up amounts and percentages; none is a tax figure. */

const MAX = Number.MAX_SAFE_INTEGER

const ok = <T>(result: { ok: boolean; value?: T; error?: string }) => {
  expect(result.ok, result.error).toBe(true)
  return result.value as T
}
const error = (result: { ok: boolean; error?: string }) => {
  expect(result.ok).toBe(false)
  return result.error!
}

describe('parseMoneyText', () => {
  it.each<[string, number]>([
    ['1234.56', 123_456],
    ['£1,234.56', 123_456],
    [' £ 1,234.56 ', 123_456],
    ['1,234', 123_400],
    ['12,345,678.9', 1_234_567_890],
    ['0', 0],
    ['0.05', 5],
    ['.5', 50],
    ['5.', 500],
    ['007', 700],
    ['00.50', 50],
    ['+5', 500],
    ['-5', -500],
    ['−5', -500],
    ['−£1,234.56', -123_456],
    ['-£5', -500],
    ['£-5', -500],
    ['-0', 0],
    ['90071992547409.91', MAX],
  ])('%j is %d pence', (text, pence) => {
    expect(ok(parseMoneyText(text))).toBe(pence)
  })

  it.each(['', '   '])('empty %j asks for an amount', (text) => {
    expect(error(parseMoneyText(text))).toBe('Enter an amount.')
  })

  it.each(['1.234', '£1,234.567', '0.001'])('%j has too many decimals', (text) => {
    expect(error(parseMoneyText(text))).toBe('Use at most two decimal places.')
  })

  it.each([
    'abc',
    '1e5',
    '£',
    '-',
    '.',
    '1.2.3',
    '--5',
    '-£-5',
    '1,23',
    '12,3456',
    ',123',
    '1 000',
    '£1,234.56p',
    '0x10',
    'Infinity',
    'NaN',
  ])('%j is not an amount', (text) => {
    expect(error(parseMoneyText(text))).toBe('Enter an amount in pounds, like 1,234.56.')
  })

  it.each(['90071992547409.92', '99999999999999999999', '-90071992547409.92', '1'.repeat(400)])('%j is past the safe range', (text) => {
    expect(error(parseMoneyText(text))).toBe('That amount is too large.')
  })

  it('applies min and max, saying the limit', () => {
    const limits = { min: fromPence(0), max: fromPence(100_000) }
    expect(error(parseMoneyText('-0.01', limits))).toBe('Enter at least £0.00.')
    expect(error(parseMoneyText('1,000.01', limits))).toBe('Enter no more than £1,000.00.')
    expect(ok(parseMoneyText('1,000', limits))).toBe(100_000)
    expect(ok(parseMoneyText('0', limits))).toBe(0)
  })
})

describe('parsePercentText', () => {
  it.each<[string, string, [number, number]]>([
    ['5', '5', [5, 100]],
    ['7.5', '7.5', [75, 1000]],
    ['7.50', '7.5', [750, 10000]],
    ['7.5%', '7.5', [75, 1000]],
    [' 7.5 % ', '7.5', [75, 1000]],
    ['007', '7', [7, 100]],
    ['.5', '0.5', [5, 1000]],
    ['-2.5', '-2.5', [-25, 1000]],
    ['−2.5', '-2.5', [-25, 1000]],
    ['-0', '0', [0, 100]],
    ['0.00', '0', [0, 10000]],
  ])('%j is %s (%o)', (text, canonical, [numerator, denominator]) => {
    const value = ok(parsePercentText(text))
    expect(value.text).toBe(canonical)
    expect(value.ratio.numerator * denominator).toBe(numerator * value.ratio.denominator)
  })

  it('asks for a value when empty', () => {
    expect(error(parsePercentText(''))).toBe('Enter a percentage.')
  })

  it.each(['abc', '%', '5%%', '1,000', '1e2', '5.5.5', '£5'])('%j is not a percentage', (text) => {
    expect(error(parsePercentText(text))).toBe('Enter a percentage, like 7.5.')
  })

  it('caps decimal places (two by default)', () => {
    expect(error(parsePercentText('1.234'))).toBe('Use at most two decimal places.')
    expect(ok(parsePercentText('1.234', { maxDecimals: 3 })).text).toBe('1.234')
  })

  it('rejects values past the safe range', () => {
    expect(error(parsePercentText('9'.repeat(30)))).toBe('That percentage is too large.')
  })

  it('applies min and max', () => {
    const limits = { min: ratio(-1, 1), max: ratio(1, 1) }
    expect(error(parsePercentText('-100.01', limits))).toBe('Enter at least -100%.')
    expect(error(parsePercentText('100.5', limits))).toBe('Enter no more than 100%.')
    expect(ok(parsePercentText('100', limits)).text).toBe('100')
  })

  it('percentRatio reads canonical text and throws on anything else', () => {
    expect(percentRatio('12.5')).toEqual(ratio(125, 1000))
    expect(() => percentRatio('12.5%x')).toThrow()
  })
})

describe('parseIntegerText', () => {
  it.each<[string, number]>([
    ['3', 3],
    ['007', 7],
    ['-4', -4],
    ['−4', -4],
    ['1,000', 1000],
    [String(MAX), MAX],
  ])('%j is %d', (text, value) => {
    expect(ok(parseIntegerText(text))).toBe(value)
  })

  it('needs a whole number', () => {
    expect(error(parseIntegerText(''))).toBe('Enter a number.')
    expect(error(parseIntegerText('2.5'))).toBe('Enter a whole number.')
    expect(error(parseIntegerText('two'))).toBe('Enter a whole number.')
    expect(error(parseIntegerText('9007199254740992'))).toBe('That number is too large.')
  })

  it('applies min and max', () => {
    expect(error(parseIntegerText('1', { min: 2, max: 10 }))).toBe('Enter at least 2.')
    expect(error(parseIntegerText('11', { min: 2, max: 10 }))).toBe('Enter no more than 10.')
  })
})

describe('parseDecimalText (slice 3c-1: miles per gallon, pence per litre)', () => {
  it('reads plain decimals to an exact Ratio, with the canonical text', () => {
    const parsed = parseDecimalText('45.5')
    expect(parsed.ok && parsed.value.text).toBe('45.5')
    expect(parsed.ok && compareRatio(parsed.value.ratio, ratio(91, 2))).toBe(0)
    expect(parseDecimalText(' 007.50 ').ok && (parseDecimalText(' 007.50 ') as { value: { text: string } }).value.text).toBe('7.5')
    expect(parseDecimalText('1,234.5').ok).toBe(true)
  })

  it('refuses text that is not a decimal, too many places, and values outside the limits', () => {
    expect(parseDecimalText('')).toEqual({ ok: false, error: 'Enter a number.' })
    expect(parseDecimalText('abc').ok).toBe(false)
    expect(parseDecimalText('1.234', { maxDecimals: 2 })).toEqual({ ok: false, error: 'Use at most two decimal places.' })
    expect(parseDecimalText('-1', { min: ratio(0, 1) }).ok).toBe(false)
    expect(parseDecimalText('0', { min: ratio(0, 1), minExclusive: true }).ok).toBe(false)
    expect(parseDecimalText('0.01', { min: ratio(0, 1), minExclusive: true }).ok).toBe(true)
    expect(parseDecimalText('20.01', { max: ratio(20, 1) }).ok).toBe(false)
    expect(parseDecimalText('20', { max: ratio(20, 1) }).ok).toBe(true)
  })

  it('decimalRatio and isCanonicalDecimal round-trip the stored text', () => {
    expect(compareRatio(decimalRatio('12.25'), ratio(49, 4))).toBe(0)
    expect(() => decimalRatio('12.50')).toThrow()
    expect(isCanonicalDecimal('12.5', { max: ratio(20, 1) })).toBe(true)
    expect(isCanonicalDecimal('12.50')).toBe(false)
    expect(isCanonicalDecimal('21', { max: ratio(20, 1) })).toBe(false)
    expect(isCanonicalDecimal(12)).toBe(false)
  })
})

describe('parseDateText (M2: mortgage dates)', () => {
  it.each([
    ['2026-01-15', '2026-01-15'],
    [' 2028-02-29 ', '2028-02-29'],
    ['15/01/2026', '2026-01-15'],
    ['5/1/2026', '2026-01-05'],
    ['29/02/2028', '2028-02-29'],
  ])('reads %j as %s', (text, iso) => {
    expect(parseDateText(text)).toEqual({ ok: true, value: iso })
  })

  it.each(['', '2026-02-30', '29/02/2027', '2026-1-15', '15-01-2026', '01/15/2026', 'tomorrow', '20260115'])('refuses %j', (text) => {
    expect(parseDateText(text).ok).toBe(false)
  })
})
