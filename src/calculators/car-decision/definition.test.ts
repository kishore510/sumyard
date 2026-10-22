import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatPercent } from '@/lib/format'
import {
  DEFAULT_HORIZON_MONTHS,
  MAX_ANNUAL_MILEAGE,
  MAX_CAR_OPTIONS,
  MAX_EXCESS_PER_MILE,
  MAX_FINANCE_RATE,
  MAX_FINANCE_TERM_MONTHS,
  MAX_HORIZON_MONTHS,
  MAX_INPUT_AMOUNT,
  MAX_ITEM_NAME_LENGTH,
  MAX_MILES_PER_GALLON,
  MAX_MILES_PER_KWH,
  MAX_PENCE_PER_UNIT,
  MAX_SAVINGS_RETURN,
  PRICE_CHANGE_BOUND,
} from '@/lib/inputLimits'
import { divideRound, fromPence, fromPounds, type Ratio, ratio, toPence } from '@/lib/money'
import { decimalRatio, percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { compareOptions } from '../car-ownership/calc'
import { CALCULATORS } from '../index'
import {
  type CarDecisionInputs,
  calculate,
  carDecisionCalculator,
  FIELD_LABELS,
  missingFields,
  OPTIONAL_FIELDS,
  type OptionInputs,
  optionName,
  SHARED_LABELS,
  toEngineOption,
} from './definition'
import { blank, blankV1, cash, electric, hp, inputs, keep, loan, pcp, perMile, type V1Inputs } from './fixtures/inputs'

/*
 * Slice 3c-1: the car decision page's registry entry (definition.ts). Inputs
 * are untrusted when they come from storage or an imported file, so
 * validateInputs checks every field and builds a fresh object. Bounds come
 * from src/lib/inputLimits.ts; expected results come from the engine
 * (compareOptions). Every figure here is made up.
 */

const defaults = () => carDecisionCalculator.defaultInputs()
const check = (raw: unknown) => carDecisionCalculator.validateInputs(raw)
const errorsOf = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? [] : result.errors
}

const example = inputs([keep(), loan()])
const withOption = (patch: Record<string, unknown>) => ({ ...example, options: [{ ...example.options[0], ...patch }, example.options[1]] })

/** A Ratio as canonical text: a percentage ("-50") or a plain decimal ("20"). */
const pct = (r: Ratio) => formatPercent(r, 6).replace('%', '').replace(/,/g, '')
const dec = (r: Ratio) => pct(ratio(r.numerator, r.denominator * 100))
const negate = (r: Ratio) => ratio(-r.numerator, r.denominator)
/** A hundredth of a unit past a bound, up or down (a hundredth of a percentage point for a rate). */
const pastPct = (r: Ratio, direction: 1 | -1) => ratio(r.numerator * 10_000 + direction * r.denominator, r.denominator * 10_000)
const pastDec = (r: Ratio, direction: 1 | -1) => ratio(r.numerator * 100 + direction * r.denominator, r.denominator * 100)

describe('registration', () => {
  it('is registered as car-decision, inputs version 2, no tax rules, after compound interest', () => {
    expect(CALCULATORS.get('car-decision')).toBe(carDecisionCalculator)
    expect(carDecisionCalculator.inputsVersion).toBe(2)
    expect(carDecisionCalculator.taxRules).toBe('none')
    expect(CALCULATORS.list().map((c) => c.id)).toEqual(['optimiser', 'compound-interest', 'car-decision'])
  })
})

describe('defaults', () => {
  it('are valid: the starting horizon, the expected case, every required amount and rate empty, optional costs and fees 0', () => {
    expect(check(defaults())).toEqual({ ok: true, inputs: defaults() })
    const d = defaults()
    expect(d.horizonMonths).toBe(DEFAULT_HORIZON_MONTHS)
    expect(d.valueCase).toBe('expected')
    expect(d.savingsReturn).toBeNull()
    expect(d.generalIncrease).toBeNull()
    expect(d.options.map((o) => o.acquisition)).toEqual(['keep', 'cash'])
    for (const option of d.options) expect(option).toEqual(blank(option.acquisition))
  })

  it('are a fresh object each time, options included', () => {
    expect(defaults()).not.toBe(defaults())
    expect(defaults().options).not.toBe(defaults().options)
    expect(defaults().options[0]).not.toBe(defaults().options[0])
  })
})

