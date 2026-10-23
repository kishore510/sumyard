import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Chart } from '@/components/Chart/Chart'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { DateInput, dateInWords } from '@/components/inputs/DateInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { Toggle } from '@/components/inputs/Toggle'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { SETTLE_MS, StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
import { addMonths } from '@/lib/calendar'
import { formatGBP, formatGBPCompact, formatIsoDate, formatPercent } from '@/lib/format'
import { isIsoDate } from '@/lib/isoDate'
import { compare, type Money, ratio, subtract, ZERO } from '@/lib/money'
import { useStore } from '@/lib/store'
import { canonicalJson } from '@/lib/validate'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import {
  ALLOWANCE_KINDS,
  BALANCE_LIMITS,
  DAY_COUNT_LABELS,
  DAY_COUNTS,
  EXTRA_MONTH_LIMITS,
  METHOD_LABELS as INTEREST_LABELS,
  INTEREST_METHODS,
  AMOUNT_LIMITS as MORTGAGE_AMOUNT_LIMITS,
  FIELD_LABELS as MORTGAGE_LABELS,
  RATE_LIMITS as MORTGAGE_RATE_LIMITS,
  YEAR_LIMITS as MORTGAGE_YEAR_LIMITS,
  type MortgagePageInputs,
  mortgageCalculator,
  REPAYMENT_LABELS,
  REPAYMENT_TYPES,
  RESET_LIMITS,
} from '../mortgage/definition'
import {
  type ContributionField,
  INPUT_LIMITS,
  METHOD_LABELS,
  MODE_LABELS,
  MONEY_LABELS,
  type OptimiserPageInputs,
  optimiserCalculator,
  PAYMENT_LABELS,
  PLAN_LABELS,
  REGION_LABELS,
  resolveInputs,
  usesPensionablePay,
  yearsAgoLabel,
} from '../optimiser/definition'
import { carryForwardYears } from '../optimiser/optimiserInputs'
import { CONTRIBUTION_MODES } from '../optimiser/pageInputs'
import { CHILD_BENEFIT_PAYMENTS, PENSION_METHODS, REGIONS, STUDENT_LOAN_PLANS } from '../optimiser/types'
import { configFor, sessionFor } from '../session'
import {
  AGE_LIMITS,
  AMOUNT_LIMITS,
  amountsText,
  breakEvenWords,
  CASE_LABELS,
  calculate,
  FIELD_LABELS,
  GUARANTEED,
  type IsaShown,
  LEG_NAMES,
  type LegId,
  type LegView,
  type MortgageShown,
  midValue,
  type NextPoundPageInputs,
  NOT_ACCESSIBLE,
  NOT_SET_UP,
  nextPoundCalculator,
  noBreakEvenWords,
  type PageOutcome,
  type PensionShown,
  RATE_LIMITS,
  SECTION_TITLES,
  type SectionId,
  sectionSet,
  sectionSummary,
  YEAR_LIMITS,
} from './definition'
import { GROWTH_CASES, type NextPoundWarning } from './types'

/*
 * The next pound page (C2) at #/c/next-pound, on the C1 composer: "Where
 * does the next £X go?". Inputs are the union of what the three legs need,
 * in sections with live summaries (docs/ui-patterns.md); results first and
 * answer first (StickyResult): what each leg adds to net worth at the
 * horizon at the mid rate, today's money first and nominal beside it; then a
 * card per leg, the break-even ISA return in words, the composer's warnings
 * grouped by leg and never hidden, and one bar chart in today's money with a
 * table. Nothing is called best or recommended, and nothing says what anyone
 * ought to do: it is a comparison under the stated assumptions. The composer
 * runs once the inputs have settled (SETTLE_MS, as the car page's flip
 * search): it takes tens of milliseconds a run (docs/performance.md). Every
 * figure is the composer's through ./definition.ts.
 */

const session = sessionFor(nextPoundCalculator)
const takeHome = sessionFor(optimiserCalculator)

type Gbp = (amount: Money) => string

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))
const TAX_YEARS = listTaxYears().map((y) => ({ value: y.id as string, label: taxYearLabel(y.id) }))
const REGION_OPTIONS = REGIONS.map((value) => ({ value, label: value === 'rUK' ? 'England, Wales, NI' : REGION_LABELS[value] }))
const METHOD_OPTIONS = options(PENSION_METHODS, METHOD_LABELS)
const MODE_OPTIONS = CONTRIBUTION_MODES.map((value) => ({ value, label: value === 'amount' ? MODE_LABELS.amount : 'Percentage' }))
const PAYMENT_OPTIONS = CHILD_BENEFIT_PAYMENTS.map((value) => ({ value, label: value === 'claimed' ? 'Claimed' : 'Opted out' }))
const REPAYMENT_OPTIONS = options(REPAYMENT_TYPES, REPAYMENT_LABELS)
const INTEREST_OPTIONS = options(INTEREST_METHODS, INTEREST_LABELS)
const DAY_COUNT_OPTIONS = options(DAY_COUNTS, DAY_COUNT_LABELS)
const ALLOWANCE_OPTIONS = options(ALLOWANCE_KINDS, { rate: 'Percentage of the balance', amount: 'Amount' })
const PERCENT_MIN = ratio(0, 1)

/** The convention behind each input, in words. No figures. */
const HINTS = {
  lumpSum: 'Take-home pay you could put in one place now. Each column spends all of it.',
  horizonYears: 'Whole years from now to when each column is measured.',
  asOf: 'Usually today. The pension access age is checked on this date plus the years.',
  ageNow: 'In whole years, for when the pension can be taken.',
  employerMatch: 'What your employer adds because of the extra contribution, if anything. Nothing for none.',
  schemeAccessAge: 'Only if your scheme says you can take your pension later than the normal minimum age. Empty for none.',
  retirementTaxRate:
    'One rate for the taxed part of the pension when you take it. Empty: this tax year’s Basic rate band for where you live.',
  otherPensionsUseAllowance: 'On if your other pensions will use all of your lump sum allowance, so none of this pot is tax-free.',
  growth:
    'Nominal growth a year, before the fee, for both the ISA and the pension. The starting values are illustrative, not forecasts or market figures: change them.',
  feeRate: 'A share of the balance each year, for both the ISA and the pension.',
  inflationRate: 'For today’s money. Nothing: today’s money is the same as nominal.',
  isaPaidThisYear: 'Already paid into ISAs this tax year, for the allowance warning only.',
  method: {
    salarySacrifice: 'Salary you give up for an employer contribution: less tax, National Insurance and student loan.',
    netPay: 'Taken from your pay before tax: less tax, but not less National Insurance.',
    reliefAtSource: 'Paid from your take-home pay; your provider adds basic rate relief. Enter what you pay.',
  },
  employeeContribution: 'What you put in now by this method, for the year. Zero for none. The lump sum is added on top.',
  employerContribution: 'Your employer’s own contribution now, for the year. It counts towards the annual allowance.',
} as const

