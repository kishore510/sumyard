import { describe, expect, it } from 'vitest'
import { formatGBP, formatPercent } from '@/lib/format'
import { fromPounds, type Money, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { METHOD_LABELS, type OptimiserPageInputs, optimiserCalculator, PAYMENT_LABELS, PLAN_LABELS, resolveInputs } from './definition'
import { isSectionSet, NOT_SET, SECTION_IDS, type SectionId, sectionForField, sectionSummary, sectionsSet } from './sections'

/*
 * 0.12.0: the take-home page's input sections. A section opens on load when
 * any of its inputs differs from the defaults, and its summary is built from
 * the resolved amounts the engine receives. Figures come from the inputs
 * here, never from config.
 */

const defaults = optimiserCalculator.defaultInputs()
const gbp = (amount: Money) => formatGBP(amount, 'pence')
const summary = (id: SectionId, inputs: OptimiserPageInputs) => sectionSummary(id, inputs, resolveInputs(inputs), gbp)

const ONE_CHANGE: Record<SectionId, Partial<OptimiserPageInputs>[]> = {
  pension: [
    { pensionMethod: 'netPay' },
    { employeeContribution: { mode: 'amount', amount: fromPounds(1), percentOfPay: '0' } },
    { employerContribution: { mode: 'percentOfPay', amount: ZERO, percentOfPay: '0' } },
    { pensionablePay: { own: true, amount: ZERO, includeBonus: false } },
  ],
  allowances: [
    { carryForward: [{ yearsAgo: 1, amount: fromPounds(1) }] },
    { moneyPurchaseAnnualAllowance: true },
    { checkChildcare: true },
  ],
  benefits: [
    { taxableBenefits: [{ name: '', period: 'month', value: ZERO, taken: ZERO, payment: 'beforeTax' }] },
    { postTaxDeductions: [{ name: 'Dental', amount: fromPounds(1), period: 'year' }] },
  ],
  studentLoans: [{ studentLoans: ['plan2'] }],
  childBenefit: [{ children: 1 }, { childBenefit: 'optedOut' }],
  taxCode: [{ taxCode: 'BR' }],
}

describe('sections: set or not', () => {
  it('no section is set on the defaults, so all start closed', () => {
    for (const id of SECTION_IDS) expect(isSectionSet(id, defaults), id).toBe(false)
    expect([...sectionsSet(defaults)]).toEqual([])
  })

  it('the region from Settings sets no section (it is in “Your pay”)', () => {
    expect([...sectionsSet({ ...defaults, region: 'scotland', salary: fromPounds(9), bonus: fromPounds(1) })]).toEqual([])
  })

  it.each(SECTION_IDS)('any one change in %s sets that section and no other', (id) => {
    for (const patch of ONE_CHANGE[id]) expect([...sectionsSet({ ...defaults, ...patch })], JSON.stringify(patch)).toEqual([id])
  })

  it('several changes set each of their sections, in page order', () => {
    const inputs = { ...defaults, ...ONE_CHANGE.taxCode[0], ...ONE_CHANGE.pension[0], ...ONE_CHANGE.childBenefit[0] }
    expect([...sectionsSet(inputs)]).toEqual(['pension', 'childBenefit', 'taxCode'])
  })
})

describe('sections: which section a field the page marks invalid belongs to', () => {
  it.each([
    ['employeeContribution', 'pension'],
    ['employeeContribution-pct', 'pension'],
    ['employerContribution', 'pension'],
    ['employerContribution-pct', 'pension'],
    ['pensionablePay', 'pension'],
    ['carryForward-1', 'allowances'],
    ['carryForward-12', 'allowances'],
    ['taxableBenefits-3-name', 'benefits'],
    ['taxableBenefits-0-taken', 'benefits'],
    ['postTaxDeductions-12-amount', 'benefits'],
    ['children', 'childBenefit'],
    ['taxCode', 'taxCode'],
  ] as const)('%s is in %s', (field, id) => {
    expect(sectionForField(field)).toBe(id)
  })

  it.each(['salary', 'bonus', 'taxableBenefitsX', 'something', 'carryForward', 'carryForward-x'])('%s is in no section', (field) => {
    expect(sectionForField(field)).toBeUndefined()
  })
})

describe('sections: one-line summaries from the resolved amounts', () => {
  it('every section says “Not set” on the defaults', () => {
    for (const id of SECTION_IDS) expect(summary(id, defaults), id).toBe(NOT_SET)
  })

  it('pension: the method and the resolved contributions for the year', () => {
    const inputs: OptimiserPageInputs = {
      ...defaults,
      salary: fromPounds(50_000),
      pensionMethod: 'netPay',
      employeeContribution: { mode: 'amount', amount: fromPounds(2_000), percentOfPay: '0' },
      employerContribution: { mode: 'percentOfPay', amount: ZERO, percentOfPay: '5.5' },
    }
    const resolved = resolveInputs(inputs)
    const text = summary('pension', inputs)
    expect(text).toContain(METHOD_LABELS.netPay)
    expect(text).toContain(gbp(resolved.employeeContribution))
    expect(text).toContain(gbp(resolved.employerContribution))
    expect(text).toContain(formatPercent(percentRatio('5.5')))
  })

  it('pension: a method with no contribution says so', () => {
    const text = summary('pension', { ...defaults, pensionMethod: 'reliefAtSource' })
    expect(text).toContain(METHOD_LABELS.reliefAtSource)
    expect(text).toMatch(/no contribution/i)
  })

  it('benefits and deductions: how many of each, with the resolved totals for the year', () => {
    const inputs: OptimiserPageInputs = {
      ...defaults,
      taxableBenefits: [
        { name: 'Medical', period: 'month', value: fromPounds(45), taken: ZERO, payment: 'beforeTax' },
        { name: 'Car', period: 'year', value: fromPounds(1_000), taken: fromPounds(1_200), payment: 'beforeTax' },
      ],
      postTaxDeductions: [{ name: 'Dental', amount: fromPounds(20), period: 'month' }],
    }
    const resolved = resolveInputs(inputs)
    const text = summary('benefits', inputs)
    expect(text).toContain('2 benefits')
    expect(text).toContain(gbp(resolved.taxableBenefits))
    expect(text).toContain('1 deduction')
    expect(text).not.toContain('1 deductions')
    expect(text).toContain(gbp(resolved.postTaxDeductions))
  })

  it('student loans: the plans', () => {
    expect(summary('studentLoans', { ...defaults, studentLoans: ['plan1', 'postgraduate'] })).toBe(
      `${PLAN_LABELS.plan1}, ${PLAN_LABELS.postgraduate}`,
    )
  })

  it('Child Benefit: the children and whether it is claimed', () => {
    expect(summary('childBenefit', { ...defaults, children: 1 })).toBe(`1 child · ${PAYMENT_LABELS.claimed}`)
    expect(summary('childBenefit', { ...defaults, children: 3, childBenefit: 'optedOut' })).toBe(`3 children · ${PAYMENT_LABELS.optedOut}`)
  })

  it('pension allowances: the carry forward total and years, the money purchase allowance and the childcare check', () => {
    const inputs: OptimiserPageInputs = {
      ...defaults,
      carryForward: [
        { yearsAgo: 1, amount: fromPounds(2_000) },
        { yearsAgo: 3, amount: fromPounds(500) },
      ],
      moneyPurchaseAnnualAllowance: true,
      checkChildcare: true,
    }
    const text = summary('allowances', inputs)
    expect(text).toContain(`Carry forward ${gbp(fromPounds(2_500))} from 2 years`)
    expect(text).toMatch(/money purchase annual allowance/i)
    expect(text).toMatch(/childcare limits checked/i)
    expect(summary('allowances', { ...defaults, carryForward: [{ yearsAgo: 2, amount: fromPounds(1) }] })).toBe(
      `Carry forward ${gbp(fromPounds(1))} from 1 year`,
    )
    expect(summary('allowances', { ...defaults, checkChildcare: true })).toBe('Childcare limits checked')
  })

  it('tax code: the code as stored', () => {
    expect(summary('taxCode', { ...defaults, taxCode: 'S900L' })).toBe('S900L')
  })
})