describe('validateInputs', () => {
  it('builds a fresh object with only the known fields, at the top and in each option', () => {
    const raw = { ...example, extra: 1, options: example.options.map((o) => ({ ...o, extra: 'dropped' })) }
    const result = check(raw)
    expect(result).toEqual({ ok: true, inputs: example })
    expect(result.ok && result.inputs).not.toBe(raw)
    expect(result.ok && result.inputs.options[0]).not.toBe(raw.options[0])
  })

  it.each(['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{}}}', '{"prototype":1}'])(
    'refuses hostile keys at the top and in an option: %s',
    (json) => {
      expect(check({ ...example, ...JSON.parse(json) }).ok).toBe(false)
      expect(check(withOption(JSON.parse(json))).ok).toBe(false)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    },
  )

  it.each([null, 'inputs', 42, [], [example]])('refuses %j, which is not an inputs object', (raw) => {
    expect(check(raw).ok).toBe(false)
  })

  it.each([0, MAX_CAR_OPTIONS + 1])('refuses %i options (one to the most compared)', (count) => {
    const options = Array.from({ length: count }, () => cash())
    expect(errorsOf({ ...example, options })).toEqual([expect.stringContaining('options')])
  })

  it.each([1, MAX_CAR_OPTIONS])('accepts %i options', (count) => {
    expect(check({ ...example, options: Array.from({ length: count }, () => cash()) }).ok).toBe(true)
  })

  it.each([{}, 'options', null, [null], ['x']])('refuses options that are not a list of option objects: %j', (options) => {
    expect(check({ ...example, options }).ok).toBe(false)
  })

  it.each<[keyof CarDecisionInputs, unknown]>([
    ['horizonMonths', '48'],
    ['horizonMonths', 2.5],
    ['horizonMonths', null],
    ['valueCase', 'middle'],
    ['savingsReturn', 4],
    ['savingsReturn', '4%'],
    ['generalIncrease', '03'],
    ['generalIncrease', '3.125'],
  ])('refuses a bad shared %s (%j), naming it', (field, value) => {
    const errors = errorsOf({ ...example, [field]: value })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(SHARED_LABELS[field as keyof typeof SHARED_LABELS])
  })

  it.each<[keyof OptionInputs, unknown]>([
    ['name', 5],
    ['name', 'a\u0000b'],
    ['name', '  padded  '],
    ['acquisition', 'lease'],
    ['value', '18000'],
    ['value', 1.5],
    ['endLow', -1],
    ['annualMileage', 1.5],
    ['fuelMode', 'diesel'],
    ['milesPerGallon', 45],
    ['milesPerGallon', '45.50'],
    ['pencePerLitre', '1.234'],
    ['homeShare', '80%'],
    ['fuelPriceChange', 2],
    ['insurance', '550'],
    ['term', '48'],
    ['pricing', 'flat'],
    ['rate', '7.90'],
    ['basis', 'weekly'],
    ['arrangementFeeTiming', 'end'],
    ['pcpEnd', 'sell'],
    ['excessPerMile', 0.5],
  ])('refuses a bad %s (%j) in an option, naming the option and the field', (field, value) => {
    const errors = errorsOf(withOption({ [field]: value }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Option 1')
    expect(errors[0]).toContain(FIELD_LABELS[field])
  })

  it('refuses a missing option field', () => {
    const { term: _drop, ...option } = loan()
    expect(errorsOf({ ...example, options: [option] })).toEqual([expect.stringContaining(FIELD_LABELS.term)])
  })

  it('accepts every required amount and rate empty (null)', () => {
    expect(check({ ...example, savingsReturn: null, generalIncrease: null, options: [blank('pcp')] }).ok).toBe(true)
  })

  it.each(OPTIONAL_FIELDS)('refuses an empty (null) %s: from inputs version 2 an optional cost or fee is stored as 0', (field) => {
    const errors = errorsOf(withOption({ [field]: null }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(FIELD_LABELS[field])
  })

  it('names every bad field, one error each', () => {
    const errors = errorsOf({
      ...example,
      horizonMonths: 0,
      options: [
        { ...loan(), value: -1, rate: 'x' },
        { ...cash(), term: 0 },
      ],
    })
    expect(errors).toHaveLength(4)
    expect(errors[1]).toContain('Option 1')
    expect(errors[3]).toContain('Option 2')
  })

  describe('limits from inputLimits.ts, at and beyond each bound', () => {
    const ok = (patch: Record<string, unknown>) => check(withOption(patch)).ok

    it('horizon: one month to the most', () => {
      expect(check({ ...example, horizonMonths: 1 }).ok).toBe(true)
      expect(check({ ...example, horizonMonths: MAX_HORIZON_MONTHS }).ok).toBe(true)
      expect(check({ ...example, horizonMonths: 0 }).ok).toBe(false)
      expect(check({ ...example, horizonMonths: MAX_HORIZON_MONTHS + 1 }).ok).toBe(false)
    })

    it('savings return: nothing to the most', () => {
      expect(check({ ...example, savingsReturn: '0' }).ok).toBe(true)
      expect(check({ ...example, savingsReturn: pct(MAX_SAVINGS_RETURN) }).ok).toBe(true)
      expect(check({ ...example, savingsReturn: '-0.01' }).ok).toBe(false)
      expect(check({ ...example, savingsReturn: pct(pastPct(MAX_SAVINGS_RETURN, 1)) }).ok).toBe(false)
    })

    it('general increase and the fuel price change: within plus or minus the bound', () => {
      for (const r of [negate(PRICE_CHANGE_BOUND), PRICE_CHANGE_BOUND]) {
        expect(check({ ...example, generalIncrease: pct(r) }).ok).toBe(true)
        expect(ok({ fuelPriceChange: pct(r) })).toBe(true)
      }
      for (const r of [pastPct(negate(PRICE_CHANGE_BOUND), -1), pastPct(PRICE_CHANGE_BOUND, 1)]) {
        expect(check({ ...example, generalIncrease: pct(r) }).ok).toBe(false)
        expect(ok({ fuelPriceChange: pct(r) })).toBe(false)
      }
    })

    it.each([
      'value',
      'endLow',
      'endExpected',
      'endHigh',
      'insurance',
      'maintenance',
      'ved',
      'other',
      'loanAmount',
      'deposit',
      'payment',
      'arrangementFee',
      'balloon',
      'optionFee',
      'finalPayment',
      'purchaseFee',
    ])('%s: nothing to the input limit', (field) => {
      expect(ok({ [field]: 0 })).toBe(true)
      expect(ok({ [field]: MAX_INPUT_AMOUNT })).toBe(true)
      expect(ok({ [field]: -1 })).toBe(false)
      expect(ok({ [field]: MAX_INPUT_AMOUNT + 1 })).toBe(false)
    })

    it.each<[keyof OptionInputs, number, number]>([
      ['annualMileage', 0, MAX_ANNUAL_MILEAGE],
      ['mileageAllowance', 0, MAX_ANNUAL_MILEAGE],
      ['term', 1, MAX_FINANCE_TERM_MONTHS],
      ['excessPerMile', 0, toPence(MAX_EXCESS_PER_MILE)],
    ])('%s: whole, from %i to the most', (field, least, most) => {
      expect(ok({ [field]: least })).toBe(true)
      expect(ok({ [field]: most })).toBe(true)
      expect(ok({ [field]: least - 1 })).toBe(false)
      expect(ok({ [field]: most + 1 })).toBe(false)
    })

    it.each<[keyof OptionInputs, Ratio]>([
      ['milesPerGallon', MAX_MILES_PER_GALLON],
      ['milesPerKwh', MAX_MILES_PER_KWH],
    ])('%s: above nothing to the most', (field, most) => {
      expect(ok({ [field]: '0.01' })).toBe(true)
      expect(ok({ [field]: dec(most) })).toBe(true)
      expect(ok({ [field]: '0' })).toBe(false)
      expect(ok({ [field]: dec(pastDec(most, 1)) })).toBe(false)
    })

    it.each(['pencePerLitre', 'homePencePerKwh', 'publicPencePerKwh', 'pencePerMile'])('%s: nothing to the most pence', (field) => {
      expect(ok({ [field]: '0' })).toBe(true)
      expect(ok({ [field]: dec(MAX_PENCE_PER_UNIT) })).toBe(true)
      expect(ok({ [field]: '-0.01' })).toBe(false)
      expect(ok({ [field]: dec(pastDec(MAX_PENCE_PER_UNIT, 1)) })).toBe(false)
    })

    it('home share: none to all; rate: nothing to the most', () => {
      expect(ok({ homeShare: '0' })).toBe(true)
      expect(ok({ homeShare: '100' })).toBe(true)
      expect(ok({ homeShare: '100.01' })).toBe(false)
      expect(ok({ rate: '0' })).toBe(true)
      expect(ok({ rate: pct(MAX_FINANCE_RATE) })).toBe(true)
      expect(ok({ rate: pct(pastPct(MAX_FINANCE_RATE, 1)) })).toBe(false)
    })

    it('a name: up to the longest item name, as tidy text', () => {
      expect(ok({ name: '' })).toBe(true)
      expect(ok({ name: 'x'.repeat(MAX_ITEM_NAME_LENGTH) })).toBe(true)
      expect(ok({ name: 'x'.repeat(MAX_ITEM_NAME_LENGTH + 1) })).toBe(false)
    })
  })
})

describe('migrateInputs', () => {
  const v1 = (options: V1Inputs['options'], patch: Partial<V1Inputs> = {}): V1Inputs => ({ ...example, options, ...patch })

  it('the optional costs and fees are the cost and fee boxes, nothing required', () => {
    expect(OPTIONAL_FIELDS).toEqual([
      'insurance',
      'maintenance',
      'ved',
      'other',
      'deposit',
      'arrangementFee',
      'balloon',
      'optionFee',
      'purchaseFee',
      'excessPerMile',
    ])
  })

  it('from version 1: an empty optional cost or fee becomes 0; every other field is kept as it was', () => {
    const old = v1([blankV1('pcp'), { ...blankV1('cash'), name: 'Named', value: fromPounds(5_000), endLow: null }])
    const migrated = carDecisionCalculator.migrateInputs(1, old)
    expect(migrated).toEqual({ ...example, options: [blank('pcp'), { ...blank('cash'), name: 'Named', value: fromPounds(5_000) }] })
    expect(check(migrated).ok).toBe(true)
  })

  it('a complete version 1 scenario migrates to the same inputs, so every figure is identical', () => {
    const old = v1([keep(), loan(), hp(), pcp()], { valueCase: 'low' })
    const migrated = carDecisionCalculator.migrateInputs(1, old)
    expect(migrated).toEqual(old)
    const read = CALCULATORS.readInputs('car-decision', 1, old)
    expect(read).toMatchObject({ ok: true })
    expect(read.ok && calculate(read.inputs as CarDecisionInputs)).toEqual(calculate(old as CarDecisionInputs))
  })

  it('a version 1 option with an optional fee left empty is costed after migration as with 0 entered', () => {
    const old = v1([{ ...cash(), insurance: null, other: null }])
    const read = CALCULATORS.readInputs('car-decision', 1, old)
    if (!read.ok) throw new Error(read.message)
    expect(calculate(read.inputs as CarDecisionInputs)).toEqual(
      calculate(inputs([{ ...cash(), insurance: fromPounds(0), other: fromPounds(0) }])),
    )
  })

  it('leaves what it can’t read for validation to refuse, and has nothing to migrate from other versions', () => {
    for (const raw of [null, 'x', { ...example, options: 'none' }, { ...example, options: [null] }]) {
      expect(check(carDecisionCalculator.migrateInputs(1, raw)).ok).toBe(false)
    }
    for (const from of [0, 2, 3]) expect(() => carDecisionCalculator.migrateInputs(from, example)).toThrow()
  })

  it('inputs from a newer version are refused, not guessed', () => {
    expect(CALCULATORS.readInputs('car-decision', 3, example)).toMatchObject({ ok: false, reason: 'newer-inputs' })
  })
})

describe('missingFields', () => {
  it('a blank option needs the car and its fuel figures; optional running costs read as 0; cash adds nothing', () => {
    expect(missingFields(blank('cash'))).toEqual([
      'value',
      'endLow',
      'endExpected',
      'endHigh',
      'annualMileage',
      'milesPerGallon',
      'pencePerLitre',
      'fuelPriceChange',
    ])
  })

  it('follows the fuel mode and the pricing', () => {
    expect(missingFields({ ...cash(), fuelMode: 'electric', milesPerGallon: null })).toEqual([
      'milesPerKwh',
      'homeShare',
      'homePencePerKwh',
      'publicPencePerKwh',
    ])
    expect(missingFields({ ...cash(), fuelMode: 'per-mile' })).toEqual(['pencePerMile'])
    expect(missingFields({ ...loan(), rate: null })).toEqual(['rate'])
    expect(missingFields({ ...loan(), rate: null, pricing: 'payment' })).toEqual(['payment'])
  })

  it('finance fields by kind', () => {
    const finance = (kind: OptionInputs['acquisition']) => missingFields({ ...cash(), acquisition: kind })
    expect(finance('keep')).toEqual([])
    expect(finance('loan')).toEqual(['loanAmount', 'term', 'rate'])
    expect(finance('hire-purchase')).toEqual(['term', 'rate'])
    expect(finance('pcp')).toEqual(['term', 'rate', 'finalPayment', 'mileageAllowance'])
  })
})

describe('toEngineOption', () => {
  const increase = percentRatio('3')

  it('maps the car: amounts as they are, rates and decimals as exact Ratios, the shared increase', () => {
    const o = toEngineOption(cash(), increase)
    expect(o).toEqual({
      car: {
        value: fromPounds(18_000),
        horizonValue: { low: fromPounds(8_000), expected: fromPounds(9_500), high: fromPounds(11_000) },
        annualMileage: 8_000,
        fuel: { kind: 'fuel', milesPerGallon: decimalRatio('45.5'), pencePerLitre: decimalRatio('149.9') },
        fuelPriceChange: percentRatio('2'),
        running: { insurance: fromPounds(550), maintenance: fromPounds(400), ved: fromPounds(190), other: fromPounds(60) },
        generalIncrease: increase,
      },
      acquisition: { kind: 'cash' },
    })
  })

  it('maps electric and per-mile fuel', () => {
    expect(toEngineOption(electric(), increase).car.fuel).toEqual({
      kind: 'electric',
      milesPerKwh: decimalRatio('3.6'),
      homeShare: percentRatio('80'),
      homePencePerKwh: decimalRatio('7.5'),
      publicPencePerKwh: decimalRatio('65'),
    })
    expect(toEngineOption(perMile(), increase).car.fuel).toEqual({ kind: 'per-mile', pencePerMile: decimalRatio('12.4') })
  })

  it('maps a loan, HP and a PCP; a PCP’s yearly allowance becomes whole miles over the term, as the expected mileage is', () => {
    expect(toEngineOption(loan(), increase).acquisition).toEqual({
      kind: 'loan',
      finance: {
        amount: fromPounds(15_000),
        term: 48,
        pricing: { kind: 'rate', rate: percentRatio('7.9'), basis: 'annual' },
        arrangementFee: fromPounds(0),
        arrangementFeeTiming: 'start',
      },
    })
    expect(toEngineOption(hp({ pricing: 'payment', payment: fromPounds(380) }), increase).acquisition).toEqual({
      kind: 'hire-purchase',
      finance: {
        deposit: fromPounds(2_000),
        term: 48,
        pricing: { kind: 'payment', payment: fromPounds(380) },
        arrangementFee: fromPounds(0),
        arrangementFeeTiming: 'start',
        balloon: fromPounds(0),
        optionFee: fromPounds(0),
      },
    })
    const term = 37
    const allowance = 10_001
    const mapped = toEngineOption(pcp({ term, mileageAllowance: allowance, pcpEnd: 'hand-back' }), increase).acquisition
    expect(mapped).toMatchObject({
      kind: 'pcp',
      end: 'hand-back',
      finance: {
        deposit: fromPounds(2_000),
        finalPayment: fromPounds(8_500),
        purchaseFee: fromPounds(10),
        excessPerMile: fromPence(8),
        mileageAllowance: Number(divideRound(BigInt(allowance * term), BigInt(MONTHS_PER_YEAR), 'nearest')),
      },
    })
  })
})

describe('calculate', () => {
  const engineOf = (i: CarDecisionInputs) =>
    compareOptions(
      i.options.map((o) => toEngineOption(o, percentRatio(i.generalIncrease!))),
      { horizonMonths: i.horizonMonths, savingsReturn: percentRatio(i.savingsReturn!) },
    )

  it('runs the engine’s comparison on complete options', () => {
    const outcome = calculate(example)
    const engine = engineOf(example)
    expect(outcome.kind).toBe('ok')
    expect(outcome.kind === 'ok' && outcome.comparison).toEqual(engine.ok && engine.result)
    expect(outcome.kind === 'ok' && outcome.statuses.map((s) => s.kind)).toEqual(['ok', 'ok'])
  })

  it('waits for the shared assumptions, naming them', () => {
    expect(calculate({ ...example, savingsReturn: null })).toEqual({ kind: 'missing-shared', missing: ['savingsReturn'] })
    expect(calculate({ ...example, savingsReturn: null, generalIncrease: null })).toEqual({
      kind: 'missing-shared',
      missing: ['savingsReturn', 'generalIncrease'],
    })
  })

  it('an incomplete option is listed as missing; the others are still compared without it', () => {
    const partial = inputs([keep(), blank('cash'), loan()])
    const outcome = calculate(partial)
    if (outcome.kind !== 'ok') throw new Error(outcome.kind)
    expect(outcome.statuses[1]).toEqual({ kind: 'missing', missing: missingFields(blank('cash')) })
    const engine = engineOf(inputs([keep(), loan()]))
    expect(outcome.comparison).toEqual(engine.ok && engine.result)
    expect(outcome.statuses[2]).toMatchObject({ kind: 'ok', engineIndex: 1 })
  })

  it('an option the engine refuses carries its own refusal, by field; the others are still compared', () => {
    const refused = inputs([keep(), hp({ deposit: fromPounds(18_000) }), cash()])
    const outcome = calculate(refused)
    if (outcome.kind !== 'ok') throw new Error(outcome.kind)
    const status = outcome.statuses[1]!
    expect(status.kind).toBe('refused')
    expect(status.kind === 'refused' && status.refusal.problems).toEqual([
      { field: 'deposit', label: FIELD_LABELS.deposit, message: expect.any(String) },
    ])
    expect(outcome.statuses.map((s) => s.kind)).toEqual(['ok', 'refused', 'ok'])
    const engine = engineOf(inputs([keep(), cash()]))
    expect(outcome.comparison).toEqual(engine.ok && engine.result)
  })

  it('an end value above the most for its price is the engine’s refusal on that option', () => {
    const outcome = calculate(inputs([cash({ endHigh: fromPounds(30_000) })]))
    if (outcome.kind !== 'ok') throw new Error(outcome.kind)
    expect(outcome.statuses[0]).toMatchObject({ kind: 'refused', refusal: { problems: [{ field: 'horizonValue' }] } })
    expect(outcome.comparison).toBeNull()
  })

  it('no option complete: nothing compared', () => {
    const outcome = calculate(inputs([blank('keep'), blank('cash')]))
    expect(outcome.kind === 'ok' && outcome.comparison).toBeNull()
  })
})

describe('optionName', () => {
  it('is the name, or the option’s number when it has none', () => {
    expect(optionName(cash({ name: 'Blue hatchback' }), 0)).toBe('Blue hatchback')
    expect(optionName(cash({ name: '' }), 2)).toBe('Option 3')
  })
})

describe('summarise (compare)', () => {
  const engine = () => {
    const outcome = compareOptions(
      example.options.map((o) => toEngineOption(o, percentRatio('3'))),
      { horizonMonths: 48, savingsReturn: percentRatio('4') },
    )
    if (!outcome.ok) throw new Error('refused')
    return outcome.result
  }

  it('lists the shared inputs and each option by name', () => {
    expect(carDecisionCalculator.summarise(example, taxYear).inputs.map((r) => r.label)).toEqual([
      'Horizon (months)',
      'End-value case',
      'Savings return (after tax, a year)',
      'Yearly increase in running costs',
      'Keep the old car',
      'Personal loan',
    ])
  })

  it('gives, per option by name, average cost per month owned, total net cost, coverage and equity at the horizon, in the case selected', () => {
    const result = engine()
    const summary = carDecisionCalculator.summarise({ ...example, valueCase: 'low' }, taxYear)
    const rows = summary.results.ok ? summary.results.rows : []
    expect(rows[0]).toEqual({ label: 'End-value case', value: { kind: 'text', text: 'Low' } })
    const keepLow = result.options[0]!.cases.low
    expect(rows.slice(1, 5)).toEqual([
      { label: 'Keep the old car: average cost per month owned', value: { kind: 'money', amount: keepLow.netCostPerCoverageMonth } },
      { label: 'Keep the old car: total net cost', value: { kind: 'money', amount: keepLow.netCost } },
      { label: 'Keep the old car: coverage', value: { kind: 'text', text: '48 of 48 months' } },
      { label: 'Keep the old car: equity at the horizon', value: { kind: 'money', amount: keepLow.months.at(-1)!.equity } },
    ])
    expect(rows).toHaveLength(9)
  })

  it('an option without results says so in its rows; same names get numbered', () => {
    const summary = carDecisionCalculator.summarise(inputs([cash({ name: 'Car' }), blank('cash'), cash({ name: 'Car' })]), taxYear)
    const labels = summary.results.ok ? summary.results.rows.map((r) => r.label) : []
    expect(labels).toContain('Option 2: average cost per month owned')
    expect(labels).toContain('Car (option 3): total net cost')
    const row = summary.results.ok && summary.results.rows.find((r) => r.label === 'Option 2: average cost per month owned')
    expect(row ? row.value : undefined).toEqual({ kind: 'text', text: 'No results: inputs missing' })
  })

  it('missing shared assumptions are an input refusal naming them', () => {
    const { results } = carDecisionCalculator.summarise({ ...example, savingsReturn: null }, taxYear)
    expect(results.ok).toBe(false)
    expect(!results.ok && 'kind' in results && results.problems.map((p) => p.label)).toEqual([SHARED_LABELS.savingsReturn])
  })

  it('does not read the tax config it is given', () => {
    expect(carDecisionCalculator.summarise(example, undefined as never)).toEqual(carDecisionCalculator.summarise(example, taxYear))
  })
})