/** What the page adds to the composer's assumptions (C2 page readings). No figures. */
const PAGE_ASSUMPTIONS = [
  'Page reading (C2): your pay and pension are the take-home page’s inputs. Benefits in kind, post-tax deductions and a tax code come only from a copy of the take-home page’s inputs; this page shows them but does not edit them, and a tax code changes no figure here.',
  'Page reading (C2): the mortgage is the mortgage page’s inputs without its own overpayments: the lump sum is the one overpayment. With nothing entered there, the mortgage column is not set up.',
  'Page reading (C2): the sticky result and the chart show the mid growth rate; the cards show low, mid and high.',
  'Page reading (C2): the results are worked out once you stop typing.',
]

/** Plain words for the mortgage engine's warnings, as this page shows them. */
function mortgageWarningText(w: Extract<NextPoundWarning, { source: 'mortgage' }>['warning'], gbp: Gbp): string {
  switch (w.kind) {
    case 'unused-overpayment':
      return `Only what clears the balance is overpaid: ${gbp(w.amount)} is held as cash in this column.`
    case 'over-allowance':
      return `The overpayment is above the penalty-free limit in allowance year ${w.year}: an early repayment charge of ${gbp(w.charge)}, paid in cash from the lump sum.`
    case 'effect-not-applicable':
      return 'On an interest-only mortgage the term does not shorten: overpaying lowers what is owed and so the interest.'
  }
}

const warningText = (w: NextPoundWarning, gbp: Gbp) =>
  w.source === 'mortgage' ? mortgageWarningText(w.warning, gbp) : w.source === 'optimiser' ? w.warning.message : w.message

/* The composer, once the inputs have settled. */

const outcomeMemo = new Map<string, PageOutcome>()
const MEMO_SIZE = 16

/**
 * nextPound() on the inputs once they have stopped changing for SETTLE_MS (the first run at once): one run is tens of
 * milliseconds, too slow for every keystroke on a phone (docs/performance.md). Inputs already seen are shown at once.
 * While a change waits, the last results stay with `stale` set.
 */
function useOutcome(inputs: NextPoundPageInputs | null, config: TaxYearConfig) {
  const key = inputs === null ? null : `${config.id}|${canonicalJson(inputs)}`
  const [ready, setReady] = useState<{ readonly key: string; readonly outcome: PageOutcome } | null>(null)
  const first = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands for the inputs and the config.
  useEffect(() => {
    if (key === null || inputs === null) return
    const known = outcomeMemo.get(key)
    const wait = first.current ? 0 : SETTLE_MS
    first.current = false
    const timer = setTimeout(
      () => {
        const outcome = known ?? calculate(inputs, config)
        if (!known) {
          if (outcomeMemo.size >= MEMO_SIZE) outcomeMemo.clear()
          outcomeMemo.set(key, outcome)
        }
        setReady({ key, outcome })
      },
      known ? 0 : wait,
    )
    return () => clearTimeout(timer)
  }, [key])
  return { outcome: ready?.outcome ?? null, stale: ready !== null && ready.key !== key }
}

/** The sticky line: each leg at the mid rate, today's money first, nominal beside it. */
function stickyValue(outcome: Extract<PageOutcome, { kind: 'ok' }>, gbp: Gbp): string {
  const part = (id: LegId, leg: LegView<PensionShown | MortgageShown | IsaShown>) => {
    const name = LEG_NAMES[id]
    if (leg.kind === 'none') return `${name}: ${NOT_SET_UP.toLowerCase()}`
    if (leg.kind === 'shown' && leg.leg.status === 'not-accessible') return `${name}: ${NOT_ACCESSIBLE.toLowerCase()}`
    if (leg.kind === 'needs' || leg.kind === 'refused') return `${name}: no result`
    const value = midValue(leg)
    return `${name} ${value === null ? gbp(ZERO) : amountsText(value, gbp)}`
  }
  return [part('pension', outcome.pension), part('mortgage', outcome.mortgage), part('isa', outcome.isa)].join(' · ')
}

export default function NextPoundPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const config = configFor(state.taxYear)
  const invalid = state.invalid.length > 0
  const { outcome, stale } = useOutcome(invalid ? null : inputs, config)
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)
  const shown = invalid ? null : outcome
  const ok = shown?.kind === 'ok' ? shown : null
  const label = `In ${inputs.horizonYears} year${inputs.horizonYears === 1 ? '' : 's'}, mid rate: today’s money (nominal)`
  const value = ok && !stale ? stickyValue(ok, gbp) : null
  const emptyText = invalid
    ? 'Fix the highlighted inputs'
    : shown === null || stale
      ? 'Working out…'
      : shown.kind === 'needs'
        ? `Enter ${shown.refusal.problems.map((p) => p.label.toLowerCase()).join(', ')}`
        : 'No result for these inputs'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {nextPoundCalculator.name}
        </h1>
        <p className="text-text-muted">{nextPoundCalculator.summary}</p>
        <div className="hidden md:flex">
          <VerifiedBadge config={config} />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={emptyText}
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <div className="flex">
            <VerifiedBadge config={config} />
          </div>
        }
        results={<Results outcome={shown} stale={stale} invalid={invalid} inputs={inputs} gbp={gbp} />}
      >
        <ScenarioBar calculator={nextPoundCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Inputs key={state.revision} taxYear={state.taxYear} inputs={inputs} invalidFields={state.invalid} gbp={gbp} />
      </StickyResult>

      <AssumptionsPanel items={[...(ok ? ok.result.assumptions : []), ...PAGE_ASSUMPTIONS]}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

/* Inputs. */

const set = (patch: Partial<NextPoundPageInputs>) => session.setInputs(patch)
const setPay = (patch: Partial<OptimiserPageInputs>) => set({ pay: { ...session.get().inputs.pay, ...patch } })
const setMortgage = (patch: Partial<MortgagePageInputs>) => set({ mortgage: { ...session.get().inputs.mortgage, ...patch } })
const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
const forget = (...fields: string[]) => {
  for (const field of fields) session.setFieldValid(field, true)
}

/** Today's date from the device clock (the page may read it; the composer never does). */
function today() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return isIsoDate(date) ? date : null
}

