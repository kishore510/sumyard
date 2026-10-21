import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { add, fromPence, fromPounds, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { CALCULATORS } from '../index'
import { takeHome } from './calc'
import {
  calculatePaye,
  calculateTakeHome,
  INPUT_LIMITS,
  inputWarnings,
  MIGRATED_ITEM_NAMES,
  type OptimiserPageInputs,
  optimiserCalculator,
  resolveInputs,
  toTaxInputs,
} from './definition'
import type { BenefitItem, ContributionEntry, ListItem } from './pageInputs'
import { parseTaxCode } from './paye'
import { DEFAULT_POLICY, type TakeHomeResult } from './types'

/*
 * Session 1b-i: the optimiser page's registry entry (definition.ts). Inputs
 * are untrusted when they come from storage or an imported file, so
 * validateInputs checks every field and builds a fresh object. 0.11.0 moves
 * the inputs to version 3: benefit items with what is taken from pay (B10)
 * and the tax code (B11, B12), migrated from versions 1 and 2 (B16). 1b-ii-a
 * moves them to version 4: carry forward, the money purchase annual
 * allowance flag and the childcare check, for optimise() only.
 */

const defaults = () => optimiserCalculator.defaultInputs()
const valid = (patch: Partial<Record<keyof OptimiserPageInputs, unknown>> = {}) => ({ ...defaults(), ...patch })
const check = (raw: unknown) => optimiserCalculator.validateInputs(raw)
const amount = (pence: number): ContributionEntry => ({ mode: 'amount', amount: fromPence(pence), percentOfPay: '0' })
const byPercent = (percentOfPay: string): ContributionEntry => ({ mode: 'percentOfPay', amount: ZERO, percentOfPay })
const yearly = (pence: number, name = 'Item'): ListItem => ({ name, amount: fromPence(pence), period: 'year' })
const monthly = (pence: number, name = 'Item'): ListItem => ({ name, amount: fromPence(pence), period: 'month' })
/** A benefit item; nothing taken (employer-paid) unless given. */
const benefit = (pence: number, name = 'Item', patch: Partial<BenefitItem> = {}): BenefitItem => ({
  name,
  period: 'year',
  value: fromPence(pence),
  taken: ZERO,
  payment: 'beforeTax',
  ...patch,
})
const benefitMonthly = (pence: number, name = 'Item', patch: Partial<BenefitItem> = {}) =>
  benefit(pence, name, { period: 'month', ...patch })

/** A version 2 scenario's inputs, as 0.10.0 stored them. */
const version2 = (patch: Record<string, unknown> = {}) => {
  const { taxCode: _none, ...rest } = optimiserCalculator.defaultInputs()
  return {
    ...rest,
    salary: fromPounds(84_000),
    bonus: fromPounds(6_000),
    pensionMethod: 'salarySacrifice',
    employeeContribution: { mode: 'percentOfPay', amount: 0, percentOfPay: '5' },
    employerContribution: { mode: 'amount', amount: fromPounds(3_000), percentOfPay: '0' },
    taxableBenefits: [
      { name: 'Medical', amount: fromPounds(95), period: 'month' },
      { name: 'Car', amount: fromPounds(4_200), period: 'year' },
    ],
    postTaxDeductions: [{ name: 'Dental', amount: fromPounds(12), period: 'month' }],
    studentLoans: ['plan2', 'postgraduate'],
    children: 2,
    ...patch,
  }
}

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

/** What a person sees from a result: every period view, the warnings and the problem, if any. */
const views = (result: ReturnType<typeof calculateTakeHome>) =>
  result.ok
    ? { annual: result.annual, monthly: result.monthly, weekly: result.weekly, warnings: result.warnings, ani: result.adjustedNetIncome }
    : result

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
  it('is registered as "optimiser" at inputs version 4, with no placeholder label', () => {
    expect(CALCULATORS.get('optimiser')).toBe(optimiserCalculator)
    expect(optimiserCalculator.inputsVersion).toBe(4)
    expect(optimiserCalculator.placeholder).toBeUndefined()
  })

  it('has valid defaults: rUK, every amount zero, contributions as amounts, pensionable pay the salary, empty lists, no tax code', () => {
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
      taxCode: '',
      carryForward: [],
      moneyPurchaseAnnualAllowance: false,
      checkChildcare: false,
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
      taxableBenefits: [{ ...benefit(100, '  Medical\u0007 cover  ', { taken: fromPence(50), payment: 'afterTax' }), extra: 'x' }],
    })
    const result = check(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inputs.employeeContribution).toEqual(byPercent('5'))
    expect(result.inputs.employeeContribution).not.toBe(raw.employeeContribution)
    expect(result.inputs.taxableBenefits).toEqual([benefit(100, 'Medical cover', { taken: fromPence(50), payment: 'afterTax' })])
    expect(result.inputs.taxableBenefits[0]).not.toBe((raw.taxableBenefits as unknown[])[0])
  })

  it('accepts a name of exactly the longest length and the most items', () => {
    const name = 'n'.repeat(INPUT_LIMITS.maxNameLength)
    const items = Array.from({ length: INPUT_LIMITS.maxItems }, () => monthly(1, name))
    const benefits = Array.from({ length: INPUT_LIMITS.maxItems }, () => benefitMonthly(1, name))
    expect(check(valid({ taxableBenefits: benefits, postTaxDeductions: items })).ok).toBe(true)
  })

  it('rejects hostile keys inside items and contributions', () => {
    expect(
      check({
        ...valid(),
        taxableBenefits: [JSON.parse('{"__proto__": {}, "name": "x", "value": 1, "taken": 0, "payment": "afterTax", "period": "year"}')],
      }).ok,
    ).toBe(false)
    expect(check({ ...valid(), postTaxDeductions: [JSON.parse('{"prototype": 1, "name": "x", "amount": 1, "period": "year"}')] }).ok).toBe(
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
    ['taxableBenefits', [{ name: 'x', value: -1, taken: 0, payment: 'beforeTax', period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, taken: -1, payment: 'beforeTax', period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, taken: 0.5, payment: 'afterTax', period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, taken: 0, payment: 'gross', period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, taken: 0, period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, payment: 'afterTax', period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', amount: 1, period: 'year' }]],
    ['taxableBenefits', [{ name: 'x', value: 1, taken: 0, payment: 'afterTax', period: 'week' }]],
    ['taxableBenefits', [{ name: 'n'.repeat(INPUT_LIMITS.maxNameLength + 1), value: 1, taken: 0, payment: 'afterTax', period: 'year' }]],
    ['taxableBenefits', [{ name: 5, value: 1, taken: 0, payment: 'afterTax', period: 'year' }]],
    ['taxableBenefits', [{ value: 1, taken: 0, payment: 'afterTax', period: 'year' }]],
    ['taxableBenefits', ['item']],
    [
      'taxableBenefits',
      Array.from({ length: INPUT_LIMITS.maxItems + 1 }, () => ({ name: 'x', value: 1, taken: 0, payment: 'afterTax', period: 'year' })),
    ],
    ['taxCode', 5],
    ['taxCode', null],
    ['taxCode', 'XYZ'],
    ['taxCode', '100l'],
    ['taxCode', ' 100L'],
    ['taxCode', '100LM1'],
    ['taxCode', 'SNT'],
    ['taxCode', '<b>100L</b>'],
    ['taxCode', `${'1'.repeat(INPUT_LIMITS.maxTaxCodeLength)}L`],
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
    ['carryForward', 'none'],
    ['carryForward', [{ yearsAgo: 0, amount: 100 }]],
    ['carryForward', [{ yearsAgo: 1.5, amount: 100 }]],
    ['carryForward', [{ yearsAgo: INPUT_LIMITS.maxCarryForwardYears + 1, amount: 100 }]],
    ['carryForward', [{ yearsAgo: '1', amount: 100 }]],
    ['carryForward', [{ yearsAgo: 1, amount: -1 }]],
    ['carryForward', [{ yearsAgo: 1, amount: 0.5 }]],
    ['carryForward', [{ yearsAgo: 1 }]],
    [
      'carryForward',
      [
        { yearsAgo: 2, amount: 1 },
        { yearsAgo: 2, amount: 5 },
      ],
    ],
    ['carryForward', [5]],
    ['moneyPurchaseAnnualAllowance', 'yes'],
    ['moneyPurchaseAnnualAllowance', 1],
    ['checkChildcare', null],
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

  it('accepts an empty tax code, a supported one and one that is not modelled, each in its canonical form', () => {
    for (const taxCode of ['', '100L', 'S100T', 'C1M', '99N', 'BR', 'SD2', 'K100', '0T', 'NT', '100L M1', 'C100L NONCUM'])
      expect(check(valid({ taxCode })).ok, taxCode).toBe(true)
  })

  it('refuses inputs saved by a newer version; reads version 4 as it is', () => {
    expect(CALCULATORS.readInputs('optimiser', 5, defaults())).toMatchObject({ ok: false, reason: 'newer-inputs' })
    expect(CALCULATORS.readInputs('optimiser', 4, defaults())).toMatchObject({ ok: true, migrated: false })
    expect(() => optimiserCalculator.migrateInputs(0, {})).toThrow()
  })

  it('a version 4 round trip through JSON gives the same inputs and the same take-home', () => {
    const inputs = valid({
      salary: fromPounds(58_000),
      bonus: fromPounds(3_000),
      employeeContribution: byPercent('6.25'),
      employerContribution: byPercent('3'),
      pensionablePay: { own: true, amount: fromPounds(55_000), includeBonus: true },
      taxableBenefits: [
        benefitMonthly(4_567, 'Medical', { taken: fromPence(5_000), payment: 'beforeTax' }),
        benefit(80_000, 'Car', { taken: fromPence(10_000), payment: 'afterTax' }),
      ],
      postTaxDeductions: [monthly(1_299, 'Dental')],
      taxCode: 'S100L',
      carryForward: [
        { yearsAgo: 1, amount: fromPounds(12_000) },
        { yearsAgo: 3, amount: fromPence(1) },
      ],
      moneyPurchaseAnnualAllowance: true,
      checkChildcare: true,
    }) as OptimiserPageInputs
    const read = CALCULATORS.readInputs('optimiser', 4, JSON.parse(JSON.stringify(inputs)))
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
    expect(inputs.taxableBenefits).toEqual([benefit(fromPounds(1_234), MIGRATED_ITEM_NAMES.taxableBenefits)])
    expect(inputs.taxCode).toBe('')
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
    expect(views(after)).toEqual(views(before))
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
      taxableBenefits: [benefitMonthly(fromPounds(50)), benefit(fromPounds(400))],
      postTaxDeductions: [],
    }) as OptimiserPageInputs
    expect(resolveInputs(inputs)).toEqual({
      pensionablePay: fromPounds(50_000),
      employeeContribution: fromPounds(2_500),
      employerContribution: fromPounds(1_000),
      taxableBenefits: fromPounds(50 * MONTHS_PER_YEAR + 400),
      benefitSacrifice: ZERO,
      benefitPaidAfterTax: ZERO,
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
      taxableBenefits: [benefit(100, 'Medical'), benefitMonthly(0, 'Gym'), benefit(0, 'Bike', { taken: fromPence(1) })],
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
        const items: (ListItem & BenefitItem)[] = []
        let sum = 0
        for (let i = 0; i < count; i++) {
          const pence = Math.floor(random() * 300_000)
          const period = random() < 0.5 ? 'month' : 'year'
          items.push({
            name: `Item ${i}`,
            amount: fromPence(pence),
            period,
            value: fromPence(pence),
            taken: ZERO,
            payment: 'beforeTax' as const,
          })
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
      const itemised = {
        ...single,
        taxableBenefits: benefits.items.map(({ amount: _a, ...item }) => item),
        postTaxDeductions: deductions.items.map(({ value: _v, taken: _t, payment: _p, ...item }) => item),
      }
      expect(check(itemised).ok).toBe(true)
      expect(views(calculateTakeHome(itemised, taxYear)), `run ${run}`).toEqual(views(calculateTakeHome(single, taxYear)))
    }
  })

  it('maps page inputs to the engine’s: salary plus bonus, a pension only with a contribution, Child Benefit only with children', () => {
    const inputs = valid({
      salary: fromPounds(50_000),
      bonus: fromPounds(5_000),
      pensionMethod: 'netPay',
      employeeContribution: amount(fromPounds(3_000)),
      taxableBenefits: [benefitMonthly(fromPounds(100), 'Medical', { taken: fromPounds(20), payment: 'afterTax' })],
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
      benefits: [{ value: fromPounds(100 * MONTHS_PER_YEAR), taken: fromPounds(20 * MONTHS_PER_YEAR), payment: 'afterTax' }],
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
    const deducted = [
      'Salary given up for benefits',
      'Income tax',
      'National Insurance',
      'Student loan',
      'Employee pension',
      'Child Benefit charge',
      'Benefit payments after tax',
      'Post-tax deductions',
    ]
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
      taxableBenefits: [benefit(fromPounds(600), 'Medical'), benefitMonthly(fromPounds(20), '')],
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

describe('migration from inputs version 2 (B16)', () => {
  it('turns each benefit item into its value with nothing taken; deductions stay as they were; no tax code', () => {
    const read = CALCULATORS.readInputs('optimiser', 2, version2())
    expect(read).toMatchObject({ ok: true, migrated: true })
    if (!read.ok) return
    const inputs = read.inputs as OptimiserPageInputs
    expect(inputs.taxableBenefits).toEqual([benefitMonthly(fromPounds(95), 'Medical'), benefit(fromPounds(4_200), 'Car')])
    expect(inputs.postTaxDeductions).toEqual([monthly(fromPounds(12), 'Dental')])
    expect(inputs.taxCode).toBe('')
    expect(inputs.employeeContribution).toEqual(byPercent('5'))
  })

  it.each([
    ['the example', {}],
    ['no benefits', { taxableBenefits: [] }],
    ['Scotland, relief at source', { region: 'scotland', pensionMethod: 'reliefAtSource' }],
    ['over the taper start', { salary: fromPounds(118_000) }],
    ['an item of nothing', { taxableBenefits: [{ name: '', amount: 0, period: 'year' }] }],
  ])('gives identical take-home before and after: %s', (_, patch) => {
    const v2 = version2(patch)
    // As 0.10.0 worked it out: each benefit item's annual amount, summed, as the single taxable figure.
    const annual = (v2.taxableBenefits as { amount: number; period: string }[]).reduce(
      (sum, i) => sum + (i.period === 'month' ? i.amount * MONTHS_PER_YEAR : i.amount),
      0,
    )
    const read = CALCULATORS.readInputs('optimiser', 2, v2)
    if (!read.ok) throw new Error(read.message)
    const inputs = read.inputs as OptimiserPageInputs
    const { benefits: _items, ...rest } = toTaxInputs(inputs)
    const before = takeHome({ ...rest, taxableBenefits: fromPence(annual) }, taxYear, DEFAULT_POLICY)
    expect(views(calculateTakeHome(inputs, taxYear))).toEqual(views(before))
  })

  it('refuses hostile or broken version 2 inputs rather than migrating them', () => {
    expect(CALCULATORS.readInputs('optimiser', 2, JSON.parse('{"__proto__": {}, "region": "rUK"}'))).toMatchObject({ ok: false })
    expect(CALCULATORS.readInputs('optimiser', 2, 'text')).toMatchObject({ ok: false, reason: 'migration-failed' })
    expect(CALCULATORS.readInputs('optimiser', 2, version2({ taxableBenefits: 'x' }))).toMatchObject({ ok: false })
    expect(
      CALCULATORS.readInputs('optimiser', 2, version2({ taxableBenefits: [{ name: 'x', amount: -1, period: 'year' }] })),
    ).toMatchObject({ ok: false, reason: 'invalid-inputs' })
  })
})

/** A version 3 scenario's inputs, as 0.12.0 stored them. */
const version3 = (patch: Record<string, unknown> = {}) => {
  const { carryForward: _a, moneyPurchaseAnnualAllowance: _b, checkChildcare: _c, ...rest } = optimiserCalculator.defaultInputs()
  return {
    ...rest,
    salary: fromPounds(112_000),
    bonus: fromPounds(8_000),
    pensionMethod: 'netPay',
    employeeContribution: { mode: 'percentOfPay', amount: 0, percentOfPay: '7.5' },
    employerContribution: { mode: 'amount', amount: fromPounds(4_000), percentOfPay: '0' },
    taxableBenefits: [{ name: 'Medical', period: 'month', value: fromPounds(95), taken: fromPounds(20), payment: 'beforeTax' }],
    postTaxDeductions: [{ name: 'Dental', amount: fromPounds(12), period: 'month' }],
    studentLoans: ['plan2'],
    children: 2,
    taxCode: '1257L',
    ...patch,
  }
}

describe('migration from inputs version 3 (1b-ii-a)', () => {
  it('adds no carry forward, no money purchase annual allowance and no childcare check, keeping everything else', () => {
    const v3 = version3()
    const read = CALCULATORS.readInputs('optimiser', 3, v3)
    expect(read).toMatchObject({ ok: true, migrated: true })
    if (!read.ok) return
    expect(read.inputs).toEqual({ ...v3, carryForward: [], moneyPurchaseAnnualAllowance: false, checkChildcare: false })
  })

  it.each([
    ['the example', {}],
    [
      'no pension, benefits or children',
      { employeeContribution: amount(0), employerContribution: amount(0), taxableBenefits: [], children: 0 },
    ],
    ['Scotland, salary sacrifice', { region: 'scotland', pensionMethod: 'salarySacrifice', taxCode: 'S1257L' }],
    ['relief at source, opted out', { pensionMethod: 'reliefAtSource', childBenefit: 'optedOut' }],
    ['contribution above pay', { salary: fromPounds(1_000), bonus: 0, employeeContribution: amount(fromPounds(2_000)) }],
  ])('gives identical take-home, PAYE and compare summary before and after: %s', (_, patch) => {
    const v3 = version3(patch) as unknown as OptimiserPageInputs
    const read = CALCULATORS.readInputs('optimiser', 3, v3)
    if (!read.ok) throw new Error(read.message)
    const migrated = read.inputs as OptimiserPageInputs
    // The version 3 inputs as 0.12.0 read them, without the new fields.
    const before = calculateTakeHome(v3, taxYear)
    const after = calculateTakeHome(migrated, taxYear)
    expect(views(after)).toEqual(views(before))
    expect(toTaxInputs(migrated)).toEqual(toTaxInputs(v3))
    if (after.ok && !('problem' in after) && before.ok && !('problem' in before))
      expect(calculatePaye(migrated, after, taxYear)).toEqual(calculatePaye(v3, before, taxYear))
    expect(optimiserCalculator.summarise(migrated, taxYear)).toEqual(optimiserCalculator.summarise(v3, taxYear))
  })

  it('refuses hostile or broken version 3 inputs rather than migrating them', () => {
    expect(CALCULATORS.readInputs('optimiser', 3, JSON.parse('{"__proto__": {}, "region": "rUK"}'))).toMatchObject({ ok: false })
    expect(CALCULATORS.readInputs('optimiser', 3, 'text')).toMatchObject({ ok: false, reason: 'migration-failed' })
    expect(CALCULATORS.readInputs('optimiser', 3, version3({ salary: -1 }))).toMatchObject({ ok: false, reason: 'invalid-inputs' })
  })

  it('migrates versions 1 and 2 all the way to version 4', () => {
    for (const [from, old] of [
      [1, version1()],
      [2, version2()],
    ] as const) {
      const read = CALCULATORS.readInputs('optimiser', from, old)
      expect(read, String(from)).toMatchObject({
        ok: true,
        migrated: true,
        inputs: { carryForward: [], moneyPurchaseAnnualAllowance: false, checkChildcare: false },
      })
    }
  })
})

describe('pension allowance inputs (version 4)', () => {
  it('builds fresh carry forward entries in year order, keeping only known fields', () => {
    const raw = valid({
      carryForward: [
        { yearsAgo: 3, amount: fromPounds(5_000), extra: 1 },
        { yearsAgo: 1, amount: fromPounds(2_000) },
      ],
      moneyPurchaseAnnualAllowance: true,
      checkChildcare: true,
    })
    const result = check(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inputs.carryForward).toEqual([
      { yearsAgo: 1, amount: fromPounds(2_000) },
      { yearsAgo: 3, amount: fromPounds(5_000) },
    ])
    expect(result.inputs.carryForward).not.toBe(raw.carryForward)
    expect(result.inputs.carryForward[1]).not.toBe((raw.carryForward as unknown[])[0])
    expect(result.inputs).toMatchObject({ moneyPurchaseAnnualAllowance: true, checkChildcare: true })
  })

  it('accepts the most earlier years, and rejects hostile keys in an entry', () => {
    const most = Array.from({ length: INPUT_LIMITS.maxCarryForwardYears }, (_, i) => ({ yearsAgo: i + 1, amount: fromPence(1) }))
    expect(check(valid({ carryForward: most })).ok).toBe(true)
    expect(check({ ...valid(), carryForward: [JSON.parse('{"__proto__": {}, "yearsAgo": 1, "amount": 1}')] }).ok).toBe(false)
  })

  it('changes no take-home figure: the new inputs are for the pension sweep only', () => {
    const base = valid({ salary: fromPounds(120_000), children: 1 }) as OptimiserPageInputs
    const set = {
      ...base,
      carryForward: [{ yearsAgo: 1, amount: fromPounds(9_000) }],
      moneyPurchaseAnnualAllowance: true,
      checkChildcare: true,
    }
    expect(views(calculateTakeHome(set, taxYear))).toEqual(views(calculateTakeHome(base, taxYear)))
  })
})

describe('benefits taken from pay, and the tax code, on the page (B10 to B12)', () => {
  it('resolves the taxable total, the salary given up and what is paid after tax, monthly times the months in a year', () => {
    const inputs = valid({
      salary: fromPounds(60_000),
      taxableBenefits: [
        benefitMonthly(fromPounds(40), 'Medical', { taken: fromPounds(50), payment: 'beforeTax' }),
        benefit(fromPounds(1_000), 'Gym', { taken: fromPounds(300), payment: 'afterTax' }),
      ],
    }) as OptimiserPageInputs
    expect(resolveInputs(inputs)).toMatchObject({
      taxableBenefits: fromPounds(50 * MONTHS_PER_YEAR + 700),
      benefitSacrifice: fromPounds(50 * MONTHS_PER_YEAR),
      benefitPaidAfterTax: fromPounds(300),
    })
  })

  it('salary given up above pay gives the input problem, naming it', () => {
    const inputs = valid({
      salary: fromPounds(10_000),
      taxableBenefits: [benefit(0, 'Car', { taken: fromPounds(10_001) })],
    }) as OptimiserPageInputs
    expect(calculateTakeHome(inputs, taxYear)).toMatchObject({ ok: false, problem: expect.stringMatching(/salary given up/i) })
  })

  it('warns when the code’s prefix and where you live disagree, either way, and not when they agree', () => {
    const warn = (region: string, taxCode: string) =>
      inputWarnings(valid({ region, taxCode }) as OptimiserPageInputs).filter((w) => w.code === 'taxCodeRegion')
    expect(warn('rUK', 'S100L')).toHaveLength(1)
    expect(warn('scotland', '100L')).toHaveLength(1)
    expect(warn('scotland', 'C100L')).toHaveLength(1)
    expect(warn('scotland', 'S100L')).toHaveLength(0)
    expect(warn('rUK', 'C100L')).toHaveLength(0)
    expect(warn('rUK', '')).toHaveLength(0)
    expect(warn('rUK', 'BR')).toHaveLength(0)
    expect(warn('rUK', 'S100L')[0]!.message).not.toMatch(/\d/)
  })

  it('calculatePaye: nothing without a code, the estimate with a supported one, a notice otherwise', () => {
    const inputs = valid({ salary: fromPounds(45_000) }) as OptimiserPageInputs
    const result = calculateTakeHome(inputs, taxYear) as TakeHomeResult
    expect(calculatePaye(inputs, result, taxYear)).toBeNull()
    const supported = calculatePaye({ ...inputs, taxCode: '100L' }, result, taxYear)
    expect(supported).toMatchObject({ ok: true, liability: result.annual.incomeTax })
    expect(calculatePaye({ ...inputs, taxCode: 'K100' }, result, taxYear)).toMatchObject({ ok: false, reason: 'unsupported', kind: 'K' })
  })

  it('summarise: the new totals and the code as text; the PAYE estimate and difference with a supported code', () => {
    const inputs = valid({
      salary: fromPounds(52_000),
      taxableBenefits: [
        benefit(fromPounds(900), 'Medical', { taken: fromPounds(1_200) }),
        benefit(fromPounds(500), 'Gym', { taken: fromPounds(100), payment: 'afterTax' }),
      ],
      taxCode: 'S100L',
    }) as OptimiserPageInputs
    const summary = optimiserCalculator.summarise(inputs, taxYear)
    const input = (label: string) => summary.inputs.find((r) => r.label === label)?.value
    expect(input('Salary given up for benefits')).toEqual({ kind: 'money', amount: fromPounds(1_200) })
    expect(input('Benefit payments after tax')).toEqual({ kind: 'money', amount: fromPounds(100) })
    expect(input('Tax code')).toEqual({ kind: 'text', text: 'S100L' })
    if (!summary.results.ok) throw new Error('refused')
    const result = (label: string) => (summary.results.ok ? summary.results.rows.find((r) => r.label === label)?.value : undefined)
    const engine = calculateTakeHome(inputs, taxYear) as TakeHomeResult
    const paye = calculatePaye(inputs, engine, taxYear)
    if (!paye?.ok) throw new Error('no estimate')
    expect(result('PAYE estimate (year)')).toEqual({ kind: 'money', amount: paye.paye.total })
    expect(result('PAYE less the year’s tax')).toEqual({ kind: 'money', amount: paye.difference })
    expect(result('Salary given up for benefits')).toEqual({ kind: 'money', amount: fromPounds(1_200) })
    const none = optimiserCalculator.summarise({ ...inputs, taxCode: '' }, taxYear)
    expect(none.inputs.find((r) => r.label === 'Tax code')?.value).toEqual({ kind: 'text', text: 'None' })
    expect(none.results.ok && none.results.rows.some((r) => r.label.startsWith('PAYE'))).toBe(false)
    const notModelled = optimiserCalculator.summarise({ ...inputs, taxCode: 'BR' }, taxYear)
    expect(notModelled.results.ok && notModelled.results.rows.find((r) => r.label === 'PAYE estimate')?.value).toEqual({
      kind: 'text',
      text: 'Not modelled for this code',
    })
  })

  it('every stored code is canonical: parseTaxCode gives it back unchanged', () => {
    for (const taxCode of ['100L', 'S100T', 'C1M', 'BR', 'SD2', 'K100', '0T', 'NT', '100L M1']) {
      const parsed = parseTaxCode(taxCode)
      expect(parsed.ok ? parsed.code.text : parsed.reason === 'unsupported' ? parsed.text : null).toBe(taxCode)
    }
  })
})
