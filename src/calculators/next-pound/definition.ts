import type { LeafPath, TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import { formatAmountInput, formatIsoDate, formatPercent } from '@/lib/format'
import {
  DEFAULT_PROJECTION_YEARS,
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_AGE_YEARS,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
  NEXT_POUND_GROWTH_HIGH,
  NEXT_POUND_GROWTH_LOW,
  NEXT_POUND_GROWTH_MID,
} from '@/lib/inputLimits'
import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import { add, compare, compareRatio, fromPence, type Money, type Ratio, ratio, ZERO } from '@/lib/money'
import { isCanonicalPercent, percentRatio } from '@/lib/parse'
import { checkUntrustedJson, isRecord } from '@/lib/validate'
import { inputRefusal as compoundRefusal } from '../compound-interest/definition'
import {
  FIELD_LABELS as MORTGAGE_LABELS,
  PROBLEM_MESSAGES as MORTGAGE_MESSAGES,
  type NeededField as MortgageNeededField,
  type MortgagePageInputs,
  mortgageCalculator,
  engineLabel as mortgageEngineLabel,
  toEngineInputs as toMortgageEngineInputs,
} from '../mortgage/definition'
import { type OptimiserPageInputs, optimiserCalculator } from '../optimiser/definition'
import { toOptimiserInputs } from '../optimiser/optimiserInputs'
import { DEFAULT_POLICY } from '../optimiser/types'
import { type CalculatorDefinition, defineCalculator, type InputRefusal, type SummaryRow } from '../registry'
import { nextPound } from './calc'
import type {
  BreakEven,
  GrowthCase,
  IsaLeg,
  LegRefusal,
  MortgageLeg,
  MortgageLegInputs,
  NextPoundField,
  NextPoundInputs,
  NextPoundProblem,
  NextPoundProblemReason,
  NextPoundResult,
  NextPoundWarning,
  PensionLeg,
} from './types'

/*
 * The next pound page's registry entry (C2, inputs version 1): the inputs a
 * scenario stores, their defaults, validation, how they map to the C1
 * composer's NextPoundInputs, what the page shows for each leg, the
 * break-even words, the compare summary and the section summaries. A tax
 * calculator: scenarios carry the tax year and summarise reads the config.
 * The pay is the take-home page's own inputs (OptimiserPageInputs),
 * validated by its definition and mapped by its toOptimiserInputs; the
 * mortgage is the mortgage page's (MortgagePageInputs), validated and mapped
 * by its definition, with no regular overpayment or lump sums of its own.
 * No figure here: bounds come from src/lib/inputLimits.ts, every result
 * from the composer. Nothing is called best or recommended (G13).
 */

/** What the page stores. Money is integer pence; each rate is its canonical percentage text; the date is ISO. */
export interface NextPoundPageInputs {
  /** X: take-home pay to put in one place now. */
  readonly lumpSum: Money
  readonly horizonYears: number
  /** The day the money goes in; empty until entered (no made-up dates, U18). */
  readonly asOf: IsoDate | null
  /** Whole years; empty until entered. */
  readonly ageNow: number | null
  /** The take-home page's inputs: pay, region, pension method and contributions, and the rest. */
  readonly pay: OptimiserPageInputs
  readonly employerMatch: Money
  /** A scheme's own later access age; null for none. */
  readonly schemeAccessAge: number | null
  /** Null: the default from config (the "Basic rate" band, CP4). */
  readonly retirementTaxRate: string | null
  readonly otherPensionsUseAllowance: boolean
  /** The mortgage page's inputs; left at its defaults, the leg is not set up. Its overpayments are the composer's. */
  readonly mortgage: MortgagePageInputs
  readonly growthLow: string
  readonly growthMid: string
  readonly growthHigh: string
  readonly feeRate: string
  readonly inflationRate: string
  readonly isaPaidThisYear: Money
}

type OwnField = Exclude<keyof NextPoundPageInputs, 'pay' | 'mortgage'>

/** Each field's name, in the order the page shows them; used in errors, refusals and compare. */
export const FIELD_LABELS: Record<OwnField, string> = {
  lumpSum: 'Lump sum',
  horizonYears: 'Years to the horizon',
  asOf: 'Date the money goes in',
  ageNow: 'Your age now',
  employerMatch: 'Employer match on the extra',
  schemeAccessAge: 'Your scheme’s own access age',
  retirementTaxRate: 'Tax rate on the pension in retirement',
  otherPensionsUseAllowance: 'Other pensions use the lump sum allowance',
  growthLow: 'Low growth rate',
  growthMid: 'Mid growth rate',
  growthHigh: 'High growth rate',
  feeRate: 'Annual fee',
  inflationRate: 'Inflation',
  isaPaidThisYear: 'Paid into ISAs this tax year',
}

/** Names of the three legs, as the page shows them. */
export const LEG_NAMES = { pension: 'Pension', mortgage: 'Mortgage overpayment', isa: 'ISA' } as const
export type LegId = keyof typeof LEG_NAMES

export const CASE_LABELS: Record<GrowthCase, string> = { low: 'Low', mid: 'Mid', high: 'High' }

const negate = (r: Ratio): Ratio => ratio(-r.numerator, r.denominator)
const NOTHING = ratio(0, 1)
const WHOLE = ratio(1, 1)

/** Decimal places a percentage input accepts. */
export const RATE_DECIMALS = 2

type RateField = 'growthLow' | 'growthMid' | 'growthHigh' | 'feeRate' | 'inflationRate' | 'retirementTaxRate'

/** Each rate's bounds, the composer's own (src/lib/inputLimits.ts), for the inputs and validation alike. */
export const RATE_LIMITS: Record<RateField, { readonly min: Ratio; readonly max: Ratio; readonly maxDecimals: number }> = {
  growthLow: { min: negate(GROWTH_RATE_BOUND), max: GROWTH_RATE_BOUND, maxDecimals: RATE_DECIMALS },
  growthMid: { min: negate(GROWTH_RATE_BOUND), max: GROWTH_RATE_BOUND, maxDecimals: RATE_DECIMALS },
  growthHigh: { min: negate(GROWTH_RATE_BOUND), max: GROWTH_RATE_BOUND, maxDecimals: RATE_DECIMALS },
  feeRate: { min: NOTHING, max: MAX_FEE_RATE, maxDecimals: RATE_DECIMALS },
  inflationRate: { min: negate(INFLATION_RATE_BOUND), max: INFLATION_RATE_BOUND, maxDecimals: RATE_DECIMALS },
  retirementTaxRate: { min: NOTHING, max: WHOLE, maxDecimals: RATE_DECIMALS },
}

export const AMOUNT_LIMITS = { min: ZERO, max: MAX_INPUT_AMOUNT }
export const YEAR_LIMITS = { min: 1, max: MAX_PROJECTION_YEARS }
export const AGE_LIMITS = { min: 0, max: MAX_AGE_YEARS }

/** A rate as the canonical percentage text an input stores: the starting values are Ratios. Exact; throws on a rate with more places than the inputs take. */
export function percentText(rate: Ratio): string {
  const text = formatPercent(rate, RATE_DECIMALS).replace('%', '').replaceAll(',', '')
  if (!isCanonicalPercent(text) || compareRatio(percentRatio(text), rate) !== 0)
    throw new Error('percentText: the rate has more decimal places than a percentage input takes')
  return text
}

const isWhole = (value: unknown, least: number, most: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= most
const isAmount = (value: unknown): value is number => isWhole(value, 0, MAX_INPUT_AMOUNT)

const AMOUNT_RULE = 'must be whole pence from nothing up to the input limit.'
const RATE_RULE = 'must be a percentage with at most two decimal places, within the range Sumyard models.'

/** The problem with one stored field, in words; undefined when it is fine. */
function fieldProblem(field: OwnField, value: unknown): string | undefined {
  const label = FIELD_LABELS[field]
  const say = (ok: boolean, rule: string) => (ok ? undefined : `${label} ${rule}`)
  switch (field) {
    case 'lumpSum':
    case 'employerMatch':
    case 'isaPaidThisYear':
      return say(isAmount(value), AMOUNT_RULE)
    case 'horizonYears':
      return say(isWhole(value, YEAR_LIMITS.min, YEAR_LIMITS.max), 'must be whole years, from one up to the longest Sumyard models.')
    case 'asOf':
      return say(value === null || isIsoDate(value), 'must be a real date, written year-month-day.')
    case 'ageNow':
    case 'schemeAccessAge':
      return say(value === null || isWhole(value, AGE_LIMITS.min, AGE_LIMITS.max), 'must be whole years, up to the oldest Sumyard takes.')
    case 'otherPensionsUseAllowance':
      return say(typeof value === 'boolean', 'must be yes or no.')
    case 'retirementTaxRate':
      return say(value === null || isCanonicalPercent(value, RATE_LIMITS.retirementTaxRate), RATE_RULE)
    default:
      return say(isCanonicalPercent(value, RATE_LIMITS[field]), RATE_RULE)
  }
}

const OWN_FIELDS = Object.keys(FIELD_LABELS) as OwnField[]

/** The mortgage as this page holds it: the mortgage page's inputs with no overpayments of their own (the composer adds the one). */
const asLeg = (m: MortgagePageInputs): MortgagePageInputs => ({ ...m, monthly: ZERO, lumpSums: [], effect: 'reduce-term' })

/** Checks untrusted inputs (storage, an imported file) field by field and builds a fresh object. */
function validate(raw: unknown) {
  if (!isRecord(raw) || Array.isArray(raw)) return { ok: false as const, errors: ['The inputs are not a set of next pound inputs.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false as const, errors: [`The inputs are not safe to read: ${hostile}`] }
  const errors = OWN_FIELDS.flatMap((field) => fieldProblem(field, raw[field]) ?? [])
  const pay = optimiserCalculator.validateInputs(raw.pay)
  if (!pay.ok) errors.push(...pay.errors.map((e) => `Your pay: ${e}`))
  const mortgage = mortgageCalculator.validateInputs(raw.mortgage)
  if (!mortgage.ok) errors.push(...mortgage.errors.map((e) => `Mortgage: ${e}`))
  if (errors.length > 0 || !pay.ok || !mortgage.ok) return { ok: false as const, errors }
  const inputs: NextPoundPageInputs = {
    lumpSum: fromPence(raw.lumpSum as number),
    horizonYears: raw.horizonYears as number,
    asOf: raw.asOf as IsoDate | null,
    ageNow: raw.ageNow as number | null,
    pay: pay.inputs,
    employerMatch: fromPence(raw.employerMatch as number),
    schemeAccessAge: raw.schemeAccessAge as number | null,
    retirementTaxRate: raw.retirementTaxRate as string | null,
    otherPensionsUseAllowance: raw.otherPensionsUseAllowance as boolean,
    mortgage: asLeg(mortgage.inputs),
    growthLow: raw.growthLow as string,
    growthMid: raw.growthMid as string,
    growthHigh: raw.growthHigh as string,
    feeRate: raw.feeRate as string,
    inflationRate: raw.inflationRate as string,
    isaPaidThisYear: fromPence(raw.isaPaidThisYear as number),
  }
  return { ok: true as const, inputs }
}

/** Something entered in the mortgage section: left at the mortgage page's defaults, the leg is not set up. */
export function mortgageEntered(inputs: NextPoundPageInputs): boolean {
  return JSON.stringify(asLeg(inputs.mortgage)) !== JSON.stringify(asLeg(mortgageCalculator.defaultInputs()))
}

/** Pay entered: salary plus bonus above nothing. */
export const payEntered = (inputs: NextPoundPageInputs) => compare(add(inputs.pay.salary, inputs.pay.bonus), ZERO) > 0

/** A field the results need and that is empty: shared, the pension leg's, or the mortgage's (`mortgage.<field>`). */
export type NeededField = 'asOf' | 'ageNow' | 'pay.salary' | `mortgage.${MortgageNeededField}`

const ENTER = 'Enter this to see results.'

export const neededLabel = (field: NeededField): string =>
  field === 'pay.salary'
    ? 'Salary'
    : field.startsWith('mortgage.')
      ? (MORTGAGE_LABELS[field.slice('mortgage.'.length) as keyof typeof MORTGAGE_LABELS] ?? 'Mortgage')
      : FIELD_LABELS[field as OwnField]

const refusalOf = (problems: InputRefusal['problems']): InputRefusal => ({ ok: false, kind: 'inputs', problems })
const needed = (fields: readonly NeededField[]): InputRefusal =>
  refusalOf(fields.map((field) => ({ field, label: neededLabel(field), message: ENTER })))

/** The composer's field names as the page names them. */
const ENGINE_LABELS: Record<NextPoundField, string> = {
  lumpSum: FIELD_LABELS.lumpSum,
  horizonYears: FIELD_LABELS.horizonYears,
  asOf: FIELD_LABELS.asOf,
  inflationRate: FIELD_LABELS.inflationRate,
  'growth.low': FIELD_LABELS.growthLow,
  'growth.mid': FIELD_LABELS.growthMid,
  'growth.high': FIELD_LABELS.growthHigh,
  feeRate: FIELD_LABELS.feeRate,
  'pension.optimiser': 'Your pay and pension',
  'pension.employerMatch': FIELD_LABELS.employerMatch,
  'pension.ageNow': FIELD_LABELS.ageNow,
  'pension.schemeAccessAge': FIELD_LABELS.schemeAccessAge,
  'pension.retirementTaxRate': FIELD_LABELS.retirementTaxRate,
  'pension.otherPensionsUseAllowance': FIELD_LABELS.otherPensionsUseAllowance,
  'isa.paidThisYear': FIELD_LABELS.isaPaidThisYear,
  result: 'Result',
}

/** Why the composer refused, in words with no figures. */
export const PROBLEM_MESSAGES: Record<NextPoundProblemReason, string> = {
  'not-money': 'Enter an amount in pounds and pence.',
  'not-whole': 'Enter a whole number.',
  'not-a-rate': 'Enter a percentage.',
  'not-a-date': 'Enter a real date, written year-month-day.',
  'not-a-choice': 'Choose one of the options.',
  'below-minimum': 'This is below the least Sumyard models.',
  'above-maximum': 'This is above the most Sumyard models.',
  'out-of-order': 'The low rate must be at most the mid rate, and the mid rate at most the high rate.',
  'no-default': 'This tax year’s bands for where you live have no band named Basic rate, so there is no default: enter a rate.',
  'not-accepted':
    'The take-home model doesn’t accept these pay and pension inputs (for example, a contribution above pay). Check them on this page or the take-home page.',
  'too-large':
    'The figures would grow past the largest amount Sumyard can work out exactly. Try a smaller lump sum, fewer years or lower rates.',
}

const engineRefusal = (problems: readonly NextPoundProblem[]): InputRefusal =>
  refusalOf(problems.map(({ field, reason }) => ({ field, label: ENGINE_LABELS[field], message: PROBLEM_MESSAGES[reason] })))

/** The composer's inputs for valid page inputs, or the shared fields still needed. Missing leg fields stand in as nothing. */
export function toEngineInputs(
  inputs: NextPoundPageInputs,
):
  | { readonly ok: true; readonly inputs: NextPoundInputs; readonly pensionNeeds: readonly NeededField[]; readonly mortgage: MortgageState }
  | { readonly ok: false; readonly needs: readonly NeededField[] } {
  if (inputs.asOf === null) return { ok: false, needs: ['asOf'] }
  const pensionNeeds: NeededField[] = [
    ...(payEntered(inputs) ? [] : ['pay.salary' as const]),
    ...(inputs.ageNow === null ? ['ageNow' as const] : []),
  ]
  const mortgage = mortgageState(inputs)
  return {
    ok: true,
    pensionNeeds,
    mortgage,
    inputs: {
      lumpSum: inputs.lumpSum,
      horizonYears: inputs.horizonYears,
      asOf: inputs.asOf,
      inflationRate: percentRatio(inputs.inflationRate),
      growth: { low: percentRatio(inputs.growthLow), mid: percentRatio(inputs.growthMid), high: percentRatio(inputs.growthHigh) },
      feeRate: percentRatio(inputs.feeRate),
      pension: {
        optimiser: toOptimiserInputs(inputs.pay),
        employerMatch: inputs.employerMatch,
        // Not entered: the leg shows what it needs, so this stand-in is never shown.
        ageNow: inputs.ageNow ?? 0,
        schemeAccessAge: inputs.schemeAccessAge,
        retirementTaxRate: inputs.retirementTaxRate === null ? null : percentRatio(inputs.retirementTaxRate),
        otherPensionsUseAllowance: inputs.otherPensionsUseAllowance,
      },
      mortgage: mortgage.kind === 'ready' ? mortgage.inputs : null,
      isa: { paidThisYear: inputs.isaPaidThisYear },
    },
  }
}

/** The mortgage section's state before the composer: not set up, still needing boxes, refused by the mortgage page's own checks, or ready. */
export type MortgageState =
  | { readonly kind: 'none' }
  | { readonly kind: 'missing'; readonly refusal: InputRefusal }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'ready'; readonly inputs: MortgageLegInputs }

function mortgageState(inputs: NextPoundPageInputs): MortgageState {
  if (!mortgageEntered(inputs)) return { kind: 'none' }
  const engine = toMortgageEngineInputs(asLeg(inputs.mortgage))
  if (!engine.ok && engine.kind === 'missing')
    return { kind: 'missing', refusal: needed(engine.fields.map((f) => `mortgage.${f}` as const)) }
  if (!engine.ok) return { kind: 'refused', refusal: refusalOf(engine.problems) }
  const { effect: _effect, regular: _regular, lumpSums: _lumpSums, ...leg } = engine.inputs
  return { kind: 'ready', inputs: leg }
}

/** One leg as the page shows it. */
export type LegView<L> =
  | { readonly kind: 'needs'; readonly refusal: InputRefusal }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal | Refusal }
  | { readonly kind: 'none' }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'shown'; readonly leg: L }

type Shown<L> = Exclude<L, LegRefusal | { readonly status: 'nothing' } | { readonly status: 'none' }>

/** A leg refused by its engine, as the page shows it: the tax refusal, or the fields by name. */
function legRefusal(refusal: LegRefusal, taxYear: NextPoundResult['taxYear']): InputRefusal | Refusal {
  switch (refusal.engine) {
    case 'optimiser':
      return { ok: false, taxYear, unverified: refusal.unverified as LeafPath[] }
    case 'mortgage':
      return refusalOf(
        refusal.problems.map((p) => ({
          field: `mortgage.${p.field}`,
          label: mortgageEngineLabel(p),
          message: MORTGAGE_MESSAGES[p.reason],
        })),
      )
    case 'compound-interest':
      return compoundRefusal(refusal.problems)
    case 'next-pound':
      return engineRefusal(refusal.problems)
  }
}

function view<L extends PensionLeg | MortgageLeg | IsaLeg>(leg: L, taxYear: NextPoundResult['taxYear']): LegView<Shown<L>> {
  if (leg.status === 'refused') return { kind: 'refused', refusal: legRefusal(leg as LegRefusal, taxYear) }
  if (leg.status === 'nothing') return { kind: 'nothing' }
  if (leg.status === 'none') return { kind: 'none' }
  return { kind: 'shown', leg: leg as Shown<L> }
}

export type PensionShown = Shown<PensionLeg>
export type MortgageShown = Shown<MortgageLeg>
export type IsaShown = Shown<IsaLeg>

/** The page's outcome: shared inputs still needed or refused, the tax refusal, or the three legs. */
export type PageOutcome =
  | { readonly kind: 'needs'; readonly refusal: InputRefusal }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'unverified'; readonly refusal: Refusal }
  | {
      readonly kind: 'ok'
      readonly result: NextPoundResult
      readonly pension: LegView<PensionShown>
      readonly mortgage: LegView<MortgageShown>
      readonly isa: LegView<IsaShown>
      /** Against the mortgage and the pension; null where that leg has no number. */
      readonly breakEven: { readonly mortgage: BreakEven | null; readonly pension: BreakEven | null }
      /** The legs' warnings, those of a leg not shown left out, grouped by leg. */
      readonly warnings: { readonly [K in LegId]: readonly NextPoundWarning[] }
    }