/** The take-home page's inputs this visit, when they differ from a fresh start: what "Copy" would bring in. */
function useTakeHomeInputs(): OptimiserPageInputs | null {
  const other = useStore(takeHome)
  const fresh = optimiserCalculator.applySettings!(optimiserCalculator.defaultInputs(), settingsStore.get())
  return canonicalJson(other.inputs) === canonicalJson(fresh) ? null : other.inputs
}

function Inputs({
  taxYear,
  inputs,
  invalidFields,
  gbp,
}: {
  taxYear: string
  inputs: NextPoundPageInputs
  invalidFields: readonly string[]
  gbp: Gbp
}) {
  const ids: SectionId[] = ['pension', 'atHorizon', 'allowance', 'otherPay', 'mortgage', 'growth', 'isa']
  const [openOnMount] = useState(() => new Set(ids.filter((id) => sectionSet(id, inputs))))
  const fromTakeHome = useTakeHomeInputs()
  const p = inputs.pay
  const section = (id: SectionId, children: ReactNode) => (
    <Section
      id={`np-section-${id}`}
      title={SECTION_TITLES[id]}
      summary={sectionSummary(id, inputs, invalidFields)}
      defaultOpen={openOnMount.has(id)}
    >
      {children}
    </Section>
  )
  const rate = (id: string, field: 'growthLow' | 'growthMid' | 'growthHigh' | 'feeRate' | 'inflationRate', hint?: string) => (
    <PercentInput
      id={id}
      label={FIELD_LABELS[field]}
      hint={hint}
      value={inputs[field]}
      min={RATE_LIMITS[field].min}
      max={RATE_LIMITS[field].max}
      maxDecimals={RATE_LIMITS[field].maxDecimals}
      onChange={(value) => set({ [field]: value })}
      onValidityChange={valid(field)}
    />
  )
  const payAmount = (id: string, field: 'salary' | 'bonus', hint: string) => (
    <CurrencyInput
      id={id}
      label={MONEY_LABELS[field]}
      hint={hint}
      value={p[field]}
      min={ZERO}
      max={INPUT_LIMITS.maxAmount}
      onChange={(value) => setPay({ [field]: value })}
      onValidityChange={valid(`pay.${field}`)}
    />
  )

  return (
    <>
      <section
        aria-labelledby="np-essentials"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="np-essentials" className="text-base font-semibold">
          The lump sum and you
        </h2>
        <CurrencyInput
          id="np-lump-sum"
          label={FIELD_LABELS.lumpSum}
          hint={HINTS.lumpSum}
          value={inputs.lumpSum}
          emptyValue={ZERO}
          placeholder="0"
          min={AMOUNT_LIMITS.min}
          max={AMOUNT_LIMITS.max}
          onChange={(lumpSum) => set({ lumpSum })}
          onValidityChange={valid('lumpSum')}
        />
        <NumberInput
          id="np-horizon"
          label={FIELD_LABELS.horizonYears}
          hint={HINTS.horizonYears}
          value={inputs.horizonYears}
          min={YEAR_LIMITS.min}
          max={YEAR_LIMITS.max}
          suffix="years"
          onChange={(horizonYears) => set({ horizonYears })}
          onValidityChange={valid('horizonYears')}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <DateInput
            id="np-as-of"
            label={FIELD_LABELS.asOf}
            hint={HINTS.asOf}
            value={inputs.asOf}
            allowEmpty
            onChange={(asOf) => set({ asOf })}
            onValidityChange={valid('asOf')}
          />
          {inputs.asOf && <p className="text-xs text-text-muted">{dateInWords(inputs.asOf)}</p>}
          <Button
            variant="ghost"
            className="h-auto min-h-touch self-start border border-border py-2"
            onClick={() => {
              forget('asOf')
              set({ asOf: today() })
            }}
          >
            Use today’s date
          </Button>
        </div>
        <NumberInput
          id="np-age"
          label={FIELD_LABELS.ageNow}
          hint={HINTS.ageNow}
          value={inputs.ageNow}
          allowEmpty
          min={AGE_LIMITS.min}
          max={AGE_LIMITS.max}
          suffix="years"
          onChange={(ageNow) => set({ ageNow })}
          onValidityChange={valid('ageNow')}
        />
      </section>

      <section
        aria-labelledby="np-your-pay"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="np-your-pay" className="text-base font-semibold">
          Your pay
        </h2>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm text-text-muted">
            {fromTakeHome
              ? 'You have entered pay on the take-home page this visit. Copy it here to start from the same pay, pension and benefits.'
              : 'The same inputs as the take-home page. Enter pay there first to copy it here, or enter it below.'}
          </p>
          <Button
            variant="ghost"
            disabled={!fromTakeHome}
            className="h-auto min-h-touch self-start border border-border py-2"
            onClick={() => {
              if (!fromTakeHome) return
              forget(...session.get().invalid.filter((f) => f.startsWith('pay.')))
              set({ pay: fromTakeHome })
              session.setTaxYear(takeHome.get().taxYear)
            }}
          >
            Copy from the take-home page
          </Button>
        </div>
        {payAmount('np-salary', 'salary', 'Your annual salary before tax. Include any flexible-benefit cash.')}
        {payAmount('np-bonus', 'bonus', 'Any bonus for the year, added to salary.')}
        <Segmented
          id="np-region"
          label="Where you live"
          value={p.region}
          options={REGION_OPTIONS}
          onChange={(region) => setPay({ region })}
        />
        <Select id="np-tax-year" label="Tax year" value={taxYear} options={TAX_YEARS} onChange={(year) => session.setTaxYear(year)} />
      </section>

      {section(
        'pension',
        <>
          <Select
            id="np-method"
            label="Pension method"
            hint={HINTS.method[p.pensionMethod]}
            value={p.pensionMethod}
            options={METHOD_OPTIONS}
            onChange={(pensionMethod) => setPay({ pensionMethod })}
          />
          <ContributionInputs id="np-employee" field="employeeContribution" pay={p} gbp={gbp} />
          <ContributionInputs id="np-employer" field="employerContribution" pay={p} gbp={gbp} />
          {usesPensionablePay(p) && <PensionablePayInputs pay={p} gbp={gbp} />}
        </>,
      )}
      {section(
        'atHorizon',
        <>
          <CurrencyInput
            id="np-employer-match"
            label={FIELD_LABELS.employerMatch}
            hint={HINTS.employerMatch}
            value={inputs.employerMatch}
            emptyValue={ZERO}
            placeholder="0"
            min={AMOUNT_LIMITS.min}
            max={AMOUNT_LIMITS.max}
            onChange={(employerMatch) => set({ employerMatch })}
            onValidityChange={valid('employerMatch')}
          />
          <NumberInput
            id="np-scheme-age"
            label={`${FIELD_LABELS.schemeAccessAge} (optional)`}
            hint={HINTS.schemeAccessAge}
            value={inputs.schemeAccessAge}
            allowEmpty
            min={AGE_LIMITS.min}
            max={AGE_LIMITS.max}
            suffix="years"
            onChange={(schemeAccessAge) => set({ schemeAccessAge })}
            onValidityChange={valid('schemeAccessAge')}
          />
          <PercentInput
            id="np-retirement-rate"
            label={`${FIELD_LABELS.retirementTaxRate} (optional)`}
            hint={HINTS.retirementTaxRate}
            value={inputs.retirementTaxRate}
            allowEmpty
            min={RATE_LIMITS.retirementTaxRate.min}
            max={RATE_LIMITS.retirementTaxRate.max}
            maxDecimals={RATE_LIMITS.retirementTaxRate.maxDecimals}
            onChange={(retirementTaxRate) => set({ retirementTaxRate })}
            onValidityChange={valid('retirementTaxRate')}
          />
          <Toggle
            id="np-other-pensions"
            label="My other pensions will use my lump sum allowance"
            hint={HINTS.otherPensionsUseAllowance}
            checked={inputs.otherPensionsUseAllowance}
            onChange={(otherPensionsUseAllowance) => set({ otherPensionsUseAllowance })}
          />
        </>,
      )}
      {section('allowance', <AllowanceInputs taxYear={taxYear} pay={p} />)}
      {section('otherPay', <OtherPayInputs pay={p} />)}
      {section('mortgage', <MortgageInputs mortgage={inputs.mortgage} />)}
      {section(
        'growth',
        <>
          <p className="text-sm text-text-muted">{HINTS.growth}</p>
          {rate('np-growth-low', 'growthLow')}
          {rate('np-growth-mid', 'growthMid')}
          {rate('np-growth-high', 'growthHigh')}
          {rate('np-fee', 'feeRate', HINTS.feeRate)}
          {rate('np-inflation', 'inflationRate', HINTS.inflationRate)}
        </>,
      )}
      {section(
        'isa',
        <CurrencyInput
          id="np-isa-paid"
          label={FIELD_LABELS.isaPaidThisYear}
          hint={HINTS.isaPaidThisYear}
          value={inputs.isaPaidThisYear}
          emptyValue={ZERO}
          placeholder="0"
          min={AMOUNT_LIMITS.min}
          max={AMOUNT_LIMITS.max}
          onChange={(isaPaidThisYear) => set({ isaPaidThisYear })}
          onValidityChange={valid('isaPaidThisYear')}
        />,
      )}
    </>
  )
}

