import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import {
  MAX_CARRY_FORWARD_YEARS,
  MAX_CHILDREN,
  MAX_INPUT_AMOUNT,
  MAX_ITEM_NAME_LENGTH,
  MAX_LIST_ITEMS,
  MAX_PERCENT_INPUT,
  MAX_TAX_CODE_LENGTH,
} from '@/lib/inputLimits'
import { add, compare, fromPence, type Money, ratio, ZERO } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import { checkUntrustedJson, cleanText, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type SummaryRow } from '../registry'
import { benefitTotals, EngineInputError, takeHome } from './calc'
import {
  annualBenefit,
  type BenefitItem,
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
import { parseTaxCode, payeEstimate } from './paye'
import {
  BENEFIT_PAYMENTS,
  type BenefitPayment,
  CHILD_BENEFIT_PAYMENTS,
  type ChildBenefitPayments,
  DEFAULT_POLICY,
  type PayeEstimate,
  type PayeNotModelled,
  PENSION_METHODS,
  type PensionMethod,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanPlanId,
  type TakeHomeResult,
  type TaxInputs,
  type UnusedAllowance,
} from './types'

/*
 * The optimiser page's registry entry (slice 1b; the inputs version is one
 * more than the migrations below): the inputs a scenario stores, their defaults, validation and
 * migration, how they map to the engine's TaxInputs, and the compare
 * summary. Version 4 (1b-ii-a) adds the pension sweep's own inputs: carry
 * forward, the money purchase annual allowance and the childcare check, which
 * change no take-home figure (optimise()'s mapping is ./optimiserInputs.ts).
 * No tax figure here: every figure comes from the engine, which reads
 * the year's verified config. How percentages and item lists become annual
 * amounts is in ./pageInputs.ts; the PAYE estimate is ./paye.ts's.
 */

/** What the page stores. Money is integer pence; amounts are for the year unless an item says per month. */
export interface OptimiserPageInputs {
  readonly region: Region
  readonly salary: Money
  readonly bonus: Money
  readonly pensionMethod: PensionMethod
  /** The employee's contribution by `pensionMethod`, as an amount or a percentage of pensionable pay; nothing for none. */
  readonly employeeContribution: ContributionEntry
  /** Other employer contributions (not a salary sacrifice). Changes no take-home figure; counts for the annual allowance in the sweep. */
  readonly employerContribution: ContributionEntry
  /** What a percentage contribution applies to (decision B6). */
  readonly pensionablePay: PensionablePayEntry
  /** Benefits in kind, itemised, with what is taken from pay for each (B7, B10). */
  readonly taxableBenefits: readonly BenefitItem[]
  /** Post-tax deductions, itemised (B7). */
  readonly postTaxDeductions: readonly ListItem[]
  readonly studentLoans: readonly StudentLoanPlanId[]
  readonly children: number
  readonly childBenefit: ChildBenefitPayments
  /** The tax code in its canonical form (parseTaxCode), or empty for none (B11). */
  readonly taxCode: string
  /** Unused annual allowance from earlier tax years, as the person states it: one entry per year at most, in year order. */
  readonly carryForward: readonly UnusedAllowance[]
  /** The money purchase annual allowance applies (a pension flexibly accessed in an earlier tax year). */
  readonly moneyPurchaseAnnualAllowance: boolean
  /** Check the childcare support income limits in the sweep. */
  readonly checkChildcare: boolean
}

/** Input bounds that keep every sum a safe whole number of pence. Not tax figures. */
export const INPUT_LIMITS = {
  maxAmount: MAX_INPUT_AMOUNT,
  maxChildren: MAX_CHILDREN,
  maxItems: MAX_LIST_ITEMS,
  maxNameLength: MAX_ITEM_NAME_LENGTH,
  maxPercent: MAX_PERCENT_INPUT,
  maxTaxCodeLength: MAX_TAX_CODE_LENGTH,
  maxCarryForwardYears: MAX_CARRY_FORWARD_YEARS,
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
function storedList<T>(
  raw: unknown,
  label: string,
  shape: string,
  read: (item: Record<string, unknown>) => Omit<T, 'name' | 'period'> | string,
): (T & { name: string; period: ItemPeriod })[] | string {
  if (!Array.isArray(raw)) return `${label} must be a list of items.`
  if (raw.length > INPUT_LIMITS.maxItems) return `${label} can have at most ${INPUT_LIMITS.maxItems} items.`
  const items: (T & { name: string; period: ItemPeriod })[] = []
  for (const item of raw) {
    if (!isRecord(item)) return `${label}: an item is not ${shape}.`
    if (typeof item.name !== 'string' || Array.from(item.name.trim()).length > INPUT_LIMITS.maxNameLength)
      return `${label}: an item’s name must be text of at most ${INPUT_LIMITS.maxNameLength} characters.`
    if (!ITEM_PERIODS.includes(item.period as ItemPeriod)) return `${label}: an item must be per month or per year.`
    const fields = read(item)
    if (typeof fields === 'string') return `${label}: ${fields}`
    items.push({ name: cleanText(item.name, INPUT_LIMITS.maxNameLength), period: item.period as ItemPeriod, ...fields } as T & {
      name: string
      period: ItemPeriod
    })
  }
  return items
}

const AMOUNT_RULE = 'whole pence from nothing up to the input limit'

const listItems = (raw: unknown, label: string) =>
  storedList<ListItem>(raw, label, 'a name, an amount and a period', (item) =>
    isAmount(item.amount) ? { amount: fromPence(item.amount) } : `an item’s amount must be ${AMOUNT_RULE}.`,
  )

const benefitItems = (raw: unknown, label: string) =>
  storedList<BenefitItem>(raw, label, 'a name, a value, an amount taken and how', (item) => {
    if (!isAmount(item.value)) return `an item’s value must be ${AMOUNT_RULE}.`
    if (!isAmount(item.taken)) return `the amount taken for an item must be ${AMOUNT_RULE}.`
    if (!BENEFIT_PAYMENTS.includes(item.payment as BenefitPayment)) return 'an item must be taken before tax or after tax.'
    return { value: fromPence(item.value), taken: fromPence(item.taken), payment: item.payment as BenefitPayment }
  })

/** A stored tax code: empty, or a code parseTaxCode recognises, in its canonical form (B12). */
function isStoredTaxCode(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  if (raw === '') return true
  const parsed = parseTaxCode(raw)
  return parsed.ok ? parsed.code.text === raw : parsed.reason === 'unsupported' && parsed.text === raw
}

/** Stored carry forward, checked and rebuilt in year order; or the problem in words. */
function carryForwardEntries(raw: unknown): UnusedAllowance[] | string {
  const rule = `Carry forward must be a list of earlier years (1 to ${INPUT_LIMITS.maxCarryForwardYears} years ago, each at most once) with an amount in whole pence from nothing up to the input limit.`
  if (!Array.isArray(raw) || raw.length > INPUT_LIMITS.maxCarryForwardYears) return rule
  const entries: UnusedAllowance[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) return rule
    const { yearsAgo } = entry
    if (typeof yearsAgo !== 'number' || !Number.isSafeInteger(yearsAgo) || yearsAgo < 1 || yearsAgo > INPUT_LIMITS.maxCarryForwardYears)
      return rule
    if (!isAmount(entry.amount) || entries.some((e) => e.yearsAgo === yearsAgo)) return rule
    entries.push({ yearsAgo, amount: fromPence(entry.amount) })
  }
  return entries.sort((a, b) => a.yearsAgo - b.yearsAgo)
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
  const benefits = benefitItems(raw.taxableBenefits, MONEY_LABELS.taxableBenefits)
  const deductions = listItems(raw.postTaxDeductions, MONEY_LABELS.postTaxDeductions)
  const carryForward = carryForwardEntries(raw.carryForward)
  for (const checked of [employee, employer, pensionable, benefits, deductions, carryForward])
    if (typeof checked === 'string') errors.push(checked)
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
  if (!isStoredTaxCode(raw.taxCode)) errors.push('The tax code must be empty or a tax code Sumyard recognises.')
  if (typeof raw.moneyPurchaseAnnualAllowance !== 'boolean')
    errors.push('Whether the money purchase annual allowance applies must be yes or no.')
  if (typeof raw.checkChildcare !== 'boolean') errors.push('Whether to check the childcare limits must be yes or no.')
  if (
    errors.length > 0 ||
    typeof employee === 'string' ||
    typeof employer === 'string' ||
    typeof pensionable === 'string' ||
    typeof benefits === 'string' ||
    typeof deductions === 'string' ||
    typeof carryForward === 'string'
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
      taxCode: raw.taxCode as string,
      carryForward,
      moneyPurchaseAnnualAllowance: raw.moneyPurchaseAnnualAllowance as boolean,
      checkChildcare: raw.checkChildcare as boolean,
    },
  }
}

