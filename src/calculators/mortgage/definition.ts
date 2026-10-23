import { addMonths } from '@/lib/calendar'
import { formatAmountInput, formatIsoDate, formatPercent } from '@/lib/format'
import { MAX_FINANCE_RATE, MAX_INPUT_AMOUNT, MAX_LIST_ITEMS, MAX_MORTGAGE_TERM_MONTHS } from '@/lib/inputLimits'
import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import { add, compare, fromPence, type Money, type Ratio, ratio, ZERO } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { checkUntrustedJson, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type InputRefusal, type SummaryRow } from '../registry'
import { overpay } from './calc'
import type {
  DayCount,
  InterestMethod,
  MortgageField,
  MortgageInputs,
  MortgageProblem,
  MortgageProblemReason,
  MortgageResult,
  OverpaymentEffect,
  RepaymentType,
} from './types'

/*
 * The mortgage overpayment page's registry entry (M2, inputs version 1): the
 * inputs a scenario stores, their defaults, validation, how they map to the
 * engine's MortgageInputs (dates to payment months), the compare summary and
 * the page's section summaries. Uses no tax rules (taxRules: 'none', MO11).
 * No figure here: bounds come from src/lib/inputLimits.ts and every result
 * from the engine (./calc.ts).
 */

export type AllowanceKind = 'rate' | 'amount'

/** A lump sum as the page holds it: a date (paid with the first payment on or after it, MO6) and an amount. */
export interface LumpSumInput {
  readonly date: IsoDate | null
  readonly amount: Money
}

/**
 * What the page stores. Money is integer pence; each rate is its canonical
 * percentage text; dates are ISO. A contract box the results need starts
 * empty (null): no made-up figures (U18).
 */
export interface MortgagePageInputs {
  readonly startDate: IsoDate | null
  readonly balance: Money | null
  readonly termYears: number | null
  readonly termExtraMonths: number
  readonly repaymentType: RepaymentType
  /** On a fixed rate now; off means the rate after the fixed rate applies from the start (MO1). */
  readonly fixed: boolean
  readonly fixedRate: string | null
  readonly fixedEndDate: IsoDate | null
  readonly reversionRate: string | null
  /** From the first payment to the end of the term; nothing for none. */
  readonly monthly: Money
  readonly effect: OverpaymentEffect
  readonly lumpSums: readonly LumpSumInput[]
  readonly erc: boolean
  readonly ercRate: string | null
  /** Null: when the fixed rate ends (MO7). */
  readonly ercEndDate: IsoDate | null
  readonly allowanceKind: AllowanceKind
  readonly allowanceRate: string | null
  readonly allowanceAmount: Money | null
  /** MO16: already overpaid in the allowance year running now. */
  readonly allowanceUsed: Money
  /** MO16: payments left in that year; nothing for a fresh year from the first payment. */
  readonly paymentsToReset: number
  readonly interestMethod: InterestMethod
  readonly dayCount: DayCount
}

export type PageField = keyof MortgagePageInputs

export const REPAYMENT_TYPES: readonly RepaymentType[] = ['repayment', 'interest-only']
export const EFFECTS: readonly OverpaymentEffect[] = ['reduce-term', 'reduce-payment']
export const ALLOWANCE_KINDS: readonly AllowanceKind[] = ['rate', 'amount']
export const INTEREST_METHODS: readonly InterestMethod[] = ['monthly', 'daily']
export const DAY_COUNTS: readonly DayCount[] = ['actual/365', 'actual/actual']

export const REPAYMENT_LABELS: Record<RepaymentType, string> = { repayment: 'Repayment', 'interest-only': 'Interest-only' }
export const EFFECT_LABELS: Record<OverpaymentEffect, string> = {
  'reduce-term': 'Shorten the term',
  'reduce-payment': 'Lower the payment',
}
export const METHOD_LABELS: Record<InterestMethod, string> = { monthly: 'Monthly', daily: 'Daily' }
export const DAY_COUNT_LABELS: Record<DayCount, string> = {
  'actual/365': 'actual/365',
  'actual/actual': 'actual/actual',
}

