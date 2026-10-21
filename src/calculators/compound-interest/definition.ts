import { formatPercent } from '@/lib/format'
import {
  DEFAULT_PROJECTION_YEARS,
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_CONTRIBUTION_INCREASE,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
} from '@/lib/inputLimits'
import { fromPence, type Money, type Ratio, ratio, ZERO } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import type { ContributionFrequency, Frequency } from '@/lib/periods'
import { checkUntrustedJson, isRecord } from '@/lib/validate'
import { type CalculatorDefinition, defineCalculator, type InputRefusal, type SummaryRow } from '../registry'
import { project } from './calc'
import { paidIn } from './results'
import type { CompoundField, CompoundInputs, CompoundOutcome, CompoundProblem, CompoundProblemReason, Timing } from './types'

/*
 * The compound interest page's registry entry (slice 2b, inputs version 1):
 * the inputs a scenario stores, their defaults, validation, how they map to
 * the engine's CompoundInputs, the compare summary and the page's section
 * summaries. Uses no tax rules (taxRules: 'none'): scenarios carry no tax
 * year and summarise ignores the config. No figure here: bounds come from
 * src/lib/inputLimits.ts and every result from the engine (./calc.ts).
 */

/** What the page stores. Money is integer pence; each rate is its canonical percentage text (as parsePercentText gives it). */
export interface CompoundPageInputs {
  readonly lumpSum: Money
  readonly contribution: Money
  readonly contributionFrequency: ContributionFrequency
  readonly timing: Timing
  readonly years: number
  readonly growthRate: string
  readonly compounding: Frequency
  readonly feeRate: string
  readonly contributionIncrease: string
  readonly inflationRate: string
}

export const CONTRIBUTION_FREQUENCIES: readonly ContributionFrequency[] = ['weekly', 'monthly', 'quarterly', 'annual']
export const COMPOUNDING_FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual']
export const TIMINGS: readonly Timing[] = ['start', 'end']

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Yearly',
}

export const TIMING_LABELS: Record<Timing, string> = { start: 'Start of each period', end: 'End of each period' }

/** Each field's name, in the order the page shows them; used in errors, refusals and compare. */
export const FIELD_LABELS: Record<CompoundField, string> = {
  lumpSum: 'Lump sum',
  contribution: 'Regular contribution',
  contributionFrequency: 'Contribution frequency',
  timing: 'Contribution timing',
  years: 'Years',
  growthRate: 'Growth rate (nominal, a year)',
  compounding: 'Compounding',
  feeRate: 'Annual fee',
  contributionIncrease: 'Annual contribution increase',
  inflationRate: 'Inflation',
}

const FIELDS = Object.keys(FIELD_LABELS) as CompoundField[]

type RateField = 'growthRate' | 'feeRate' | 'contributionIncrease' | 'inflationRate'

const negate = (r: Ratio): Ratio => ratio(-r.numerator, r.denominator)
const NOTHING = ratio(0, 1)

/** Decimal places a percentage input accepts. */
export const RATE_DECIMALS = 2

/** Each rate's bounds (decision C8, src/lib/inputLimits.ts), for the inputs and validation alike. */
export const RATE_LIMITS: Record<RateField, { readonly min: Ratio; readonly max: Ratio; readonly maxDecimals: number }> = {
  growthRate: { min: negate(GROWTH_RATE_BOUND), max: GROWTH_RATE_BOUND, maxDecimals: RATE_DECIMALS },
  feeRate: { min: NOTHING, max: MAX_FEE_RATE, maxDecimals: RATE_DECIMALS },
  contributionIncrease: { min: NOTHING, max: MAX_CONTRIBUTION_INCREASE, maxDecimals: RATE_DECIMALS },
  inflationRate: { min: negate(INFLATION_RATE_BOUND), max: INFLATION_RATE_BOUND, maxDecimals: RATE_DECIMALS },
}

export const AMOUNT_LIMITS = { min: ZERO, max: MAX_INPUT_AMOUNT }
export const YEAR_LIMITS = { min: 1, max: MAX_PROJECTION_YEARS }

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= AMOUNT_LIMITS.min && value <= AMOUNT_LIMITS.max

const isYears = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= YEAR_LIMITS.min && value <= YEAR_LIMITS.max

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T)

const choices = (list: readonly Frequency[]) =>
  list
    .map((f) => FREQUENCY_LABELS[f].toLowerCase())
    .join(', ')
    .replace(/, ([^,]*)$/, ' or $1')