/** nextPound() on the page's inputs. Never throws on valid inputs. */
export function calculate(inputs: NextPoundPageInputs, config: TaxYearConfig): PageOutcome {
  const engine = toEngineInputs(inputs)
  if (!engine.ok) return { kind: 'needs', refusal: needed(engine.needs) }
  const result = nextPound(engine.inputs, config, DEFAULT_POLICY)
  if (!result.ok)
    return 'problems' in result ? { kind: 'refused', refusal: engineRefusal(result.problems) } : { kind: 'unverified', refusal: result }
  const pension: LegView<PensionShown> =
    engine.pensionNeeds.length > 0 && result.legs.pension.status !== 'nothing'
      ? { kind: 'needs', refusal: needed(engine.pensionNeeds) }
      : view(result.legs.pension, result.taxYear)
  const m = engine.mortgage
  const mortgage: LegView<MortgageShown> =
    m.kind === 'missing' || m.kind === 'refused'
      ? m.kind === 'missing'
        ? { kind: 'needs', refusal: m.refusal }
        : { kind: 'refused', refusal: m.refusal }
      : view(result.legs.mortgage, result.taxYear)
  const isa = view(result.legs.isa, result.taxYear)
  const warningsOf = (leg: LegId, shown: boolean) => (shown ? result.warnings.filter((w) => w.leg === leg) : [])
  return {
    kind: 'ok',
    result,
    pension,
    mortgage,
    isa,
    breakEven: {
      mortgage: mortgage.kind === 'shown' ? result.breakEven.mortgage : null,
      pension: pension.kind === 'shown' ? result.breakEven.pension : null,
    },
    warnings: {
      pension: warningsOf('pension', pension.kind === 'shown'),
      mortgage: warningsOf('mortgage', mortgage.kind === 'shown'),
      isa: warningsOf('isa', isa.kind === 'shown'),
    },
  }
}