/** One pension contribution as the take-home page takes it: how it is entered, the box, and what a percentage comes to. */
function ContributionInputs({ id, field, pay, gbp }: { id: string; field: ContributionField; pay: OptimiserPageInputs; gbp: Gbp }) {
  const entry = pay[field]
  const update = (patch: Partial<OptimiserPageInputs[ContributionField]>) => setPay({ [field]: { ...entry, ...patch } })
  const resolved = resolveInputs(pay)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Segmented
        id={`${id}-mode`}
        label={`${MONEY_LABELS[field]}: enter as`}
        value={entry.mode}
        options={MODE_OPTIONS}
        onChange={(mode) => {
          forget(mode === 'amount' ? `pay.${field}-pct` : `pay.${field}`)
          if (!usesPensionablePay({ ...pay, [field]: { ...entry, mode } })) forget('pay.pensionablePay')
          update({ mode })
        }}
      />
      {entry.mode === 'amount' ? (
        <CurrencyInput
          id={id}
          label={MONEY_LABELS[field]}
          hint={HINTS[field]}
          value={entry.amount}
          min={ZERO}
          max={INPUT_LIMITS.maxAmount}
          onChange={(amount) => update({ amount })}
          onValidityChange={valid(`pay.${field}`)}
        />
      ) : (
        <>
          <PercentInput
            id={`${id}-pct`}
            label={`${MONEY_LABELS[field]} (percentage of pensionable pay)`}
            hint={HINTS[field]}
            value={entry.percentOfPay}
            min={PERCENT_MIN}
            max={INPUT_LIMITS.maxPercent}
            onChange={(percentOfPay) => update({ percentOfPay })}
            onValidityChange={valid(`pay.${field}-pct`)}
          />
          <p className="text-sm text-text">
            Comes to <span className="font-semibold tabular-nums">{gbp(resolved[field])}</span> for the year.
          </p>
        </>
      )}
    </div>
  )
}

function PensionablePayInputs({ pay, gbp }: { pay: OptimiserPageInputs; gbp: Gbp }) {
  const entry = pay.pensionablePay
  const update = (patch: Partial<OptimiserPageInputs['pensionablePay']>) => setPay({ pensionablePay: { ...entry, ...patch } })
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-text">Pensionable pay</legend>
      <Toggle
        id="np-pensionable-own"
        label="Enter my own pensionable pay"
        hint="Off: your salary. Your scheme may use a different figure."
        checked={entry.own}
        onChange={(own) => {
          if (!own) forget('pay.pensionablePay')
          update({ own })
        }}
      />
      {entry.own && (
        <CurrencyInput
          id="np-pensionable"
          label="Pensionable pay for the year"
          value={entry.amount}
          min={ZERO}
          max={INPUT_LIMITS.maxAmount}
          onChange={(amount) => update({ amount })}
          onValidityChange={valid('pay.pensionablePay')}
        />
      )}
      <Toggle
        id="np-pensionable-bonus"
        label="Include the bonus"
        checked={entry.includeBonus}
        onChange={(includeBonus) => update({ includeBonus })}
      />
      <p className="text-sm text-text">
        Percentages apply to <span className="font-semibold tabular-nums">{gbp(resolveInputs(pay).pensionablePay)}</span> a year.
      </p>
    </fieldset>
  )
}

