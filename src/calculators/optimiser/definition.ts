import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import { MAX_CHILDREN, MAX_INPUT_AMOUNT } from '@/lib/inputLimits'
import { add, compare, fromPence, type Money, ZERO } from '@/lib/money'
import { checkUntrustedJson, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type SummaryRow } from '../registry'
import { EngineInputError, takeHome } from './calc'
import {
  CHILD_BENEFIT_PAYMENTS,
  type ChildBenefitPayments,
  DEFAULT_POLICY,
  PENSION_METHODS,
  type PensionMethod,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanPlanId,
  type TakeHomeResult,
  type TaxInputs,
} from './types'

/*
 * The optimiser page's registry entry (slice 1b, session 1b-i): the inputs a
 * scenario stores, their defaults and validation, how they map to the
 * engine's TaxInputs, and the compare summary. Take-home only for now; the
 * pension sweep (optimise()) arrives in 1b-ii. No tax figure here: every
 * figure comes from the engine, which reads the year's verified config.
 */

/** What the page stores. Money is integer pence. Annual amounts. */
export interface OptimiserPageInputs {
  readonly region: Region
  readonly salary: Money
  readonly bonus: Money
  readonly pensionMethod: PensionMethod
  /** The employee's contribution for the year by `pensionMethod`; zero for none. */
  readonly employeeContribution: Money
  /** Other employer contributions (not a salary sacrifice). Changes no take-home figure; kept for 1b-ii's annual allowance view. */
  readonly employerContribution: Money
  readonly taxableBenefits: Money
  readonly postTaxDeductions: Money
  readonly studentLoans: readonly StudentLoanPlanId[]
  readonly children: number
  readonly childBenefit: ChildBenefitPayments
}

/** Input bounds that keep every sum a safe whole number of pence. Not tax figures. */
export const INPUT_LIMITS = { maxAmount: MAX_INPUT_AMOUNT, maxChildren: MAX_CHILDREN }

const MONEY_FIELDS = ['salary', 'bonus', 'employeeContribution', 'employerContribution', 'taxableBenefits', 'postTaxDeductions'] as const

export const MONEY_LABELS: Record<(typeof MONEY_FIELDS)[number], string> = {
  salary: 'Salary',
  bonus: 'Bonus',
  employeeContribution: 'Employee pension contribution',
  employerContribution: 'Employer pension contribution',
  taxableBenefits: 'Taxable benefits in kind',
  postTaxDeductions: 'Post-tax deductions',
}

export const REGION_LABELS: Record<Region, string> = { rUK: 'England, Wales or Northern Ireland', scotland: 'Scotland' }

export const METHOD_LABELS: Record<PensionMethod, string> = {
  salarySacrifice: 'Salary sacrifice',
  netPay: 'Net pay arrangement',
  reliefAtSource: 'Relief at source',
}

export const PLAN_LABELS: Record<StudentLoanPlanId, string> = {
  plan1: 'Plan 1',
  plan2: 'Plan 2',
  plan4: 'Plan 4',
  plan5: 'Plan 5',
  postgraduate: 'Postgraduate loan',
}

export const PAYMENT_LABELS: Record<ChildBenefitPayments, string> = { claimed: 'Claimed', optedOut: 'Opted out of payments' }

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= INPUT_LIMITS.maxAmount