/** The problem with one stored field, in words; undefined when it is fine. */
function fieldProblem(field: CompoundField, value: unknown): string | undefined {
  const label = FIELD_LABELS[field]
  switch (field) {
    case 'lumpSum':
    case 'contribution':
      return isAmount(value) ? undefined : `${label} must be whole pence from nothing up to the input limit.`
    case 'contributionFrequency':
      return isOneOf(CONTRIBUTION_FREQUENCIES, value) ? undefined : `${label} must be ${choices(CONTRIBUTION_FREQUENCIES)}.`
    case 'compounding':
      return isOneOf(COMPOUNDING_FREQUENCIES, value) ? undefined : `${label} must be ${choices(COMPOUNDING_FREQUENCIES)}.`
    case 'timing':
      return isOneOf(TIMINGS, value) ? undefined : `${label} must be the start or the end of each period.`
    case 'years':
      return isYears(value) ? undefined : `${label} must be a whole number of years, from one up to the longest Sumyard models.`
    default:
      return isCanonicalPercent(value, RATE_LIMITS[field])
        ? undefined
        : `${label} must be a percentage with at most two decimal places, within the range Sumyard models.`
  }
}

/** Checks untrusted inputs (storage, an imported file) field by field and builds a fresh object. */
function validate(raw: unknown) {
  if (!isRecord(raw) || Array.isArray(raw)) return { ok: false as const, errors: ['The inputs are not a set of compound interest inputs.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false as const, errors: [`The inputs are not safe to read: ${hostile}`] }
  const errors = FIELDS.flatMap((field) => fieldProblem(field, raw[field]) ?? [])
  if (errors.length > 0) return { ok: false as const, errors }
  const inputs: CompoundPageInputs = {
    lumpSum: fromPence(raw.lumpSum as number),
    contribution: fromPence(raw.contribution as number),
    contributionFrequency: raw.contributionFrequency as ContributionFrequency,
    timing: raw.timing as Timing,
    years: raw.years as number,
    growthRate: raw.growthRate as string,
    compounding: raw.compounding as Frequency,
    feeRate: raw.feeRate as string,
    contributionIncrease: raw.contributionIncrease as string,
    inflationRate: raw.inflationRate as string,
  }
  return { ok: true as const, inputs }
}

/** The engine's inputs: amounts and choices as they are, each percentage as its exact Ratio. */
export function toEngineInputs(inputs: CompoundPageInputs): CompoundInputs {
  return {
    lumpSum: inputs.lumpSum,
    contribution: inputs.contribution,
    contributionFrequency: inputs.contributionFrequency,
    timing: inputs.timing,
    years: inputs.years,
    growthRate: percentRatio(inputs.growthRate),
    compounding: inputs.compounding,
    feeRate: percentRatio(inputs.feeRate),
    contributionIncrease: percentRatio(inputs.contributionIncrease),
    inflationRate: percentRatio(inputs.inflationRate),
  }
}

/** The engine's projection or its typed refusal (C8), for valid page inputs. */
export const calculate = (inputs: CompoundPageInputs): CompoundOutcome => project(toEngineInputs(inputs))

/** Why the engine refused, in words with no figures. */
export const PROBLEM_MESSAGES: Record<CompoundProblemReason, string> = {
  'not-money': 'Enter an amount in pounds and pence.',
  'not-a-rate': 'Enter a percentage.',
  'not-whole': 'Enter a whole number.',
  'not-a-choice': 'Choose one of the options.',
  'below-minimum': 'This is below the least Sumyard models.',
  'above-maximum': 'This is above the most Sumyard models.',
  'too-large':
    'The balance would grow past the largest amount Sumyard can work out exactly. Try fewer years, a lower growth rate or smaller amounts.',
}

/** The engine's refusal as an InputRefusal, for RefusalNotice and compare. */
export function inputRefusal(problems: readonly CompoundProblem[]): InputRefusal {
  return {
    ok: false,
    kind: 'inputs',
    problems: problems.map(({ field, reason }) => ({
      field,
      label: field === 'result' ? 'Result' : FIELD_LABELS[field],
      message: PROBLEM_MESSAGES[reason],
    })),
  }
}

const percentText = (text: string) => formatPercent(percentRatio(text))

export type SectionId = 'growth' | 'time'

/** The fields in each section; "Your savings" (the rest) is always visible. */
export const SECTION_FIELDS: Record<SectionId, readonly CompoundField[]> = {
  growth: ['growthRate', 'compounding', 'feeRate'],
  time: ['contributionIncrease', 'inflationRate'],
}

export const NOT_SET = 'Not set'
export const NEEDS_FIXING = 'Fix the highlighted input'

/** A section's inputs differ from the defaults (so it opens on load). */
export function sectionSet(id: SectionId, inputs: CompoundPageInputs): boolean {
  const defaults = compoundCalculator.defaultInputs()
  return SECTION_FIELDS[id].some((field) => inputs[field] !== defaults[field])
}

/** A section header's one-line summary of its inputs (docs/ui-patterns.md, U2). */
export function sectionSummary(id: SectionId, inputs: CompoundPageInputs, invalid: readonly string[]): string {
  if (SECTION_FIELDS[id].some((field) => invalid.includes(field))) return NEEDS_FIXING
  if (!sectionSet(id, inputs)) return NOT_SET
  if (id === 'growth') {
    const fee = inputs.feeRate === '0' ? 'no fee' : `fee ${percentText(inputs.feeRate)} a year`
    return `${percentText(inputs.growthRate)} a year, compounded ${FREQUENCY_LABELS[inputs.compounding].toLowerCase()}; ${fee}`
  }
  const rise =
    inputs.contributionIncrease === '0' ? 'Contributions level' : `Contributions rise ${percentText(inputs.contributionIncrease)} a year`
  return `${rise}; inflation ${percentText(inputs.inflationRate)}`
}

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const rate = (label: string, value: Ratio): SummaryRow => ({ label, value: { kind: 'ratio', ratio: value } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })

export const compoundCalculator: CalculatorDefinition<CompoundPageInputs> = defineCalculator<CompoundPageInputs>({
  id: 'compound-interest',
  name: 'Compound interest',
  summary:
    'How a lump sum and regular contributions could grow at a steady rate, with an annual fee and inflation: a yearly table and chart, in pounds of the day and in today’s money, and what the fee costs.',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({
    lumpSum: ZERO,
    contribution: ZERO,
    contributionFrequency: 'monthly',
    timing: 'end',
    years: DEFAULT_PROJECTION_YEARS,
    growthRate: '0',
    compounding: 'monthly',
    feeRate: '0',
    contributionIncrease: '0',
    inflationRate: '0',
  }),
  validateInputs: validate,
  migrateInputs(from) {
    // Version 1 is the first: there is nothing older to migrate from.
    throw new Error(`The compound interest calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs) {
    const rows: SummaryRow[] = [
      money(FIELD_LABELS.lumpSum, inputs.lumpSum),
      money(FIELD_LABELS.contribution, inputs.contribution),
      text(FIELD_LABELS.contributionFrequency, FREQUENCY_LABELS[inputs.contributionFrequency]),
      text(FIELD_LABELS.timing, TIMING_LABELS[inputs.timing]),
      { label: FIELD_LABELS.years, value: { kind: 'count', count: inputs.years } },
      rate(FIELD_LABELS.growthRate, percentRatio(inputs.growthRate)),
      text(FIELD_LABELS.compounding, FREQUENCY_LABELS[inputs.compounding]),
      rate(FIELD_LABELS.feeRate, percentRatio(inputs.feeRate)),
      rate(FIELD_LABELS.contributionIncrease, percentRatio(inputs.contributionIncrease)),
      rate(FIELD_LABELS.inflationRate, percentRatio(inputs.inflationRate)),
    ]
    const outcome = calculate(inputs)
    if (!outcome.ok) return { inputs: rows, results: inputRefusal(outcome.problems) }
    const { withFee, feeDrag, effectiveAnnualRate, effectiveAnnualRateAfterFees } = outcome.result
    return {
      inputs: rows,
      results: {
        ok: true,
        rows: [
          money('Final balance', withFee.nominal.closing),
          money('Final balance in today’s money', withFee.real.closing),
          money('Paid in', paidIn(withFee.nominal)),
          money('Growth', withFee.nominal.growth),
          money('Fees', withFee.nominal.fees),
          money('Fee drag', feeDrag.nominal),
          money('Fee drag in today’s money', feeDrag.real),
          rate('Effective annual rate', effectiveAnnualRate),
          rate('Effective annual rate after fees', effectiveAnnualRateAfterFees),
        ],
      },
    }
  },
})