/* Words for the results (no figures of their own: every amount is the composer's). */

export const NOT_ACCESSIBLE = 'Not accessible at horizon'
export const NOT_SET_UP = 'Not set up'
export const GUARANTEED = 'Guaranteed'

/** The mid case's value of a leg shown, or null: the pension not accessible has no number. */
export function midValue(leg: LegView<PensionShown | MortgageShown | IsaShown>) {
  if (leg.kind !== 'shown') return null
  const l = leg.leg
  if (l.status === 'not-accessible') return null
  if (l.status === 'ok' && 'guaranteed' in l && l.guaranteed) return (l as MortgageShown & { status: 'ok' }).value
  return (l as Extract<PensionShown, { status: 'accessible' }> | IsaShown).rates.mid.value
}

const AGAINST: Record<'mortgage' | 'pension', string> = {
  mortgage: 'the mortgage overpayment',
  pension: 'the pension at the mid rate',
}

/** The break-even ISA return in words (CP7): a rate, or above the highest or below the lowest rate modelled; never a ranking. */
export function breakEvenWords(against: 'mortgage' | 'pension', breakEven: BreakEven): string {
  const other = AGAINST[against]
  switch (breakEven.kind) {
    case 'above-highest':
      return `The ISA return that matches ${other} at the horizon is above the highest rate modelled.`
    case 'below-lowest':
      return `The ISA return that matches ${other} at the horizon is below the lowest rate modelled.`
    case 'rate': {
      const same = compareRatio(breakEven.rate, breakEven.upTo) === 0
      const rate = same ? formatPercent(breakEven.rate) : `between ${formatPercent(breakEven.rate)} and ${formatPercent(breakEven.upTo)}`
      return `The ISA matches ${other} at the horizon at a growth rate ${rate} a year, before the fee.`
    }
  }
}

