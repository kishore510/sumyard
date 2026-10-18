import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { add, fromPence, fromPounds, ZERO } from '@/lib/money'
import { CALCULATORS } from '../index'
import { takeHome } from './calc'
import { calculateTakeHome, INPUT_LIMITS, type OptimiserPageInputs, optimiserCalculator, toTaxInputs } from './definition'
import { DEFAULT_POLICY } from './types'

/*
 * Session 1b-i: the optimiser page's registry entry (definition.ts). Inputs
 * are untrusted when they come from storage or an imported file, so
 * validateInputs checks every field and builds a fresh object.
 */

const defaults = () => optimiserCalculator.defaultInputs()
const valid = (patch: Partial<Record<keyof OptimiserPageInputs, unknown>> = {}) => ({ ...defaults(), ...patch })
const check = (raw: unknown) => optimiserCalculator.validateInputs(raw)

describe('optimiser definition', () => {
  it('is registered as "optimiser" at inputs version 1, with no placeholder label', () => {
    expect(CALCULATORS.get('optimiser')).toBe(optimiserCalculator)
    expect(optimiserCalculator.inputsVersion).toBe(1)
    expect(optimiserCalculator.placeholder).toBeUndefined()
  })

  it('has valid defaults: rUK, every amount zero, no loans, no children', () => {
    const d = defaults()
    expect(check(d)).toEqual({ ok: true, inputs: d })
    expect(d).toMatchObject({
      region: 'rUK',
      salary: ZERO,
      bonus: ZERO,
      employeeContribution: ZERO,
      employerContribution: ZERO,
      taxableBenefits: ZERO,
      postTaxDeductions: ZERO,
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
    ['employeeContribution', -100],
    ['employerContribution', Number.NaN],
    ['taxableBenefits', -1],
    ['postTaxDeductions', -1],
    ['postTaxDeductions', Number.POSITIVE_INFINITY],
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
  })

  it('refuses inputs saved by a newer version, and has nothing older to migrate', () => {
    expect(CALCULATORS.readInputs('optimiser', 2, defaults())).toMatchObject({ ok: false, reason: 'newer-inputs' })
    expect(CALCULATORS.readInputs('optimiser', 1, defaults())).toMatchObject({ ok: true, migrated: false })
    expect(() => optimiserCalculator.migrateInputs(0, {})).toThrow()
  })

  it('maps page inputs to the engine’s: salary plus bonus, a pension only with a contribution, Child Benefit only with children', () => {
    const inputs = valid({
      salary: fromPounds(50_000),
      bonus: fromPounds(5_000),
      pensionMethod: 'netPay',
      employeeContribution: fromPounds(3_000),
      taxableBenefits: fromPounds(1_200),
      postTaxDeductions: fromPounds(300),
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
      taxableBenefits: fromPounds(1_200),
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
    const over = calculateTakeHome({ ...inputs, employeeContribution: fromPounds(40_001) }, taxYear)
    expect(over).toMatchObject({ ok: false, problem: expect.stringMatching(/pension/i) })
  })

  it('summarises inputs and results for compare: results add up to take-home', () => {
    const inputs = valid({ salary: fromPounds(60_000), postTaxDeductions: fromPounds(600), children: 1 }) as OptimiserPageInputs
    const summary = optimiserCalculator.summarise(inputs, taxYear)
    expect(summary.inputs.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Region', 'Salary', 'Bonus', 'Taxable benefits in kind', 'Post-tax deductions', 'Children']),
    )
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
      valid({ salary: fromPounds(1_000), employeeContribution: fromPounds(2_000) }) as OptimiserPageInputs,
      taxYear,
    )
    expect(over.results).toMatchObject({ ok: true, rows: [{ label: 'Result', value: { kind: 'text' } }] })
  })
})