/** The annual figures the inputs resolve to: what the engine receives (and the employer's, kept for 1b-ii). */
export interface ResolvedInputs {
  readonly pensionablePay: Money
  readonly employeeContribution: Money
  readonly employerContribution: Money
  /** The benefit items' taxable total for the year (B10). */
  readonly taxableBenefits: Money
  /** Salary given up for benefits for the year. */
  readonly benefitSacrifice: Money
  /** Contributions to benefits from net pay for the year. */
  readonly benefitPaidAfterTax: Money
  readonly postTaxDeductions: Money
}

export function resolveInputs(inputs: OptimiserPageInputs): ResolvedInputs {
  const pensionable = pensionablePay(inputs.salary, inputs.bonus, inputs.pensionablePay)
  const benefits = benefitTotals(inputs.taxableBenefits.map(annualBenefit))
  return {
    pensionablePay: pensionable,
    employeeContribution: resolveContribution(inputs.employeeContribution, pensionable),
    employerContribution: resolveContribution(inputs.employerContribution, pensionable),
    taxableBenefits: benefits.taxable,
    benefitSacrifice: benefits.salaryGivenUp,
    benefitPaidAfterTax: benefits.paidAfterTax,
    postTaxDeductions: listTotal(inputs.postTaxDeductions),
  }
}