/** Why there is no break-even against a leg, in words. */
export function noBreakEvenWords(against: 'mortgage' | 'pension', outcome: Extract<PageOutcome, { kind: 'ok' }>): string {
  const leg = outcome[against]
  if (outcome.result.legs.isa.status === 'nothing' || leg.kind === 'nothing') return 'No break-even: the lump sum is nothing.'
  if (against === 'pension' && leg.kind === 'shown') return `No break-even: the pension is ${NOT_ACCESSIBLE.toLowerCase()}.`
  if (against === 'mortgage' && leg.kind === 'none') return 'No break-even: no mortgage is set up.'
  return `No break-even: the ${LEG_NAMES[against].toLowerCase()} has no result for these inputs.`
}

/* Sections (docs/ui-patterns.md, U1 to U3). */

export type SectionId = 'pension' | 'atHorizon' | 'allowance' | 'otherPay' | 'mortgage' | 'growth' | 'isa'

export const SECTION_TITLES: Record<SectionId, string> = {
  pension: 'Your pension now',
  atHorizon: 'Pension at the horizon',
  allowance: 'Annual allowance',
  otherPay: 'More about your pay',
  mortgage: 'Mortgage (optional)',
  growth: 'Growth, fee and inflation',
  isa: 'ISA',
}

export const NOT_SET = 'Not set'
export const NEEDS_FIXING = 'Fix the highlighted input'

