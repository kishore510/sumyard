import { MAX_BUDGET_LINES, MAX_INPUT_AMOUNT, MAX_ITEM_NAME_LENGTH } from '@/lib/inputLimits'
import { fromPence, type Money, type Ratio, ZERO } from '@/lib/money'
import { canonicalJson, checkUntrustedJson, cleanText, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type InputRefusal, type SummaryRow } from '../registry'
import { budget } from './calc'
import {
  BUDGET_KINDS,
  type BudgetInputs,
  type BudgetKind,
  type BudgetOutcome,
  type BudgetPeriod,
  type BudgetProblem,
  type BudgetProblemReason,
  type IncomeLine,
  type OutgoingLine,
} from './types'

/*
 * The household budget's registry entry (inputs version 1): what a scenario
 * stores, the defaults (named blank lines, a template: BD4), validation, the
 * engine mapping, what-ifs (BD7) and the compare summary. Uses no tax rules
 * (taxRules: 'none'): scenarios carry no tax year and summarise ignores the
 * config. No figure here: bounds come from src/lib/inputLimits.ts and every
 * result from the engine (./calc.ts).
 */

/** How often Your pay is entered (BD3). */
export type PayPeriod = Extract<BudgetPeriod, 'monthly' | 'annual'>

/** What the page stores. Money is integer pence; a blank amount is nothing (BD4). */
export interface BudgetPageInputs {
  /** Your pay after tax. */
  readonly pay: Money
  readonly payPeriod: PayPeriod
  /** Extra income lines (BD3). */
  readonly income: readonly IncomeLine[]
  readonly outgoings: readonly OutgoingLine[]
}

export const PERIODS: readonly BudgetPeriod[] = ['weekly', 'monthly', 'quarterly', 'annual']
export const PAY_PERIODS: readonly PayPeriod[] = ['monthly', 'annual']

export const PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: 'A week',
  monthly: 'A month',
  quarterly: 'A quarter',
  annual: 'A year',
}

/** How often, in words after an amount ("per month"), for the sliders' spoken value. */
export const PERIOD_UNITS: Record<BudgetPeriod, string> = {
  weekly: 'per week',
  monthly: 'per month',
  quarterly: 'per quarter',
  annual: 'per year',
}

/** Each kind's name (BD1), as the sections, table and compare show it. */
export const KIND_LABELS: Record<BudgetKind, string> = {
  spending: 'Spending',
  joint: 'Joint account',
  debt: 'Debt payments',
  savings: 'Savings and investing',
}

export const PAY_LABEL = 'Your pay'

const line = (name: string, kind: BudgetKind, period: BudgetPeriod = 'monthly'): OutgoingLine => ({ name, amount: ZERO, period, kind })

/** The named blank lines a fresh page starts with: a template, not advice. */
export const DEFAULT_LINES: readonly OutgoingLine[] = [
  line('Groceries', 'spending'),
  line('Car insurance', 'spending', 'annual'),
  line('Mobile', 'spending'),
  line('Other spending', 'spending'),
  line('Joint account', 'joint'),
  line('Credit card payment', 'debt'),
  line('Cash savings', 'savings'),
  line('Stocks and shares ISA', 'savings'),
  line('Fixed saver', 'savings'),
]

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T)

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= ZERO && value <= MAX_INPUT_AMOUNT

const AMOUNT_RULE = 'must be whole pence from nothing up to the input limit.'

/** One stored line checked and rebuilt, or the problem with it in words. */
function readLine(raw: unknown, outgoing: boolean): OutgoingLine | IncomeLine | string {
  if (!isRecord(raw) || Array.isArray(raw)) return 'is not a line.'
  if (typeof raw.name !== 'string') return 'has no name.'
  if (!isAmount(raw.amount)) return `amount ${AMOUNT_RULE}`
  if (!isOneOf(PERIODS, raw.period)) return 'must be weekly, monthly, quarterly or yearly.'
  if (outgoing && !isOneOf(BUDGET_KINDS, raw.kind)) return 'must be spending, joint account, debt or savings.'
  const base = { name: cleanText(raw.name, MAX_ITEM_NAME_LENGTH), amount: fromPence(raw.amount), period: raw.period }
  return outgoing ? { ...base, kind: raw.kind as BudgetKind } : base
}

function readLines<L>(raw: unknown, label: string, outgoing: boolean, errors: string[]): L[] {
  if (!Array.isArray(raw)) {
    errors.push(`${label} must be a list of lines.`)
    return []
  }
  if (raw.length > MAX_BUDGET_LINES) {
    errors.push(`${label} can hold at most the most lines a list holds.`)
    return []
  }
  return raw.flatMap((item, index) => {
    const read = readLine(item, outgoing)
    if (typeof read === 'string') {
      errors.push(`${label}, line ${index + 1} ${read}`)
      return []
    }
    return [read as L]
  })
}

