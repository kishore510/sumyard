import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { MAX_BUDGET_LINES, MAX_INPUT_AMOUNT, MAX_ITEM_NAME_LENGTH } from '@/lib/inputLimits'
import { fromPence, fromPounds, ratio, toPence, ZERO } from '@/lib/money'
import { readScenario } from '@/scenarios/scenario'
import { CALCULATORS } from '../index'
import { scenarioTaxYear } from '../session'
import { budget } from './calc'
import {
  type BudgetPageInputs,
  budgetCalculator,
  calculate,
  DEFAULT_LINES,
  inputRefusal,
  sectionSet,
  toEngineInputs,
  withWhatIf,
} from './definition'

/*
 * The household budget's registry entry. Inputs from storage or an imported
 * file are untrusted, so validateInputs checks every field and builds a
 * fresh object. Amounts are made up.
 */

const defaults = () => budgetCalculator.defaultInputs()
const check = (raw: unknown) => budgetCalculator.validateInputs(raw)
const errorsOf = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? [] : result.errors
}

const example: BudgetPageInputs = {
  pay: fromPounds(2_500),
  payPeriod: 'monthly',
  income: [{ name: 'Rent from lodger', amount: fromPounds(300), period: 'monthly' }],
  outgoings: [
    { name: 'Groceries', amount: fromPounds(400), period: 'monthly', kind: 'spending' },
    { name: 'Joint account', amount: fromPounds(700), period: 'monthly', kind: 'joint' },
    { name: 'Credit card payment', amount: fromPounds(200), period: 'monthly', kind: 'debt' },
    { name: 'Stocks and shares ISA', amount: fromPounds(250), period: 'monthly', kind: 'savings' },
  ],
}

describe('registration', () => {
  it('is registered as budget, inputs version 1, with no tax rules', () => {
    expect(CALCULATORS.get('budget')).toBe(budgetCalculator)
    expect(budgetCalculator.inputsVersion).toBe(1)
    expect(budgetCalculator.taxRules).toBe('none')
    expect(budgetCalculator.name).toBe('Household budget')
  })

  it('a scenario carries no tax year, whatever the session holds', () => {
    expect(scenarioTaxYear(budgetCalculator, { taxYear: '2026-27' })).toBeUndefined()
    const raw = {
      id: 'b1',
      calculatorId: 'budget',
      name: 'Mine',
      inputs: example,
      inputsVersion: 1,
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    }
    const read = readScenario(raw, CALCULATORS)
    expect(read.ok && Object.hasOwn(read.scenario, 'taxYear')).toBe(false)
    expect(read.ok && read.scenario.inputs).toEqual(example)
    expect(readScenario({ ...raw, taxYear: '2026-27' }, CALCULATORS)).toMatchObject({ ok: false })
  })

  it('a migration has nothing to migrate from', () => {
    expect(() => budgetCalculator.migrateInputs(0, {})).toThrow()
  })
})

describe('defaults', () => {
  it('are valid: no pay, a month, no extra income, and the named template lines, all blank', () => {
    const d = defaults()
    expect(check(d)).toEqual({ ok: true, inputs: d })
    expect(d.pay).toBe(ZERO)
    expect(d.payPeriod).toBe('monthly')
    expect(d.income).toEqual([])
    expect(d.outgoings).toEqual(DEFAULT_LINES)
    expect(d.outgoings.map((l) => [l.name, l.kind, l.period])).toEqual([
      ['Groceries', 'spending', 'monthly'],
      ['Car insurance', 'spending', 'annual'],
      ['Mobile', 'spending', 'monthly'],
      ['Other spending', 'spending', 'monthly'],
      ['Joint account', 'joint', 'monthly'],
      ['Credit card payment', 'debt', 'monthly'],
      ['Cash savings', 'savings', 'monthly'],
      ['Stocks and shares ISA', 'savings', 'monthly'],
      ['Fixed saver', 'savings', 'monthly'],
    ])
    for (const l of d.outgoings) expect(l.amount).toBe(ZERO)
  })

  it('a fresh copy each time', () => {
    expect(defaults()).not.toBe(defaults())
    expect(defaults().outgoings).not.toBe(defaults().outgoings)
  })

  it('no section is set on a fresh page; one with an amount, an added or renamed line is', () => {
    const d = defaults()
    for (const id of ['income', 'spending', 'joint', 'debt', 'savings'] as const) expect(sectionSet(id, d)).toBe(false)
    expect(sectionSet('income', example)).toBe(true)
    expect(sectionSet('debt', example)).toBe(true)
    const renamed = { ...d, outgoings: d.outgoings.map((l, i) => (i === 4 ? { ...l, name: 'House account' } : l)) }
    expect(sectionSet('joint', renamed)).toBe(true)
    expect(sectionSet('spending', renamed)).toBe(false)
  })
})

