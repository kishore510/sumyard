import { formatPercent } from '@/lib/format'
import {
  DEFAULT_HORIZON_MONTHS,
  MAX_ANNUAL_MILEAGE,
  MAX_CAR_OPTIONS,
  MAX_EXCESS_PER_MILE,
  MAX_FINANCE_RATE,
  MAX_FINANCE_TERM_MONTHS,
  MAX_HORIZON_MONTHS,
  MAX_INPUT_AMOUNT,
  MAX_ITEM_NAME_LENGTH,
  MAX_MILES_PER_GALLON,
  MAX_MILES_PER_KWH,
  MAX_PENCE_PER_UNIT,
  MAX_SAVINGS_RETURN,
  PRICE_CHANGE_BOUND,
} from '@/lib/inputLimits'
import { divideRound, fromPence, type Money, type Ratio, ratio, toPence, ZERO } from '@/lib/money'
import { decimalRatio, isCanonicalDecimal, isCanonicalPercent, percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { checkUntrustedJson, cleanText, isRecord } from '@/lib/validate'
import type { FeeTiming, FinanceField, FinanceProblemReason, Pricing, RateBasis } from '../car-finance/types'
import { compareOptions, ownershipCost } from '../car-ownership/calc'
import type {
  Acquisition,
  AcquisitionKind,
  CarOption,
  Comparison,
  FuelCost,
  OwnershipField,
  OwnershipProblem,
  OwnershipResult,
  Shared,
  ValueCase,
} from '../car-ownership/types'
import { type CalculatorDefinition, defineCalculator, type InputRefusal, type SummaryRow } from '../registry'

/*
 * The car decision page's registry entry (slice 3c-1, inputs version 1): the
 * inputs a scenario stores, their defaults (every amount and rate empty),
 * validation, how they map to the 3b engine's CarOption and Shared, which
 * fields an option still needs, the comparison with incomplete and refused
 * options set apart, the compare summary and the words for each refusal.
 * Uses no tax rules (taxRules: 'none'). No figure here: bounds come from
 * src/lib/inputLimits.ts and every result from the engines
 * (../car-ownership/calc.ts, which runs ../car-finance/calc.ts).
 */

export type FuelMode = 'fuel' | 'electric' | 'per-mile'
export type PricingMode = 'rate' | 'payment'
export type PcpEnd = 'buy' | 'hand-back'

/**
 * One option as the page stores it. Money is integer pence, a rate its canonical percentage text, miles per gallon and
 * prices per unit their canonical decimal text, and null is an empty box (not entered). Every field is kept whatever the
 * kind or fuel type, so switching back finds what was typed.
 */
export interface OptionInputs {
  readonly name: string
  readonly acquisition: AcquisitionKind
  readonly value: Money | null
  readonly endLow: Money | null
  readonly endExpected: Money | null
  readonly endHigh: Money | null
  readonly annualMileage: number | null
  readonly fuelMode: FuelMode
  readonly milesPerGallon: string | null
  readonly pencePerLitre: string | null
  readonly milesPerKwh: string | null
  readonly homeShare: string | null
  readonly homePencePerKwh: string | null
  readonly publicPencePerKwh: string | null
  readonly pencePerMile: string | null
  readonly fuelPriceChange: string | null
  readonly insurance: Money | null
  readonly maintenance: Money | null
  readonly ved: Money | null
  readonly other: Money | null
  readonly loanAmount: Money | null
  readonly deposit: Money | null
  readonly term: number | null
  readonly pricing: PricingMode
  readonly rate: string | null
  readonly basis: RateBasis
  readonly payment: Money | null
  readonly arrangementFee: Money | null
  readonly arrangementFeeTiming: FeeTiming
  readonly balloon: Money | null
  readonly optionFee: Money | null
  readonly finalPayment: Money | null
  readonly purchaseFee: Money | null
  readonly pcpEnd: PcpEnd
  /** Whole miles a year; over the agreement it is this × term ÷ a year's months, to the nearest mile (as the engine's expected mileage). */
  readonly mileageAllowance: number | null
  /** Whole pence a mile. */
  readonly excessPerMile: number | null
}

export type OptionField = keyof OptionInputs

export interface CarDecisionInputs {
  readonly horizonMonths: number
  /** The end-value case the cards show; stored, so compare can say which. */
  readonly valueCase: ValueCase
  /** After tax, a year (F18). */
  readonly savingsReturn: string | null
  /** The yearly increase in insurance, maintenance, VED and other costs, the same for every option (F21). */
  readonly generalIncrease: string | null
  readonly options: readonly OptionInputs[]
}

export type SharedField = Exclude<keyof CarDecisionInputs, 'options'>

export const ACQUISITIONS: readonly AcquisitionKind[] = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp']
export const ACQUISITION_LABELS: Record<AcquisitionKind, string> = {
  keep: 'Keep current car',
  cash: 'Buy with cash',
  loan: 'Loan',
  'hire-purchase': 'HP',
  pcp: 'PCP',
}
export const VALUE_CASES: readonly ValueCase[] = ['low', 'expected', 'high']
export const CASE_LABELS: Record<ValueCase, string> = { low: 'Low', expected: 'Expected', high: 'High' }
export const FUEL_MODES: readonly FuelMode[] = ['fuel', 'electric', 'per-mile']
export const FUEL_LABELS: Record<FuelMode, string> = { fuel: 'Petrol or diesel', electric: 'Electric', 'per-mile': 'Cost per mile' }
export const PRICING_MODES: readonly PricingMode[] = ['rate', 'payment']
export const BASES: readonly RateBasis[] = ['annual', 'monthly']
export const TIMINGS: readonly FeeTiming[] = ['start', 'added']
export const PCP_ENDS: readonly PcpEnd[] = ['buy', 'hand-back']

/** Each option field's name, used in errors, refusals and missing lists. */
export const FIELD_LABELS: Record<OptionField, string> = {
  name: 'Name',
  acquisition: 'How you get the car',
  value: 'Price or current value',
  endLow: 'End value, low',
  endExpected: 'End value, expected',
  endHigh: 'End value, high',
  annualMileage: 'Annual mileage',
  fuelMode: 'Fuel type',
  milesPerGallon: 'Miles per gallon',
  pencePerLitre: 'Price per litre',
  milesPerKwh: 'Miles per kWh',
  homeShare: 'Charged at home',
  homePencePerKwh: 'Home price per kWh',
  publicPencePerKwh: 'Public price per kWh',
  pencePerMile: 'Cost per mile',
  fuelPriceChange: 'Yearly change in fuel or energy price',
  insurance: 'Insurance',
  maintenance: 'Maintenance',
  ved: 'VED',
  other: 'Other costs',
  loanAmount: 'Loan amount',
  deposit: 'Deposit',
  term: 'Term',
  pricing: 'Priced by',
  rate: 'Interest rate',
  basis: 'Rate basis',
  payment: 'Monthly payment',
  arrangementFee: 'Arrangement fee',
  arrangementFeeTiming: 'Arrangement fee paid',
  balloon: 'Balloon',
  optionFee: 'Option to purchase fee',
  finalPayment: 'Optional final payment',
  purchaseFee: 'Purchase fee',
  pcpEnd: 'At the end',
  mileageAllowance: 'Mileage allowance',
  excessPerMile: 'Excess mileage charge',
}

export const SHARED_LABELS: Record<SharedField, string> = {
  horizonMonths: 'Horizon (months)',
  valueCase: 'End-value case',
  savingsReturn: 'Savings return (after tax, a year)',
  generalIncrease: 'Yearly increase in running costs',
}

export const MONEY_FIELDS: readonly OptionField[] = [
  'value',
  'endLow',
  'endExpected',
  'endHigh',
  'insurance',
  'maintenance',
  'ved',
  'other',
  'loanAmount',
  'deposit',
  'payment',
  'arrangementFee',
  'balloon',
  'optionFee',
  'finalPayment',
  'purchaseFee',
]

/** Optional costs and fees (inputs version 2): an empty box reads as nothing, stored as 0. */
export const OPTIONAL_FIELDS: readonly OptionField[] = [
  'insurance',
  'maintenance',
  'ved',
  'other',
  'deposit',
  'arrangementFee',
  'balloon',
  'optionFee',
  'purchaseFee',
  'excessPerMile',
]

/** Decimal places a rate, a decimal and a percentage accept. */
export const DECIMALS = 2

const NOTHING = ratio(0, 1)
const ALL = ratio(1, 1)
const negate = (r: Ratio): Ratio => ratio(-r.numerator, r.denominator)

type Whole = { readonly kind: 'whole'; readonly min: number; readonly max: number }
type Rate = { readonly kind: 'percent'; readonly min: Ratio; readonly max: Ratio }
type Decimal = { readonly kind: 'decimal'; readonly min: Ratio; readonly max: Ratio; readonly minExclusive?: boolean }
type Choice = { readonly kind: 'choice'; readonly options: readonly string[] }

/** Each field's kind and bounds (src/lib/inputLimits.ts), for the inputs and validation alike. */
export const LIMITS: Record<Exclude<OptionField, 'name'>, { readonly kind: 'money' } | Whole | Rate | Decimal | Choice> = {
  acquisition: { kind: 'choice', options: ACQUISITIONS },
  value: { kind: 'money' },
  endLow: { kind: 'money' },
  endExpected: { kind: 'money' },
  endHigh: { kind: 'money' },
  annualMileage: { kind: 'whole', min: 0, max: MAX_ANNUAL_MILEAGE },
  fuelMode: { kind: 'choice', options: FUEL_MODES },
  milesPerGallon: { kind: 'decimal', min: NOTHING, max: MAX_MILES_PER_GALLON, minExclusive: true },
  pencePerLitre: { kind: 'decimal', min: NOTHING, max: MAX_PENCE_PER_UNIT },
  milesPerKwh: { kind: 'decimal', min: NOTHING, max: MAX_MILES_PER_KWH, minExclusive: true },
  homeShare: { kind: 'percent', min: NOTHING, max: ALL },
  homePencePerKwh: { kind: 'decimal', min: NOTHING, max: MAX_PENCE_PER_UNIT },
  publicPencePerKwh: { kind: 'decimal', min: NOTHING, max: MAX_PENCE_PER_UNIT },
  pencePerMile: { kind: 'decimal', min: NOTHING, max: MAX_PENCE_PER_UNIT },
  fuelPriceChange: { kind: 'percent', min: negate(PRICE_CHANGE_BOUND), max: PRICE_CHANGE_BOUND },
  insurance: { kind: 'money' },
  maintenance: { kind: 'money' },
  ved: { kind: 'money' },
  other: { kind: 'money' },
  loanAmount: { kind: 'money' },
  deposit: { kind: 'money' },
  term: { kind: 'whole', min: 1, max: MAX_FINANCE_TERM_MONTHS },
  pricing: { kind: 'choice', options: PRICING_MODES },
  rate: { kind: 'percent', min: NOTHING, max: MAX_FINANCE_RATE },
  basis: { kind: 'choice', options: BASES },
  payment: { kind: 'money' },
  arrangementFee: { kind: 'money' },
  arrangementFeeTiming: { kind: 'choice', options: TIMINGS },
  balloon: { kind: 'money' },
  optionFee: { kind: 'money' },
  finalPayment: { kind: 'money' },
  purchaseFee: { kind: 'money' },
  pcpEnd: { kind: 'choice', options: PCP_ENDS },
  mileageAllowance: { kind: 'whole', min: 0, max: MAX_ANNUAL_MILEAGE },
  excessPerMile: { kind: 'whole', min: 0, max: toPence(MAX_EXCESS_PER_MILE) },
}

export const SHARED_LIMITS = {
  horizonMonths: { min: 1, max: MAX_HORIZON_MONTHS },
  savingsReturn: { min: NOTHING, max: MAX_SAVINGS_RETURN },
  generalIncrease: { min: negate(PRICE_CHANGE_BOUND), max: PRICE_CHANGE_BOUND },
} as const

export const AMOUNT_LIMITS = { min: ZERO, max: MAX_INPUT_AMOUNT }

const OPTION_FIELDS = Object.keys(FIELD_LABELS) as OptionField[]

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max

const isAmount = (value: unknown): value is number => isWhole(value, AMOUNT_LIMITS.min as number, AMOUNT_LIMITS.max as number)

/** The problem with one stored option field, in words; undefined when it is fine. Every amount and rate may be null (empty). */
function optionFieldProblem(field: OptionField, value: unknown): string | undefined {
  if (field === 'name') {
    const ok =
      typeof value === 'string' && Array.from(value).length <= MAX_ITEM_NAME_LENGTH && cleanText(value, MAX_ITEM_NAME_LENGTH) === value
    return ok ? undefined : 'must be plain text, no longer than the longest name Sumyard accepts.'
  }
  const limit = LIMITS[field]
  if (limit.kind === 'choice') return limit.options.includes(value as string) ? undefined : 'must be one of the options.'
  if (value === null) return undefined
  switch (limit.kind) {
    case 'money':
      return isAmount(value) ? undefined : 'must be whole pence from nothing up to the input limit, or empty.'
    case 'whole':
      return isWhole(value, limit.min, limit.max) ? undefined : 'must be a whole number within the range Sumyard models, or empty.'
    case 'percent':
      return isCanonicalPercent(value, { min: limit.min, max: limit.max, maxDecimals: DECIMALS })
        ? undefined
        : 'must be a percentage with at most two decimal places, within the range Sumyard models, or empty.'
    case 'decimal':
      return isCanonicalDecimal(value, { min: limit.min, max: limit.max, minExclusive: limit.minExclusive, maxDecimals: DECIMALS })
        ? undefined
        : 'must be a number with at most two decimal places, within the range Sumyard models, or empty.'
  }
}

function sharedFieldProblem(field: SharedField, value: unknown): string | undefined {
  const label = SHARED_LABELS[field]
  switch (field) {
    case 'horizonMonths':
      return isWhole(value, SHARED_LIMITS.horizonMonths.min, SHARED_LIMITS.horizonMonths.max)
        ? undefined
        : `${label} must be a whole number of months, from one up to the longest Sumyard models.`
    case 'valueCase':
      return VALUE_CASES.includes(value as ValueCase) ? undefined : `${label} must be low, expected or high.`
    default:
      return value === null || isCanonicalPercent(value, { ...SHARED_LIMITS[field], maxDecimals: DECIMALS })
        ? undefined
        : `${label} must be a percentage with at most two decimal places, within the range Sumyard models, or empty.`
  }
}

const SHARED_FIELDS = Object.keys(SHARED_LABELS) as SharedField[]

/** Checks untrusted inputs (storage, an imported file) field by field and builds a fresh object. */
function validate(raw: unknown) {
  if (!isRecord(raw) || Array.isArray(raw)) return { ok: false as const, errors: ['The inputs are not a set of car decision inputs.'] }
  const hostile = checkUntrustedJson(raw)
  if (hostile) return { ok: false as const, errors: [`The inputs are not safe to read: ${hostile}`] }
  const errors = SHARED_FIELDS.flatMap((field) => sharedFieldProblem(field, raw[field]) ?? [])
  const options = raw.options
  if (!Array.isArray(options) || options.length < 1 || options.length > MAX_CAR_OPTIONS) {
    errors.push('The inputs need from one option up to the most Sumyard compares (options).')
    return { ok: false as const, errors }
  }
  options.forEach((option, index) => {
    if (!isRecord(option) || Array.isArray(option)) {
      errors.push(`Option ${index + 1} is not a set of option inputs.`)
      return
    }
    for (const field of OPTION_FIELDS) {
      const problem = optionFieldProblem(field, option[field])
      if (problem) errors.push(`Option ${index + 1}, ${FIELD_LABELS[field]} ${problem}`)
    }
  })
  if (errors.length > 0) return { ok: false as const, errors }
  const inputs: CarDecisionInputs = {
    horizonMonths: raw.horizonMonths as number,
    valueCase: raw.valueCase as ValueCase,
    savingsReturn: raw.savingsReturn as string | null,
    generalIncrease: raw.generalIncrease as string | null,
    options: options.map((option: Record<string, unknown>) => {
      const fresh: Record<string, unknown> = {}
      for (const field of OPTION_FIELDS) {
        const value = option[field]
        fresh[field] = value !== null && (MONEY_FIELDS as readonly string[]).includes(field) ? fromPence(value as number) : value
      }
      return fresh as unknown as OptionInputs
    }),
  }
  return { ok: true as const, inputs }
}

/** A fresh option of a kind with every amount and rate empty. */
export function blankOption(acquisition: AcquisitionKind): OptionInputs {
  return {
    name: '',
    acquisition,
    value: null,
    endLow: null,
    endExpected: null,
    endHigh: null,
    annualMileage: null,
    fuelMode: 'fuel',
    milesPerGallon: null,
    pencePerLitre: null,
    milesPerKwh: null,
    homeShare: null,
    homePencePerKwh: null,
    publicPencePerKwh: null,
    pencePerMile: null,
    fuelPriceChange: null,
    insurance: null,
    maintenance: null,
    ved: null,
    other: null,
    loanAmount: null,
    deposit: null,
    term: null,
    pricing: 'rate',
    rate: null,
    basis: 'annual',
    payment: null,
    arrangementFee: null,
    arrangementFeeTiming: 'start',
    balloon: null,
    optionFee: null,
    finalPayment: null,
    purchaseFee: null,
    pcpEnd: 'buy',
    mileageAllowance: null,
    excessPerMile: null,
  }
}

/** Option sections (docs/ui-patterns.md, U1): the car, its finance (loan, HP, PCP only) and running costs with fuel. */
export type SectionId = 'car' | 'finance' | 'running'

export const FUEL_FIELDS: Record<FuelMode, readonly OptionField[]> = {
  fuel: ['milesPerGallon', 'pencePerLitre'],
  electric: ['milesPerKwh', 'homeShare', 'homePencePerKwh', 'publicPencePerKwh'],
  'per-mile': ['pencePerMile'],
}

export const isFinance = (kind: AcquisitionKind) => kind === 'loan' || kind === 'hire-purchase' || kind === 'pcp'

/** The fields an option's section shows, for its kind, fuel type and pricing. */
export function sectionFields(id: SectionId, option: OptionInputs): readonly OptionField[] {
  if (id === 'car') return ['value', 'endLow', 'endExpected', 'endHigh', 'annualMileage']
  if (id === 'running') return ['insurance', 'maintenance', 'ved', 'other', ...FUEL_FIELDS[option.fuelMode], 'fuelPriceChange']
  const price: OptionField = option.pricing === 'rate' ? 'rate' : 'payment'
  switch (option.acquisition) {
    case 'loan':
      return ['loanAmount', 'term', price, 'arrangementFee']
    case 'hire-purchase':
      return ['deposit', 'term', price, 'arrangementFee', 'balloon', 'optionFee']
    case 'pcp':
      return ['deposit', 'term', price, 'arrangementFee', 'finalPayment', 'purchaseFee', 'mileageAllowance', 'excessPerMile']
    default:
      return []
  }
}

/** The fields an option still needs before it can be costed: empty boxes it shows, in the page's order. */
export function missingFields(option: OptionInputs): OptionField[] {
  const shown = [...sectionFields('car', option), ...sectionFields('running', option), ...sectionFields('finance', option)]
  return shown.filter((field) => option[field] === null)
}

const need = <T>(value: T | null): T => {
  if (value === null) throw new Error('An option was costed before it was complete')
  return value
}

/** A PCP's yearly allowance over the agreement, to the nearest whole mile: as the engine works out the expected mileage (F24). */
const allowanceOver = (yearly: number, term: number) => Number(divideRound(BigInt(yearly * term), BigInt(MONTHS_PER_YEAR), 'nearest'))

/** The engine's fuel or energy cost (F21) once the fuel boxes for the option's fuel type are filled, else null. */
export function fuelCost(o: OptionInputs): FuelCost | null {
  if (FUEL_FIELDS[o.fuelMode].some((field) => o[field] === null)) return null
  if (o.fuelMode === 'fuel')
    return { kind: 'fuel', milesPerGallon: decimalRatio(need(o.milesPerGallon)), pencePerLitre: decimalRatio(need(o.pencePerLitre)) }
  if (o.fuelMode === 'electric')
    return {
      kind: 'electric',
      milesPerKwh: decimalRatio(need(o.milesPerKwh)),
      homeShare: percentRatio(need(o.homeShare)),
      homePencePerKwh: decimalRatio(need(o.homePencePerKwh)),
      publicPencePerKwh: decimalRatio(need(o.publicPencePerKwh)),
    }
  return { kind: 'per-mile', pencePerMile: decimalRatio(need(o.pencePerMile)) }
}

/** The engine's option for a complete option (missingFields empty), with the shared yearly increase. */
export function toEngineOption(option: OptionInputs, generalIncrease: Ratio): CarOption {
  const o = option
  const fuel = need(fuelCost(o))
  const car = {
    value: need(o.value),
    horizonValue: { low: need(o.endLow), expected: need(o.endExpected), high: need(o.endHigh) },
    annualMileage: need(o.annualMileage),
    fuel,
    fuelPriceChange: percentRatio(need(o.fuelPriceChange)),
    running: { insurance: need(o.insurance), maintenance: need(o.maintenance), ved: need(o.ved), other: need(o.other) },
    generalIncrease,
  }
  return { car, acquisition: acquisitionOf(o) }
}

function acquisitionOf(o: OptionInputs): Acquisition {
  if (o.acquisition === 'keep' || o.acquisition === 'cash') return { kind: o.acquisition }
  const pricing: Pricing =
    o.pricing === 'rate'
      ? { kind: 'rate', rate: percentRatio(need(o.rate)), basis: o.basis }
      : { kind: 'payment', payment: need(o.payment) }
  const term = need(o.term)
  const common = { term, pricing, arrangementFee: need(o.arrangementFee), arrangementFeeTiming: o.arrangementFeeTiming }
  if (o.acquisition === 'loan') return { kind: 'loan', finance: { amount: need(o.loanAmount), ...common } }
  if (o.acquisition === 'hire-purchase') {
    return {
      kind: 'hire-purchase',
      finance: { deposit: need(o.deposit), ...common, balloon: need(o.balloon), optionFee: need(o.optionFee) },
    }
  }
  return {
    kind: 'pcp',
    end: o.pcpEnd,
    finance: {
      deposit: need(o.deposit),
      ...common,
      finalPayment: need(o.finalPayment),
      purchaseFee: need(o.purchaseFee),
      mileageAllowance: allowanceOver(need(o.mileageAllowance), term),
      excessPerMile: fromPence(need(o.excessPerMile)),
    },
  }
}

/** The engine's shared inputs, once the shared assumptions are entered. */
export const toEngineShared = (inputs: CarDecisionInputs): Shared => ({
  horizonMonths: inputs.horizonMonths,
  savingsReturn: percentRatio(need(inputs.savingsReturn)),
})

/** Why an engine refused, in words with no figures. */
export const PROBLEM_MESSAGES: Record<FinanceProblemReason, string> = {
  'not-money': 'Enter an amount in pounds and pence.',
  'not-a-rate': 'Enter a number.',
  'not-whole': 'Enter a whole number.',
  'not-a-choice': 'Choose one of the options.',
  'below-minimum': 'This is below the least Sumyard models.',
  'above-maximum': 'This is above the most Sumyard models.',
  'not-payable': 'The payments can’t be worked out to the penny for these figures. Try a different term, rate or final payment.',
  'too-large': 'The result would grow past the largest amount Sumyard can work out exactly. Try smaller amounts or a shorter horizon.',
}

/** Words for a problem that has a clearer meaning on a field than the reason alone. */
const SPECIFIC: Partial<Record<string, string>> = {
  'deposit/above-maximum': 'The deposit must be below the price, leaving something to finance.',
  'amount/above-maximum': 'The loan amount can’t be more than the price.',
  'amount/below-minimum': 'Enter a loan amount above nothing.',
  'cashPrice/below-minimum': 'Enter a price above nothing to finance.',
  'finalPayment/above-maximum': 'The final payment can’t be more than the amount financed.',
  'balloon/above-maximum': 'The balloon can’t be more than the amount financed.',
  'horizonValue/above-maximum': 'An end value is above the most Sumyard models for this price.',
  'payment/below-minimum': 'The monthly payments don’t repay the amount financed.',
  'payment/above-maximum': 'The monthly payment is too high for any rate Sumyard models.',
}

/** The page's label for an engine field. */
function engineLabel(field: OwnershipField | FinanceField | 'result', valueLabel: string): string {
  switch (field) {
    case 'result':
      return 'Result'
    case 'value':
    case 'cashPrice':
      return valueLabel
    case 'amount':
      return FIELD_LABELS.loanAmount
    case 'horizonValue':
      return 'End values'
    case 'expectedMileage':
      return FIELD_LABELS.annualMileage
    case 'fuel':
      return FIELD_LABELS.fuelMode
    case 'end':
      return FIELD_LABELS.pcpEnd
    case 'options':
      return 'Options'
    case 'horizonMonths':
      return SHARED_LABELS.horizonMonths
    case 'savingsReturn':
      return SHARED_LABELS.savingsReturn
    case 'generalIncrease':
      return SHARED_LABELS.generalIncrease
    default:
      return FIELD_LABELS[field as OptionField] ?? field
  }
}

/** "Price" or, for keep, "Current value". */
export const valueLabel = (kind: AcquisitionKind) => (kind === 'keep' ? 'Current value' : 'Price')

/** Engine problems as an InputRefusal, for RefusalNotice and compare. */
export function inputRefusal(problems: readonly OwnershipProblem[], kind: AcquisitionKind = 'cash'): InputRefusal {
  return {
    ok: false,
    kind: 'inputs',
    problems: problems.map(({ field, reason }) => ({
      field,
      label: engineLabel(field, valueLabel(kind)),
      message: SPECIFIC[`${field}/${reason}`] ?? PROBLEM_MESSAGES[reason],
    })),
  }
}

export type OptionStatus =
  | { readonly kind: 'missing'; readonly missing: readonly OptionField[] }
  /** An input in it is being typed and isn't valid yet: held back until it is fixed. */
  | { readonly kind: 'held' }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | {
      readonly kind: 'ok'
      readonly result: OwnershipResult
      /** The option's index in the comparison (options set apart are left out of it). */
      readonly engineIndex: number
      readonly option: CarOption
    }

export type PageOutcome =
  | { readonly kind: 'missing-shared'; readonly missing: readonly SharedField[] }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'ok'; readonly statuses: readonly OptionStatus[]; readonly comparison: Comparison | null }