/** True when either contribution is entered as a percentage, so pensionable pay matters. */
export const usesPensionablePay = (inputs: OptimiserPageInputs) =>
  inputs.employeeContribution.mode === 'percentOfPay' || inputs.employerContribution.mode === 'percentOfPay'

/**
 * The engine's inputs: gross pay is salary plus bonus (flexible-benefit cash goes in salary, B3); a pension only with a
 * contribution; Child Benefit only with children; each benefit item for the year (B10); deductions as their annual total.
 */
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
    benefits: inputs.taxableBenefits.map(annualBenefit),
    postTaxDeductions: resolved.postTaxDeductions,
  }
}

/** Something about the inputs worth saying, which still gives results. */
export interface InputWarning {
  readonly code: 'percentAboveAllOfPay' | 'itemWithoutAmount' | 'taxCodeRegion'
  /** Stable within one set of inputs, for keys and tests. */
  readonly key: string
  readonly message: string
}

/** An item's name for messages: its own, or its place in the list. */
export const itemLabel = (field: ListField, item: { readonly name: string }, index: number) =>
  item.name || `${ITEM_NOUNS[field].replace(/^./, (c) => c.toUpperCase())} ${index + 1}`

const CODE_REGIONS = { rUK: 'England, Wales or Northern Ireland', scotland: 'Scotland', wales: 'Wales' } as const