/** Checks untrusted inputs (storage, an imported file) field by field and builds a fresh object. */
function validate(raw: unknown) {
  if (!isRecord(raw) || Array.isArray(raw)) return { ok: false as const, errors: ['The inputs are not a set of household budget inputs.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false as const, errors: [`The inputs are not safe to read: ${hostile}`] }
  const errors: string[] = []
  if (!isAmount(raw.pay)) errors.push(`${PAY_LABEL} ${AMOUNT_RULE}`)
  if (!isOneOf(PAY_PERIODS, raw.payPeriod)) errors.push(`${PAY_LABEL} must be entered a month or a year.`)
  const income = readLines<IncomeLine>(raw.income, 'Extra income', false, errors)
  const outgoings = readLines<OutgoingLine>(raw.outgoings, 'Outgoings', true, errors)
  if (errors.length > 0) return { ok: false as const, errors }
  const inputs: BudgetPageInputs = { pay: fromPence(raw.pay as number), payPeriod: raw.payPeriod as PayPeriod, income, outgoings }
  return { ok: true as const, inputs }
}

/** The engine's inputs: Your pay first among the income lines (BD3). */
export function toEngineInputs(inputs: BudgetPageInputs): BudgetInputs {
  return { income: [{ name: PAY_LABEL, amount: inputs.pay, period: inputs.payPeriod }, ...inputs.income], outgoings: inputs.outgoings }
}

export const calculate = (inputs: BudgetPageInputs): BudgetOutcome => budget(toEngineInputs(inputs))

/** Why the engine refused, in words with no figures. */
export const PROBLEM_MESSAGES: Record<BudgetProblemReason, string> = {
  'not-a-list': 'This is not a list of lines.',
  'too-many-lines': 'This list has more lines than Sumyard holds.',
  'not-money': 'Enter an amount in pounds and pence.',
  'below-minimum': 'Enter nothing or more.',
  'above-maximum': 'This is above the most Sumyard models.',
  'not-a-choice': 'Choose one of the options.',
  'too-large': 'The totals would grow past the largest amount Sumyard can work out exactly. Try smaller amounts.',
}

const FIELD_NAMES: Record<BudgetProblem['field'], string> = { income: 'Income', outgoings: 'Outgoings', result: 'Result' }

/** The engine's refusal as an InputRefusal, for RefusalNotice and compare. */
export function inputRefusal(problems: readonly BudgetProblem[]): InputRefusal {
  return {
    ok: false,
    kind: 'inputs',
    problems: problems.map(({ field, index, reason }) => ({
      field: index === undefined ? field : `${field}-${index}`,
      label: index === undefined ? FIELD_NAMES[field] : `${FIELD_NAMES[field]}, line ${index + 1}`,
      message: PROBLEM_MESSAGES[reason],
    })),
  }
}

/** What-if amounts over the inputs (BD7): Your pay, and lines by their place in each list. Page state only. */
export interface WhatIf {
  readonly pay?: Money
  readonly income: ReadonlyMap<number, Money>
  readonly outgoings: ReadonlyMap<number, Money>
}

const overlay = <L extends IncomeLine>(lines: readonly L[], amounts: ReadonlyMap<number, Money>): readonly L[] =>
  amounts.size === 0 ? lines : lines.map((l, i) => (amounts.has(i) ? { ...l, amount: amounts.get(i)! } : l))

/** The inputs with the what-if amounts in place; lines no longer there are ignored. A fresh object; the inputs are untouched. */
export function withWhatIf(inputs: BudgetPageInputs, whatIf: WhatIf): BudgetPageInputs {
  return {
    ...inputs,
    pay: whatIf.pay ?? inputs.pay,
    income: overlay(inputs.income, whatIf.income),
    outgoings: overlay(inputs.outgoings, whatIf.outgoings),
  }
}

export type SectionId = 'income' | BudgetKind

/** A section's lines differ from a fresh page's (an amount, a name, a period, a line added or removed), so it opens on load. */
export function sectionSet(id: SectionId, inputs: BudgetPageInputs): boolean {
  if (id === 'income') return inputs.income.length > 0
  const ofKind = (lines: readonly OutgoingLine[]) => lines.filter((l) => l.kind === id)
  return canonicalJson(ofKind(inputs.outgoings)) !== canonicalJson(ofKind(DEFAULT_LINES))
}

export const NOT_APPLICABLE = 'n/a'

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const share = (label: string, value: Ratio | null): SummaryRow => ({
  label,
  value: value === null ? { kind: 'text', text: NOT_APPLICABLE } : { kind: 'ratio', ratio: value },
})

export const budgetCalculator: CalculatorDefinition<BudgetPageInputs> = defineCalculator<BudgetPageInputs>({
  id: 'budget',
  name: 'Household budget',
  summary:
    'Your income after tax and where it goes: spending, a joint account, debt payments and savings, what is left over and the share of your income each takes, a month or a year, with what-if sliders.',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({ pay: ZERO, payPeriod: 'monthly', income: [], outgoings: DEFAULT_LINES.map((l) => ({ ...l })) }),
  validateInputs: validate,
  migrateInputs(from) {
    // Version 1 is the first: there is nothing older to migrate from.
    throw new Error(`The household budget has no inputs version ${from} to migrate from`)
  },
  summarise(inputs) {
    const rows: SummaryRow[] = [
      money(PAY_LABEL, inputs.pay),
      { label: 'Pay entered', value: { kind: 'text', text: PERIOD_LABELS[inputs.payPeriod] } },
      { label: 'Extra income lines', value: { kind: 'count', count: inputs.income.length } },
      { label: 'Outgoing lines', value: { kind: 'count', count: inputs.outgoings.length } },
    ]
    const outcome = calculate(inputs)
    if (!outcome.ok) return { inputs: rows, results: inputRefusal(outcome.problems) }
    const r = outcome.result
    return {
      inputs: rows,
      results: {
        ok: true,
        rows: [
          money('Income a year', r.income.year),
          money('Outgoings a year', r.outgoings.year),
          money('Left over a year', r.leftover.year),
          ...r.perKind.map((t) => money(`${KIND_LABELS[t.kind]} a year`, t.year)),
          share('Savings rate', r.savingsRate),
        ],
      },
    }
  },
})