describe('validateInputs', () => {
  it('accepts valid inputs and builds a fresh object', () => {
    const result = check(example)
    expect(result).toEqual({ ok: true, inputs: example })
    expect(result.ok && result.inputs).not.toBe(example)
    expect(result.ok && result.inputs.outgoings[0]).not.toBe(example.outgoings[0])
  })

  it('drops unknown fields', () => {
    const result = check({ ...example, extra: 1, outgoings: [{ ...example.outgoings[0], note: 'x' }] })
    expect(result.ok && result.inputs).toEqual({ ...example, outgoings: [example.outgoings[0]] })
  })

  it('tidies a name and cuts it to the longest a name may be', () => {
    const long = 'a'.repeat(MAX_ITEM_NAME_LENGTH + 5)
    const result = check({ ...example, income: [{ ...example.income[0], name: `  ${long}` }] })
    expect(result.ok && result.inputs.income[0]!.name).toBe('a'.repeat(MAX_ITEM_NAME_LENGTH))
  })

  it.each([
    ['not an object', null],
    ['an array', []],
    ['a string', 'budget'],
  ])('refuses %s', (_, raw) => {
    expect(check(raw).ok).toBe(false)
  })

  it('refuses hostile keys', () => {
    const hostile = JSON.parse(
      `{"pay":0,"payPeriod":"monthly","income":[],"outgoings":[{"__proto__":{"x":1},"name":"a","amount":0,"period":"monthly","kind":"spending"}]}`,
    )
    expect(errorsOf(hostile).join(' ')).toMatch(/not safe/)
    expect(check({ ...example, constructor: 1 }).ok).toBe(false)
  })

  it.each([
    ['a negative pay', { pay: -1 }, /Your pay/],
    ['pay past the input limit', { pay: toPence(MAX_INPUT_AMOUNT) + 1 }, /Your pay/],
    ['pay in pounds and pence as a decimal', { pay: 1.5 }, /Your pay/],
    ['a weekly pay', { payPeriod: 'weekly' }, /month or a year/],
    ['income that is not a list', { income: {} }, /Extra income/],
    ['outgoings that are not a list', { outgoings: 'x' }, /Outgoings/],
  ])('refuses %s', (_, patch, message) => {
    expect(errorsOf({ ...example, ...patch }).join(' ')).toMatch(message)
  })

  it.each([
    ['a negative amount', { amount: -1 }],
    ['an amount past the limit', { amount: toPence(MAX_INPUT_AMOUNT) + 1 }],
    ['an amount as text', { amount: '5' }],
    ['no name', { name: undefined }],
    ['a name that is not text', { name: 5 }],
    ['a daily period', { period: 'daily' }],
    ['an unknown kind', { kind: 'treats' }],
    ['no kind', { kind: undefined }],
    ['a line that is not an object', null],
  ])('refuses an outgoing line with %s', (_, patch) => {
    const line = patch === null ? null : { ...example.outgoings[0], ...patch }
    expect(errorsOf({ ...example, outgoings: [line] }).join(' ')).toMatch(/line 1/)
  })

  it('refuses more lines than a list holds (MAX_BUDGET_LINES)', () => {
    const line = example.outgoings[0]!
    expect(check({ ...example, outgoings: Array.from({ length: MAX_BUDGET_LINES }, () => line) }).ok).toBe(true)
    expect(errorsOf({ ...example, outgoings: Array.from({ length: MAX_BUDGET_LINES + 1 }, () => line) }).join(' ')).toMatch(/at most/)
    expect(errorsOf({ ...example, income: Array.from({ length: MAX_BUDGET_LINES + 1 }, () => example.income[0]) }).join(' ')).toMatch(
      /at most/,
    )
  })
})