/** Each field's name, in the order the page shows them; used in errors, refusals and compare. */
export const FIELD_LABELS: Record<PageField, string> = {
  startDate: 'Start date',
  balance: 'Balance owed',
  termYears: 'Years left',
  termExtraMonths: 'Months left',
  repaymentType: 'Repayment type',
  fixed: 'On a fixed rate',
  fixedRate: 'Fixed rate',
  fixedEndDate: 'Fixed rate ends',
  reversionRate: 'Interest rate after the fixed rate',
  monthly: 'Monthly overpayment',
  effect: 'Overpaying',
  lumpSums: 'Lump sums',
  erc: 'Early repayment charge applies',
  ercRate: 'Early repayment charge',
  ercEndDate: 'Charge ends',
  allowanceKind: 'Penalty-free limit as',
  allowanceRate: 'Penalty-free limit',
  allowanceAmount: 'Penalty-free limit',
  allowanceUsed: 'Allowance used this year',
  paymentsToReset: 'Payments until the allowance resets',
  interestMethod: 'Interest worked out',
  dayCount: 'Day count',
}

/** Decimal places a percentage input accepts. */
export const RATE_DECIMALS = 2
export const RATE_LIMITS = { min: ratio(0, 1), max: MAX_FINANCE_RATE, maxDecimals: RATE_DECIMALS }
export const BALANCE_LIMITS = { min: fromPence(1), max: MAX_INPUT_AMOUNT }
export const AMOUNT_LIMITS = { min: ZERO, max: MAX_INPUT_AMOUNT }
export const YEAR_LIMITS = { min: 0, max: Math.floor(MAX_MORTGAGE_TERM_MONTHS / MONTHS_PER_YEAR) }
export const EXTRA_MONTH_LIMITS = { min: 0, max: MONTHS_PER_YEAR - 1 }
export const RESET_LIMITS = { min: 0, max: MONTHS_PER_YEAR }

const isWhole = (value: unknown, least: number, most: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= most
const isAmount = (value: unknown, least: Money): value is number => isWhole(value, least, MAX_INPUT_AMOUNT)
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T)
const isRate = (value: unknown): value is string => isCanonicalPercent(value, RATE_LIMITS)
const orNull =
  <T>(test: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || test(value)

const RATE_MESSAGE = 'must be a percentage from nothing up to the most Sumyard models, with at most two decimal places.'
const DATE_MESSAGE = 'must be a real date, written year-month-day.'

/** The problem with one stored field, in words; undefined when it is fine. */
function fieldProblem(field: Exclude<PageField, 'lumpSums'>, value: unknown): string | undefined {
  const label = FIELD_LABELS[field]
  const say = (ok: boolean, message: string) => (ok ? undefined : `${label} ${message}`)
  switch (field) {
    case 'startDate':
    case 'fixedEndDate':
    case 'ercEndDate':
      return say(orNull(isIsoDate)(value), DATE_MESSAGE)
    case 'balance':
      return say(value === null || isAmount(value, BALANCE_LIMITS.min), 'must be whole pence from a penny up to the input limit.')
    case 'allowanceAmount':
      return say(value === null || isAmount(value, ZERO), 'must be whole pence from nothing up to the input limit.')
    case 'monthly':
    case 'allowanceUsed':
      return say(isAmount(value, ZERO), 'must be whole pence from nothing up to the input limit.')
    case 'termYears':
      return say(
        value === null || isWhole(value, YEAR_LIMITS.min, YEAR_LIMITS.max),
        'must be whole years, up to the longest Sumyard models.',
      )
    case 'termExtraMonths':
      return say(isWhole(value, EXTRA_MONTH_LIMITS.min, EXTRA_MONTH_LIMITS.max), 'must be whole months, fewer than a year.')
    case 'paymentsToReset':
      return say(isWhole(value, RESET_LIMITS.min, RESET_LIMITS.max), 'must be whole payments, up to a year’s.')
    case 'fixedRate':
    case 'reversionRate':
    case 'ercRate':
    case 'allowanceRate':
      return say(orNull(isRate)(value), RATE_MESSAGE)
    case 'fixed':
    case 'erc':
      return say(typeof value === 'boolean', 'must be on or off.')
    case 'repaymentType':
      return say(isOneOf(REPAYMENT_TYPES, value), 'must be repayment or interest-only.')
    case 'effect':
      return say(isOneOf(EFFECTS, value), 'must shorten the term or lower the payment.')
    case 'allowanceKind':
      return say(isOneOf(ALLOWANCE_KINDS, value), 'must be a percentage or an amount.')
    case 'interestMethod':
      return say(isOneOf(INTEREST_METHODS, value), 'must be monthly or daily.')
    case 'dayCount':
      return say(isOneOf(DAY_COUNTS, value), `must be ${DAY_COUNTS.join(' or ')}.`)
  }
}

const SCALAR_FIELDS = (Object.keys(FIELD_LABELS) as PageField[]).filter((f): f is Exclude<PageField, 'lumpSums'> => f !== 'lumpSums')

function lumpProblems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [`${FIELD_LABELS.lumpSums} must be a list.`]
  if (raw.length > MAX_LIST_ITEMS) return [`${FIELD_LABELS.lumpSums} can hold at most ${MAX_LIST_ITEMS}.`]
  return raw.flatMap((lump: unknown, index) => {
    const name = `Lump sum ${index + 1}`
    if (!isRecord(lump)) return [`${name} must be a date and an amount.`]
    const problems: string[] = []
    if (!orNull(isIsoDate)(lump.date)) problems.push(`${name} date ${DATE_MESSAGE}`)
    if (!isAmount(lump.amount, ZERO)) problems.push(`${name} amount must be whole pence from nothing up to the input limit.`)
    return problems
  })
}