/**
 * Every complete option compared on the shared horizon (compareOptions), or why not. An option still missing inputs is
 * listed as missing; one the engine refuses carries its own refusal; the rest are compared without them. Each option's
 * figures are the engine's, never the page's.
 */
export function calculate(inputs: CarDecisionInputs, held: ReadonlySet<number> = new Set()): PageOutcome {
  const missingShared = (['savingsReturn', 'generalIncrease'] as const).filter((field) => inputs[field] === null)
  if (missingShared.length > 0) return { kind: 'missing-shared', missing: missingShared }
  const shared = toEngineShared(inputs)
  const increase = percentRatio(need(inputs.generalIncrease))
  const statuses: (OptionStatus | null)[] = inputs.options.map((option, index) => {
    if (held.has(index)) return { kind: 'held' }
    const missing = missingFields(option)
    return missing.length > 0 ? { kind: 'missing', missing } : null
  })
  const built = new Map(
    inputs.options.flatMap((option, index) => (statuses[index] ? [] : [[index, toEngineOption(option, increase)] as const])),
  )
  const refuse = (index: number, problems: readonly OwnershipProblem[]) => {
    statuses[index] = { kind: 'refused', refusal: inputRefusal(problems, inputs.options[index]!.acquisition) }
    built.delete(index)
  }
  // An option's own problems set it apart; the comparison runs again without it (twice at most: problems come all at once).
  for (let attempt = 0; built.size > 0; attempt++) {
    const indexes = [...built.keys()]
    const outcome = compareOptions([...built.values()], shared)
    if (outcome.ok) {
      indexes.forEach((index, engineIndex) => {
        statuses[index] = { kind: 'ok', result: outcome.result.options[engineIndex]!, engineIndex, option: built.get(index)! }
      })
      return { kind: 'ok', statuses: statuses as OptionStatus[], comparison: outcome.result }
    }
    const own = outcome.problems.filter((p) => p.option !== undefined)
    const general = outcome.problems.filter((p) => p.option === undefined)
    for (const index of new Set(own.map((p) => p.option!)))
      refuse(
        indexes[index]!,
        own.filter((p) => p.option === index),
      )
    if (general.length > 0) {
      // A sum past the safe range has no option: cost each alone to find which.
      const alone = indexes.filter((index) => built.has(index)).map((index) => [index, ownershipCost(built.get(index)!, shared)] as const)
      const failing = alone.filter(([, result]) => !result.ok)
      if (failing.length === 0 || attempt > 0) return { kind: 'refused', refusal: inputRefusal(general) }
      for (const [index, result] of failing) if (!result.ok) refuse(index, result.problems)
    }
  }
  return { kind: 'ok', statuses: statuses as OptionStatus[], comparison: null }
}