describe('the engine mapping', () => {
  it('puts Your pay first among the income lines', () => {
    const engine = toEngineInputs(example)
    expect(engine.income[0]).toEqual({ name: 'Your pay', amount: example.pay, period: 'monthly' })
    expect(engine.income.slice(1)).toEqual(example.income)
    expect(engine.outgoings).toEqual(example.outgoings)
    expect(calculate(example)).toEqual(budget(engine))
  })

  it('a yearly pay is a yearly line', () => {
    const r = calculate({ ...example, payPeriod: 'annual', income: [] })
    expect(r.ok && r.result.income.year).toBe(example.pay)
  })

  it('an engine refusal reads by field, with no figures', () => {
    const refusal = inputRefusal([
      { field: 'outgoings', index: 2, reason: 'above-maximum' },
      { field: 'result', reason: 'too-large' },
    ])
    expect(refusal.kind).toBe('inputs')
    expect(refusal.problems.map((x) => x.label)).toEqual(['Outgoings, line 3', 'Result'])
    for (const x of refusal.problems) expect(x.message).not.toMatch(/\d/)
  })
})

describe('what-ifs (BD7)', () => {
  it('replace the amounts named and nothing else', () => {
    const next = withWhatIf(example, { pay: fromPounds(2_600), outgoings: new Map([[1, fromPounds(600)]]), income: new Map() })
    expect(next.pay).toBe(fromPounds(2_600))
    expect(next.outgoings[1]).toEqual({ ...example.outgoings[1], amount: fromPounds(600) })
    expect(next.outgoings[0]).toBe(example.outgoings[0])
    expect(next.income).toEqual(example.income)
    expect(example.pay).toBe(fromPounds(2_500))
  })

  it('ignore a line that is no longer there', () => {
    const next = withWhatIf(example, { outgoings: new Map([[99, fromPounds(1)]]), income: new Map() })
    expect(next).toEqual(example)
  })
})

describe('summarise (compare)', () => {
  it('gives the inputs and the year’s results as rows', () => {
    const summary = budgetCalculator.summarise(example, taxYear)
    expect(summary.inputs.map((r) => r.label)).toEqual(['Your pay', 'Pay entered', 'Extra income lines', 'Outgoing lines'])
    expect(summary.results.ok).toBe(true)
    if (!summary.results.ok) return
    expect(summary.results.rows.map((r) => r.label)).toEqual([
      'Income a year',
      'Outgoings a year',
      'Left over a year',
      'Spending a year',
      'Joint account a year',
      'Debt payments a year',
      'Savings and investing a year',
      'Savings rate',
    ])
    const income = toPence(fromPounds(2_800 * 12))
    expect(summary.results.rows[2]!.value).toEqual({ kind: 'money', amount: fromPence(income - toPence(fromPounds(1_550 * 12))) })
    expect(summary.results.rows[7]!.value).toEqual({ kind: 'ratio', ratio: ratio(toPence(fromPounds(250 * 12)), income) })
  })

  it('a savings rate with no income is n/a', () => {
    const summary = budgetCalculator.summarise(defaults(), taxYear)
    expect(summary.results.ok && summary.results.rows.at(-1)!.value).toEqual({ kind: 'text', text: 'n/a' })
  })
})