/** The page's own fields in each section; `pay.` and `mortgage.` fields are matched by prefix. */
const SECTION_OWN: Record<SectionId, readonly OwnField[]> = {
  pension: [],
  atHorizon: ['employerMatch', 'schemeAccessAge', 'retirementTaxRate', 'otherPensionsUseAllowance'],
  allowance: [],
  otherPay: [],
  mortgage: [],
  growth: ['growthLow', 'growthMid', 'growthHigh', 'feeRate', 'inflationRate'],
  isa: ['isaPaidThisYear'],
}

const PAY_SECTION: Record<string, SectionId> = {
  pensionMethod: 'pension',
  employeeContribution: 'pension',
  'employeeContribution-pct': 'pension',
  employerContribution: 'pension',
  'employerContribution-pct': 'pension',
  pensionablePay: 'pension',
  moneyPurchaseAnnualAllowance: 'allowance',
  children: 'otherPay',
  studentLoans: 'otherPay',
}

/** The section a field (as the page tracks its validity) is in; null for the always-visible inputs. */
export function sectionForField(field: string): SectionId | null {
  if (field.startsWith('mortgage.')) return 'mortgage'
  if (field.startsWith('pay.')) {
    const name = field.slice('pay.'.length)
    if (name.startsWith('carryForward')) return 'allowance'
    return PAY_SECTION[name] ?? null
  }
  return (Object.keys(SECTION_OWN) as SectionId[]).find((id) => SECTION_OWN[id].includes(field as OwnField)) ?? null
}

