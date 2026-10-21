import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatPercent } from '@/lib/format'
import {
  DEFAULT_PROJECTION_YEARS,
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_CONTRIBUTION_INCREASE,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
} from '@/lib/inputLimits'
import { add, fromPounds, type Ratio, ratio, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { CALCULATORS } from '../index'
import { project } from './calc'
import { type CompoundPageInputs, compoundCalculator, FIELD_LABELS, inputRefusal, toEngineInputs } from './definition'

/*
 * Slice 2b: the compound interest page's registry entry (definition.ts).
 * Inputs are untrusted when they come from storage or an imported file, so
 * validateInputs checks every field and builds a fresh object. Bounds come
 * from src/lib/inputLimits.ts; expected results come from the engine. Amounts
 * and rates here are made up.
 */

const defaults = () => compoundCalculator.defaultInputs()
const valid = (patch: Partial<Record<keyof CompoundPageInputs, unknown>> = {}) => ({ ...defaults(), ...patch })
const check = (raw: unknown) => compoundCalculator.validateInputs(raw)
const errorsOf = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? [] : result.errors
}

/** A Ratio as the canonical percentage text the page stores ("-50", "0.15"). */
const text = (r: Ratio) => formatPercent(r).replace('%', '').replace(/,/g, '')
const negate = (r: Ratio) => ratio(-r.numerator, r.denominator)
/** A hundredth of a percentage point past a bound, up or down. */
const past = (r: Ratio, direction: 1 | -1) => ratio(r.numerator * 10_000 + direction * r.denominator, r.denominator * 10_000)

const example: CompoundPageInputs = {
  lumpSum: fromPounds(5_000),
  contribution: fromPounds(150),
  contributionFrequency: 'monthly',
  timing: 'start',
  years: 20,
  growthRate: '5',
  compounding: 'monthly',
  feeRate: '0.75',
  contributionIncrease: '2',
  inflationRate: '2.5',
}

describe('registration', () => {
  it('is registered with id compound-interest, inputs version 1 and no tax rules', () => {
    expect(CALCULATORS.get('compound-interest')).toBe(compoundCalculator)
    expect(compoundCalculator.inputsVersion).toBe(1)
    expect(compoundCalculator.taxRules).toBe('none')
    expect(CALCULATORS.list().map((c) => c.id)).toEqual(['optimiser', 'compound-interest'])
  })
})

describe('defaults', () => {
  it('are valid, with no amounts, no rates and the starting years', () => {
    expect(check(defaults())).toEqual({ ok: true, inputs: defaults() })
    expect(defaults()).toEqual({
      lumpSum: ZERO,
      contribution: ZERO,
      contributionFrequency: 'monthly',
      timing: 'end',
      years: DEFAULT_PROJECTION_YEARS,
      growthRate: '0',
      compounding: 'monthly',
      feeRate: '0',
      contributionIncrease: '0',
      inflationRate: '0',
    })
  })

  it('are a fresh object each time', () => {
    expect(defaults()).not.toBe(defaults())
  })
})

