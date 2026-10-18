import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import { MAX_CHILDREN, MAX_INPUT_AMOUNT, MAX_ITEM_NAME_LENGTH, MAX_LIST_ITEMS, MAX_PERCENT_INPUT } from '@/lib/inputLimits'
import { add, compare, fromPence, type Money, ratio, ZERO } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import { checkUntrustedJson, cleanText, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type SummaryRow } from '../registry'
import { EngineInputError, takeHome } from './calc'
import {
  CONTRIBUTION_MODES,
  type ContributionEntry,
  type ContributionMode,
  ITEM_PERIODS,
  type ItemPeriod,
  isAboveAllOfPay,
  type ListItem,
  listTotal,
  type PensionablePayEntry,
  pensionablePay,
  resolveContribution,
} from './pageInputs'
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
 * The optimiser page's registry entry (slice 1b; inputs version 2 since part
 * 1b-i.1): the inputs a scenario stores, their defaults, validation and
 * migration, how they map to the engine's TaxInputs, and the compare
 * summary. Take-home only for now; the pension sweep (optimise()) arrives in
 * 1b-ii. No tax figure here: every figure comes from the engine, which reads
 * the year's verified config. How percentages and item lists become annual
 * amounts is in ./pageInputs.ts.
 */

/** What the page stores. Money is integer pence; amounts are for the year unless an item says per month. */
export interface OptimiserPageInputs {
  readonly region: Region
  readonly salary: Money
  readonly bonus: Money
  readonly pensionMethod: PensionMethod
  /** The employee's contribution by `pensionMethod`, as an amount or a percentage of pensionable pay; nothing for none. */
  readonly employeeContribution: ContributionEntry
  /** Other employer contributions (not a salary sacrifice). Changes no take-home figure; kept for 1b-ii's annual allowance view. */
  readonly employerContribution: ContributionEntry
  /** What a percentage contribution applies to (decision B6). */
  readonly pensionablePay: PensionablePayEntry
  /** Taxable benefits in kind, itemised (B7). */
  readonly taxableBenefits: readonly ListItem[]
  /** Post-tax deductions, itemised (B7). */
  readonly postTaxDeductions: readonly ListItem[]
  readonly studentLoans: readonly StudentLoanPlanId[]
  readonly children: number
  readonly childBenefit: ChildBenefitPayments
}

/** Input bounds that keep every sum a safe whole number of pence. Not tax figures. */
export const INPUT_LIMITS = {
  maxAmount: MAX_INPUT_AMOUNT,
  maxChildren: MAX_CHILDREN,
  maxItems: MAX_LIST_ITEMS,
  maxNameLength: MAX_ITEM_NAME_LENGTH,
  maxPercent: MAX_PERCENT_INPUT,
}

const MONEY_FIELDS = ['salary', 'bonus'] as const
const CONTRIBUTION_FIELDS = ['employeeContribution', 'employerContribution'] as const
const LIST_FIELDS = ['taxableBenefits', 'postTaxDeductions'] as const
export type ContributionField = (typeof CONTRIBUTION_FIELDS)[number]
export type ListField = (typeof LIST_FIELDS)[number]

export const MONEY_LABELS: Record<(typeof MONEY_FIELDS)[number] | ContributionField | ListField, string> = {
  salary: 'Salary',
  bonus: 'Bonus',
  employeeContribution: 'Employee pension contribution',
  employerContribution: 'Employer pension contribution',
  taxableBenefits: 'Taxable benefits in kind',
  postTaxDeductions: 'Post-tax deductions',
}

export const MODE_LABELS: Record<ContributionMode, string> = { amount: 'Amount', percentOfPay: 'Percentage of pensionable pay' }

export const PERIOD_LABELS: Record<ItemPeriod, string> = { month: 'Per month', year: 'Per year' }

/** What one item in each list is called, for legends, buttons and messages. */
export const ITEM_NOUNS: Record<ListField, string> = { taxableBenefits: 'benefit', postTaxDeductions: 'deduction' }