/** A section's inputs differ from the defaults (so it opens on load). */
export function sectionSet(id: SectionId, inputs: NextPoundPageInputs): boolean {
  const defaults = nextPoundCalculator.defaultInputs()
  const p = inputs.pay
  const d = defaults.pay
  const differ = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  switch (id) {
    case 'pension':
      return (
        differ(p.employeeContribution, d.employeeContribution) ||
        differ(p.employerContribution, d.employerContribution) ||
        differ(p.pensionablePay, d.pensionablePay)
      )
    case 'allowance':
      return p.carryForward.length > 0 || p.moneyPurchaseAnnualAllowance
    case 'otherPay':
      return p.studentLoans.length > 0 || p.children > 0 || p.taxableBenefits.length > 0 || p.postTaxDeductions.length > 0
    case 'mortgage':
      return mortgageEntered(inputs)
    default:
      return SECTION_OWN[id].some((field) => differ(inputs[field], defaults[field]))
  }
}

const pct = (text: string) => formatPercent(percentRatio(text))
const pounds = (amount: Money) => `£${formatAmountInput(amount)}`
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** A section header's one-line summary of its inputs (U2). */
export function sectionSummary(id: SectionId, inputs: NextPoundPageInputs, invalid: readonly string[]): string {
  if (invalid.some((field) => sectionForField(field) === id)) return NEEDS_FIXING
  const p = inputs.pay
  switch (id) {
    case 'pension': {
      const contribution = (entry: OptimiserPageInputs['employeeContribution']) =>
        entry.mode === 'percentOfPay' ? pct(entry.percentOfPay) : pounds(entry.amount)
      const employee = compare(p.employeeContribution.amount, ZERO) > 0 || p.employeeContribution.mode === 'percentOfPay'
      return `${employee ? `You pay ${contribution(p.employeeContribution)}` : 'No contribution now'}; employer ${contribution(p.employerContribution)}`
    }
    case 'atHorizon': {
      const rate = inputs.retirementTaxRate === null ? 'tax at the Basic rate band' : `tax at ${pct(inputs.retirementTaxRate)}`
      const match = compare(inputs.employerMatch, ZERO) > 0 ? `match ${pounds(inputs.employerMatch)}; ` : ''
      const age = inputs.schemeAccessAge === null ? '' : `; scheme age ${inputs.schemeAccessAge}`
      return `${match}${rate}${age}`
    }
    case 'growth':
      return `${pct(inputs.growthLow)}, ${pct(inputs.growthMid)} and ${pct(inputs.growthHigh)} a year; fee ${pct(inputs.feeRate)}; inflation ${pct(inputs.inflationRate)}`
    case 'isa':
      return compare(inputs.isaPaidThisYear, ZERO) > 0
        ? `${pounds(inputs.isaPaidThisYear)} paid in this tax year`
        : 'Nothing paid in this tax year'
    case 'allowance':
      if (!sectionSet(id, inputs)) return NOT_SET
      return [
        p.carryForward.length > 0 ? `Carry forward from ${p.carryForward.length} year${p.carryForward.length === 1 ? '' : 's'}` : '',
        p.moneyPurchaseAnnualAllowance ? 'money purchase annual allowance' : '',
      ]
        .filter(Boolean)
        .join('; ')
    case 'otherPay': {
      if (!sectionSet(id, inputs)) return NOT_SET
      const items = p.taxableBenefits.length + p.postTaxDeductions.length
      return [
        p.studentLoans.length > 0 ? `${p.studentLoans.length} student loan plan${p.studentLoans.length === 1 ? '' : 's'}` : '',
        p.children > 0 ? `${p.children} child${p.children === 1 ? '' : 'ren'}` : '',
        items > 0 ? `${items} item${items === 1 ? '' : 's'} from the take-home page` : '',
      ]
        .filter(Boolean)
        .join('; ')
    }
    case 'mortgage': {
      const state = mortgageState(inputs)
      if (state.kind === 'none') return NOT_SET_UP
      if (state.kind === 'missing') return `Needs ${state.refusal.problems.map((x) => lower(x.label)).join(', ')}`
      const m = inputs.mortgage
      return `${pounds(m.balance as Money)} from ${formatIsoDate(m.startDate as IsoDate)}${m.erc ? ', with a charge' : ''}`
    }
  }
}