describe('validateInputs', () => {
  it('builds a fresh object with only the known fields', () => {
    const raw = { ...example, extra: 'dropped' }
    const result = check(raw)
    expect(result).toEqual({ ok: true, inputs: example })
    expect(result.ok && result.inputs).not.toBe(raw)
  })

  it.each(['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{}}}', '{"prototype":1}'])(
    'refuses hostile keys: %s',
    (json) => {
      const raw = { ...example, ...JSON.parse(json) }
      expect(check(raw).ok).toBe(false)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    },
  )

  it.each([null, 'inputs', 42, [], [example]])('refuses %j, which is not an inputs object', (raw) => {
    expect(check(raw).ok).toBe(false)
  })

  it.each<[keyof CompoundPageInputs, unknown]>([
    ['lumpSum', '5000'],
    ['lumpSum', 1.5],
    ['contribution', null],
    ['contributionFrequency', 'daily'],
    ['contributionFrequency', 'fortnightly'],
    ['timing', 'middle'],
    ['years', '10'],
    ['years', 2.5],
    ['growthRate', 5],
    ['growthRate', '5%'],
    ['growthRate', '05'],
    ['growthRate', '5.125'],
    ['compounding', 'hourly'],
    ['feeRate', ''],
    ['contributionIncrease', '-0'],
    ['inflationRate', 7],
  ])('refuses a bad %s (%j), naming that field', (field, value) => {
    const errors = errorsOf(valid({ [field]: value }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(FIELD_LABELS[field])
  })

  it('names every bad field, one error each, in the order of the page', () => {
    const errors = errorsOf(valid({ years: 0, lumpSum: -1, feeRate: 'x' }))
    expect(errors.map((e) => Object.values(FIELD_LABELS).find((label) => e.startsWith(label)))).toEqual([
      FIELD_LABELS.lumpSum,
      FIELD_LABELS.years,
      FIELD_LABELS.feeRate,
    ])
  })

  it('refuses a missing field', () => {
    const { years: _drop, ...raw } = example
    expect(errorsOf(raw)).toEqual([expect.stringContaining(FIELD_LABELS.years)])
  })

  describe('limits from inputLimits.ts, at and beyond each bound', () => {
    it.each(['lumpSum', 'contribution'] as const)('%s: nothing to the input limit', (field) => {
      expect(check(valid({ [field]: 0 })).ok).toBe(true)
      expect(check(valid({ [field]: MAX_INPUT_AMOUNT })).ok).toBe(true)
      expect(check(valid({ [field]: -1 })).ok).toBe(false)
      expect(check(valid({ [field]: MAX_INPUT_AMOUNT + 1 })).ok).toBe(false)
    })

    it('years: one to the horizon cap', () => {
      expect(check(valid({ years: 1 })).ok).toBe(true)
      expect(check(valid({ years: MAX_PROJECTION_YEARS })).ok).toBe(true)
      expect(check(valid({ years: 0 })).ok).toBe(false)
      expect(check(valid({ years: MAX_PROJECTION_YEARS + 1 })).ok).toBe(false)
    })

    it.each<[keyof CompoundPageInputs, Ratio, Ratio]>([
      ['growthRate', negate(GROWTH_RATE_BOUND), GROWTH_RATE_BOUND],
      ['inflationRate', negate(INFLATION_RATE_BOUND), INFLATION_RATE_BOUND],
      ['feeRate', ratio(0, 1), MAX_FEE_RATE],
      ['contributionIncrease', ratio(0, 1), MAX_CONTRIBUTION_INCREASE],
    ])('%s: from its least to its most', (field, least, most) => {
      expect(check(valid({ [field]: text(least) })).ok).toBe(true)
      expect(check(valid({ [field]: text(most) })).ok).toBe(true)
      expect(check(valid({ [field]: text(past(least, -1)) })).ok).toBe(false)
      expect(check(valid({ [field]: text(past(most, 1)) })).ok).toBe(false)
    })

    it('a negative growth rate is allowed', () => {
      expect(check(valid({ growthRate: '-3.5' })).ok).toBe(true)
    })
  })
})

describe('migrateInputs', () => {
  it('has nothing to migrate from: version 1 is the first', () => {
    for (const from of [0, 1, 2]) expect(() => compoundCalculator.migrateInputs(from, example)).toThrow()
  })

  it('inputs from a newer version are refused, not guessed', () => {
    expect(CALCULATORS.readInputs('compound-interest', 2, example)).toMatchObject({ ok: false, reason: 'newer-inputs' })
  })
})

describe('toEngineInputs', () => {
  it('passes amounts and choices through and reads each percentage as its exact Ratio', () => {
    expect(toEngineInputs(example)).toEqual({
      lumpSum: example.lumpSum,
      contribution: example.contribution,
      contributionFrequency: 'monthly',
      timing: 'start',
      years: 20,
      growthRate: percentRatio('5'),
      compounding: 'monthly',
      feeRate: percentRatio('0.75'),
      contributionIncrease: percentRatio('2'),
      inflationRate: percentRatio('2.5'),
    })
  })
})

describe('summarise (compare)', () => {
  const engine = () => {
    const outcome = project(toEngineInputs(example))
    if (!outcome.ok) throw new Error('refused')
    return outcome.result
  }

  it('lists every input', () => {
    expect(compoundCalculator.summarise(example, taxYear).inputs.map((r) => r.label)).toEqual([
      'Lump sum',
      'Regular contribution',
      'Contribution frequency',
      'Contribution timing',
      'Years',
      'Growth rate (nominal, a year)',
      'Compounding',
      'Annual fee',
      'Annual contribution increase',
      'Inflation',
    ])
  })

  it('gives the brief’s result rows, each the engine’s figure', () => {
    const result = engine()
    const summary = compoundCalculator.summarise(example, taxYear)
    expect(summary.results).toEqual({
      ok: true,
      rows: [
        { label: 'Final balance', value: { kind: 'money', amount: result.withFee.nominal.closing } },
        { label: 'Final balance in today’s money', value: { kind: 'money', amount: result.withFee.real.closing } },
        { label: 'Paid in', value: { kind: 'money', amount: add(result.withFee.nominal.lumpSum, result.withFee.nominal.contributions) } },
        { label: 'Growth', value: { kind: 'money', amount: result.withFee.nominal.growth } },
        { label: 'Fees', value: { kind: 'money', amount: result.withFee.nominal.fees } },
        { label: 'Fee drag', value: { kind: 'money', amount: result.feeDrag.nominal } },
        { label: 'Fee drag in today’s money', value: { kind: 'money', amount: result.feeDrag.real } },
        { label: 'Effective annual rate', value: { kind: 'ratio', ratio: result.effectiveAnnualRate } },
        { label: 'Effective annual rate after fees', value: { kind: 'ratio', ratio: result.effectiveAnnualRateAfterFees } },
      ],
    })
  })

  it('a result past the safe range is an input refusal naming the result, never a number', () => {
    const huge = {
      ...example,
      lumpSum: MAX_INPUT_AMOUNT,
      contribution: MAX_INPUT_AMOUNT,
      growthRate: text(GROWTH_RATE_BOUND),
      years: MAX_PROJECTION_YEARS,
    }
    const { results } = compoundCalculator.summarise(huge, taxYear)
    expect(results).toEqual(inputRefusal([{ field: 'result', reason: 'too-large' }]))
    expect(results.ok).toBe(false)
    expect(!results.ok && 'kind' in results && results.problems[0]).toMatchObject({ field: 'result', label: 'Result' })
  })

  it('does not read the tax config it is given', () => {
    expect(compoundCalculator.summarise(example, undefined as never)).toEqual(compoundCalculator.summarise(example, taxYear))
  })
})

describe('inputRefusal', () => {
  it('puts each engine problem in words, by field, with no figures', () => {
    const refusal = inputRefusal([
      { field: 'years', reason: 'above-maximum' },
      { field: 'result', reason: 'too-large' },
    ])
    expect(refusal.kind).toBe('inputs')
    expect(refusal.problems.map((p) => [p.field, p.label])).toEqual([
      ['years', FIELD_LABELS.years],
      ['result', 'Result'],
    ])
    for (const problem of refusal.problems) expect(problem.message).not.toMatch(/\d/)
  })

  it('has words for every reason the engine gives', () => {
    for (const reason of ['not-money', 'not-a-rate', 'not-whole', 'not-a-choice', 'below-minimum', 'above-maximum', 'too-large'] as const)
      expect(inputRefusal([{ field: 'lumpSum', reason }]).problems[0]!.message.length, reason).toBeGreaterThan(0)
  })
})