/** An option's name, or its number when it has none. */
export const optionName = (option: OptionInputs, index: number) => option.name || `Option ${index + 1}`

/** Each option's name for compare rows, unique: a repeated name gets its option number. */
export function uniqueNames(options: readonly OptionInputs[]): string[] {
  const names = options.map(optionName)
  return names.map((name, index) => (names.indexOf(name) === index ? name : `${name} (option ${index + 1})`))
}

/** Fields in words for a missing list: "Price, End value, low". */
export const fieldList = (fields: readonly OptionField[], kind: AcquisitionKind) =>
  fields.map((field) => (field === 'value' ? valueLabel(kind) : FIELD_LABELS[field])).join(', ')

const money = (label: string, amount: Money): SummaryRow => ({ label, value: { kind: 'money', amount } })
const text = (label: string, value: string): SummaryRow => ({ label, value: { kind: 'text', text: value } })
const percentRow = (label: string, value: string | null): SummaryRow =>
  value === null ? text(label, 'Not entered') : { label, value: { kind: 'ratio', ratio: percentRatio(value) } }

/** "48 of 48 months". */
export const coverageText = (result: OwnershipResult) => `${result.coverageMonths} of ${result.horizonMonths} months`

export const carDecisionCalculator: CalculatorDefinition<CarDecisionInputs> = defineCalculator<CarDecisionInputs>({
  id: 'car-decision',
  name: 'Car decision',
  summary:
    'What a car costs over the same horizon if you keep your current car, buy with cash, or take a loan, HP or PCP: net cost per month of coverage in low, expected and high cases for its value, with what would change the order.',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({
    horizonMonths: DEFAULT_HORIZON_MONTHS,
    valueCase: 'expected',
    savingsReturn: null,
    generalIncrease: null,
    options: [blankOption('keep'), blankOption('cash')],
  }),
  validateInputs: validate,
  migrateInputs(from) {
    // Version 1 is the first: there is nothing older to migrate from.
    throw new Error(`The car decision calculator has no inputs version ${from} to migrate from`)
  },
  summarise(inputs) {
    const names = uniqueNames(inputs.options)
    const rows: SummaryRow[] = [
      { label: SHARED_LABELS.horizonMonths, value: { kind: 'count', count: inputs.horizonMonths } },
      text(SHARED_LABELS.valueCase, CASE_LABELS[inputs.valueCase]),
      percentRow(SHARED_LABELS.savingsReturn, inputs.savingsReturn),
      percentRow(SHARED_LABELS.generalIncrease, inputs.generalIncrease),
      ...inputs.options.map((option, index) => text(names[index]!, ACQUISITION_LABELS[option.acquisition])),
    ]
    const outcome = calculate(inputs)
    if (outcome.kind === 'missing-shared') {
      return {
        inputs: rows,
        results: {
          ok: false,
          kind: 'inputs',
          problems: outcome.missing.map((field) => ({ field, label: SHARED_LABELS[field], message: 'Not entered yet.' })),
        },
      }
    }
    if (outcome.kind === 'refused') return { inputs: rows, results: outcome.refusal }
    const results: SummaryRow[] = [text(SHARED_LABELS.valueCase, CASE_LABELS[inputs.valueCase])]
    outcome.statuses.forEach((status, index) => {
      const name = names[index]!
      const labels = ['net cost per month of coverage', 'total net cost', 'coverage', 'equity at the horizon'].map(
        (what) => `${name}: ${what}`,
      )
      const [perMonth, total, coverage, equity] = labels as [string, string, string, string]
      if (status.kind !== 'ok') {
        const why =
          status.kind === 'refused' ? `No results: ${status.refusal.problems.map((p) => p.label).join(', ')}` : 'No results: inputs missing'
        results.push(...labels.map((label) => text(label, why)))
        return
      }
      const c = status.result.cases[inputs.valueCase]
      results.push(
        money(perMonth, c.netCostPerCoverageMonth),
        money(total, c.netCost),
        text(coverage, coverageText(status.result)),
        status.result.fullCoverage ? money(equity, c.months.at(-1)!.equity) : text(equity, 'No car: handed back'),
      )
    })
    return { inputs: rows, results: { ok: true, rows: results } }
  },
})

/** For hints and summaries: a percentage's display. */
export const percentText = (text: string) => formatPercent(percentRatio(text))
