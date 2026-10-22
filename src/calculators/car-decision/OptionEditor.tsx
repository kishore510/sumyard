import { Copy, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { DecimalInput } from '@/components/inputs/DecimalInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { TextInput } from '@/components/inputs/TextInput'
import { Section } from '@/components/Section'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { formatPence, formatPercent } from '@/lib/format'
import { MAX_ITEM_NAME_LENGTH } from '@/lib/inputLimits'
import type { Money } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { costPerMile } from '../car-ownership/calc'
import {
  ACQUISITION_LABELS,
  ACQUISITIONS,
  AMOUNT_LIMITS,
  BASES,
  DECIMALS,
  FIELD_LABELS,
  FUEL_LABELS,
  FUEL_MODES,
  fieldList,
  fuelCost,
  isFinance,
  LIMITS,
  type OptionField,
  type OptionInputs,
  type OptionStatus,
  optionName,
  PCP_ENDS,
  PRICING_MODES,
  type SectionId,
  sectionFields,
  TIMINGS,
  valueLabel,
} from './definition'

/*
 * One option in the car decision's editor (slice 3c-1): its name and how the
 * car is had, then sections with live one-line summaries (docs/ui-patterns.md,
 * U1 to U3): the car, its finance (loan, HP and PCP only) and its running
 * costs with fuel or energy. Every amount and rate starts empty; the hints
 * say each convention in words and hold no figure. The cost per mile shown
 * under the fuel boxes is the engine's (costPerMile). Duplicate and Remove
 * are the page's (Remove has Undo).
 */

type Gbp = (amount: Money) => string
type Bounded = Exclude<OptionField, 'name'>

/** The convention behind each input, in words. No figures. */
const HINTS: Partial<Record<OptionField, string>> = {
  endLow: 'What the car could be worth at the end of the horizon if things go badly.',
  endExpected: 'What you expect it to be worth then. The value falls by the same percentage each year between now and then.',
  endHigh: 'What it could be worth then if things go well. It may be more than today’s value, within a limit.',
  annualMileage: 'Whole miles a year, the same every year.',
  loanAmount: 'The amount borrowed. Any part of the price it doesn’t cover is paid in cash at the start.',
  deposit: 'Paid at the start; the rest of the price is financed.',
  term: 'Whole months. Payments are monthly, the first a month after the start.',
  rate: 'The yearly rate from the quote. Its basis is below.',
  basis:
    'Effective a year: each month’s rate compounds to this over a year, as an APR is worked out. Nominal: a twelfth of it is charged each month.',
  payment: 'The monthly payment from the quote. The rate is worked out from it.',
  arrangementFee: 'A loan’s arrangement fee or an HP or PCP documentation fee. Nothing if there is none.',
  arrangementFeeTiming: 'Paid at the start in cash, or added to what you borrow, where it is charged interest.',
  balloon: 'A larger last payment the agreement requires. Nothing if there is none.',
  optionFee: 'Paid with the last payment, when the car becomes yours.',
  finalPayment: 'The optional final payment to keep the car at the end.',
  purchaseFee: 'Paid with the final payment if you buy the car at the end.',
  pcpEnd: 'Hand it back: no final payment, any excess mileage charged, and no car for the rest of the horizon.',
  mileageAllowance: 'Miles a year the agreement allows. It matters only if you hand the car back.',
  excessPerMile: 'Pence for each mile over the allowance, charged only if you hand the car back.',
  insurance: 'A year, for the first year. It rises each year by the shared yearly increase.',
  maintenance: 'Servicing, tyres and repairs a year, for the first year. It rises by the shared yearly increase.',
  ved: 'Vehicle excise duty a year, as you enter it. Check the rate for this car on GOV.UK: Sumyard holds no VED figures.',
  other: 'Anything else a year, such as parking or breakdown cover. It rises by the shared yearly increase.',
  milesPerGallon: 'Miles per UK gallon. Sumyard converts to litres with the litres in an imperial gallon.',
  pencePerLitre: 'The pump price, in pence a litre.',
  milesPerKwh: 'Miles for each kWh of charging.',
  homeShare: 'The share of charging done at home; the rest is at public chargers.',
  homePencePerKwh: 'Your home tariff, in pence a kWh.',
  publicPencePerKwh: 'What public charging costs you, in pence a kWh.',
  pencePerMile: 'Your own figure for fuel or energy, in pence a mile.',
  fuelPriceChange: 'Its own yearly change, apart from the shared increase. It can be negative.',
}

const VALUE_HINTS = {
  keep: 'What the car would sell for today. Keeping it counts this as a sale given up at the start.',
  other: 'The cash price. Finance is on this price.',
} as const

const SUFFIXES: Partial<Record<OptionField, string>> = {
  annualMileage: 'miles',
  term: 'months',
  milesPerGallon: 'mpg',
  pencePerLitre: 'p',
  milesPerKwh: 'miles',
  homePencePerKwh: 'p',
  publicPencePerKwh: 'p',
  pencePerMile: 'p',
  mileageAllowance: 'miles',
  excessPerMile: 'p',
}

/** Each field's id suffix: cd-o<key>-<suffix>. */
export const ID_SUFFIXES: Record<OptionField, string> = {
  name: 'name',
  acquisition: 'acquisition',
  value: 'value',
  endLow: 'end-low',
  endExpected: 'end-expected',
  endHigh: 'end-high',
  annualMileage: 'mileage',
  fuelMode: 'fuel-mode',
  milesPerGallon: 'mpg',
  pencePerLitre: 'ppl',
  milesPerKwh: 'mpkwh',
  homeShare: 'home-share',
  homePencePerKwh: 'home-ppkwh',
  publicPencePerKwh: 'public-ppkwh',
  pencePerMile: 'ppm',
  fuelPriceChange: 'fuel-change',
  insurance: 'insurance',
  maintenance: 'maintenance',
  ved: 'ved',
  other: 'other',
  loanAmount: 'loan-amount',
  deposit: 'deposit',
  term: 'term',
  pricing: 'pricing',
  rate: 'rate',
  basis: 'basis',
  payment: 'payment',
  arrangementFee: 'fee',
  arrangementFeeTiming: 'fee-timing',
  balloon: 'balloon',
  optionFee: 'option-fee',
  finalPayment: 'final-payment',
  purchaseFee: 'purchase-fee',
  pcpEnd: 'pcp-end',
  mileageAllowance: 'allowance',
  excessPerMile: 'excess',
}

const CHOICE_LABELS = {
  pricing: { rate: 'Interest rate', payment: 'Monthly payment' },
  basis: { annual: 'Effective a year', monthly: 'Nominal, monthly' },
  arrangementFeeTiming: { start: 'At the start', added: 'Added to the loan' },
  pcpEnd: { buy: 'Buy the car', 'hand-back': 'Hand it back' },
} as const

const SECTION_TITLES: Record<SectionId, string> = { car: 'The car', finance: 'Finance', running: 'Running costs' }

export const NOT_SET = 'Not set'
export const NEEDS_FIXING = 'Fix the highlighted input'

/** The invalid-field name the session tracks for an option's box. */
export const fieldName = (key: number, field: OptionField) => `o${key}.${field}`

const entered = (option: OptionInputs, fields: readonly OptionField[]) => fields.filter((f) => option[f] !== null)

/** The engine's cost per mile once the fuel boxes are filled, else null. */
function perMileCost(option: OptionInputs): string | null {
  const fuel = fuelCost(option)
  return fuel ? formatPence(costPerMile(fuel)) : null
}

/** A section header's one-line summary (U2), built from the stored inputs and the engine's cost per mile. */
export function sectionSummary(id: SectionId, option: OptionInputs, invalid: readonly OptionField[], gbp: Gbp): string {
  const fields = sectionFields(id, option)
  if (fields.some((f) => invalid.includes(f))) return NEEDS_FIXING
  if (entered(option, fields).length === 0) return NOT_SET
  const parts: string[] = []
  const money = (field: OptionField, label?: string) => {
    const value = option[field] as Money | null
    if (value !== null) parts.push(label ? `${label} ${gbp(value)}` : gbp(value))
  }
  if (id === 'car') {
    money('value', valueLabel(option.acquisition))
    const ends = (['endLow', 'endExpected', 'endHigh'] as const).map((f) => option[f])
    if (ends.some((v) => v !== null)) parts.push(`ends ${ends.map((v) => (v === null ? '…' : gbp(v))).join(' / ')}`)
    if (option.annualMileage !== null) parts.push(`${new Intl.NumberFormat('en-GB').format(option.annualMileage)} miles a year`)
  } else if (id === 'running') {
    for (const field of ['insurance', 'maintenance', 'ved', 'other'] as const) money(field, FIELD_LABELS[field])
    const perMile = perMileCost(option)
    if (perMile) parts.push(`${FUEL_LABELS[option.fuelMode].toLowerCase()} ${perMile} a mile`)
  } else {
    money(option.acquisition === 'loan' ? 'loanAmount' : 'deposit', option.acquisition === 'loan' ? 'Loan' : 'Deposit')
    if (option.term !== null) parts.push(`${option.term} months`)
    if (option.pricing === 'rate' && option.rate !== null)
      parts.push(`${formatPercent(percentRatio(option.rate))} ${CHOICE_LABELS.basis[option.basis].toLowerCase()}`)
    if (option.pricing === 'payment') money('payment', 'paying')
    if (option.acquisition === 'pcp') {
      money('finalPayment', 'final')
      parts.push(CHOICE_LABELS.pcpEnd[option.pcpEnd].toLowerCase())
    }
    if (option.acquisition === 'hire-purchase') money('balloon', 'balloon')
  }
  const missing = fields.filter((f) => option[f] === null)
  const needs = missing.length > 0 ? `; needs ${fieldList(missing, option.acquisition).toLowerCase()}` : ''
  return `${parts.join('; ')}${needs}`
}

export interface EditorProps {
  readonly option: OptionInputs
  readonly index: number
  readonly optionKey: number
  readonly status: OptionStatus | null
  readonly invalid: readonly OptionField[]
  readonly full: boolean
  readonly only: boolean
  readonly gbp: Gbp
  readonly update: (patch: Partial<OptionInputs>) => void
  readonly setValid: (field: OptionField, ok: boolean) => void
  readonly duplicate: () => void
  readonly remove: () => void
}

/** One option's editor. Remounted (by key) on a load or a fresh start, so the open sections follow the inputs; never stored. */
export function OptionEditor({
  option,
  index,
  optionKey,
  status,
  invalid,
  full,
  only,
  gbp,
  update,
  setValid,
  duplicate,
  remove,
}: EditorProps) {
  const base = `cd-o${optionKey}`
  const id = (field: OptionField) => `${base}-${ID_SUFFIXES[field]}`
  const [openOnMount] = useState(() => ({
    car: entered(option, sectionFields('car', option)).length > 0,
    finance: entered(option, sectionFields('finance', option)).length > 0,
    running: entered(option, sectionFields('running', option)).length > 0,
  }))
  const name = optionName(option, index)
  const common = (field: OptionField) => ({
    id: id(field),
    label: FIELD_LABELS[field],
    hint: HINTS[field],
    onValidityChange: (ok: boolean) => setValid(field, ok),
  })
  const money = (field: OptionField, label?: string, hint?: string) => (
    <CurrencyInput
      {...common(field)}
      label={label ?? FIELD_LABELS[field]}
      hint={hint ?? HINTS[field]}
      allowEmpty
      value={option[field] as Money | null}
      min={AMOUNT_LIMITS.min}
      max={AMOUNT_LIMITS.max}
      onChange={(value) => update({ [field]: value })}
    />
  )
  const whole = (field: Bounded) => {
    const limit = LIMITS[field]
    return (
      <NumberInput
        {...common(field)}
        allowEmpty
        value={option[field] as number | null}
        min={limit.kind === 'whole' ? limit.min : undefined}
        max={limit.kind === 'whole' ? limit.max : undefined}
        suffix={SUFFIXES[field]}
        onChange={(value) => update({ [field]: value })}
      />
    )
  }
  const rate = (field: Bounded) => {
    const limit = LIMITS[field]
    return (
      <PercentInput
        {...common(field)}
        allowEmpty
        value={option[field] as string | null}
        min={limit.kind === 'percent' ? limit.min : undefined}
        max={limit.kind === 'percent' ? limit.max : undefined}
        maxDecimals={DECIMALS}
        onChange={(value) => update({ [field]: value })}
      />
    )
  }
  const decimal = (field: Bounded) => {
    const limit = LIMITS[field]
    return (
      <DecimalInput
        {...common(field)}
        allowEmpty
        value={option[field] as string | null}
        min={limit.kind === 'decimal' ? limit.min : undefined}
        max={limit.kind === 'decimal' ? limit.max : undefined}
        minExclusive={limit.kind === 'decimal' ? limit.minExclusive : undefined}
        maxDecimals={DECIMALS}
        suffix={SUFFIXES[field]}
        onChange={(value) => update({ [field]: value })}
      />
    )
  }
  const choice = (field: keyof typeof CHOICE_LABELS, list: readonly string[]) => {
    const labels: Record<string, string> = CHOICE_LABELS[field]
    return (
      <Segmented
        id={id(field)}
        label={FIELD_LABELS[field]}
        hint={HINTS[field]}
        value={option[field] as string}
        options={list.map((value) => ({ value, label: labels[value]! }))}
        onChange={(value) => update({ [field]: value } as Partial<OptionInputs>)}
      />
    )
  }
  const section = (sectionId: SectionId, children: ReactNode) => (
    <Section
      id={`${base}-${sectionId}`}
      title={SECTION_TITLES[sectionId]}
      summary={sectionSummary(sectionId, option, invalid, gbp)}
      defaultOpen={openOnMount[sectionId]}
    >
      {children}
    </Section>
  )
  const perMile = perMileCost(option)
  const finance = isFinance(option.acquisition)

  return (
    <fieldset id={base} data-option-editor className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface-muted p-3">
      <legend className="sr-only">{`Option ${index + 1}`}</legend>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="min-w-0 flex-1 basis-40 text-base font-semibold text-text [overflow-wrap:anywhere]">{name}</h2>
        <div className="flex flex-wrap gap-1">
          <Button id={`${base}-duplicate`} variant="ghost" disabled={full} onClick={duplicate}>
            <Copy aria-hidden="true" />
            Duplicate<span className="sr-only"> {name}</span>
          </Button>
          <Button id={`${base}-remove`} variant="ghost" disabled={only} onClick={remove}>
            <Trash2 aria-hidden="true" />
            Remove<span className="sr-only"> {name}</span>
          </Button>
        </div>
      </div>
      <TextInput
        {...common('name')}
        hint="Shown on its card and in compare. Optional."
        value={option.name}
        maxLength={MAX_ITEM_NAME_LENGTH}
        onChange={(value) => update({ name: value })}
      />
      <Segmented
        id={id('acquisition')}
        label={FIELD_LABELS.acquisition}
        value={option.acquisition}
        options={ACQUISITIONS.map((value) => ({ value, label: ACQUISITION_LABELS[value] }))}
        onChange={(acquisition) => update({ acquisition })}
      />
      {status?.kind === 'refused' && (
        <div data-option-problems>
          <InlineNotice tone="warning" title="No results for this option">
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {status.refusal.problems.map((p) => (
                <li key={p.field}>
                  <span className="font-medium">{p.label}:</span> {p.message}
                </li>
              ))}
            </ul>
          </InlineNotice>
        </div>
      )}
      {section(
        'car',
        <>
          {money('value', valueLabel(option.acquisition), option.acquisition === 'keep' ? VALUE_HINTS.keep : VALUE_HINTS.other)}
          {money('endLow')}
          {money('endExpected')}
          {money('endHigh')}
          {whole('annualMileage')}
        </>,
      )}
      {finance &&
        section(
          'finance',
          <>
            {option.acquisition === 'loan' ? money('loanAmount') : money('deposit')}
            {whole('term')}
            {choice('pricing', PRICING_MODES)}
            {option.pricing === 'rate' ? (
              <>
                {rate('rate')}
                {choice('basis', BASES)}
              </>
            ) : (
              money('payment')
            )}
            {money('arrangementFee')}
            {choice('arrangementFeeTiming', TIMINGS)}
            {option.acquisition === 'hire-purchase' && (
              <>
                {money('balloon')}
                {money('optionFee')}
              </>
            )}
            {option.acquisition === 'pcp' && (
              <>
                {money('finalPayment')}
                {money('purchaseFee')}
                {choice('pcpEnd', PCP_ENDS)}
                {whole('mileageAllowance')}
                {whole('excessPerMile')}
              </>
            )}
          </>,
        )}
      {section(
        'running',
        <>
          {money('insurance')}
          {money('maintenance')}
          {money('ved')}
          {money('other')}
          <Segmented
            id={id('fuelMode')}
            label="Fuel or energy"
            hint="Petrol or diesel by miles per gallon and the price per litre; electric by miles per kWh and what charging costs; or your own cost per mile."
            value={option.fuelMode}
            options={FUEL_MODES.map((value) => ({ value, label: FUEL_LABELS[value] }))}
            onChange={(fuelMode) => update({ fuelMode })}
          />
          {option.fuelMode === 'fuel' && (
            <>
              {decimal('milesPerGallon')}
              {decimal('pencePerLitre')}
            </>
          )}
          {option.fuelMode === 'electric' && (
            <>
              {decimal('milesPerKwh')}
              {rate('homeShare')}
              {decimal('homePencePerKwh')}
              {decimal('publicPencePerKwh')}
            </>
          )}
          {option.fuelMode === 'per-mile' && decimal('pencePerMile')}
          <p data-cost-per-mile className="text-sm text-text">
            Fuel or energy:{' '}
            <span className="font-medium tabular-nums">
              {perMile ? `${perMile} a mile` : 'a cost per mile once the boxes above are filled'}
            </span>
          </p>
          {rate('fuelPriceChange')}
        </>,
      )}
    </fieldset>
  )
}