function AllowanceInputs({ taxYear, pay }: { taxYear: string; pay: OptimiserPageInputs }) {
  const lookBack = carryForwardYears(configFor(taxYear))
  const years = [...new Set([...Array.from({ length: lookBack ?? 0 }, (_, i) => i + 1), ...pay.carryForward.map((y) => y.yearsAgo)])].sort(
    (a, b) => a - b,
  )
  const amountFor = (yearsAgo: number) => pay.carryForward.find((y) => y.yearsAgo === yearsAgo)?.amount ?? ZERO
  const setYear = (yearsAgo: number, amount: Money) =>
    setPay({
      carryForward: years.flatMap((year) => {
        const value = year === yearsAgo ? amount : amountFor(year)
        return compare(value, ZERO) > 0 ? [{ yearsAgo: year, amount: value }] : []
      }),
    })
  return (
    <>
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="pb-1.5 text-sm font-medium text-text">Unused annual allowance (carry forward)</legend>
        <p className="text-sm text-text-muted">
          From your pension statements or provider: allowance an earlier year’s pension savings did not use. Taken as entered, not checked.
          Leave a year at nothing if there is none.
        </p>
        {lookBack === null && (
          <p className="text-sm text-text-muted">The carry forward period for this tax year is not verified yet, so no years are listed.</p>
        )}
        {years.map((yearsAgo) => (
          <CurrencyInput
            key={yearsAgo}
            id={`np-carry-${yearsAgo}`}
            label={`Unused allowance from ${yearsAgoLabel(yearsAgo)}`}
            value={amountFor(yearsAgo)}
            min={ZERO}
            max={INPUT_LIMITS.maxAmount}
            onChange={(amount) => setYear(yearsAgo, amount)}
            onValidityChange={valid(`pay.carryForward-${yearsAgo}`)}
          />
        ))}
      </fieldset>
      <Toggle
        id="np-mpaa"
        label="The money purchase annual allowance applies to me"
        hint="If you have taken money from a defined contribution pension flexibly in an earlier tax year. Carry forward can’t be added to it."
        checked={pay.moneyPurchaseAnnualAllowance}
        onChange={(moneyPurchaseAnnualAllowance) => setPay({ moneyPurchaseAnnualAllowance })}
      />
    </>
  )
}

