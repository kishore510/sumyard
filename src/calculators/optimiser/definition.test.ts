import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { add, fromPence, fromPounds, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { CALCULATORS } from '../index'
import { takeHome } from './calc'
import {
  calculateTakeHome,
  INPUT_LIMITS,
  inputWarnings,
  MIGRATED_ITEM_NAMES,
  type OptimiserPageInputs,
  optimiserCalculator,
  resolveInputs,
  toTaxInputs,
} from './definition'
import type { ContributionEntry, ListItem } from './pageInputs'
import { DEFAULT_POLICY, type TakeHomeResult } from './types'

/*
 * Session 1b-i: the optimiser page's registry entry (definition.ts). Inputs
 * are untrusted when they come from storage or an imported file, so
 * validateInputs checks every field and builds a fresh object.
 */

const defaults = () => optimiserCalculator.defaultInputs()
const valid = (patch: Partial<Record<keyof OptimiserPageInputs, unknown>> = {}) => ({ ...defaults(), ...patch })
const check = (raw: unknown) => optimiserCalculator.validateInputs(raw)
const amount = (pence: number): ContributionEntry => ({ mode: 'amount', amount: fromPence(pence), percentOfPay: '0' })
const byPercent = (percentOfPay: string): ContributionEntry => ({ mode: 'percentOfPay', amount: ZERO, percentOfPay })
const yearly = (pence: number, name = 'Item'): ListItem => ({ name, amount: fromPence(pence), period: 'year' })
const monthly = (pence: number, name = 'Item'): ListItem => ({ name, amount: fromPence(pence), period: 'month' })

/** A version 1 scenario's inputs, as 0.9.0 stored them. */
const version1 = (patch: Record<string, unknown> = {}) => ({
  region: 'rUK',
  salary: fromPounds(62_000),
  bonus: fromPounds(4_000),
  pensionMethod: 'netPay',
  employeeContribution: fromPounds(3_100),
  employerContribution: fromPounds(2_000),
  taxableBenefits: fromPounds(1_234),
  postTaxDeductions: fromPounds(321),
  studentLoans: ['plan2'],
  children: 2,
  childBenefit: 'claimed',
  ...patch,
})

/** The 0.9.0 mapping of version 1 inputs to the engine's, written out independently of definition.ts. */
const version1TaxInputs = (v1: ReturnType<typeof version1>) => ({
  grossPay: add(v1.salary as never, v1.bonus as never),
  region: v1.region as 'rUK',
  studentLoans: v1.studentLoans as ['plan2'],
  ...((v1.employeeContribution as number) > 0
    ? { pension: { method: v1.pensionMethod as 'netPay', contribution: fromPence(v1.employeeContribution as number) } }
    : {}),
  ...((v1.children as number) > 0 ? { childBenefit: { children: v1.children as number, payments: 'claimed' as const } } : {}),
  taxableBenefits: fromPence(v1.taxableBenefits as number),
  postTaxDeductions: fromPence(v1.postTaxDeductions as number),
})

const net = (result: ReturnType<typeof calculateTakeHome>) => {
  if (!result.ok) throw new Error('no result')
  return (result as TakeHomeResult).annual.net
}

/** Mulberry32: a small seeded generator for repeatable samples. */
function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('optimiser definition', () => {
  it('is registered as "optimiser" at inputs version 2, with no placeholder label', () => {
    expect(CALCULATORS.get('optimiser')).toBe(optimiserCalculator)
    expect(optimiserCalculator.inputsVersion).toBe(2)
    expect(optimiserCalculator.placeholder).toBeUndefined()
  })

  it('has valid defaults: rUK, every amount zero, contributions as amounts, pensionable pay the salary, empty lists', () => {
    const d = defaults()
    expect(check(d)).toEqual({ ok: true, inputs: d })
    expect(d).toMatchObject({
      region: 'rUK',
      salary: ZERO,
      bonus: ZERO,
      employeeContribution: amount(0),
      employerContribution: amount(0),
      pensionablePay: { own: false, amount: ZERO, includeBonus: false },
      taxableBenefits: [],
      postTaxDeductions: [],
      studentLoans: [],
      children: 0,
      childBenefit: 'claimed',
    })
  })

  it('takes the region from Settings for a fresh start', () => {
    expect(optimiserCalculator.applySettings!(defaults(), { region: 'scotland' }).region).toBe('scotland')
    expect(optimiserCalculator.applySettings!(defaults(), { region: 'ruk' }).region).toBe('rUK')
  })

  it('builds a fresh object from the known fields only', () => {
    const raw = { ...valid({ salary: fromPounds(40_000) }), extra: 'ignored' }
    const result = check(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inputs).not.toBe(raw)
    expect(result.inputs).not.toHaveProperty('extra')
    expect(result.inputs.studentLoans).not.toBe(raw.studentLoans)
  })

  it('builds fresh items and contributions, keeping only known fields and tidying names as text', () => {
    const raw = valid({
      employeeContribution: { ...byPercent('5'), extra: 1 },
      taxableBenefits: [{ ...yearly(100, '  Medical\u0007 cover  '), extra: 'x' }],
    })
    const result = check(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inputs.employeeContribution).toEqual(byPercent('5'))
    expect(result.inputs.employeeContribution).not.toBe(raw.employeeContribution)
    expect(result.inputs.taxableBenefits).toEqual([yearly(100, 'Medical cover')])
    expect(result.inputs.taxableBenefits[0]).not.toBe((raw.taxableBenefits as unknown[])[0])
  })

  it('accepts a name of exactly the longest length and the most items', () => {
    const name = 'n'.repeat(INPUT_LIMITS.maxNameLength)
    const items = Array.from({ length: INPUT_LIMITS.maxItems }, () => monthly(1, name))
    expect(check(valid({ taxableBenefits: items, postTaxDeductions: items })).ok).toBe(true)
  })

  it('rejects hostile keys inside items and contributions', () => {
    expect(check({ ...valid(), taxableBenefits: [JSON.parse('{"__proto__": {}, "name": "x", "amount": 1, "period": "year"}')] }).ok).toBe(
      false,
    )
    expect(
      check({ ...valid(), employerContribution: JSON.parse('{"constructor": 1, "mode": "amount", "amount": 0, "percentOfPay": "0"}') }).ok,
    ).toBe(false)
  })

  it('rejects hostile keys and shapes that are not objects', () => {
    expect(check(JSON.parse('{"__proto__": {"polluted": true}, "region": "rUK"}')).ok).toBe(false)
    expect(check({ ...valid(), constructor: {} }).ok).toBe(false)
    for (const raw of [null, undefined, 'text', 5, [], [defaults()]]) expect(check(raw).ok, JSON.stringify(raw)).toBe(false)
  })

  it.each([
    ['region', 'wales'],
    ['salary', -1],
    ['salary', 0.5],
    ['salary', '100'],
    ['bonus', add(INPUT_LIMITS.maxAmount, fromPence(1))],
    ['employeeContribution', 100],
    ['employeeContribution', { mode: 'amount', amount: -100, percentOfPay: '0' }],
    ['employeeContribution', { mode: 'gross', amount: 0, percentOfPay: '0' }],
    ['employeeContribution', { mode: 'percentOfPay', amount: 0, percentOfPay: '5.0' }],
    ['employeeContribution', { mode: 'percentOfPay', amount: 0, percentOfPay: '-5' }],
    ['employeeContribution', { mode: 'percentOfPay', amount: 0, percentOfPay: '1000.01' }],
    ['employeeContribution', { mode: 'percentOfPay', amount: 0, percentOfPay: 5 }],
    ['employerContribution', { mode: 'amount', amount: Number.NaN, percentOfPay: '0' }],
    ['employerContribution', { mode: 'amount', percentOfPay: '0' }],
    ['pensionablePay', { own: 'yes', amount: 0, includeBonus: false }],
    ['pensionablePay', { own: false, amount: -1, includeBonus: false }],
    ['pensionablePay', { own: false, amount: 0 }],
    ['taxableBenefits', -1],
    ['taxableBenefits', 100],
    ['taxableBenefits', [{ name: 'x', amount: -1, period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', amount: 1, period: 'week' }]],
    ['taxableBenefits', [{ name: 'n'.repeat(INPUT_LIMITS.maxNameLength + 1), amount: 1, period: 'year' }]],
    ['taxableBenefits', [{ name: 5, amount: 1, period: 'year' }]],
    ['taxableBenefits', [{ amount: 1, period: 'year' }]],
    ['taxableBenefits', ['item']],
    ['taxableBenefits', Array.from({ length: INPUT_LIMITS.maxItems + 1 }, () => ({ name: 'x', amount: 1, period: 'year' }))],
    ['postTaxDeductions', [{ name: 'x', amount: Number.POSITIVE_INFINITY, period: 'month' }]],
    ['postTaxDeductions', [{ name: 'x', amount: 0.5, period: 'month' }]],
    ['postTaxDeductions', Array.from({ length: INPUT_LIMITS.maxItems + 1 }, () => ({ name: 'x', amount: 1, period: 'year' }))],
    ['pensionMethod', 'gross'],
    ['studentLoans', ['plan3']],
    ['studentLoans', ['plan1', 'plan1']],
    ['studentLoans', 'plan1'],
    ['children', -1],
    ['children', 1.5],
    ['children', INPUT_LIMITS.maxChildren + 1],
    ['childBenefit', 'maybe'],
  ])('rejects %s = %j', (field, value) => {
    const result = check(valid({ [field]: value } as Partial<Record<keyof OptimiserPageInputs, unknown>>))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors.length).toBeGreaterThan(0)
  })

  it('rejects a missing field', () => {
    const { taxableBenefits: _dropped, ...rest } = defaults()
    expect(check(rest).ok).toBe(false)
    const { pensionablePay: _gone, ...without } = defaults()
    expect(check(without).ok).toBe(false)
  })

  it('refuses inputs saved by a newer version; reads version 2 as it is', () => {
    expect(CALCULATORS.readInputs('optimiser', 3, defaults())).toMatchObject({ ok: false, reason: 'newer-inputs' })
    expect(CALCULATORS.readInputs('optimiser', 2, defaults())).toMatchObject({ ok: true, migrated: false })
    expect(() => optimiserCalculator.migrateInputs(0, {})).toThrow()
  })

  it('a version 2 round trip through JSON gives the same inputs and the same take-home', () => {
    const inputs = valid({
      salary: fromPounds(58_000),
      bonus: fromPounds(3_000),
      employeeContribution: byPercent('6.25'),
      employerContribution: byPercent('3'),
      pensionablePay: { own: true, amount: fromPounds(55_000), includeBonus: true },
      taxableBenefits: [monthly(4_567, 'Medical'), yearly(80_000, 'Car')],
      postTaxDeductions: [monthly(1_299, 'Dental')],
    }) as OptimiserPageInputs
    const read = CALCULATORS.readInputs('optimiser', 2, JSON.parse(JSON.stringify(inputs)))
    expect(read).toEqual({ ok: true, inputs, migrated: false })
    expect(net(calculateTakeHome(read.ok ? (read.inputs as OptimiserPageInputs) : inputs, taxYear))).toBe(
      net(calculateTakeHome(inputs, taxYear)),
    )
  })
})

describe('migration from inputs version 1 (B9)', () => {
  it('turns each pension amount into amount mode and each non-zero amount into one item per year', () => {
    const read = CALCULATORS.readInputs('optimiser', 1, version1())
    expect(read).toMatchObject({ ok: true, migrated: true })
    if (!read.ok) return
    const inputs = read.inputs as OptimiserPageInputs
    expect(inputs.employeeContribution).toEqual(amount(fromPounds(3_100)))
    expect(inputs.employerContribution).toEqual(amount(fromPounds(2_000)))
    expect(inputs.pensionablePay).toEqual({ own: false, amount: ZERO, includeBonus: false })
    expect(inputs.taxableBenefits).toEqual([yearly(fromPounds(1_234), MIGRATED_ITEM_NAMES.taxableBenefits)])
    expect(inputs.postTaxDeductions).toEqual([yearly(fromPounds(321), MIGRATED_ITEM_NAMES.postTaxDeductions)])
    expect(MIGRATED_ITEM_NAMES).toEqual({ taxableBenefits: 'Benefits in kind', postTaxDeductions: 'Post-tax deductions' })
  })

  it('turns a zero amount into an empty list, so no warning appears', () => {
    const read = CALCULATORS.readInputs('optimiser', 1, version1({ taxableBenefits: 0, postTaxDeductions: 0 }))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const inputs = read.inputs as OptimiserPageInputs
    expect(inputs.taxableBenefits).toEqual([])
    expect(inputs.postTaxDeductions).toEqual([])
    expect(inputWarnings(inputs)).toEqual([])
  })

  it.each([
    ['the example', {}],
    [
      'no pension, benefits or children',
      { employeeContribution: 0, employerContribution: 0, taxableBenefits: 0, postTaxDeductions: 0, children: 0 },
    ],
    ['relief at source in Scotland', { region: 'scotland', pensionMethod: 'reliefAtSource', studentLoans: [] }],
    [
      'salary sacrifice over the taper start',
      { salary: fromPounds(120_000), pensionMethod: 'salarySacrifice', employeeContribution: fromPounds(9_000) },
    ],
    ['deductions above take-home', { salary: fromPounds(15_000), bonus: 0, postTaxDeductions: fromPounds(40_000) }],
  ])('gives identical take-home before and after: %s', (_, patch) => {
    const v1 = version1(patch)
    const before = takeHome(version1TaxInputs(v1), taxYear, DEFAULT_POLICY)
    const read = CALCULATORS.readInputs('optimiser', 1, v1)
    if (!read.ok) throw new Error(read.message)
    const after = calculateTakeHome(read.inputs as OptimiserPageInputs, taxYear)
    expect(after).toEqual(before)
  })

  it('gives identical results when the contribution is above pay (the same input problem)', () => {
    const read = CALCULATORS.readInputs(
      'optimiser',
      1,
      version1({ salary: fromPounds(1_000), bonus: 0, employeeContribution: fromPounds(2_000) }),
    )
    if (!read.ok) throw new Error(read.message)
    expect(calculateTakeHome(read.inputs as OptimiserPageInputs, taxYear)).toMatchObject({ ok: false, problem: expect.any(String) })
  })

  it('refuses hostile or broken version 1 inputs rather than migrating them', () => {
    expect(CALCULATORS.readInputs('optimiser', 1, JSON.parse('{"__proto__": {}, "region": "rUK"}'))).toMatchObject({ ok: false })
    expect(CALCULATORS.readInputs('optimiser', 1, 'text')).toMatchObject({ ok: false, reason: 'migration-failed' })
    expect(CALCULATORS.readInputs('optimiser', 1, version1({ taxableBenefits: -5 }))).toMatchObject({ ok: false, reason: 'invalid-inputs' })
    expect(CALCULATORS.readInputs('optimiser', 1, version1({ employeeContribution: '100' }))).toMatchObject({
      ok: false,
      reason: 'invalid-inputs',
    })
  })
})

describe('resolved amounts and warnings', () => {
  it('resolves a percentage of pensionable pay, the bonus switch, and list totals with monthly times the months in a year', () => {
    const inputs = valid({
      salary: fromPounds(50_000),
      bonus: fromPounds(10_000),
      employeeContribution: byPercent('5'),
      employerContribution: amount(fromPounds(1_000)),
      taxableBenefits: [monthly(fromPounds(50)), yearly(fromPounds(400))],
      postTaxDeductions: [],
    }) as OptimiserPageInputs
    expect(resolveInputs(inputs)).toEqual({
      pensionablePay: fromPounds(50_000),
      employeeContribution: fromPounds(2_500),
      employerContribution: fromPounds(1_000),
      taxableBenefits: fromPounds(50 * MONTHS_PER_YEAR + 400),
      postTaxDeductions: ZERO,
    })
    const withBonus = { ...inputs, pensionablePay: { ...inputs.pensionablePay, includeBonus: true } }
    expect(resolveInputs(withBonus).employeeContribution).toBe(fromPounds(3_000))
  })

  it('a resolved contribution above pay gives the existing input problem', () => {
    const inputs = valid({ salary: fromPounds(10_000), employeeContribution: byPercent('150') }) as OptimiserPageInputs
    expect(calculateTakeHome(inputs, taxYear)).toMatchObject({ ok: false, problem: expect.stringMatching(/pension/i) })
  })

  it('warns on a percentage above all of pensionable pay, for either contribution, and not at all of it', () => {
    const at = valid({ salary: fromPounds(10_000), employerContribution: byPercent('100') }) as OptimiserPageInputs
    expect(inputWarnings(at)).toEqual([])
    const over = valid({ salary: fromPounds(10_000), employeeContribution: byPercent('100.5'), employerContribution: byPercent('200') })
    expect(inputWarnings(over as OptimiserPageInputs).map((w) => [w.code, w.key])).toEqual([
      ['percentAboveAllOfPay', 'employeeContribution'],
      ['percentAboveAllOfPay', 'employerContribution'],
    ])
  })

  it('warns on an item with no amount, by name or place, in either list', () => {
    const inputs = valid({
      taxableBenefits: [yearly(100, 'Medical'), monthly(0, 'Gym')],
      postTaxDeductions: [yearly(0, '')],
    }) as OptimiserPageInputs
    const warnings = inputWarnings(inputs)
    expect(warnings.map((w) => w.code)).toEqual(['itemWithoutAmount', 'itemWithoutAmount'])
    expect(warnings[0]!.message).toContain('“Gym”')
    expect(warnings[1]!.message).toContain('“Deduction 1”')
    for (const w of warnings) expect(w.message).not.toMatch(/\d{2}|£/)
  })
})

describe('itemised lists against the single annual figure (B7)', () => {
  it('any mix of items with the same annual total gives the same take-home as the old single field', () => {
    const random = generator(2_026)
    for (let run = 0; run < 150; run++) {
      const total = (count: number) => {
        const items: ListItem[] = []
        let sum = 0
        for (let i = 0; i < count; i++) {
          const pence = Math.floor(random() * 300_000)
          const period = random() < 0.5 ? 'month' : 'year'
          items.push({ name: `Item ${i}`, amount: fromPence(pence), period })
          sum += period === 'month' ? pence * MONTHS_PER_YEAR : pence
        }
        return { items, sum }
      }
      const benefits = total(Math.floor(random() * (INPUT_LIMITS.maxItems + 1)))
      const deductions = total(Math.floor(random() * (INPUT_LIMITS.maxItems + 1)))
      const v1 = version1({
        salary: fromPence(Math.floor(random() * 25_000_000)),
        bonus: fromPence(Math.floor(random() * 2_000_000)),
        employeeContribution: 0,
        taxableBenefits: benefits.sum,
        postTaxDeductions: deductions.sum,
      })
      const read = CALCULATORS.readInputs('optimiser', 1, v1)
      if (!read.ok) throw new Error(read.message)
      const single = read.inputs as OptimiserPageInputs
      const itemised = { ...single, taxableBenefits: benefits.items, postTaxDeductions: deductions.items }
      expect(check(itemised).ok).toBe(true)
      expect(calculateTakeHome(itemised, taxYear), `run ${run}`).toEqual(calculateTakeHome(single, taxYear))
    }
  })

  it('maps page inputs to the engine’s: salary plus bonus, a pension only with a contribution, Child Benefit only with children', () => {
    const inputs = valid({
      salary: fromPounds(50_000),
      bonus: fromPounds(5_000),
      pensionMethod: 'netPay',
      employeeContribution: amount(fromPounds(3_000)),
      taxableBenefits: [monthly(fromPounds(100))],
      postTaxDeductions: [yearly(fromPounds(100)), yearly(fromPounds(200))],
      studentLoans: ['plan2'],
      children: 2,
      childBenefit: 'optedOut',
    }) as OptimiserPageInputs
    expect(toTaxInputs(inputs)).toEqual({
      grossPay: fromPounds(55_000),
      region: 'rUK',
      studentLoans: ['plan2'],
      pension: { method: 'netPay', contribution: fromPounds(3_000) },
      childBenefit: { children: 2, payments: 'optedOut' },
      taxableBenefits: fromPounds(100 * MONTHS_PER_YEAR),
      postTaxDeductions: fromPounds(300),
    })
    const bare = toTaxInputs(defaults())
    expect(bare).not.toHaveProperty('pension')
    expect(bare).not.toHaveProperty('childBenefit')
  })

  it('calculateTakeHome returns the engine’s result, a refusal, or an input problem (never throws)', () => {
    const inputs = valid({ salary: fromPounds(40_000) }) as OptimiserPageInputs
    expect(calculateTakeHome(inputs, taxYear)).toEqual(takeHome(toTaxInputs(inputs), taxYear, DEFAULT_POLICY))
    const refused = calculateTakeHome(inputs, FAKE_TODO_YEAR)
    expect(refused).toMatchObject({ ok: false, taxYear: FAKE_TODO_YEAR.id })
    const over = calculateTakeHome({ ...inputs, employeeContribution: amount(fromPounds(40_001)) }, taxYear)
    expect(over).toMatchObject({ ok: false, problem: expect.stringMatching(/pension/i) })
  })

  it('summarises inputs and results for compare: results add up to take-home', () => {
    const inputs = valid({
      salary: fromPounds(60_000),
      postTaxDeductions: [monthly(fromPounds(50), 'Dental')],
      children: 1,
    }) as OptimiserPageInputs
    const summary = optimiserCalculator.summarise(inputs, taxYear)
    expect(summary.inputs.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Region', 'Salary', 'Bonus', 'Taxable benefits in kind', 'Post-tax deductions', 'Children']),
    )
    const input = (label: string) => summary.inputs.find((r) => r.label === label)?.value
    expect(input('Post-tax deductions')).toEqual({ kind: 'money', amount: fromPounds(50 * MONTHS_PER_YEAR) })
    expect(input('Deduction items')).toEqual({ kind: 'text', text: 'Dental' })
    expect(input('Benefit items')).toEqual({ kind: 'text', text: 'None' })
    expect(input('Employee pension contribution: entered as')).toEqual({ kind: 'text', text: 'Amount' })
    expect(input('Employee pension contribution: percentage')).toBeUndefined()
    expect(input('Pensionable pay')).toBeUndefined()
    expect(summary.results.ok).toBe(true)
    if (!summary.results.ok) return
    const row = (label: string) => {
      const value = summary.results.ok ? summary.results.rows.find((r) => r.label === label)?.value : undefined
      if (value?.kind !== 'money') throw new Error(`no money row ${label}`)
      return value.amount as number
    }
    const deducted = ['Income tax', 'National Insurance', 'Student loan', 'Employee pension', 'Child Benefit charge', 'Post-tax deductions']
    expect(row('Gross pay') - deducted.reduce((sum, label) => sum + row(label), 0)).toBe(row('Take-home (year)'))
    const engine = takeHome(toTaxInputs(inputs), taxYear, DEFAULT_POLICY)
    expect(engine.ok && row('Take-home (month)')).toBe(engine.ok && engine.monthly.net)
  })

  it('summarise passes a refusal through, and reports an input problem as text', () => {
    expect(optimiserCalculator.summarise(defaults(), FAKE_TODO_YEAR).results.ok).toBe(false)
    const over = optimiserCalculator.summarise(
      valid({ salary: fromPounds(1_000), employeeContribution: amount(fromPounds(2_000)) }) as OptimiserPageInputs,
      taxYear,
    )
    expect(over.results).toMatchObject({ ok: true, rows: [{ label: 'Result', value: { kind: 'text' } }] })
  })
})

describe('summarise: the resolved totals and how contributions were entered', () => {
  it('shows a percentage contribution’s mode, percentage, resolved amount and pensionable pay', () => {
    const inputs = valid({
      salary: fromPounds(40_000),
      employeeContribution: byPercent('7.5'),
      taxableBenefits: [yearly(fromPounds(600), 'Medical'), monthly(fromPounds(20), '')],
    }) as OptimiserPageInputs
    const rows = optimiserCalculator.summarise(inputs, taxYear).inputs
    const input = (label: string) => rows.find((r) => r.label === label)?.value
    expect(input('Pensionable pay')).toEqual({ kind: 'money', amount: fromPounds(40_000) })
    expect(input('Employee pension contribution: entered as')).toEqual({ kind: 'text', text: 'Percentage of pensionable pay' })
    expect(input('Employee pension contribution: percentage')).toEqual({ kind: 'ratio', ratio: percentRatio('7.5') })
    expect(input('Employee pension contribution')).toEqual({ kind: 'money', amount: fromPounds(3_000) })
    expect(input('Taxable benefits in kind')).toEqual({ kind: 'money', amount: fromPounds(600 + 20 * MONTHS_PER_YEAR) })
    expect(input('Benefit items')).toEqual({ kind: 'text', text: 'Medical, Benefit 2' })
  })
})