/** Warnings on the inputs (never a cap): a percentage above all of pensionable pay; an item with no amount; a tax code for another part of the UK. */
export function inputWarnings(inputs: OptimiserPageInputs): InputWarning[] {
  const warnings: InputWarning[] = []
  for (const field of CONTRIBUTION_FIELDS)
    if (isAboveAllOfPay(inputs[field]))
      warnings.push({
        code: 'percentAboveAllOfPay',
        key: field,
        message: `The ${field === 'employeeContribution' ? 'employee' : 'employer'} contribution is more than all of your pensionable pay. Check the percentage.`,
      })
  const empty = (field: ListField, item: { readonly name: string }, index: number) =>
    warnings.push({
      code: 'itemWithoutAmount',
      key: `${field}-${index}`,
      message: `“${itemLabel(field, item, index)}” in ${MONEY_LABELS[field].toLowerCase()} has no amount, so it adds nothing.`,
    })
  inputs.taxableBenefits.forEach((item, index) => {
    if (compare(item.value, ZERO) === 0 && compare(item.taken, ZERO) === 0) empty('taxableBenefits', item, index)
  })
  inputs.postTaxDeductions.forEach((item, index) => {
    if (compare(item.amount, ZERO) === 0) empty('postTaxDeductions', item, index)
  })
  const code = parseTaxCode(inputs.taxCode)
  // A code's S or C prefix says which rates payroll uses; "Where you live" sets the year's tax (B12).
  const fits = !code.ok || (code.code.regime === 'scotland') === (inputs.region === 'scotland')
  if (!fits && code.ok)
    warnings.push({
      code: 'taxCodeRegion',
      key: 'taxCode',
      message: `Your tax code uses the rates for ${CODE_REGIONS[code.code.regime]}, but you chose ${REGION_LABELS[inputs.region]}. The PAYE estimate follows the code; the year’s tax follows where you live.`,
    })
  return warnings
}

/** Inputs the engine cannot model (a pension contribution above pay), in plain words. */
export interface InputProblem {
  readonly ok: false
  readonly problem: string
}

export type PageResult = TakeHomeResult | Refusal | InputProblem

export const isInputProblem = <T extends { readonly ok: boolean }>(result: T | InputProblem): result is InputProblem =>
  !result.ok && 'problem' in result

/** Take-home for the page and compare: the engine's result, its refusal, or an input problem. Never throws on valid inputs. */
export function calculateTakeHome(inputs: OptimiserPageInputs, config: TaxYearConfig): PageResult {
  try {
    return takeHome(toTaxInputs(inputs), config, DEFAULT_POLICY)
  } catch (error) {
    if (error instanceof EngineInputError)
      return {
        ok: false,
        problem:
          'The pension contribution, with any salary given up for benefits, is more than your pay (salary plus bonus). Sumyard doesn’t model relief on contributions above earnings, or giving up more than your pay.',
      }
    throw error
  }
}

/** The PAYE estimate for the page's tax code against a take-home result; null without a code (B11). */
export function calculatePaye(
  inputs: OptimiserPageInputs,
  result: TakeHomeResult,
  config: TaxYearConfig,
): PayeEstimate | PayeNotModelled | Refusal | null {
  return inputs.taxCode === '' ? null : payeEstimate(inputs.taxCode, result, config)
}

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })

const noContribution = (): ContributionEntry => ({ mode: 'amount', amount: ZERO, percentOfPay: '0' })

/**
 * Version 3 to 4 (1b-ii-a): no carry forward, no money purchase annual
 * allowance and no childcare check; everything else as it was, so take-home
 * is unchanged. Untrusted: hostile keys refuse it; the result is validated after.
 */
function migrateFromVersion3(old: unknown): unknown {
  if (!isRecord(old)) throw new Error('Version 3 inputs are not an object')
  const hostile = checkUntrustedJson(old)
  if (hostile) throw new Error(`Version 3 inputs are not safe to read: ${hostile}`)
  return { ...old, carryForward: [], moneyPurchaseAnnualAllowance: false, checkChildcare: false }
}

/**
 * Version 2 to 3 (decision B16): each benefit item keeps its name and period,
 * with its amount as the value, nothing taken from pay (so an employer-paid
 * benefit: the same taxable amount as before); deductions stay as they are;
 * no tax code. Untrusted: hostile keys refuse it; a broken item is passed on
 * as it is, for validation to reject; the result is validated after.
 */
function migrateFromVersion2(old: unknown): unknown {
  if (!isRecord(old)) throw new Error('Version 2 inputs are not an object')
  const hostile = checkUntrustedJson(old)
  if (hostile) throw new Error(`Version 2 inputs are not safe to read: ${hostile}`)
  const benefits = Array.isArray(old.taxableBenefits)
    ? old.taxableBenefits.map((item: unknown) =>
        isRecord(item) ? { name: item.name, period: item.period, value: item.amount, taken: 0, payment: 'beforeTax' } : item,
      )
    : old.taxableBenefits
  return { ...old, taxableBenefits: benefits, taxCode: '' }
}