function OtherPayInputs({ pay }: { pay: OptimiserPageInputs }) {
  const togglePlan = (plan: (typeof STUDENT_LOAN_PLANS)[number], on: boolean) =>
    setPay({ studentLoans: STUDENT_LOAN_PLANS.filter((x) => (x === plan ? on : pay.studentLoans.includes(x))) })
  const copied = [...pay.taxableBenefits.map((i) => i.name || 'A benefit'), ...pay.postTaxDeductions.map((i) => i.name || 'A deduction')]
  return (
    <>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="pb-1.5 text-sm font-medium text-text">Student loan plans you repay</legend>
        {STUDENT_LOAN_PLANS.map((plan) => (
          <Toggle
            key={plan}
            id={`np-loan-${plan}`}
            label={PLAN_LABELS[plan]}
            checked={pay.studentLoans.includes(plan)}
            onChange={(on) => togglePlan(plan, on)}
          />
        ))}
      </fieldset>
      <NumberInput
        id="np-children"
        label="Children you get Child Benefit for"
        value={pay.children}
        min={0}
        max={INPUT_LIMITS.maxChildren}
        onChange={(children) => setPay({ children })}
        onValidityChange={valid('pay.children')}
      />
      {pay.children > 0 && (
        <Segmented
          id="np-child-benefit"
          label="Child Benefit payments"
          hint={pay.childBenefit === 'optedOut' ? PAYMENT_LABELS.optedOut : 'Paid to you; a charge applies on higher incomes.'}
          value={pay.childBenefit}
          options={PAYMENT_OPTIONS}
          onChange={(childBenefit) => setPay({ childBenefit })}
        />
      )}
      {copied.length > 0 && (
        <div data-copied-items className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <p className="font-medium text-text">From the take-home page (edit them there)</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-text-muted [overflow-wrap:anywhere]">
            {copied.map((name, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a list shown, not edited here.
              <li key={index}>{name}</li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="h-auto min-h-touch self-start border border-border py-2"
            onClick={() => setPay({ taxableBenefits: [], postTaxDeductions: [] })}
          >
            Leave these out here
          </Button>
        </div>
      )}
    </>
  )
}

/** The mortgage page's inputs, as that page takes them, with no overpayments of their own. */
function MortgageInputs({ mortgage: m }: { mortgage: MortgagePageInputs }) {
  const rate = (id: string, field: 'fixedRate' | 'reversionRate' | 'ercRate' | 'allowanceRate', label: string, hint?: string) => (
    <PercentInput
      id={id}
      label={label}
      hint={hint}
      value={m[field]}
      allowEmpty
      min={MORTGAGE_RATE_LIMITS.min}
      max={MORTGAGE_RATE_LIMITS.max}
      maxDecimals={MORTGAGE_RATE_LIMITS.maxDecimals}
      onChange={(value) => setMortgage({ [field]: value })}
      onValidityChange={valid(`mortgage.${field}`)}
    />
  )
  const date = (id: string, field: 'startDate' | 'fixedEndDate' | 'ercEndDate', label: string, hint: string) => (
    <div className="flex flex-col gap-1">
      <DateInput
        id={id}
        label={label}
        hint={hint}
        value={m[field]}
        allowEmpty
        onChange={(value) => setMortgage({ [field]: value })}
        onValidityChange={valid(`mortgage.${field}`)}
      />
      {m[field] && <p className="text-xs text-text-muted">{dateInWords(m[field])}</p>}
    </div>
  )
  const amount = (id: string, field: 'allowanceAmount' | 'allowanceUsed', label: string, hint: string) =>
    field === 'allowanceAmount' ? (
      <CurrencyInput
        id={id}
        label={label}
        hint={hint}
        value={m.allowanceAmount}
        allowEmpty
        min={MORTGAGE_AMOUNT_LIMITS.min}
        max={MORTGAGE_AMOUNT_LIMITS.max}
        onChange={(allowanceAmount) => setMortgage({ allowanceAmount })}
        onValidityChange={valid('mortgage.allowanceAmount')}
      />
    ) : (
      <CurrencyInput
        id={id}
        label={label}
        hint={hint}
        value={m.allowanceUsed}
        emptyValue={ZERO}
        placeholder="0"
        min={MORTGAGE_AMOUNT_LIMITS.min}
        max={MORTGAGE_AMOUNT_LIMITS.max}
        onChange={(allowanceUsed) => setMortgage({ allowanceUsed })}
        onValidityChange={valid('mortgage.allowanceUsed')}
      />
    )
  return (
    <>
      <p className="text-sm text-text-muted">
        Optional. Leave it empty for no mortgage column. The lump sum is overpaid with the first payment after the start date; the payment
        stays the same and the term shortens.
      </p>
      {date('np-mo-start', 'startDate', MORTGAGE_LABELS.startDate, 'The day the balance below is owed, such as your last statement date.')}
      <CurrencyInput
        id="np-mo-balance"
        label={MORTGAGE_LABELS.balance}
        value={m.balance}
        allowEmpty
        min={BALANCE_LIMITS.min}
        max={BALANCE_LIMITS.max}
        onChange={(balance) => setMortgage({ balance })}
        onValidityChange={valid('mortgage.balance')}
      />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-sm font-medium text-text">Term left</legend>
        <p className="text-xs text-text-muted">Your contractual term left, from your statement or offer.</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            id="np-mo-years"
            label={MORTGAGE_LABELS.termYears}
            value={m.termYears}
            allowEmpty
            min={MORTGAGE_YEAR_LIMITS.min}
            max={MORTGAGE_YEAR_LIMITS.max}
            suffix="years"
            onChange={(termYears) => setMortgage({ termYears })}
            onValidityChange={valid('mortgage.termYears')}
          />
          <NumberInput
            id="np-mo-months"
            label={MORTGAGE_LABELS.termExtraMonths}
            value={m.termExtraMonths}
            emptyValue={0}
            placeholder="0"
            min={EXTRA_MONTH_LIMITS.min}
            max={EXTRA_MONTH_LIMITS.max}
            suffix="months"
            onChange={(termExtraMonths) => setMortgage({ termExtraMonths })}
            onValidityChange={valid('mortgage.termExtraMonths')}
          />
        </div>
      </fieldset>
      <Segmented
        id="np-mo-repayment"
        label={MORTGAGE_LABELS.repaymentType}
        value={m.repaymentType}
        options={REPAYMENT_OPTIONS}
        onChange={(repaymentType) => setMortgage({ repaymentType })}
      />
      <Toggle
        id="np-mo-fixed"
        label="On a fixed rate now?"
        hint="Off if you are on a variable rate now: the rate below then applies from the start."
        checked={m.fixed}
        onChange={(fixed) => {
          if (!fixed) forget('mortgage.fixedRate', 'mortgage.fixedEndDate')
          setMortgage({ fixed })
        }}
      />
      {m.fixed && rate('np-mo-fixed-rate', 'fixedRate', MORTGAGE_LABELS.fixedRate, 'The rate you pay now.')}
      {m.fixed &&
        date('np-mo-fixed-end', 'fixedEndDate', MORTGAGE_LABELS.fixedEndDate, 'Payments on or before this date are at the fixed rate.')}
      {rate(
        'np-mo-reversion',
        'reversionRate',
        m.fixed ? MORTGAGE_LABELS.reversionRate : 'Your interest rate',
        m.fixed
          ? 'A guess: the rate you expect after the fixed rate, to the end of the term.'
          : 'The rate you pay now, assumed to the end of the term.',
      )}
      <Toggle
        id="np-mo-erc"
        label="Does an early repayment charge apply?"
        hint="From your offer documents. Usually while a fixed rate lasts."
        checked={m.erc}
        onChange={(erc) => {
          if (!erc)
            forget(
              'mortgage.ercRate',
              'mortgage.ercEndDate',
              'mortgage.allowanceRate',
              'mortgage.allowanceAmount',
              'mortgage.allowanceUsed',
              'mortgage.paymentsToReset',
            )
          setMortgage({ erc })
        }}
      />
      {m.erc && (
        <>
          {rate('np-mo-erc-rate', 'ercRate', MORTGAGE_LABELS.ercRate, 'A percentage of what you overpay above the penalty-free limit.')}
          {date(
            'np-mo-erc-end',
            'ercEndDate',
            MORTGAGE_LABELS.ercEndDate,
            'The last date an overpayment can be charged. Empty: when the fixed rate ends.',
          )}
          <Segmented
            id="np-mo-allowance-kind"
            label={MORTGAGE_LABELS.allowanceKind}
            value={m.allowanceKind}
            options={ALLOWANCE_OPTIONS}
            onChange={(allowanceKind) => {
              forget('mortgage.allowanceRate', 'mortgage.allowanceAmount')
              setMortgage({ allowanceKind })
            }}
          />
          {m.allowanceKind === 'rate'
            ? rate(
                'np-mo-allowance-rate',
                'allowanceRate',
                'Penalty-free limit a year',
                'A share of the balance at the start of each allowance year.',
              )
            : amount(
                'np-mo-allowance-amount',
                'allowanceAmount',
                'Penalty-free limit a year',
                'What you can overpay each year without a charge.',
              )}
          {amount(
            'np-mo-allowance-used',
            'allowanceUsed',
            MORTGAGE_LABELS.allowanceUsed,
            'Already overpaid in the allowance year running now.',
          )}
          <NumberInput
            id="np-mo-reset"
            label={MORTGAGE_LABELS.paymentsToReset}
            hint="Payments left before your allowance year starts again. Nothing for a fresh year from the first payment."
            value={m.paymentsToReset}
            emptyValue={0}
            placeholder="0"
            min={RESET_LIMITS.min}
            max={RESET_LIMITS.max}
            suffix="payments"
            onChange={(paymentsToReset) => setMortgage({ paymentsToReset })}
            onValidityChange={valid('mortgage.paymentsToReset')}
          />
        </>
      )}
      <Segmented
        id="np-mo-method"
        label={MORTGAGE_LABELS.interestMethod}
        value={m.interestMethod}
        options={INTEREST_OPTIONS}
        onChange={(interestMethod) => setMortgage({ interestMethod })}
      />
      {m.interestMethod === 'daily' && (
        <Select
          id="np-mo-day-count"
          label={MORTGAGE_LABELS.dayCount}
          value={m.dayCount}
          options={DAY_COUNT_OPTIONS}
          onChange={(dayCount) => setMortgage({ dayCount })}
        />
      )}
      <Button
        variant="ghost"
        className="h-auto min-h-touch self-start border border-border py-2"
        onClick={() => {
          forget(...session.get().invalid.filter((f) => f.startsWith('mortgage.')))
          set({ mortgage: { ...mortgageCalculator.defaultInputs() } })
        }}
      >
        Clear the mortgage
      </Button>
    </>
  )
}

/* Results. */

function Results({
  outcome,
  stale,
  invalid,
  inputs,
  gbp,
}: {
  outcome: PageOutcome | null
  stale: boolean
  invalid: boolean
  inputs: NextPoundPageInputs
  gbp: Gbp
}) {
  if (invalid)
    return (
      <InlineNotice tone="warning" title="No results until the inputs are fixed">
        <p>Fix the highlighted inputs to see results.</p>
      </InlineNotice>
    )
  if (outcome === null)
    return (
      <p role="status" className="text-sm text-text-muted">
        Working out the three columns…
      </p>
    )
  if (outcome.kind === 'unverified') return <RefusalNotice refusal={outcome.refusal} />
  if (outcome.kind !== 'ok') return <RefusalNotice refusal={outcome.refusal} />
  const years = `${outcome.result.horizonYears} year${outcome.result.horizonYears === 1 ? '' : 's'}`
  return (
    <div data-np-results aria-busy={stale} className="flex flex-col gap-4">
      <p role="status" className="text-sm text-text-muted">
        {stale ? 'Updating for your changes…' : ''}
      </p>
      <p className="text-sm text-text">
        What putting {gbp(outcome.result.lumpSum)} of take-home pay in each place adds to your net worth in {years}, after tax on
        withdrawal: today’s money first, nominal beside it. A comparison under the assumptions below, not advice; no column is ranked.
      </p>
      <PensionCard leg={outcome.pension} gbp={gbp} />
      <MortgageCard leg={outcome.mortgage} startDate={inputs.mortgage.startDate} gbp={gbp} />
      <IsaCard leg={outcome.isa} gbp={gbp} />
      <BreakEvenCard outcome={outcome} />
      <Warnings warnings={outcome.warnings} gbp={gbp} />
      <ComparisonChart outcome={outcome} gbp={gbp} />
    </div>
  )
}

/** What a leg with no number shows: what it needs, its refusal, not set up, or nothing. */
function LegState({ leg, name }: { leg: Exclude<LegView<unknown>, { kind: 'shown' }>; name: string }) {
  switch (leg.kind) {
    case 'needs':
    case 'refused':
      return <RefusalNotice refusal={leg.refusal} heading="h3" />
    case 'none':
      return (
        <p data-leg-state="none" className="text-sm text-text-muted">
          {NOT_SET_UP}: enter a mortgage in the Mortgage section to compare an overpayment.
        </p>
      )
    case 'nothing':
      return (
        <p data-leg-state="nothing" className="text-sm text-text-muted">
          Nothing: the lump sum is nothing, so the {name.toLowerCase()} adds nothing.
        </p>
      )
  }
}

const ratesRows = (
  rates: {
    readonly [K in (typeof GROWTH_CASES)[number]]: {
      readonly growthRate: { numerator: number; denominator: number }
      readonly value: { todaysMoney: Money; nominal: Money }
    }
  },
  gbp: Gbp,
) =>
  GROWTH_CASES.map((c) => (
    <StatRow
      key={c}
      label={`${CASE_LABELS[c]} (${formatPercent(rates[c].growthRate)} a year)`}
      value={gbp(rates[c].value.todaysMoney)}
      detail={`${gbp(rates[c].value.nominal)} nominal`}
      marker={`np-${c}`}
    />
  ))

function PensionCard({ leg, gbp }: { leg: LegView<PensionShown>; gbp: Gbp }) {
  const name = LEG_NAMES.pension
  if (leg.kind !== 'shown')
    return <ResultCard title={name} data-leg="pension" data-leg-kind={leg.kind} footer={<LegState leg={leg} name={name} />} />
  const l = leg.leg
  const c = l.contribution
  const access = l.access
  const contributionRows = (
    <>
      <StatRow
        label="Extra contribution bought"
        value={gbp(c.extra)}
        detail={compare(c.employerMatch, ZERO) > 0 ? `Your employer adds ${gbp(c.employerMatch)}` : undefined}
        marker="np-extra"
      />
      <StatRow label="Into the pension" value={gbp(c.pensionAdded)} />
      <StatRow label="Cost in take-home" value={gbp(c.cost)} />
      <StatRow label="Held as cash in this column" value={gbp(c.leftoverCash)} marker="np-pension-cash" />
      {access && (
        <StatRow
          label="Access"
          value={`From age ${access.accessAge}`}
          detail={`You would be ${access.ageAtHorizon} on ${formatIsoDate(access.horizonDate)}`}
        />
      )}
    </>
  )
  if (l.status === 'not-accessible')
    return (
      <ResultCard
        title={name}
        headline={NOT_ACCESSIBLE}
        data-leg="pension"
        data-leg-kind="not-accessible"
        footer={<p className="text-xs text-text-muted">No value and no break-even: the pension can’t be taken by the horizon.</p>}
      >
        {contributionRows}
      </ResultCard>
    )
  const mid = l.rates.mid
  return (
    <ResultCard
      title={name}
      headline={gbp(mid.value.todaysMoney)}
      headlineLabel={`Mid rate, today’s money (${gbp(mid.value.nominal)} nominal)`}
      data-leg="pension"
      data-leg-kind="accessible"
      footer={
        <p className="text-xs text-text-muted">
          Assumes: grown at the ISA’s rates and fee; the tax-free part capped at the lump sum allowance available (
          {gbp(l.allowanceAvailable)}); the rest taxed at {formatPercent(l.retirementTaxRate)} (
          {l.retirementTaxRateFrom === 'config' ? 'this tax year’s Basic rate band' : 'as entered'}); not guaranteed.
        </p>
      }
    >
      {ratesRows(l.rates, gbp)}
      {contributionRows}
      <StatRow label="Tax-free part (mid)" value={gbp(mid.taxFree)} detail="Nominal" />
      <StatRow label="Tax on the rest (mid)" value={gbp(mid.tax)} detail="Nominal" />
    </ResultCard>
  )
}

function MortgageCard({ leg, startDate, gbp }: { leg: LegView<MortgageShown>; startDate: MortgagePageInputs['startDate']; gbp: Gbp }) {
  const name = LEG_NAMES.mortgage
  if (leg.kind !== 'shown')
    return <ResultCard title={name} data-leg="mortgage" data-leg-kind={leg.kind} footer={<LegState leg={leg} name={name} />} />
  const l = leg.leg
  return (
    <ResultCard
      title={name}
      headline={gbp(l.value.todaysMoney)}
      headlineLabel={`${GUARANTEED}: today’s money (${gbp(l.value.nominal)} nominal)`}
      data-leg="mortgage"
      data-leg-kind="shown"
      data-guaranteed=""
      footer={
        <p className="text-xs text-text-muted">
          Assumes: overpaid with the first payment, the payment kept and the term shortened; any charge paid in cash; payments no longer
          needed counted at face value. Guaranteed by the mortgage’s rates; the rate after a fixed rate is your guess.
        </p>
      }
    >
      <StatRow label="Overpayment" value={gbp(l.overpaymentUsed)} marker="np-overpayment" />
      <StatRow label="Early repayment charge paid" value={gbp(l.erc)} marker="np-erc" />
      <StatRow label="Held as cash in this column" value={gbp(l.leftoverCash)} marker="np-mortgage-cash" />
      <StatRow
        label="Balance lower by"
        value={gbp(subtract(l.baselineBalance, l.overpayingBalance))}
        detail={startDate ? `On ${formatIsoDate(addMonths(startDate, l.horizonMonth))}` : undefined}
      />
      <StatRow label="Payments no longer needed" value={gbp(l.paymentsFreed)} detail="To the horizon, at face value" />
    </ResultCard>
  )
}

function IsaCard({ leg, gbp }: { leg: LegView<IsaShown>; gbp: Gbp }) {
  const name = LEG_NAMES.isa
  if (leg.kind !== 'shown')
    return <ResultCard title={name} data-leg="isa" data-leg-kind={leg.kind} footer={<LegState leg={leg} name={name} />} />
  const l = leg.leg
  return (
    <ResultCard
      title={name}
      headline={gbp(l.rates.mid.value.todaysMoney)}
      headlineLabel={`Mid rate, today’s money (${gbp(l.rates.mid.value.nominal)} nominal)`}
      data-leg="isa"
      data-leg-kind="shown"
      footer={
        <p className="text-xs text-text-muted">
          Assumes: invested, the fee taken each year, growth and withdrawals free of tax; not guaranteed.
        </p>
      }
    >
      {ratesRows(l.rates, gbp)}
    </ResultCard>
  )
}

function BreakEvenCard({ outcome }: { outcome: Extract<PageOutcome, { kind: 'ok' }> }) {
  const line = (against: 'mortgage' | 'pension') => {
    const b = outcome.breakEven[against]
    return b === null ? noBreakEvenWords(against, outcome) : breakEvenWords(against, b)
  }
  return (
    <ResultCard
      title="Break-even ISA return"
      data-break-even=""
      footer={
        <div className="flex flex-col gap-2">
          <p data-break-even-mortgage className="text-sm text-text">
            {line('mortgage')}
          </p>
          <p data-break-even-pension className="text-sm text-text">
            {line('pension')}
          </p>
        </div>
      }
    />
  )
}

function Warnings({ warnings, gbp }: { warnings: Extract<PageOutcome, { kind: 'ok' }>['warnings']; gbp: Gbp }) {
  const legs = (Object.keys(LEG_NAMES) as LegId[]).filter((id) => warnings[id].length > 0)
  if (legs.length === 0) return null
  return (
    <section
      aria-labelledby="np-warnings"
      data-warnings
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <h2 id="np-warnings" className="text-base font-semibold">
        Warnings
      </h2>
      {legs.map((id) => (
        <div key={id} data-warnings-leg={id} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{LEG_NAMES[id]}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
            {warnings[id].map((w, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the composer's list, in its order.
              <li key={index}>{warningText(w, gbp)}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** Short names that fit under a bar on a phone; the cards and table carry the full ones. */
const CHART_NAMES: Record<LegId, string> = { pension: 'Pension', mortgage: 'Mortgage', isa: 'ISA' }

/** One bar a leg at the mid rate, in today's money, with a table (the shared Chart; no new style). */
function ComparisonChart({ outcome, gbp }: { outcome: Extract<PageOutcome, { kind: 'ok' }>; gbp: Gbp }) {
  const legs: [LegId, LegView<PensionShown | MortgageShown | IsaShown>][] = [
    ['pension', outcome.pension],
    ['mortgage', outcome.mortgage],
    ['isa', outcome.isa],
  ]
  const values = legs.map(([, leg]) => midValue(leg))
  if (values.every((v) => v === null)) return null
  const note = (leg: LegView<PensionShown | MortgageShown | IsaShown>) =>
    leg.kind === 'shown' && leg.leg.status === 'not-accessible' ? NOT_ACCESSIBLE : leg.kind === 'none' ? NOT_SET_UP : 'No result'
  return (
    <section aria-labelledby="np-chart" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 id="np-chart" className="text-base font-semibold">
        The three columns compared
      </h2>
      <Chart
        title="What each column adds at the horizon, mid rate, today’s money"
        categories={legs.map(([id]) => CHART_NAMES[id])}
        series={[
          { id: 'mid', label: 'Mid rate, today’s money', kind: 'bar', values: values.map((v) => (v === null ? null : v.todaysMoney)) },
        ]}
        xLabel="Where the lump sum goes"
        yLabel="Today’s money"
        formatTick={(v) => formatGBPCompact(v as Money)}
        formatValue={(v) => gbp(v as Money)}
        integer
        columns={[{ label: 'Nominal', values: values.map((v, i) => (v === null ? note(legs[i]![1]) : gbp(v.nominal))), numeric: true }]}
      />
    </section>
  )
}