/** The names a version 1 single amount becomes when migrated (B9). */
export const MIGRATED_ITEM_NAMES: Record<ListField, string> = {
  taxableBenefits: 'Benefits in kind',
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

const PERCENT_LIMITS = { min: ratio(0, 1), max: MAX_PERCENT_INPUT }

/** A stored contribution, checked and rebuilt; or the problem in words. */
function contributionEntry(raw: unknown, label: string): ContributionEntry | string {
  if (!isRecord(raw)) return `${label} is not an amount or a percentage.`
  if (!CONTRIBUTION_MODES.includes(raw.mode as ContributionMode)) return `${label}: the way it is entered is not one Sumyard knows.`
  if (!isAmount(raw.amount)) return `${label} must be whole pence from nothing up to the input limit.`
  if (!isCanonicalPercent(raw.percentOfPay, PERCENT_LIMITS)) return `${label}: the percentage is not one Sumyard accepts.`
  return { mode: raw.mode as ContributionMode, amount: fromPence(raw.amount), percentOfPay: raw.percentOfPay }
}

function pensionablePayEntry(raw: unknown): PensionablePayEntry | string {
  if (!isRecord(raw) || typeof raw.own !== 'boolean' || typeof raw.includeBonus !== 'boolean' || !isAmount(raw.amount))
    return 'Pensionable pay must say whether it is your own figure, the amount, and whether it includes the bonus.'
  return { own: raw.own, amount: fromPence(raw.amount), includeBonus: raw.includeBonus }
}

/** A stored list, checked item by item and rebuilt (names tidied, text only); or the problem in words. */
function listItems(raw: unknown, label: string): ListItem[] | string {
  if (!Array.isArray(raw)) return `${label} must be a list of items.`
  if (raw.length > INPUT_LIMITS.maxItems) return `${label} can have at most ${INPUT_LIMITS.maxItems} items.`
  const items: ListItem[] = []
  for (const item of raw) {
    if (!isRecord(item)) return `${label}: an item is not a name, an amount and a period.`
    if (typeof item.name !== 'string' || Array.from(item.name.trim()).length > INPUT_LIMITS.maxNameLength)
      return `${label}: an item’s name must be text of at most ${INPUT_LIMITS.maxNameLength} characters.`
    if (!isAmount(item.amount)) return `${label}: an item’s amount must be whole pence from nothing up to the input limit.`
    if (!ITEM_PERIODS.includes(item.period as ItemPeriod)) return `${label}: an item must be per month or per year.`
    items.push({
      name: cleanText(item.name, INPUT_LIMITS.maxNameLength),
      amount: fromPence(item.amount),
      period: item.period as ItemPeriod,
    })
  }
  return items
}

function validate(raw: unknown): { ok: true; inputs: OptimiserPageInputs } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) return { ok: false, errors: ['Inputs are not an object.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false, errors: [`Inputs are not safe to read: ${hostile}.`] }
  const errors: string[] = []
  if (!REGIONS.includes(raw.region as Region)) errors.push('The region must be England, Wales or Northern Ireland, or Scotland.')
  for (const field of MONEY_FIELDS)
    if (!isAmount(raw[field])) errors.push(`${MONEY_LABELS[field]} must be whole pence from nothing up to the input limit.`)
  const employee = contributionEntry(raw.employeeContribution, MONEY_LABELS.employeeContribution)
  const employer = contributionEntry(raw.employerContribution, MONEY_LABELS.employerContribution)
  const pensionable = pensionablePayEntry(raw.pensionablePay)
  const benefits = listItems(raw.taxableBenefits, MONEY_LABELS.taxableBenefits)
  const deductions = listItems(raw.postTaxDeductions, MONEY_LABELS.postTaxDeductions)
  for (const checked of [employee, employer, pensionable, benefits, deductions]) if (typeof checked === 'string') errors.push(checked)
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
  if (
    errors.length > 0 ||
    typeof employee === 'string' ||
    typeof employer === 'string' ||
    typeof pensionable === 'string' ||
    typeof benefits === 'string' ||
    typeof deductions === 'string'
  )
    return { ok: false, errors }
  const amount = (field: (typeof MONEY_FIELDS)[number]) => fromPence(raw[field] as number)
  return {
    ok: true,
    inputs: {
      region: raw.region as Region,
      salary: amount('salary'),
      bonus: amount('bonus'),
      pensionMethod: raw.pensionMethod as PensionMethod,
      employeeContribution: employee,
      employerContribution: employer,
      pensionablePay: pensionable,
      taxableBenefits: benefits,
      postTaxDeductions: deductions,
      // Kept in the engine's plan order, so the same plans always store the same way.
      studentLoans: STUDENT_LOAN_PLANS.filter((plan) => (plans as unknown[]).includes(plan)),
      children: children as number,
      childBenefit: raw.childBenefit as ChildBenefitPayments,
    },
  }
}

/** The annual figures the inputs resolve to: what the engine receives (and the employer's, kept for 1b-ii). */
export interface ResolvedInputs {
  readonly pensionablePay: Money
  readonly employeeContribution: Money
  readonly employerContribution: Money
  readonly taxableBenefits: Money
  readonly postTaxDeductions: Money
}

export function resolveInputs(inputs: OptimiserPageInputs): ResolvedInputs {
  const pensionable = pensionablePay(inputs.salary, inputs.bonus, inputs.pensionablePay)
  return {
    pensionablePay: pensionable,
    employeeContribution: resolveContribution(inputs.employeeContribution, pensionable),
    employerContribution: resolveContribution(inputs.employerContribution, pensionable),
    taxableBenefits: listTotal(inputs.taxableBenefits),
    postTaxDeductions: listTotal(inputs.postTaxDeductions),
  }
}

/** True when either contribution is entered as a percentage, so pensionable pay matters. */
export const usesPensionablePay = (inputs: OptimiserPageInputs) =>
  inputs.employeeContribution.mode === 'percentOfPay' || inputs.employerContribution.mode === 'percentOfPay'

/** The engine's inputs: gross pay is salary plus bonus (flexible-benefit cash goes in salary, B3); a pension only with a contribution; Child Benefit only with children; each list as its annual total. */
export function toTaxInputs(inputs: OptimiserPageInputs): TaxInputs {
  const resolved = resolveInputs(inputs)
  return {
    grossPay: add(inputs.salary, inputs.bonus),
    region: inputs.region,
    studentLoans: [...inputs.studentLoans],
    ...(compare(resolved.employeeContribution, ZERO) > 0
      ? { pension: { method: inputs.pensionMethod, contribution: resolved.employeeContribution } }
      : {}),
    ...(inputs.children > 0 ? { childBenefit: { children: inputs.children, payments: inputs.childBenefit } } : {}),
    taxableBenefits: resolved.taxableBenefits,
    postTaxDeductions: resolved.postTaxDeductions,
  }
}

/** Something about the inputs worth saying, which still gives results. */
export interface InputWarning {
  readonly code: 'percentAboveAllOfPay' | 'itemWithoutAmount'
  /** Stable within one set of inputs, for keys and tests. */
  readonly key: string
  readonly message: string
}

/** An item's name for messages: its own, or its place in the list. */
export const itemLabel = (field: ListField, item: ListItem, index: number) =>
  item.name || `${ITEM_NOUNS[field].replace(/^./, (c) => c.toUpperCase())} ${index + 1}`

/** Warnings on the inputs (never a cap): a percentage above all of pensionable pay; an item with no amount. */
export function inputWarnings(inputs: OptimiserPageInputs): InputWarning[] {
  const warnings: InputWarning[] = []
  for (const field of CONTRIBUTION_FIELDS)
    if (isAboveAllOfPay(inputs[field]))
      warnings.push({
        code: 'percentAboveAllOfPay',
        key: field,
        message: `The ${field === 'employeeContribution' ? 'employee' : 'employer'} contribution is more than all of your pensionable pay. Check the percentage.`,
      })
  for (const field of LIST_FIELDS)
    inputs[field].forEach((item, index) => {
      if (compare(item.amount, ZERO) === 0)
        warnings.push({
          code: 'itemWithoutAmount',
          key: `${field}-${index}`,
          message: `“${itemLabel(field, item, index)}” in ${MONEY_LABELS[field].toLowerCase()} has no amount, so it adds nothing.`,
        })
    })
  return warnings
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

const noContribution = (): ContributionEntry => ({ mode: 'amount', amount: ZERO, percentOfPay: '0' })

/**
 * Version 1 to 2 (decision B9): each contribution becomes amount mode with
 * the same amount; a non-zero benefits or deductions amount becomes one item
 * per year; nothing becomes an empty list; pensionable pay starts as the
 * salary. Untrusted: hostile keys refuse it; the result is validated after.
 */
export function migrateFromVersion1(from: number, old: unknown): unknown {
  if (from !== 1) throw new Error(`The take-home calculator has no inputs version ${from} to migrate from`)
  if (!isRecord(old)) throw new Error('Version 1 inputs are not an object')
  const hostile = checkUntrustedJson(old)
  if (hostile) throw new Error(`Version 1 inputs are not safe to read: ${hostile}`)
  const contribution = (amount: unknown) => ({ mode: 'amount', amount, percentOfPay: '0' })
  const items = (field: ListField) => (old[field] === 0 ? [] : [{ name: MIGRATED_ITEM_NAMES[field], amount: old[field], period: 'year' }])
  return {
    region: old.region,
    salary: old.salary,
    bonus: old.bonus,
    pensionMethod: old.pensionMethod,
    employeeContribution: contribution(old.employeeContribution),
    employerContribution: contribution(old.employerContribution),
    pensionablePay: { own: false, amount: 0, includeBonus: false },
    taxableBenefits: items('taxableBenefits'),
    postTaxDeductions: items('postTaxDeductions'),
    studentLoans: old.studentLoans,
    children: old.children,
    childBenefit: old.childBenefit,
  }
}

/** Item names for compare, text only. */
const itemNames = (field: ListField, items: readonly ListItem[]) =>
  items.length === 0 ? 'None' : items.map((item, index) => itemLabel(field, item, index)).join(', ')

/** How a contribution was entered, for compare: the mode, and the percentage when it counts. */
const contributionRows = (field: ContributionField, entry: ContributionEntry, resolved: Money): SummaryRow[] => [
  text(`${MONEY_LABELS[field]}: entered as`, MODE_LABELS[entry.mode]),
  ...(entry.mode === 'percentOfPay'
    ? [{ label: `${MONEY_LABELS[field]}: percentage`, value: { kind: 'ratio', ratio: percentRatio(entry.percentOfPay) } } as const]
    : []),
  money(MONEY_LABELS[field], resolved),
]

export const optimiserCalculator: CalculatorDefinition<OptimiserPageInputs> = defineCalculator<OptimiserPageInputs>({
  id: 'optimiser',
  name: 'Take-home pay',
  summary:
    'Your take-home pay for the year, with pension, student loans, benefits in kind and Child Benefit. The pension optimiser is coming.',
  inputsVersion: 2,
  defaultInputs: () => ({
    region: 'rUK',
    salary: ZERO,
    bonus: ZERO,
    pensionMethod: 'salarySacrifice',
    employeeContribution: noContribution(),
    employerContribution: noContribution(),
    pensionablePay: { own: false, amount: ZERO, includeBonus: false },
    taxableBenefits: [],
    postTaxDeductions: [],
    studentLoans: [],
    children: 0,
    childBenefit: 'claimed',
  }),
  applySettings: (inputs, settings) => ({ ...inputs, region: settings.region === 'scotland' ? 'scotland' : 'rUK' }),
  validateInputs: validate,
  migrateInputs(from) {
    throw new Error(`stub (red commit): no migration from inputs version ${from}`)
  },
  summarise(inputs, config) {
    const result = calculateTakeHome(inputs, config)
    const resolved = resolveInputs(inputs)
    const rows: SummaryRow[] = [
      text('Region', REGION_LABELS[inputs.region]),
      money('Salary', inputs.salary),
      money('Bonus', inputs.bonus),
      text('Pension method', METHOD_LABELS[inputs.pensionMethod]),
      ...(usesPensionablePay(inputs) ? [money('Pensionable pay', resolved.pensionablePay)] : []),
      ...contributionRows('employeeContribution', inputs.employeeContribution, resolved.employeeContribution),
      ...contributionRows('employerContribution', inputs.employerContribution, resolved.employerContribution),
      money(MONEY_LABELS.taxableBenefits, resolved.taxableBenefits),
      text('Benefit items', itemNames('taxableBenefits', inputs.taxableBenefits)),
      money(MONEY_LABELS.postTaxDeductions, resolved.postTaxDeductions),
      text('Deduction items', itemNames('postTaxDeductions', inputs.postTaxDeductions)),
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
