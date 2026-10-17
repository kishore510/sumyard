import { describe, expect, it } from 'vitest'
import { taxYear as skeleton } from '@/config/tax/2026-27'
import { FAKE_VERIFIED_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { fromPence, type Money } from '@/lib/money'
import { calculateHello, HELLO_LIMITS, HELLO_TAX_PATHS, type HelloInputs } from './calc'
import { helloCalculator } from './definition'

/* Made-up amounts and percentages. Hello has no tax logic. */

const base: HelloInputs = {
  amount: fromPence(100_000),
  percent: '10',
  rounding: 'nearest',
  steps: 10,
  chart: 'line',
  referenceLine: true,
  useTaxYearDates: false,
}
const run = (patch: Partial<HelloInputs>, config = skeleton) => calculateHello({ ...base, ...patch }, config)
const granted = (result: ReturnType<typeof calculateHello>) => {
  if (!result.ok) throw new Error('expected results')
  return result
}

describe('calculateHello', () => {
  it('multiplies the amount by the percentage with mulRound', () => {
    const result = granted(run({}))
    expect(result.product).toBe(10_000)
    expect(result.total).toBe(110_000)
  })

  it('builds a series of `steps` values, applying the percentage once per step', () => {
    const { series } = granted(run({}))
    expect(series).toHaveLength(10)
    expect(series.slice(0, 3)).toEqual([110_000, 121_000, 133_100])
    expect(granted(run({ steps: 2 })).series).toHaveLength(2)
  })

  it('uses the chosen rounding mode at every step', () => {
    const half = (rounding: HelloInputs['rounding']) => granted(run({ amount: fromPence(1), percent: '50', rounding, steps: 2 }))
    expect(half('nearest').product).toBe(1)
    expect(half('down').product).toBe(0)
    expect(half('up').product).toBe(1)
    expect(half('down').series).toEqual([1, 1])
    expect(half('up').series).toEqual([2, 3])
  })

  it('handles a negative percentage (halves away from zero for nearest)', () => {
    const result = (rounding: HelloInputs['rounding']) => granted(run({ amount: fromPence(1001), percent: '-50', rounding })).product
    expect(result('nearest')).toBe(-501)
    expect(result('down')).toBe(-501)
    expect(result('up')).toBe(-500)
  })

  it('stays in the safe range at the input limits', () => {
    const { series } = granted(run({ amount: HELLO_LIMITS.maxAmount, percent: '100' }))
    expect(Number.isSafeInteger(series.at(-1))).toBe(true)
  })

  it('needs no tax data unless asked, so the skeleton year still gives results', () => {
    expect(run({}).ok).toBe(true)
    expect(granted(run({})).taxYearDates).toBeNull()
  })

  it('asks requireVerified for the tax-year dates and refuses on the skeleton', () => {
    expect(run({ useTaxYearDates: true })).toEqual({ ok: false, taxYear: '2026-27', unverified: [...HELLO_TAX_PATHS] })
  })

  it('shows the dates when they are verified (fake year)', () => {
    const result = granted(run({ useTaxYearDates: true }, FAKE_VERIFIED_YEAR))
    expect(result.taxYearDates).toEqual({ start: '2098-01-01', end: '2098-12-31' })
  })
})

describe('Hello inputs validation', () => {
  const check = (raw: unknown) => helloCalculator.validateInputs(raw)

  it('accepts valid inputs and builds a fresh object with only known fields', () => {
    const raw = { ...base, extra: 1 }
    const result = check(raw)
    expect(result).toEqual({ ok: true, inputs: base })
    expect(result.ok && result.inputs).not.toBe(raw)
  })

  it('defaults are valid', () => {
    expect(check(helloCalculator.defaultInputs()).ok).toBe(true)
  })

  it.each<[string, Record<string, unknown>]>([
    ['negative amount', { amount: -1 }],
    ['amount over the limit', { amount: (HELLO_LIMITS.maxAmount as Money) + 1 }],
    ['fractional pence', { amount: 1.5 }],
    ['amount as text', { amount: '100' }],
    ['percentage over 100', { percent: '100.01' }],
    ['percentage under -100', { percent: '-101' }],
    ['percentage not canonical', { percent: '10%' }],
    ['percentage with too many decimals', { percent: '1.234' }],
    ['unknown rounding', { rounding: 'banker' }],
    ['too few steps', { steps: 1 }],
    ['too many steps', { steps: 11 }],
    ['unknown chart', { chart: 'pie' }],
    ['reference line not a boolean', { referenceLine: 'yes' }],
    ['tax-year dates not a boolean', { useTaxYearDates: 1 }],
  ])('rejects %s', (_label, patch) => {
    expect(check({ ...base, ...patch }).ok).toBe(false)
  })

  it('rejects a missing field and a non-object', () => {
    const { amount: _amount, ...rest } = base
    expect(check(rest).ok).toBe(false)
    expect(check(null).ok).toBe(false)
    expect(check([]).ok).toBe(false)
  })

  it('is at inputs version 1 and has no older version to migrate from', () => {
    expect(helloCalculator.inputsVersion).toBe(1)
    expect(() => helloCalculator.migrateInputs(0, {})).toThrow()
  })

  it('summarises inputs and results for compare', () => {
    const summary = helloCalculator.summarise(base, skeleton)
    expect(summary.inputs.map((r) => r.label)).toContain('Amount')
    expect(summary.results.ok && summary.results.rows.map((r) => r.label)).toContain('Amount × percentage')
    expect(helloCalculator.summarise({ ...base, useTaxYearDates: true }, skeleton).results.ok).toBe(false)
  })
})