/* Compare (registry summarise). */

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const rate = (label: string, value: Ratio): SummaryRow => ({ label, value: { kind: 'ratio', ratio: value } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })
const count = (label: string, value: number): SummaryRow => ({ label, value: { kind: 'count', count: value } })

const NOT_ENTERED = 'Not entered'

function inputRows(inputs: NextPoundPageInputs): SummaryRow[] {
  const m = inputs.mortgage
  return [
    money(FIELD_LABELS.lumpSum, inputs.lumpSum),
    count(FIELD_LABELS.horizonYears, inputs.horizonYears),
    text(FIELD_LABELS.asOf, inputs.asOf === null ? NOT_ENTERED : formatIsoDate(inputs.asOf)),
    inputs.ageNow === null ? text(FIELD_LABELS.ageNow, NOT_ENTERED) : count(FIELD_LABELS.ageNow, inputs.ageNow),
    money('Salary', inputs.pay.salary),
    money('Bonus', inputs.pay.bonus),
    money(FIELD_LABELS.employerMatch, inputs.employerMatch),
    inputs.retirementTaxRate === null
      ? text(FIELD_LABELS.retirementTaxRate, 'From the Basic rate band')
      : rate(FIELD_LABELS.retirementTaxRate, percentRatio(inputs.retirementTaxRate)),
    rate(FIELD_LABELS.growthLow, percentRatio(inputs.growthLow)),
    rate(FIELD_LABELS.growthMid, percentRatio(inputs.growthMid)),
    rate(FIELD_LABELS.growthHigh, percentRatio(inputs.growthHigh)),
    rate(FIELD_LABELS.feeRate, percentRatio(inputs.feeRate)),
    rate(FIELD_LABELS.inflationRate, percentRatio(inputs.inflationRate)),
    money(FIELD_LABELS.isaPaidThisYear, inputs.isaPaidThisYear),
    mortgageEntered(inputs) && m.balance !== null ? money('Mortgage balance', m.balance) : text('Mortgage', NOT_SET_UP),
  ]
}

