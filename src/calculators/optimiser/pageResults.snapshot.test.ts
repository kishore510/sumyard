import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { fromPounds, ZERO } from '@/lib/money'
import { breakdown } from './breakdown'
import { calculatePaye, calculateTakeHome, isInputProblem, type OptimiserPageInputs, optimiserCalculator } from './definition'

/*
 * 0.12.0 (take-home page redesign, UI only): the engine outputs the page
 * shows, for several inputs, pinned by a snapshot written from the code
 * before the redesign. Engine, definition and compare summary must give the
 * same results after it. Regenerate only with an engine change, never for a
 * layout change. The snapshot is generated output from the 2026-27 config,
 * not figures written by hand; a correction to that config regenerates it.
 */

const base = optimiserCalculator.defaultInputs()
const item = (name: string, value: number, period: 'month' | 'year' = 'year') => ({ name, period, value: fromPounds(value) })

const CASES: Record<string, OptimiserPageInputs> = {
  defaults: base,
  'salary and bonus': { ...base, salary: fromPounds(52_000), bonus: fromPounds(4_000) },
  'every section set': {
    ...base,
    salary: fromPounds(118_000),
    bonus: fromPounds(9_000),
    pensionMethod: 'netPay',
    employeeContribution: { mode: 'percentOfPay', amount: ZERO, percentOfPay: '6' },
    employerContribution: { mode: 'amount', amount: fromPounds(4_000), percentOfPay: '0' },
    pensionablePay: { own: false, amount: ZERO, includeBonus: true },
    taxableBenefits: [
      { ...item('Medical', 90, 'month'), taken: ZERO, payment: 'beforeTax' },
      { ...item('Car', 3_200), taken: fromPounds(3_600), payment: 'beforeTax' },
      { ...item('Gym', 40, 'month'), taken: fromPounds(15), payment: 'afterTax' },
    ],
    postTaxDeductions: [{ name: 'Dental', amount: fromPounds(18), period: 'month' }],
    studentLoans: ['plan2', 'postgraduate'],
    children: 2,
    childBenefit: 'claimed',
    taxCode: '900L',
  },
  scotland: {
    ...base,
    region: 'scotland',
    salary: fromPounds(64_000),
    pensionMethod: 'reliefAtSource',
    employeeContribution: { mode: 'amount', amount: fromPounds(2_400), percentOfPay: '0' },
    studentLoans: ['plan4'],
    taxCode: 'S1100L',
  },
  'code not modelled': { ...base, salary: fromPounds(40_000), taxCode: 'BR' },
  'take-home below nothing': {
    ...base,
    salary: fromPounds(20_000),
    postTaxDeductions: [{ name: 'Rent', amount: fromPounds(40_000), period: 'year' }],
  },
  'contribution above pay': {
    ...base,
    salary: fromPounds(10_000),
    employeeContribution: { mode: 'amount', amount: fromPounds(12_000), percentOfPay: '0' },
  },
}

describe('page results are unchanged by the redesign (snapshot of engine outputs)', () => {
  it.each(Object.entries(CASES))('%s', (_name, inputs) => {
    const result = calculateTakeHome(inputs, taxYear)
    const paye = !isInputProblem(result) && result.ok ? calculatePaye(inputs, result, taxYear) : null
    const month = !isInputProblem(result) && result.ok ? breakdown(result.annual, 'month') : null
    expect({ result, paye, month, summary: optimiserCalculator.summarise(inputs, taxYear) }).toMatchSnapshot()
  })
})