/** Checks untrusted inputs (storage, an imported file) field by field and builds a fresh object. */
function validate(raw: unknown) {
  if (!isRecord(raw) || Array.isArray(raw))
    return { ok: false as const, errors: ['The inputs are not a set of mortgage overpayment inputs.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false as const, errors: [`The inputs are not safe to read: ${hostile}`] }
  const errors = [...SCALAR_FIELDS.flatMap((field) => fieldProblem(field, raw[field]) ?? []), ...lumpProblems(raw.lumpSums)]
  if (errors.length > 0) return { ok: false as const, errors }
  const money = (value: unknown) => (value === null ? null : fromPence(value as number))
  const inputs: MortgagePageInputs = {
    startDate: raw.startDate as IsoDate | null,
    balance: money(raw.balance),
    termYears: raw.termYears as number | null,
    termExtraMonths: raw.termExtraMonths as number,
    repaymentType: raw.repaymentType as RepaymentType,
    fixed: raw.fixed as boolean,
    fixedRate: raw.fixedRate as string | null,
    fixedEndDate: raw.fixedEndDate as IsoDate | null,
    reversionRate: raw.reversionRate as string | null,
    monthly: fromPence(raw.monthly as number),
    effect: raw.effect as OverpaymentEffect,
    lumpSums: (raw.lumpSums as Record<string, unknown>[]).map((lump) => ({
      date: lump.date as IsoDate | null,
      amount: fromPence(lump.amount as number),
    })),
    erc: raw.erc as boolean,
    ercRate: raw.ercRate as string | null,
    ercEndDate: raw.ercEndDate as IsoDate | null,
    allowanceKind: raw.allowanceKind as AllowanceKind,
    allowanceRate: raw.allowanceRate as string | null,
    allowanceAmount: money(raw.allowanceAmount),
    allowanceUsed: fromPence(raw.allowanceUsed as number),
    paymentsToReset: raw.paymentsToReset as number,
    interestMethod: raw.interestMethod as InterestMethod,
    dayCount: raw.dayCount as DayCount,
  }
  return { ok: true as const, inputs }
}

/** The whole months left (MO12); the engine refuses one outside its bounds. */
export const termOf = (inputs: MortgagePageInputs) => (inputs.termYears ?? 0) * MONTHS_PER_YEAR + inputs.termExtraMonths

/** The first payment month, from one to the term, on or after a date (MO6: overpayments go with a payment); null if none. */
export function paymentMonthOnOrAfter(start: IsoDate, date: IsoDate, term: number): number | null {
  for (let month = 1; month <= term; month++) if (addMonths(start, month) >= date) return month
  return null
}

/** How many payment dates, from the first to the term's, fall on or before a date: the fixed rate's months (MO1, MO4). */
export function paymentsOnOrBefore(start: IsoDate, date: IsoDate, term: number): number {
  let months = 0
  while (months < term && addMonths(start, months + 1) <= date) months++
  return months
}

/** A field the results need and that is empty; a lump sum's date is `lumpSums.<index>.date`. */
export type NeededField = PageField | `lumpSums.${number}.date`

export type PageProblem = InputRefusal['problems'][number]

export type EngineInputs =
  | { readonly ok: true; readonly inputs: MortgageInputs }
  | { readonly ok: false; readonly kind: 'missing'; readonly fields: readonly NeededField[] }
  | { readonly ok: false; readonly kind: 'refused'; readonly problems: readonly PageProblem[] }

const ENTER = 'Enter this to see results.'

/** The label of a field the results need. */
export const neededLabel = (field: NeededField) => {
  const lump = /^lumpSums\.(\d+)\.date$/.exec(field)
  return lump ? `Lump sum ${Number(lump[1]) + 1} date` : FIELD_LABELS[field as PageField]
}

/**
 * The engine's inputs for valid page inputs, or what is still needed, or the
 * dates that fall outside the term. Dates become payment months: a lump sum
 * goes with the first payment on or after its date, and the fixed rate (and
 * the charge) covers the payments on or before its end date.
 */
export function toEngineInputs(inputs: MortgagePageInputs): EngineInputs {
  const { startDate, balance, termYears, fixed, fixedRate, fixedEndDate, reversionRate, erc } = inputs
  const term = termOf(inputs)
  const termInBounds = term >= 1 && term <= MAX_MORTGAGE_TERM_MONTHS
  // Out of bounds, the engine refuses the term; dates are placed within the longest term so only that is reported.
  const span = termInBounds ? term : MAX_MORTGAGE_TERM_MONTHS
  const fixedMonths = fixed && startDate && fixedEndDate ? paymentsOnOrBefore(startDate, fixedEndDate, span) : fixed ? null : 0
  const allFixed = fixedMonths !== null && fixedMonths === span && termInBounds

  const missing: NeededField[] = []
  if (startDate === null) missing.push('startDate')
  if (balance === null) missing.push('balance')
  if (termYears === null) missing.push('termYears')
  if (fixed && fixedRate === null) missing.push('fixedRate')
  if (fixed && fixedEndDate === null) missing.push('fixedEndDate')
  if (reversionRate === null && !allFixed) missing.push('reversionRate')
  if (erc && inputs.ercRate === null) missing.push('ercRate')
  if (erc && !fixed && inputs.ercEndDate === null) missing.push('ercEndDate')
  if (erc && inputs.allowanceKind === 'rate' && inputs.allowanceRate === null) missing.push('allowanceRate')
  if (erc && inputs.allowanceKind === 'amount' && inputs.allowanceAmount === null) missing.push('allowanceAmount')
  inputs.lumpSums.forEach((lump, index) => {
    if (lump.date === null) missing.push(`lumpSums.${index}.date`)
  })
  if (missing.length > 0 || startDate === null || balance === null) return { ok: false, kind: 'missing', fields: missing }

  const problems: PageProblem[] = []
  const lumpSums = inputs.lumpSums.map((lump, index) => {
    const date = lump.date as IsoDate
    const month = date <= startDate ? null : paymentMonthOnOrAfter(startDate, date, span)
    if (month === null)
      problems.push({
        field: `lumpSums.${index}.date`,
        label: `Lump sum ${index + 1} date`,
        message:
          date <= startDate
            ? 'This date is on or before the start date: enter a later one.'
            : 'This date is after the last payment in the term: enter an earlier one.',
      })
    return { month: month ?? 1, amount: lump.amount }
  })
  if (problems.length > 0) return { ok: false, kind: 'refused', problems }

  const reversion = reversionRate === null ? percentRatio(fixedRate as string) : percentRatio(reversionRate)
  const fixedEndMonth = fixedMonths ?? 0
  return {
    ok: true,
    inputs: {
      startDate,
      balance,
      termMonths: term,
      repaymentType: inputs.repaymentType,
      fixedRate: fixed ? percentRatio(fixedRate as string) : reversion,
      fixedEndMonth,
      reversionRate: reversion,
      effect: inputs.effect,
      regular: compare(inputs.monthly, ZERO) > 0 ? { amount: inputs.monthly, fromMonth: 1, toMonth: span } : null,
      lumpSums,
      erc: erc
        ? {
            rate: percentRatio(inputs.ercRate as string),
            endMonth: inputs.ercEndDate === null ? fixedEndMonth : paymentsOnOrBefore(startDate, inputs.ercEndDate, span),
            allowance:
              inputs.allowanceKind === 'rate'
                ? { kind: 'rate', rate: percentRatio(inputs.allowanceRate as string) }
                : { kind: 'amount', amount: inputs.allowanceAmount as Money },
            usedThisYear: inputs.allowanceUsed,
            paymentsToReset: inputs.paymentsToReset,
          }
        : null,
      policy: { interestMethod: inputs.interestMethod, dayCount: inputs.dayCount },
    },
  }
}

/** Why the engine refused, in words with no figures. */
export const PROBLEM_MESSAGES: Record<MortgageProblemReason, string> = {
  'not-money': 'Enter an amount in pounds and pence.',
  'not-whole': 'Enter a whole number.',
  'not-a-rate': 'Enter a percentage.',
  'not-a-choice': 'Choose one of the options.',
  'not-a-date': 'Enter a real date, written year-month-day.',
  'below-minimum': 'This is below the least Sumyard models.',
  'above-maximum': 'This is above the most Sumyard models.',
  'out-of-order': 'This comes before the date it follows.',
  'too-many': 'There are more than Sumyard models.',
  'too-large': 'The figures would grow past the largest amount Sumyard can work out exactly. Try a smaller balance or a lower rate.',
}

const ENGINE_LABELS: Record<Exclude<MortgageField, 'lumpSumAmount' | 'lumpSumMonth'>, string> = {
  startDate: FIELD_LABELS.startDate,
  balance: FIELD_LABELS.balance,
  termMonths: 'Term left',
  repaymentType: FIELD_LABELS.repaymentType,
  fixedRate: FIELD_LABELS.fixedRate,
  fixedEndMonth: FIELD_LABELS.fixedEndDate,
  reversionRate: FIELD_LABELS.reversionRate,
  effect: FIELD_LABELS.effect,
  regular: FIELD_LABELS.monthly,
  regularAmount: FIELD_LABELS.monthly,
  regularFromMonth: FIELD_LABELS.monthly,
  regularToMonth: FIELD_LABELS.monthly,
  lumpSums: FIELD_LABELS.lumpSums,
  erc: FIELD_LABELS.erc,
  ercRate: FIELD_LABELS.ercRate,
  ercEndMonth: FIELD_LABELS.ercEndDate,
  allowance: FIELD_LABELS.allowanceKind,
  allowanceRate: FIELD_LABELS.allowanceRate,
  allowanceAmount: FIELD_LABELS.allowanceAmount,
  allowanceUsed: FIELD_LABELS.allowanceUsed,
  paymentsToReset: FIELD_LABELS.paymentsToReset,
  interestMethod: FIELD_LABELS.interestMethod,
  dayCount: FIELD_LABELS.dayCount,
  result: 'Result',
}

export const engineLabel = ({ field, index }: MortgageProblem) =>
  field === 'lumpSumAmount'
    ? `Lump sum ${(index ?? 0) + 1} amount`
    : field === 'lumpSumMonth'
      ? `Lump sum ${(index ?? 0) + 1} date`
      : ENGINE_LABELS[field]

/** The page's outcome: inputs still needed, a refusal by field, or the engine's result on the mapped inputs. */
export type PageOutcome =
  | { readonly kind: 'missing'; readonly fields: readonly NeededField[]; readonly refusal: InputRefusal }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'ok'; readonly inputs: MortgageInputs; readonly result: MortgageResult }

const refusalOf = (problems: readonly PageProblem[]): InputRefusal => ({ ok: false, kind: 'inputs', problems })

export function calculate(inputs: MortgagePageInputs): PageOutcome {
  const engine = toEngineInputs(inputs)
  if (!engine.ok && engine.kind === 'missing')
    return {
      kind: 'missing',
      fields: engine.fields,
      refusal: refusalOf(engine.fields.map((field) => ({ field, label: neededLabel(field), message: ENTER }))),
    }
  if (!engine.ok) return { kind: 'refused', refusal: refusalOf(engine.problems) }
  const outcome = overpay(engine.inputs)
  if (!outcome.ok)
    return {
      kind: 'refused',
      refusal: refusalOf(outcome.problems.map((p) => ({ field: p.field, label: engineLabel(p), message: PROBLEM_MESSAGES[p.reason] }))),
    }
  return { kind: 'ok', inputs: engine.inputs, result: outcome.result }
}

/** The inputs with the what-if's monthly overpayment (U41): page state only, never stored. */
export const withWhatIf = (inputs: MortgagePageInputs, monthly: Money): MortgagePageInputs => ({ ...inputs, monthly })

export type SectionId = 'loan' | 'fixed' | 'overpay' | 'erc' | 'advanced'

/** The fields in each section. */
export const SECTION_FIELDS: Record<SectionId, readonly PageField[]> = {
  loan: ['startDate', 'balance', 'termYears', 'termExtraMonths', 'repaymentType'],
  fixed: ['fixed', 'fixedRate', 'fixedEndDate', 'reversionRate'],
  overpay: ['monthly', 'lumpSums', 'effect'],
  erc: ['erc', 'ercRate', 'ercEndDate', 'allowanceKind', 'allowanceRate', 'allowanceAmount', 'allowanceUsed', 'paymentsToReset'],
  advanced: ['interestMethod', 'dayCount'],
}

export const NOT_SET = 'Not set'
export const NEEDS_FIXING = 'Fix the highlighted input'

const sectionOf = (field: NeededField): SectionId =>
  field.startsWith('lumpSums.')
    ? 'overpay'
    : (Object.keys(SECTION_FIELDS) as SectionId[]).find((id) => SECTION_FIELDS[id].includes(field as PageField))!

/** A section's inputs differ from the defaults (so it opens on load). */
export function sectionSet(id: SectionId, inputs: MortgagePageInputs): boolean {
  const defaults = mortgageCalculator.defaultInputs()
  return SECTION_FIELDS[id].some((field) =>
    field === 'lumpSums' ? inputs.lumpSums.length > 0 : JSON.stringify(inputs[field]) !== JSON.stringify(defaults[field]),
  )
}

/** The fields the results still need in a section. */
export function sectionMissing(id: SectionId, inputs: MortgagePageInputs): readonly NeededField[] {
  const engine = toEngineInputs(inputs)
  return !engine.ok && engine.kind === 'missing' ? engine.fields.filter((field) => sectionOf(field) === id) : []
}

/** A section holds an input the results still need (so it opens on load: U42). */
export const sectionNeeded = (id: SectionId, inputs: MortgagePageInputs) => sectionMissing(id, inputs).length > 0

const pounds = (amount: Money) => `£${formatAmountInput(amount)}`
const pct = (text: string) => formatPercent(percentRatio(text))
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** Whole months as years and months: "25 years", "2 years 3 months", "7 months". */
export function yearsAndMonths(months: number): string {
  const years = Math.floor(months / MONTHS_PER_YEAR)
  const rest = months % MONTHS_PER_YEAR
  const parts = [years > 0 ? plural(years, 'year') : '', rest > 0 || years === 0 ? plural(rest, 'month') : ''].filter(Boolean)
  return parts.join(' ')
}

/** A section header's one-line summary of its inputs (docs/ui-patterns.md, U2). */
export function sectionSummary(id: SectionId, inputs: MortgagePageInputs, invalid: readonly string[]): string {
  const inSection = (field: string) => sectionOf((field.startsWith('lumpSums.') ? 'lumpSums' : field) as NeededField) === id
  if (invalid.some((field) => (field in FIELD_LABELS || field.startsWith('lumpSums.') ? inSection(field) : false))) return NEEDS_FIXING
  const missing = sectionMissing(id, inputs)
  if (missing.length > 0) return `Needs ${missing.map((field) => lower(neededLabel(field))).join(', ')}`
  if (!sectionSet(id, inputs)) return NOT_SET
  switch (id) {
    case 'loan':
      return `${pounds(inputs.balance as Money)} over ${yearsAndMonths(termOf(inputs))}, ${lower(REPAYMENT_LABELS[inputs.repaymentType])}, from ${formatIsoDate(inputs.startDate as IsoDate)}`
    case 'fixed': {
      const after = inputs.reversionRate === null ? '' : pct(inputs.reversionRate)
      if (!inputs.fixed) return `No fixed rate; ${after}`
      return `${pct(inputs.fixedRate as string)} to ${formatIsoDate(inputs.fixedEndDate as IsoDate)}${after ? `, then ${after}` : ''}`
    }
    case 'overpay': {
      const count = inputs.lumpSums.length
      const parts = [
        compare(inputs.monthly, ZERO) > 0 ? `${pounds(inputs.monthly)} a month` : '',
        count === 0 ? '' : count === 1 ? 'one lump sum' : `${count} lump sums`,
      ].filter(Boolean)
      return `${parts.length > 0 ? parts.join(' and ') : 'No overpayments'}; ${lower(EFFECT_LABELS[inputs.effect])}`
    }
    case 'erc': {
      if (!inputs.erc) return 'No charge'
      const limit = inputs.allowanceKind === 'rate' ? pct(inputs.allowanceRate as string) : pounds(inputs.allowanceAmount as Money)
      const until = inputs.ercEndDate === null ? 'the fixed rate ends' : formatIsoDate(inputs.ercEndDate)
      const used =
        inputs.paymentsToReset > 0 && (compare(inputs.allowanceUsed, ZERO) > 0 || inputs.paymentsToReset < MONTHS_PER_YEAR)
          ? `; ${pounds(inputs.allowanceUsed)} used, ${plural(inputs.paymentsToReset, 'payment')} to the reset`
          : ''
      return `${pct(inputs.ercRate as string)} above ${limit} a year, until ${until}${used}`
    }
    case 'advanced':
      return inputs.interestMethod === 'daily' ? `Daily, ${DAY_COUNT_LABELS[inputs.dayCount]}` : 'Monthly'
  }
}

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const rate = (label: string, value: Ratio): SummaryRow => ({ label, value: { kind: 'ratio', ratio: value } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })
const count = (label: string, value: number): SummaryRow => ({ label, value: { kind: 'count', count: value } })

const NOT_ENTERED = 'Not entered'
const rateOrNot = (label: string, value: string | null) => (value === null ? text(label, NOT_ENTERED) : rate(label, percentRatio(value)))
const dateText = (date: IsoDate | null) => (date === null ? NOT_ENTERED : formatIsoDate(date))

function inputRows(inputs: MortgagePageInputs): SummaryRow[] {
  const lumpTotal = inputs.lumpSums.reduce((total, lump) => add(total, lump.amount), ZERO)
  const limit =
    inputs.allowanceKind === 'rate'
      ? rateOrNot(FIELD_LABELS.allowanceRate, inputs.allowanceRate)
      : inputs.allowanceAmount === null
        ? text(FIELD_LABELS.allowanceAmount, NOT_ENTERED)
        : money(FIELD_LABELS.allowanceAmount, inputs.allowanceAmount)
  return [
    text(FIELD_LABELS.startDate, dateText(inputs.startDate)),
    inputs.balance === null ? text(FIELD_LABELS.balance, NOT_ENTERED) : money(FIELD_LABELS.balance, inputs.balance),
    count('Term left', termOf(inputs)),
    text(FIELD_LABELS.repaymentType, REPAYMENT_LABELS[inputs.repaymentType]),
    inputs.fixed ? rateOrNot(FIELD_LABELS.fixedRate, inputs.fixedRate) : text(FIELD_LABELS.fixedRate, 'None'),
    text(FIELD_LABELS.fixedEndDate, inputs.fixed ? dateText(inputs.fixedEndDate) : 'No fixed rate'),
    rateOrNot(FIELD_LABELS.reversionRate, inputs.reversionRate),
    money(FIELD_LABELS.monthly, inputs.monthly),
    money(FIELD_LABELS.lumpSums, lumpTotal),
    text(FIELD_LABELS.effect, EFFECT_LABELS[inputs.effect]),
    inputs.erc ? rateOrNot(FIELD_LABELS.ercRate, inputs.ercRate) : text(FIELD_LABELS.ercRate, 'None'),
    inputs.erc ? limit : text(FIELD_LABELS.allowanceRate, 'No charge'),
    money(FIELD_LABELS.allowanceUsed, inputs.erc ? inputs.allowanceUsed : ZERO),
    count(FIELD_LABELS.paymentsToReset, inputs.erc ? inputs.paymentsToReset : 0),
    text(
      FIELD_LABELS.interestMethod,
      inputs.interestMethod === 'daily' ? `Daily, ${DAY_COUNT_LABELS[inputs.dayCount]}` : METHOD_LABELS.monthly,
    ),
  ]
}

function resultRows(engine: MortgageInputs, result: MortgageResult): SummaryRow[] {
  const { overpaying, baseline } = result
  const returnOf = (period: 'fixed' | 'reversion') => result.returns.find((r) => r.period === period)
  const fixedReturn = returnOf('fixed')
  const reversionReturn = returnOf('reversion')
  const breakEven = result.charge?.breakEvenMonth
  return [
    money('Interest saved', result.interestSaved),
    count('Term cut (months)', result.monthsSaved),
    text('New payoff date', overpaying.payoffDate === null ? 'Not paid off in the term' : formatIsoDate(overpaying.payoffDate)),
    money('Total paid', overpaying.totalPaid),
    money('Early repayment charge paid', overpaying.totalErc),
    ...(result.charge
      ? [
          money('Net saving', result.charge.netSaving),
          text(
            'Break-even',
            breakEven === null || breakEven === undefined ? 'Not within the term' : formatIsoDate(addMonths(engine.startDate, breakEven)),
          ),
        ]
      : []),
    money('Payment now', baseline.paymentNow),
    ...(overpaying.balanceAtFixedEnd === null ? [] : [money('Balance when the fixed rate ends', overpaying.balanceAtFixedEnd)]),
    ...(fixedReturn ? [rate('Return while fixed', fixedReturn.effective)] : []),
    ...(reversionReturn ? [rate('Return after the fixed rate', reversionReturn.effective)] : []),
  ]
}

export const mortgageCalculator: CalculatorDefinition<MortgagePageInputs> = defineCalculator<MortgagePageInputs>({
  id: 'mortgage',
  name: 'Mortgage overpayment',
  summary:
    'What overpaying your mortgage does, monthly or as lump sums, through a fixed rate and after it: interest saved, the time cut or a lower payment, the balance over time, and any early repayment charge with its break-even point.',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({
    startDate: null,
    balance: null,
    termYears: null,
    termExtraMonths: 0,
    repaymentType: 'repayment',
    fixed: true,
    fixedRate: null,
    fixedEndDate: null,
    reversionRate: null,
    monthly: ZERO,
    effect: 'reduce-term',
    lumpSums: [],
    erc: false,
    ercRate: null,
    ercEndDate: null,
    allowanceKind: 'rate',
    allowanceRate: null,
    allowanceAmount: null,
    allowanceUsed: ZERO,
    paymentsToReset: 0,
    interestMethod: 'monthly',
    dayCount: 'actual/365',
  }),
  validateInputs: validate,
  migrateInputs(from) {
    // Version 1 is the first: there is nothing older to migrate from.
    throw new Error(`The mortgage overpayment calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs) {
    const rows = inputRows(inputs)
    const outcome = calculate(inputs)
    if (outcome.kind !== 'ok') return { inputs: rows, results: outcome.refusal }
    return { inputs: rows, results: { ok: true, rows: resultRows(outcome.inputs, outcome.result) } }
  },
})