/**
 * Version 1 to 2 (decision B9): each contribution becomes amount mode with
 * the same amount; a non-zero benefits or deductions amount becomes one item
 * per year; nothing becomes an empty list; pensionable pay starts as the
 * salary. Untrusted: hostile keys refuse it; the result is validated after.
 */
function migrateFromVersion1(old: unknown): unknown {
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

/** Each migration takes inputs from its version (its place in the list, from one) to the next: B9, B16, then 1b-ii-a. */
const MIGRATIONS = [migrateFromVersion1, migrateFromVersion2, migrateFromVersion3] as const

/** Older inputs, one version at a time, up to the current one. */
function migrate(from: number, old: unknown): unknown {
  if (!Number.isSafeInteger(from) || from < 1 || from > MIGRATIONS.length)
    throw new Error(`The take-home calculator has no inputs version ${from} to migrate from`)
  return MIGRATIONS.slice(from - 1).reduce((inputs, step) => step(inputs), old)
}

/** Item names for compare, text only. */
const itemNames = (field: ListField, items: readonly { readonly name: string }[]) =>
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
    'Your take-home pay for the year, with pension, student loans, benefits in kind, Child Benefit and a PAYE estimate from your tax code, and a chart of what you keep at each candidate pension contribution.',
  inputsVersion: MIGRATIONS.length + 1,
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
    taxCode: '',
    carryForward: [],
    moneyPurchaseAnnualAllowance: false,
    checkChildcare: false,
  }),
  applySettings: (inputs, settings) => ({ ...inputs, region: settings.region === 'scotland' ? 'scotland' : 'rUK' }),
  validateInputs: validate,
  migrateInputs: migrate,
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
      money('Salary given up for benefits', resolved.benefitSacrifice),
      money('Benefit payments after tax', resolved.benefitPaidAfterTax),
      text('Benefit items', itemNames('taxableBenefits', inputs.taxableBenefits)),
      money(MONEY_LABELS.postTaxDeductions, resolved.postTaxDeductions),
      text('Deduction items', itemNames('postTaxDeductions', inputs.postTaxDeductions)),
      text('Student loans', inputs.studentLoans.length === 0 ? 'None' : inputs.studentLoans.map((p) => PLAN_LABELS[p]).join(', ')),
      { label: 'Children', value: { kind: 'count', count: inputs.children } },
      ...(inputs.children > 0 ? [text('Child Benefit', PAYMENT_LABELS[inputs.childBenefit])] : []),
      text('Tax code', inputs.taxCode === '' ? 'None' : inputs.taxCode),
    ]
    if (isInputProblem(result)) return { inputs: rows, results: { ok: true, rows: [text('Result', result.problem)] } }
    if (!result.ok) return { inputs: rows, results: result }
    const { annual } = result
    const paye = calculatePaye(inputs, result, config)
    const payeRows: SummaryRow[] =
      paye === null
        ? []
        : paye.ok
          ? [money('PAYE estimate (year)', paye.paye.total), money('PAYE less the year’s tax', paye.difference)]
          : [text('PAYE estimate', 'reason' in paye ? 'Not modelled for this code' : 'Tax values not verified')]
    return {
      inputs: rows,
      results: {
        ok: true,
        rows: [
          money('Take-home (year)', annual.net),
          money('Take-home (month)', result.monthly.net),
          money('Take-home (week)', result.weekly.net),
          money('Gross pay', annual.gross),
          money('Salary given up for benefits', annual.benefitSacrifice),
          money('Income tax', annual.incomeTax),
          money('National Insurance', annual.nationalInsurance),
          money('Student loan', annual.studentLoan),
          money('Employee pension', annual.pension),
          money('Child Benefit charge', annual.hicbc),
          money('Benefit payments after tax', annual.benefitPayments),
          money('Post-tax deductions', annual.postTaxDeductions),
          money('Child Benefit received', annual.childBenefit),
          ...payeRows,
        ],
      },
    }
  },
})