function legRows(name: string, leg: LegView<PensionShown | MortgageShown | IsaShown>): SummaryRow[] {
  if (leg.kind === 'none') return [text(name, NOT_SET_UP)]
  if (leg.kind === 'needs' || leg.kind === 'refused') return [text(name, 'No result for these inputs')]
  if (leg.kind === 'shown' && leg.leg.status === 'not-accessible') return [text(name, NOT_ACCESSIBLE)]
  const value = midValue(leg)
  if (value === null) return [money(`${name}, today’s money`, ZERO), money(`${name}, nominal`, ZERO)]
  const mid = leg.kind === 'shown' && leg.leg.status === 'ok' && 'overpayment' in leg.leg ? '' : ' (mid)'
  return [money(`${name}${mid}, today’s money`, value.todaysMoney), money(`${name}${mid}, nominal`, value.nominal)]
}

function breakEvenRow(against: 'mortgage' | 'pension', outcome: Extract<PageOutcome, { kind: 'ok' }>): SummaryRow {
  const label = `Break-even ISA return against the ${against === 'mortgage' ? 'mortgage' : 'pension'}`
  const b = outcome.breakEven[against]
  if (b === null) return text(label, 'None')
  if (b.kind === 'rate') return rate(label, b.upTo)
  return text(label, b.kind === 'above-highest' ? 'Above the highest rate modelled' : 'Below the lowest rate modelled')
}

export const nextPoundCalculator: CalculatorDefinition<NextPoundPageInputs> = defineCalculator<NextPoundPageInputs>({
  id: 'next-pound',
  name: 'Where does the next £X go?',
  summary:
    'One lump sum of take-home pay, now, into a pension, a mortgage overpayment or an ISA: what each adds to your net worth at a horizon, after tax on withdrawal, in today’s money and nominal, with the ISA return that would match each of the others.',
  inputsVersion: 1,
  defaultInputs: () => ({
    lumpSum: ZERO,
    horizonYears: DEFAULT_PROJECTION_YEARS,
    asOf: null,
    ageNow: null,
    pay: optimiserCalculator.defaultInputs(),
    employerMatch: ZERO,
    schemeAccessAge: null,
    retirementTaxRate: null,
    otherPensionsUseAllowance: false,
    mortgage: asLeg(mortgageCalculator.defaultInputs()),
    growthLow: percentText(NEXT_POUND_GROWTH_LOW),
    growthMid: percentText(NEXT_POUND_GROWTH_MID),
    growthHigh: percentText(NEXT_POUND_GROWTH_HIGH),
    feeRate: '0',
    inflationRate: '0',
    isaPaidThisYear: ZERO,
  }),
  applySettings: (inputs, settings) => ({ ...inputs, pay: { ...inputs.pay, region: settings.region === 'scotland' ? 'scotland' : 'rUK' } }),
  validateInputs: validate,
  migrateInputs(from) {
    // Version 1 is the first: there is nothing older to migrate from.
    throw new Error(`The next pound calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs, config) {
    const rows = inputRows(inputs)
    const outcome = calculate(inputs, config)
    if (outcome.kind !== 'ok') return { inputs: rows, results: outcome.refusal }
    return {
      inputs: rows,
      results: {
        ok: true,
        rows: [
          ...legRows(LEG_NAMES.pension, outcome.pension),
          ...legRows(LEG_NAMES.mortgage, outcome.mortgage),
          ...legRows(LEG_NAMES.isa, outcome.isa),
          breakEvenRow('mortgage', outcome),
          breakEvenRow('pension', outcome),
        ],
      },
    }
  },
})

/** Formats a leg's amounts as the page does: today's money first, nominal beside it. */
export const amountsText = (value: { readonly todaysMoney: Money; readonly nominal: Money }, gbp: (m: Money) => string) =>
  `${gbp(value.todaysMoney)} (${gbp(value.nominal)} nominal)`