function validate(raw: unknown): { ok: true; inputs: OptimiserPageInputs } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) return { ok: false, errors: ['Inputs are not an object.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false, errors: [`Inputs are not safe to read: ${hostile}.`] }
  const errors: string[] = []
  if (!REGIONS.includes(raw.region as Region)) errors.push('The region must be England, Wales or Northern Ireland, or Scotland.')
  for (const field of MONEY_FIELDS)
    if (!isAmount(raw[field])) errors.push(`${MONEY_LABELS[field]} must be whole pence from nothing up to the input limit.`)
  if (!PENSION_METHODS.includes(raw.pensionMethod as PensionMethod)) errors.push('The pension method is not one Sumyard knows.')
  const plans = raw.studentLoans
  if (
    !Array.isArray(plans) ||
    plans.some((plan) => !STUDENT_LOAN_PLANS.includes(plan as StudentLoanPlanId)) ||
    new Set(plans).size !== plans.length
  )
    errors.push('Student loans must be a list of known plans, each at most once.')
  const children = raw.children
  if (typeof children !== 'number' || !Number.isSafeInteger(children) || children < 0 || children > INPUT_LIMITS.maxChildren)
    errors.push(`Children must be a whole number from 0 to ${INPUT_LIMITS.maxChildren}.`)
  if (!CHILD_BENEFIT_PAYMENTS.includes(raw.childBenefit as ChildBenefitPayments))
    errors.push('Child Benefit must be claimed or opted out of.')
  if (errors.length > 0) return { ok: false, errors }
  const amount = (field: (typeof MONEY_FIELDS)[number]) => fromPence(raw[field] as number)
  return {
    ok: true,
    inputs: {
      region: raw.region as Region,
      salary: amount('salary'),
      bonus: amount('bonus'),
      pensionMethod: raw.pensionMethod as PensionMethod,
      employeeContribution: amount('employeeContribution'),
      employerContribution: amount('employerContribution'),
      taxableBenefits: amount('taxableBenefits'),
      postTaxDeductions: amount('postTaxDeductions'),
      // Kept in the engine's plan order, so the same plans always store the same way.
      studentLoans: STUDENT_LOAN_PLANS.filter((plan) => (plans as unknown[]).includes(plan)),
      children: children as number,
      childBenefit: raw.childBenefit as ChildBenefitPayments,
    },
  }
}

/** The engine's inputs: gross pay is salary plus bonus (flexible-benefit cash goes in salary, B3); a pension only with a contribution; Child Benefit only with children. */
export function toTaxInputs(inputs: OptimiserPageInputs): TaxInputs {
  return {
    grossPay: add(inputs.salary, inputs.bonus),
    region: inputs.region,
    studentLoans: [...inputs.studentLoans],
    ...(compare(inputs.employeeContribution, ZERO) > 0
      ? { pension: { method: inputs.pensionMethod, contribution: inputs.employeeContribution } }
      : {}),
    ...(inputs.children > 0 ? { childBenefit: { children: inputs.children, payments: inputs.childBenefit } } : {}),
    taxableBenefits: inputs.taxableBenefits,
    postTaxDeductions: inputs.postTaxDeductions,
  }
}

/** Inputs the engine cannot model (a pension contribution above pay), in plain words. */
export interface InputProblem {
  readonly ok: false
  readonly problem: string
}

export type PageResult = TakeHomeResult | Refusal | InputProblem

export const isInputProblem = (result: PageResult): result is InputProblem => !result.ok && 'problem' in result

/** Take-home for the page and compare: the engine's result, its refusal, or an input problem. Never throws on valid inputs. */
export function calculateTakeHome(inputs: OptimiserPageInputs, config: TaxYearConfig): PageResult {
  try {
    return takeHome(toTaxInputs(inputs), config, DEFAULT_POLICY)
  } catch (error) {
    if (error instanceof EngineInputError)
      return {
        ok: false,
        problem:
          'The pension contribution is more than your pay (salary plus bonus). Sumyard doesn’t model relief on contributions above earnings.',
      }
    throw error
  }
}

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })

export const optimiserCalculator: CalculatorDefinition<OptimiserPageInputs> = defineCalculator<OptimiserPageInputs>({
  id: 'optimiser',
  name: 'Take-home pay',
  summary:
    'Your take-home pay for the year, with pension, student loans, benefits in kind and Child Benefit. The pension optimiser is coming.',
  inputsVersion: 1,
  defaultInputs: () => ({
    region: 'rUK',
    salary: ZERO,
    bonus: ZERO,
    pensionMethod: 'salarySacrifice',
    employeeContribution: ZERO,
    employerContribution: ZERO,
    taxableBenefits: ZERO,
    postTaxDeductions: ZERO,
    studentLoans: [],
    children: 0,
    childBenefit: 'claimed',
  }),
  applySettings: (inputs, settings) => ({ ...inputs, region: settings.region === 'scotland' ? 'scotland' : 'rUK' }),
  validateInputs: validate,
  migrateInputs(from) {
    throw new Error(`The take-home calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs, config) {
    const result = calculateTakeHome(inputs, config)
    const rows: SummaryRow[] = [
      text('Region', REGION_LABELS[inputs.region]),
      money('Salary', inputs.salary),
      money('Bonus', inputs.bonus),
      text('Pension method', METHOD_LABELS[inputs.pensionMethod]),
      money(MONEY_LABELS.employeeContribution, inputs.employeeContribution),
      money(MONEY_LABELS.employerContribution, inputs.employerContribution),
      money(MONEY_LABELS.taxableBenefits, inputs.taxableBenefits),
      money(MONEY_LABELS.postTaxDeductions, inputs.postTaxDeductions),
      text('Student loans', inputs.studentLoans.length === 0 ? 'None' : inputs.studentLoans.map((p) => PLAN_LABELS[p]).join(', ')),
      { label: 'Children', value: { kind: 'count', count: inputs.children } },
      ...(inputs.children > 0 ? [text('Child Benefit', PAYMENT_LABELS[inputs.childBenefit])] : []),
    ]
    if (isInputProblem(result)) return { inputs: rows, results: { ok: true, rows: [text('Result', result.problem)] } }
    if (!result.ok) return { inputs: rows, results: result }
    const { annual } = result
    return {
      inputs: rows,
      results: {
        ok: true,
        rows: [
          money('Take-home (year)', annual.net),
          money('Take-home (month)', result.monthly.net),
          money('Take-home (week)', result.weekly.net),
          money('Gross pay', annual.gross),
          money('Income tax', annual.incomeTax),
          money('National Insurance', annual.nationalInsurance),
          money('Student loan', annual.studentLoan),
          money('Employee pension', annual.pension),
          money('Child Benefit charge', annual.hicbc),
          money('Post-tax deductions', annual.postTaxDeductions),
          money('Child Benefit received', annual.childBenefit),
        ],
      },
    }
  },
})
