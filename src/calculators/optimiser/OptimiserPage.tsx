import { Plus } from 'lucide-react'
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Chart } from '@/components/Chart/Chart'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { TextInput } from '@/components/inputs/TextInput'
import { TextValueInput } from '@/components/inputs/TextValueInput'
import { Toggle } from '@/components/inputs/Toggle'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { SplitBar } from '@/components/SplitBar'
import { StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import { formatGBP, formatGBPCompact, formatGBPDelta } from '@/lib/format'
import { add, compare, fromPence, type Money, ratio, subtract, toPence, ZERO } from '@/lib/money'
import type { Parsed } from '@/lib/parse'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { toasts } from '@/toast/toasts'
import { configFor, sessionFor } from '../session'
import { BREAKDOWN_PERIODS, type Breakdown, type BreakdownPeriod, breakdown, perPeriod } from './breakdown'
import { benefitTaxable } from './calc'
import { CHART_VIEWS, type ChartView, CURVE_NOTE, MONTH_NOTE, optimiserChartData, viewLabel, X_LABELS } from './chartData'
import {
  type ContributionField,
  calculatePaye,
  calculateTakeHome,
  INPUT_LIMITS,
  type InputWarning,
  ITEM_NOUNS,
  inputWarnings,
  isInputProblem,
  itemLabel,
  type ListField,
  METHOD_LABELS,
  MODE_LABELS,
  MONEY_LABELS,
  type OptimiserPageInputs,
  optimiserCalculator,
  PAYMENT_LABELS,
  type PageResult,
  PERIOD_LABELS,
  PLAN_LABELS,
  REGION_LABELS,
  type ResolvedInputs,
  resolveInputs,
  usesPensionablePay,
} from './definition'
import { calculateOptimise, carryForwardYears, type OptimiserPageResult } from './optimiserInputs'
import { annualAmount, annualBenefit, type BenefitItem, CONTRIBUTION_MODES, ITEM_PERIODS, type ListItem } from './pageInputs'
import { parseTaxCode } from './paye'
import { changeVsNow, currentPoint, nearestPoint, pointsIn, zoomRange } from './reading'
import { payslipNet, splitSegments } from './results'
import { NEEDS_FIXING, SECTION_IDS, SECTION_TITLES, type SectionId, sectionForField, sectionSummary, sectionsSet } from './sections'
import {
  BENEFIT_PAYMENTS,
  CHILD_BENEFIT_PAYMENTS,
  DEFAULT_POLICY,
  type OptimiseResult,
  type PayeEstimate,
  PENSION_METHODS,
  REGIONS,
  STUDENT_LOAN_PLANS,
  type TakeHomeResult,
} from './types'

/*
 * The take-home page (slice 1b, session 1b-i; part 1b-i.1 added percentage
 * contributions and itemised lists; 0.11.0 benefits taken from pay, the tax
 * code and PAYE estimate, and the monthly breakdown; 0.12.0 the layout in
 * docs/ui-patterns.md) at #/c/optimiser: "Your pay" always visible, the other
 * inputs in sections with live summaries, and results first (StickyResult):
 * take-home for the chosen period, a split bar of where gross pay goes, the
 * breakdown by year or month, the PAYE card, warnings, assumptions and
 * scenarios, all from shared components and the engine's takeHome and
 * payeEstimate. Part 1b-ii-a adds the pension allowances section and,
 * below the split bar, the chart of candidate contributions from optimise()
 * (./optimiserInputs.ts, ./chartData.ts). No figure is written here.
 */

const session = sessionFor(optimiserCalculator)

const TAX_YEARS = listTaxYears().map((y) => ({ value: y.id as string, label: taxYearLabel(y.id) }))
const REGION_OPTIONS = REGIONS.map((value) => ({ value, label: value === 'rUK' ? 'England, Wales, NI' : REGION_LABELS[value] }))
const METHOD_OPTIONS = PENSION_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))
const PAYMENT_OPTIONS = CHILD_BENEFIT_PAYMENTS.map((value) => ({ value, label: value === 'claimed' ? 'Claimed' : 'Opted out' }))
const MODE_OPTIONS = CONTRIBUTION_MODES.map((value) => ({ value, label: value === 'amount' ? MODE_LABELS.amount : 'Percentage' }))
const PERIOD_OPTIONS = ITEM_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))
const PAYMENT_OPTIONS_BENEFIT = BENEFIT_PAYMENTS.map((value) => ({ value, label: value === 'beforeTax' ? 'Before tax' : 'After tax' }))
const BREAKDOWN_OPTIONS = BREAKDOWN_PERIODS.map((value) => ({ value, label: value === 'year' ? 'Year' : 'Month' }))
const VIEW_OPTIONS = CHART_VIEWS.map((value) => ({ value, label: value === 'spendable' ? 'Spendable' : 'Take-home' }))
const PERCENT_MIN = ratio(0, 1)

const METHOD_HINTS: Record<OptimiserPageInputs['pensionMethod'], string> = {
  salarySacrifice: 'Salary you give up for an employer contribution: less tax, National Insurance and student loan.',
  netPay: 'Taken from your pay before tax: less tax, but not less National Insurance.',
  reliefAtSource: 'Paid from your take-home pay; your provider adds basic rate relief. Enter what you pay.',
}

/** Assumptions the page adds to the engine's: what this page does and doesn't model. No figures except the policy's week count. */
const PAGE_ASSUMPTIONS = [
  `Child Benefit is counted for ${DEFAULT_POLICY.childBenefitWeeks} weeks of the year (the modelling policy), for every child entered.`,
  'Pension is counted as contributions only: what goes in this year. Growth and tax on withdrawals are not modelled; the annual allowance is checked only in the contribution chart.',
  'Taxable benefits in kind are taken as entered: they are not checked against your employer’s annual statement of benefits or your tax code.',
  'The year’s tax (the liability) is the headline figure, worked out on the year’s figures however it is collected. A tax code is optional: with one, a PAYE estimate shows what payroll would take, assuming level monthly pay all year.',
  'With a tax code, estimated payslip net pay is take-home with the PAYE estimate in place of the year’s income tax; everything else, including the Child Benefit charge, is as in take-home. Take-home after the year-end adjustment is the take-home figure itself.',
  'Tax codes modelled: a number and a letter (L, M, N or T), with S or C in front if you have one. K, BR, D, NT, emergency and no-allowance codes get a notice and no estimate.',
  'Benefits taken before tax (salary sacrifice) follow the general rule: the salary given up comes off your pay before tax, National Insurance and student loan, and the benefit is taxed on the higher of its value and the salary given up. Benefits that keep an exemption (such as cycle to work or pension contributions) are not modelled: enter pension contributions as pension.',
  'Benefits paid for after tax: what you pay comes off take-home and takes the benefit’s taxable value down, not below nothing.',
  'The monthly breakdown divides each yearly row by the months in a year, to the nearest penny; take-home per month is those rows added up, so it can differ by a penny or two from the year’s take-home divided evenly.',
  'Take-home leaves out costs the employer pays: Class 1A National Insurance on benefits, employer National Insurance and the employer’s pension contribution.',
  'Flexible-benefit cash is entered as salary.',
  'A contribution entered as a percentage is that share of pensionable pay (your salary, or your own figure, with the bonus only if you include it), rounded to the nearest penny. Your scheme may round differently.',
  'Benefits in kind and post-tax deductions are each added up from your items into one figure for the year.',
  'Monthly amounts are assumed level through the year.',
]

const LIST_IDS: Record<ListField, string> = { taxableBenefits: 'opt-benefits', postTaxDeductions: 'opt-deductions' }

const LIST_HINTS: Record<ListField, string> = {
  taxableBenefits:
    'Benefits from your job, such as medical cover: their value, and anything taken from your pay for them, before tax (salary sacrifice) or after tax. Add one item for each.',
  postTaxDeductions:
    'Amounts taken from your pay after tax with no tax effect, such as medical or dental cover you pay for. Add one item for each.',
}

const CONTRIBUTION_HINTS: Record<ContributionField, string> = {
  employeeContribution: 'What you put in by this method. Zero for none.',
  employerContribution: 'Your employer’s own contribution. It doesn’t change your take-home.',
}

/** What the contribution chart leaves out, beside optimise()'s own assumptions. */
const CHART_ASSUMPTIONS = [
  'Contribution chart, not modelled: defined benefit pension savings, income other than this job, relief claimed through Self Assessment, who pays an annual allowance charge (Scheme Pays), the value of childcare support, investment growth and tax on withdrawals.',
  'Contribution chart: each point changes only your own contribution, by the method chosen, from nothing up to the most the engine models; the sweep is in amounts, so a contribution entered as a percentage shows as its amount, with its share of pensionable pay beside the marked points.',
]

/** The engine lists the taper rounding with its results; without results the page says it. */
const TAPER_ASSUMPTION = 'Personal allowance taper: the reduction is worked out exactly, with nothing rounded until the result.'

const sameAmount = (a: Money, b: Money) => compare(a, b) === 0

const PERIOD_LABELS_HEADLINE: Record<BreakdownPeriod, string> = { year: 'Take-home for the year', month: 'Take-home a month' }

export default function OptimiserPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const config = configFor(state.taxYear)
  const invalid = state.invalid.length > 0
  const result = invalid ? null : calculateTakeHome(inputs, config)
  const resolved = resolveInputs(inputs)
  const warnings = invalid ? [] : inputWarnings(inputs)
  const [period, setPeriod] = useState<BreakdownPeriod>('year')
  const gbp = (amount: Money) => formatGBP(amount, amounts)
  const ok = result && !isInputProblem(result) && result.ok ? result : null
  const label = PERIOD_LABELS_HEADLINE[period]
  const value = ok ? gbp(breakdown(ok.annual, period).takeHome) : null
  // The sweep needs pay and a take-home result; it is the slowest part of the page, so only redone when inputs change.
  const hasPay = compare(add(inputs.salary, inputs.bonus), ZERO) > 0
  const sweep = useMemo(
    () => (!invalid && hasPay ? calculateOptimise(inputs, config, period) : null),
    [invalid, hasPay, inputs, config, period],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {optimiserCalculator.name}
        </h1>
        <p className="text-text-muted">{optimiserCalculator.summary}</p>
        {/* On a phone the badge is in the sticky bar instead. */}
        <div className="hidden md:flex">
          <VerifiedBadge config={config} />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={invalid ? 'Fix the highlighted inputs' : 'No result for these inputs'}
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <>
            <Segmented id="opt-period" label="Show take-home for a" value={period} options={BREAKDOWN_OPTIONS} onChange={setPeriod} />
            <div className="flex">
              <VerifiedBadge config={config} />
            </div>
          </>
        }
        results={
          <>
            <InputWarnings warnings={warnings} />
            <ResultsOrNotice
              result={result}
              sweep={sweep}
              inputs={inputs}
              resolved={resolved}
              gbp={gbp}
              period={period}
              setPeriod={setPeriod}
            />
          </>
        }
      >
        <ScenarioBar calculator={optimiserCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Inputs key={state.revision} taxYear={state.taxYear} inputs={inputs} resolved={resolved} invalidFields={state.invalid} gbp={gbp} />
      </StickyResult>

      <AssumptionsPanel
        items={[
          ...new Set([
            ...(result?.ok ? result.assumptions : [TAPER_ASSUMPTION]),
            ...payeAssumptions(inputs, result),
            ...PAGE_ASSUMPTIONS,
            ...(ok && sweep?.ok ? [...sweep.assumptions, ...CHART_ASSUMPTIONS] : []),
          ]),
        ]}
      >
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
const set = (patch: Partial<OptimiserPageInputs>) => session.setInputs(patch)

/**
 * The inputs: "Your pay" always visible, then a section each (U1 to U3), open on mount when its inputs differ from the
 * defaults. Remounted (by key) on a load or a fresh start, so the open sections follow the inputs; never stored.
 */
function Inputs({
  taxYear,
  inputs,
  resolved,
  invalidFields,
  gbp,
}: {
  taxYear: string
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  invalidFields: readonly string[]
  gbp: Gbp
}) {
  const [openOnMount] = useState(() => sectionsSet(inputs))
  const togglePlan = (plan: (typeof STUDENT_LOAN_PLANS)[number], on: boolean) =>
    set({ studentLoans: STUDENT_LOAN_PLANS.filter((p) => (p === plan ? on : inputs.studentLoans.includes(p))) })
  const amountInput = (id: string, field: 'salary' | 'bonus', hint?: string) => (
    <CurrencyInput
      id={id}
      label={MONEY_LABELS[field]}
      hint={hint}
      value={inputs[field]}
      min={ZERO}
      max={INPUT_LIMITS.maxAmount}
      onChange={(value) => set({ [field]: value })}
      onValidityChange={valid(field)}
    />
  )
  const section = (id: SectionId, children: ReactNode) => (
    <Section
      id={`opt-section-${id}`}
      title={SECTION_TITLES[id]}
      summary={invalidFields.some((f) => sectionForField(f) === id) ? NEEDS_FIXING : sectionSummary(id, inputs, resolved, gbp)}
      defaultOpen={openOnMount.has(id)}
    >
      {children}
    </Section>
  )
  const content: Record<SectionId, ReactNode> = {
    pension: (
      <>
        <Select
          id="opt-method"
          label="Pension method"
          hint={METHOD_HINTS[inputs.pensionMethod]}
          value={inputs.pensionMethod}
          options={METHOD_OPTIONS}
          onChange={(pensionMethod) => set({ pensionMethod })}
        />
        <ContributionInputs id="opt-employee" field="employeeContribution" inputs={inputs} resolved={resolved} gbp={gbp} />
        <ContributionInputs id="opt-employer" field="employerContribution" inputs={inputs} resolved={resolved} gbp={gbp} />
        {usesPensionablePay(inputs) && <PensionablePayInputs inputs={inputs} resolved={resolved} gbp={gbp} />}
      </>
    ),
    allowances: <AllowanceInputs taxYear={taxYear} inputs={inputs} />,
    benefits: (
      <>
        <ItemList
          field="taxableBenefits"
          items={inputs.taxableBenefits}
          invalidFields={invalidFields}
          blank={{ name: '', period: 'month', value: ZERO, taken: ZERO, payment: 'beforeTax' }}
          invalidParts={['name', 'value', 'taken']}
          fields={(item, itemId, update, part) => <BenefitFields item={item} itemId={itemId} update={update} part={part} />}
          resolved={(item) => <BenefitResolved item={item} gbp={gbp} />}
          total={<BenefitTotals resolved={resolved} gbp={gbp} empty={inputs.taxableBenefits.length === 0} />}
        />
        <ItemList
          field="postTaxDeductions"
          items={inputs.postTaxDeductions}
          invalidFields={invalidFields}
          blank={{ name: '', amount: ZERO, period: 'month' }}
          invalidParts={['name', 'amount']}
          fields={(item, itemId, update, part) => (
            <CurrencyInput
              id={`${itemId}-amount`}
              label="Amount"
              value={item.amount}
              min={ZERO}
              max={INPUT_LIMITS.maxAmount}
              onChange={(amount) => update({ amount })}
              onValidityChange={(ok) => session.setFieldValid(part('amount'), ok)}
            />
          )}
          resolved={(item) => (
            <>
              <span className="tabular-nums">{gbp(annualAmount(item))}</span> for the year
            </>
          )}
          total={
            <>
              Total for the year: <span className="font-semibold tabular-nums">{gbp(resolved.postTaxDeductions)}</span>
              {inputs.postTaxDeductions.length === 0 ? ' (none added)' : ''}
            </>
          }
        />
      </>
    ),
    studentLoans: (
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="pb-1.5 text-sm font-medium text-text">Plans you repay</legend>
        {STUDENT_LOAN_PLANS.map((plan) => (
          <Toggle
            key={plan}
            id={`opt-loan-${plan}`}
            label={PLAN_LABELS[plan]}
            checked={inputs.studentLoans.includes(plan)}
            onChange={(on) => togglePlan(plan, on)}
          />
        ))}
      </fieldset>
    ),
    childBenefit: (
      <>
        <NumberInput
          id="opt-children"
          label="Children you get Child Benefit for"
          value={inputs.children}
          min={0}
          max={INPUT_LIMITS.maxChildren}
          onChange={(children) => set({ children })}
          onValidityChange={valid('children')}
        />
        {inputs.children > 0 && (
          <Segmented
            id="opt-child-benefit"
            label="Child Benefit payments"
            hint={inputs.childBenefit === 'optedOut' ? PAYMENT_LABELS.optedOut : 'Paid to you; a charge applies on higher incomes.'}
            value={inputs.childBenefit}
            options={PAYMENT_OPTIONS}
            onChange={(childBenefit) => set({ childBenefit })}
          />
        )}
      </>
    ),
    taxCode: (
      <TextValueInput<string>
        id="opt-tax-code"
        label="Tax code (optional)"
        hint="As on your payslip: a number then a letter, with S or C in front if yours has one. Leave it empty for no PAYE estimate."
        value={inputs.taxCode}
        inputMode="text"
        parse={parseCodeText}
        format={(code) => code}
        onChange={(taxCode) => set({ taxCode })}
        onValidityChange={valid('taxCode')}
      />
    ),
  }

  return (
    <>
      <section
        aria-labelledby="opt-your-pay"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="opt-your-pay" className="text-base font-semibold">
          Your pay
        </h2>
        {amountInput('opt-salary', 'salary', 'Your annual salary before tax. Include any flexible-benefit cash.')}
        {amountInput('opt-bonus', 'bonus', 'Any bonus for the year, added to salary.')}
        <Segmented
          id="opt-region"
          label="Where you live"
          value={inputs.region}
          options={REGION_OPTIONS}
          onChange={(region) => set({ region })}
        />
        <Select
          id="opt-tax-year"
          label="Tax year"
          value={taxYear}
          options={TAX_YEARS}
          onChange={(taxYear) => session.setTaxYear(taxYear)}
        />
      </section>
      {SECTION_IDS.map((id) => (
        <Fragment key={id}>{section(id, content[id])}</Fragment>
      ))}
    </>
  )
}

/** The results column: a notice when there are no results, else the results. */
function ResultsOrNotice({
  result,
  ...props
}: {
  result: PageResult | null
  sweep: OptimiserPageResult | null
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
  period: BreakdownPeriod
  setPeriod: (period: BreakdownPeriod) => void
}) {
  if (!result)
    return (
      <InlineNotice tone="warning" title="No results until the inputs are fixed">
        <p>Fix the highlighted inputs to see results.</p>
      </InlineNotice>
    )
  if (isInputProblem(result))
    return (
      <div data-input-problem>
        <InlineNotice tone="warning" title="These inputs can’t be worked out">
          <p>{result.problem}</p>
        </InlineNotice>
      </div>
    )
  if (!result.ok) return <RefusalNotice refusal={result} />
  return <Results result={result} {...props} />
}

type Gbp = (amount: Money) => string

/** Marks fields valid when their box leaves the page (a mode switch, a removed item), so results don't wait on them. */
const forget = (...fields: string[]) => {
  for (const field of fields) session.setFieldValid(field, true)
}

/** One pension contribution: how it is entered, the box for that, and the amount it comes to when it is a percentage. */
function ContributionInputs({
  id,
  field,
  inputs,
  resolved,
  gbp,
}: {
  id: string
  field: ContributionField
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
}) {
  const entry = inputs[field]
  const set = (patch: Partial<OptimiserPageInputs[ContributionField]>) => session.setInputs({ [field]: { ...entry, ...patch } })
  const valid = (name: string) => (ok: boolean) => session.setFieldValid(name, ok)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Segmented
        id={`${id}-mode`}
        label={`${MONEY_LABELS[field]}: enter as`}
        value={entry.mode}
        options={MODE_OPTIONS}
        onChange={(mode) => {
          forget(mode === 'amount' ? `${field}-pct` : field)
          // Pensionable pay leaves the page when neither contribution is a percentage any more.
          if (!usesPensionablePay({ ...inputs, [field]: { ...entry, mode } })) forget('pensionablePay')
          set({ mode })
        }}
      />
      {entry.mode === 'amount' ? (
        <CurrencyInput
          id={id}
          label={MONEY_LABELS[field]}
          hint={`${CONTRIBUTION_HINTS[field]} For the year.`}
          value={entry.amount}
          min={ZERO}
          max={INPUT_LIMITS.maxAmount}
          onChange={(amount) => set({ amount })}
          onValidityChange={valid(field)}
        />
      ) : (
        <>
          <PercentInput
            id={`${id}-pct`}
            label={`${MONEY_LABELS[field]} (percentage of pensionable pay)`}
            hint={CONTRIBUTION_HINTS[field]}
            value={entry.percentOfPay}
            min={PERCENT_MIN}
            max={INPUT_LIMITS.maxPercent}
            onChange={(percentOfPay) => set({ percentOfPay })}
            onValidityChange={valid(`${field}-pct`)}
          />
          <p id={`${id}-resolved`} className="text-sm text-text">
            Comes to <span className="font-semibold tabular-nums">{gbp(resolved[field])}</span> for the year.
          </p>
        </>
      )}
    </div>
  )
}

/** What a percentage contribution applies to: the salary, or the person's own figure, with the bonus only if included. */
function PensionablePayInputs({ inputs, resolved, gbp }: { inputs: OptimiserPageInputs; resolved: ResolvedInputs; gbp: Gbp }) {
  const entry = inputs.pensionablePay
  const set = (patch: Partial<OptimiserPageInputs['pensionablePay']>) => session.setInputs({ pensionablePay: { ...entry, ...patch } })
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-text">Pensionable pay</legend>
      <Toggle
        id="opt-pensionable-own"
        label="Enter my own pensionable pay"
        hint="Off: your salary. Your scheme may use a different figure."
        checked={entry.own}
        onChange={(own) => {
          if (!own) forget('pensionablePay')
          set({ own })
        }}
      />
      {entry.own && (
        <CurrencyInput
          id="opt-pensionable"
          label="Pensionable pay for the year"
          value={entry.amount}
          min={ZERO}
          max={INPUT_LIMITS.maxAmount}
          onChange={(amount) => set({ amount })}
          onValidityChange={(ok) => session.setFieldValid('pensionablePay', ok)}
        />
      )}
      <Toggle
        id="opt-pensionable-bonus"
        label="Include the bonus"
        checked={entry.includeBonus}
        onChange={(includeBonus) => set({ includeBonus })}
      />
      <p id="opt-pensionable-resolved" className="text-sm text-text">
        Percentages apply to <span className="font-semibold tabular-nums">{gbp(resolved.pensionablePay)}</span> a year.
      </p>
    </fieldset>
  )
}

/** Keys for a list's items that stay with each item as others are added, removed or restored. Held by the page only, never stored. */
function useItemKeys(count: number) {
  const [state, setState] = useState(() => ({ next: count, keys: Array.from({ length: count }, (_, i) => i) }))
  let { keys } = state
  if (keys.length !== count) {
    // The list changed from outside (an Undo after the page was left): start the keys afresh.
    keys = Array.from({ length: count }, (_, i) => state.next + i)
    setState({ next: state.next + count, keys })
  }
  const key = state.next
  return {
    keys,
    /** Adds a key at `index` (the end for a new item) and returns it. */
    inserted: (index: number) => {
      setState((s) => ({ next: s.next + 1, keys: [...s.keys.slice(0, index), s.next, ...s.keys.slice(index)] }))
      return key
    },
    removed: (index: number) => setState((s) => ({ ...s, keys: s.keys.filter((_, i) => i !== index) })),
  }
}

type Item = { readonly name: string; readonly period: ListItem['period'] }

const capitalised = (text: string) => text.replace(/^./, (c) => c.toUpperCase())

/**
 * A list of named items (benefits in kind or post-tax deductions), each per month or per year, with its total for the
 * year (U9): each item a compact card with its name and resolved amounts, edited in place (Edit, Done) and removed with
 * Undo. A new item opens for editing with its name focused; an item with an input to fix stays open. `fields` renders an
 * item's own boxes between its name and its period; `part` names a box for the session's validity.
 */
function ItemList<T extends Item>({
  field,
  items,
  invalidFields,
  blank,
  invalidParts,
  fields,
  resolved,
  total,
}: {
  field: ListField
  items: readonly T[]
  invalidFields: readonly string[]
  blank: T
  invalidParts: readonly string[]
  fields: (item: T, itemId: string, update: (patch: Partial<T>) => void, part: (name: string) => string) => ReactNode
  resolved: (item: T) => ReactNode
  total: ReactNode
}) {
  const id = LIST_IDS[field]
  const noun = ITEM_NOUNS[field]
  const { keys, inserted, removed } = useItemKeys(items.length)
  const [editing, setEditing] = useState<ReadonlySet<number>>(() => new Set())
  // What takes focus after the next render: a new item's name, a restored item's Edit, or Add after a removal.
  const [focus, setFocus] = useState<string | null>(null)
  const latest = useRef({ inserted, setEditing, setFocus })
  latest.current = { inserted, setEditing, setFocus }
  useEffect(() => {
    if (focus === null) return
    document.getElementById(focus)?.focus()
    setFocus(null)
  }, [focus])
  const full = items.length >= INPUT_LIMITS.maxItems
  const setItems = (next: readonly T[]) => session.setInputs({ [field]: next })
  const update = (index: number, patch: Partial<T>) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const fieldName = (key: number, part: string) => `${field}-${key}-${part}`
  const toggle = (key: number, on: boolean) =>
    setEditing((s) => {
      const next = new Set(s)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const remove = (index: number, key: number, label: string) => {
    const item = items[index]!
    const revision = session.get().revision
    forget(...invalidParts.map((part) => fieldName(key, part)))
    removed(index)
    setItems(items.filter((_, i) => i !== index))
    setFocus(`${id}-add`)
    toasts.show({
      message: `Removed “${label}”.`,
      undo: {
        blocked: () =>
          session.get().revision !== revision
            ? 'Couldn’t undo: other inputs have been loaded since.'
            : session.get().inputs[field].length >= INPUT_LIMITS.maxItems
              ? 'Couldn’t undo: the list is full.'
              : undefined,
        run: () => {
          const now = session.get().inputs[field] as unknown as readonly T[]
          const at = Math.min(index, now.length)
          const restored = latest.current.inserted(at)
          session.setInputs({ [field]: [...now.slice(0, at), item, ...now.slice(at)] })
          latest.current.setFocus(`${id}-${restored}-edit`)
        },
        done: `Restored “${label}”.`,
      },
    })
  }

  return (
    <fieldset aria-describedby={`${id}-hint`} className="flex min-w-0 flex-col gap-3" data-list={field}>
      <legend className="pb-1.5 text-sm font-medium text-text">{MONEY_LABELS[field]}</legend>
      <p id={`${id}-hint`} className="-mt-1.5 text-xs text-text-muted">
        {LIST_HINTS[field]}
      </p>
      {items.map((item, index) => {
        const key = keys[index] ?? index
        const itemId = `${id}-${key}`
        const label = itemLabel(field, item, index)
        const numbered = `${capitalised(noun)} ${index + 1}`
        const needsFixing = invalidFields.some((f) => f.startsWith(`${field}-${key}-`))
        const open = editing.has(key) || needsFixing
        return (
          <fieldset key={key} id={itemId} data-item className="flex min-w-0 flex-col rounded-md border border-border">
            <legend className="sr-only">{numbered}</legend>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pr-1 pl-3">
              <p id={`${itemId}-summary`} className="flex min-w-0 flex-1 basis-40 flex-col py-1 text-sm">
                <span className="font-medium text-text [overflow-wrap:anywhere]">{item.name || numbered}</span>
                <span className="text-xs text-text-muted">{resolved(item)}</span>
              </p>
              <div className="flex min-w-0 flex-wrap gap-1">
                <Button
                  id={`${itemId}-edit`}
                  variant="ghost"
                  aria-expanded={open}
                  aria-controls={`${itemId}-fields`}
                  onClick={() => toggle(key, !open)}
                >
                  {open ? 'Done' : 'Edit'}
                  <span className="sr-only"> {label}</span>
                </Button>
                <Button id={`${itemId}-remove`} variant="ghost" aria-label={`Remove ${label}`} onClick={() => remove(index, key, label)}>
                  Remove
                </Button>
              </div>
            </div>
            <div id={`${itemId}-fields`} hidden={!open} className="flex flex-col gap-3 border-t border-border p-3">
              <TextInput
                id={`${itemId}-name`}
                label="Name"
                value={item.name}
                maxLength={INPUT_LIMITS.maxNameLength}
                onChange={(name) => update(index, { name } as Partial<T>)}
                onValidityChange={(ok) => session.setFieldValid(fieldName(key, 'name'), ok)}
              />
              {fields(
                item,
                itemId,
                (patch) => update(index, patch),
                (part) => fieldName(key, part),
              )}
              <Segmented
                id={`${itemId}-period`}
                label="How often"
                value={item.period}
                options={PERIOD_OPTIONS}
                onChange={(period) => update(index, { period } as Partial<T>)}
              />
            </div>
          </fieldset>
        )
      })}
      <p id={`${id}-total`} className="text-sm text-text">
        {total}
      </p>
      <div className="flex flex-col gap-1.5">
        <Button
          id={`${id}-add`}
          disabled={full}
          aria-describedby={full ? `${id}-full` : undefined}
          onClick={() => {
            const key = inserted(items.length)
            toggle(key, true)
            setItems([...items, blank])
            setFocus(`${id}-${key}-name`)
          }}
          className="h-auto min-h-touch max-w-full self-start py-2 text-left whitespace-normal"
        >
          <Plus />
          Add a {noun}
        </Button>
        {full && (
          <p id={`${id}-full`} className="text-xs text-text-muted">
            That’s the most this list holds ({INPUT_LIMITS.maxItems}). Combine items to add more.
          </p>
        )}
      </div>
    </fieldset>
  )
}

const PAYMENT_HINTS: Record<BenefitItem['payment'], string> = {
  beforeTax:
    'Salary you give up for it: less tax, National Insurance and student loan on your pay, but it is taxed on the higher of its value and the salary given up.',
  afterTax: 'Paid from your take-home pay: it lowers the benefit’s taxable value.',
}

/** A benefit item's own boxes: its value, what is taken from pay, and how (B10). */
function BenefitFields({
  item,
  itemId,
  update,
  part,
}: {
  item: BenefitItem
  itemId: string
  update: (patch: Partial<BenefitItem>) => void
  part: (name: string) => string
}) {
  return (
    <>
      <CurrencyInput
        id={`${itemId}-value`}
        label="Value of the benefit"
        hint="As your employer works it out, before anything you pay towards it."
        value={item.value}
        min={ZERO}
        max={INPUT_LIMITS.maxAmount}
        onChange={(value) => update({ value })}
        onValidityChange={(ok) => session.setFieldValid(part('value'), ok)}
      />
      <CurrencyInput
        id={`${itemId}-taken`}
        label="Taken from your pay for it"
        hint="Nothing if your employer pays for it all."
        value={item.taken}
        min={ZERO}
        max={INPUT_LIMITS.maxAmount}
        onChange={(taken) => update({ taken })}
        onValidityChange={(ok) => session.setFieldValid(part('taken'), ok)}
      />
      <Segmented
        id={`${itemId}-payment`}
        label="Taken from pay"
        hint={PAYMENT_HINTS[item.payment]}
        value={item.payment}
        options={PAYMENT_OPTIONS_BENEFIT}
        onChange={(payment) => update({ payment })}
      />
    </>
  )
}

/** What a benefit item comes to for the year: taxable, and taken from pay (and how). */
function BenefitResolved({ item, gbp }: { item: BenefitItem; gbp: Gbp }) {
  const year = annualBenefit(item)
  return (
    <>
      Taxable: <span className="tabular-nums">{gbp(benefitTaxable(year))}</span> for the year
      {compare(year.taken, ZERO) > 0 && (
        <>
          {' '}
          · taken from pay: <span className="tabular-nums">{gbp(year.taken)}</span>{' '}
          {item.payment === 'beforeTax' ? 'before tax' : 'after tax'}
        </>
      )}
    </>
  )
}

/** The benefit items' running totals for the year. */
function BenefitTotals({ resolved, gbp, empty }: { resolved: ResolvedInputs; gbp: Gbp; empty: boolean }) {
  return (
    <>
      Taxable for the year: <span className="font-semibold tabular-nums">{gbp(resolved.taxableBenefits)}</span>
      {empty ? ' (none added)' : ''}
      {compare(resolved.benefitSacrifice, ZERO) > 0 && (
        <>
          . Salary given up: <span className="font-semibold tabular-nums">{gbp(resolved.benefitSacrifice)}</span>
        </>
      )}
      {compare(resolved.benefitPaidAfterTax, ZERO) > 0 && (
        <>
          . Paid after tax: <span className="font-semibold tabular-nums">{gbp(resolved.benefitPaidAfterTax)}</span>
        </>
      )}
    </>
  )
}

/** The tax code box's text: empty for none, or a code GOV.UK defines, kept in its canonical form (B12). */
function parseCodeText(text: string): Parsed<string> {
  if (text.trim() === '') return { ok: true, value: '' }
  if (Array.from(text.trim()).length > INPUT_LIMITS.maxTaxCodeLength)
    return { ok: false, error: `Use at most ${INPUT_LIMITS.maxTaxCodeLength} characters.` }
  const parsed = parseTaxCode(text)
  if (parsed.ok) return { ok: true, value: parsed.code.text }
  if (parsed.reason === 'unsupported') return { ok: true, value: parsed.text }
  return { ok: false, error: 'Not a tax code Sumyard recognises: a number then a letter, with S or C in front if yours has one.' }
}

/** The PAYE estimate's assumptions, when a supported code gives one. */
function payeAssumptions(inputs: OptimiserPageInputs, result: ReturnType<typeof calculateTakeHome> | null): readonly string[] {
  if (!result?.ok || isInputProblem(result)) return []
  const paye = calculatePaye(inputs, result, configFor(session.get().taxYear))
  return paye?.ok ? paye.paye.assumptions : []
}

/** Warnings about the inputs themselves, shown above the results and never a cap. */
function InputWarnings({ warnings }: { warnings: readonly InputWarning[] }) {
  return warnings.map((warning) => (
    <div key={warning.key} data-input-warning={warning.code} className="[overflow-wrap:anywhere]">
      <InlineNotice tone="warning">
        <p>{warning.message}</p>
      </InlineNotice>
    </div>
  ))
}

/** Breakdown row labels, in order; the benefit rows show only when they hold something. */
const ROW_LABELS = {
  benefitSacrifice: 'Salary given up for benefits',
  incomeTax: 'Income tax',
  nationalInsurance: 'National Insurance',
  studentLoan: 'Student loan',
  pension: 'Employee pension',
  hicbc: 'High Income Child Benefit Charge',
  benefitPayments: 'Benefit payments after tax',
  postTaxDeductions: 'Post-tax deductions',
} as const

const OPTIONAL_ROWS = new Set<keyof typeof ROW_LABELS>(['benefitSacrifice', 'benefitPayments'])

/** The pennies a month's take-home moves from an even division of the year's, in words. */
function pennyNote(month: Breakdown, gbp: Gbp): string | undefined {
  const moved = compare(month.difference, ZERO)
  if (moved === 0) return undefined
  const by = gbp(moved > 0 ? month.difference : subtract(ZERO, month.difference))
  return `The rows added up: ${by} ${moved > 0 ? 'more' : 'less'} than the year’s take-home divided evenly (${gbp(month.evenShare)}), from rounding each row.`
}

function Results({
  result,
  sweep,
  inputs,
  resolved,
  gbp,
  period,
  setPeriod,
}: {
  result: TakeHomeResult
  sweep: OptimiserPageResult | null
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
  period: BreakdownPeriod
  setPeriod: (period: BreakdownPeriod) => void
}) {
  const { annual, weekly } = result
  const month = breakdown(annual, 'month')
  const shown = breakdown(annual, period)
  const paye = calculatePaye(inputs, result, configFor(result.taxYear))
  const intoPension = add(result.pension?.grossContribution ?? ZERO, resolved.employerContribution)
  const hasChildren = inputs.children > 0
  const periodWords = period === 'year' ? 'for the year' : 'a month'
  return (
    <>
      {result.warnings.map((warning) => (
        <div key={warning.code} data-warning={warning.code}>
          <InlineNotice tone="warning">
            <p>{warning.message}</p>
          </InlineNotice>
        </div>
      ))}

      <div className="flex flex-col gap-3" data-headline>
        <ResultCard title="Take-home pay" headlineLabel={PERIOD_LABELS_HEADLINE[period]} headline={gbp(shown.takeHome)}>
          {paye?.ok && (
            <>
              <StatRow
                label="Estimated payslip net pay"
                value={gbp(payslipNet(shown, paye))}
                detail={`Income tax as the PAYE estimate on your code, ${periodWords}`}
              />
              <StatRow
                label="Take-home after the year-end adjustment"
                value={gbp(shown.takeHome)}
                detail={`Income tax as the year’s tax, ${periodWords}`}
              />
            </>
          )}
          <StatRow label="Year" value={gbp(annual.net)} detail={annual.label} />
          <StatRow
            label="Month"
            value={gbp(month.takeHome)}
            detail="Each yearly row divided by the months in a year, to the nearest penny, then added up"
          />
          <StatRow label="Week" value={gbp(weekly.net)} detail={weekly.label} />
        </ResultCard>
        {paye?.ok && (
          <p data-net-pay-note className="text-xs text-text-muted">
            Your payslips take income tax on your tax code; the year’s tax is settled after the year ends, so a difference is refunded or
            collected then, or through a new code.
          </p>
        )}
        <InlineNotice>
          <p>
            Worked out for the whole tax year. Monthly and weekly are the annual figures divided evenly, so your payslips may differ,
            especially in a month with a bonus.
          </p>
        </InlineNotice>
      </div>

      <section data-split aria-label="Where your gross pay goes" className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <SplitBar
          title={`Where your gross pay goes, ${periodWords}`}
          segments={splitSegments(shown).map((s) => ({ id: s.id, label: s.label, value: s.amount }))}
          total={shown.gross}
          totalLabel="Gross pay"
          formatValue={(pence) => gbp(pence as Money)}
          highlight="takeHome"
        />
      </section>
      {sweep && <OptimiserChart sweep={sweep} inputs={inputs} resolved={resolved} gbp={gbp} period={period} />}

      <div className="flex flex-col gap-3" data-breakdown={period}>
        <Segmented
          id="opt-breakdown-period"
          label="Show the breakdown for a"
          value={period}
          options={BREAKDOWN_OPTIONS}
          onChange={setPeriod}
        />
        <ResultCard title="Breakdown">
          <StatRow label="Gross pay" value={gbp(shown.gross)} detail="Salary plus bonus" />
          {(Object.keys(ROW_LABELS) as (keyof typeof ROW_LABELS)[])
            .filter((row) => !OPTIONAL_ROWS.has(row) || compare(annual[row], ZERO) !== 0)
            .map((row) => (
              <StatRow
                key={row}
                label={ROW_LABELS[row]}
                value={gbp(shown.rows[row])}
                detail={row === 'pension' && result.pension ? METHOD_LABELS[result.pension.method] : undefined}
              />
            ))}
          <StatRow
            label="Take-home"
            value={gbp(shown.takeHome)}
            detail={period === 'year' ? 'Gross pay less every row above' : (pennyNote(shown, gbp) ?? 'Gross pay less every row above')}
          />
          {period === 'month' && paye?.ok && (
            <StatRow
              label="Income tax through PAYE"
              value={gbp(paye.paye.months[0]!.tax)}
              detail="Estimate for a month on your tax code; not in the sum above"
            />
          )}
        </ResultCard>
        <p className="text-xs text-text-muted">
          {period === 'year'
            ? 'The tax year’s figures.'
            : 'Each yearly row divided by the months in a year, to the nearest penny; take-home is those rows added up. Not a payslip.'}
        </p>
      </div>

      {paye && !paye.ok && 'reason' in paye && (
        <div data-paye-notice={paye.kind ?? paye.reason}>
          <InlineNotice tone="info" title="No PAYE estimate for this tax code">
            <p>{paye.message}</p>
          </InlineNotice>
        </div>
      )}
      {paye && !paye.ok && !('reason' in paye) && <RefusalNotice refusal={paye} />}
      {paye?.ok && <PayeCard estimate={paye} gbp={gbp} />}

      <ResultCard title="Alongside your pay">
        {hasChildren && <StatRow label="Child Benefit received" value={gbp(annual.childBenefit)} />}
        {hasChildren && <StatRow label="Take-home with Child Benefit" value={gbp(annual.netIncludingChildBenefit)} />}
        <StatRow
          label="Into your pension"
          value={gbp(intoPension)}
          detail={
            sameAmount(intoPension, ZERO)
              ? undefined
              : 'Your contribution (with any relief your provider adds) plus your employer’s own contribution'
          }
        />
        <StatRow label="Taxable benefits in kind" value={gbp(resolved.taxableBenefits)} detail="Taxed as pay, but not paid in cash" />
        <StatRow label="Adjusted net income" value={gbp(result.adjustedNetIncome.adjustedNetIncome)} />
      </ResultCard>
    </>
  )
}

/** The PAYE estimate beside the year's tax (B11): the estimate, a month, the liability and the difference, in words. */
function PayeCard({ estimate, gbp }: { estimate: PayeEstimate; gbp: Gbp }) {
  const { paye, liability, difference } = estimate
  const taxes = paye.months.map((m) => m.tax)
  const level = taxes.every((tax) => tax === taxes[0])
  const sign = compare(difference, ZERO)
  return (
    <div className="flex flex-col gap-3" data-paye>
      <ResultCard title="PAYE estimate" headlineLabel={`PAYE for the year on tax code ${paye.code.text}`} headline={gbp(paye.total)}>
        <StatRow
          label="PAYE a month"
          value={gbp(taxes[0]!)}
          detail={level ? 'Level monthly pay' : 'Level monthly pay; some months differ by a penny, and the year adds up exactly'}
        />
        <StatRow label="Income tax for the year" value={gbp(liability)} detail="The headline figure: the year’s tax on these inputs" />
        <StatRow
          label="Difference"
          value={gbp(sign < 0 ? subtract(ZERO, difference) : difference)}
          detail={
            sign > 0
              ? 'PAYE would take more than the year’s tax'
              : sign < 0
                ? 'PAYE would take less than the year’s tax'
                : 'PAYE would take the year’s tax exactly'
          }
        />
      </ResultCard>
      <InlineNotice>
        <p>
          A difference may be refunded or collected later: HMRC can change your tax code, or settle it after the year ends, by letter or
          through Self Assessment if you send a return.
        </p>
      </InlineNotice>
    </div>
  )
}

/** Earlier years' unused allowance, named by how long ago: "the tax year before", then "n tax years before". */
const yearsAgoLabel = (yearsAgo: number) => (yearsAgo === 1 ? 'the tax year before' : `${yearsAgo} tax years before`)

/**
 * The pension allowances section (1b-ii-a): unused allowance for each earlier year carry forward looks back (from the
 * year's config, plus any stored year beyond it), the money purchase annual allowance and the childcare check. Change
 * no take-home figure; they are optimise()'s.
 */
function AllowanceInputs({ taxYear, inputs }: { taxYear: string; inputs: OptimiserPageInputs }) {
  const lookBack = carryForwardYears(configFor(taxYear))
  const years = [
    ...new Set([...Array.from({ length: lookBack ?? 0 }, (_, i) => i + 1), ...inputs.carryForward.map((y) => y.yearsAgo)]),
  ].sort((a, b) => a - b)
  const amountFor = (yearsAgo: number) => inputs.carryForward.find((y) => y.yearsAgo === yearsAgo)?.amount ?? ZERO
  const setYear = (yearsAgo: number, amount: Money) =>
    set({
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
            id={`opt-carry-${yearsAgo}`}
            label={`Unused allowance from ${yearsAgoLabel(yearsAgo)}`}
            value={amountFor(yearsAgo)}
            min={ZERO}
            max={INPUT_LIMITS.maxAmount}
            onChange={(amount) => setYear(yearsAgo, amount)}
            onValidityChange={valid(`carryForward-${yearsAgo}`)}
          />
        ))}
      </fieldset>
      <Toggle
        id="opt-mpaa"
        label="The money purchase annual allowance applies to me"
        hint="If you have taken money from a defined contribution pension flexibly in an earlier tax year. Carry forward can’t be added to it."
        checked={inputs.moneyPurchaseAnnualAllowance}
        onChange={(moneyPurchaseAnnualAllowance) => set({ moneyPurchaseAnnualAllowance })}
      />
      <Toggle
        id="opt-childcare"
        label="Check the childcare support income limits"
        hint="Tax-Free Childcare and Free Childcare for Working Parents: your adjusted net income against each limit, marked on the chart. Other conditions are not checked."
        checked={inputs.checkChildcare}
        onChange={(checkChildcare) => set({ checkChildcare })}
      />
    </>
  )
}

/**
 * The contribution chart (1b-ii-a), below the split bar: spendable (or take-home) against the contribution by the
 * chosen method, from optimise()'s points, with the current contribution, the maximum and each threshold point marked,
 * cliffs as lettered ranges, and the table. A refusal takes its place; an input problem is already shown above.
 * 1b-ii-b: in the page's period, with a chosen point (the current contribution until another is chosen) read out
 * above the chart, and each point's change against now in the table. The choice is never stored.
 */
function OptimiserChart({
  sweep,
  inputs,
  resolved,
  gbp,
  period,
}: {
  sweep: OptimiserPageResult
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
  period: BreakdownPeriod
}) {
  const [view, setView] = useState<ChartView>('spendable')
  const [chosen, setChosen] = useState<Money | null>(null)
  const [fullRange, setFullRange] = useState(false)
  if (isInputProblem(sweep)) return null
  return (
    <section
      data-optimiser
      aria-labelledby="opt-chart-heading"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <h2 id="opt-chart-heading" className="text-base font-semibold">
        Pension contributions
      </h2>
      {!sweep.ok ? (
        <RefusalNotice refusal={sweep} />
      ) : (
        <ChartBody
          sweep={sweep}
          view={view}
          setView={setView}
          chosen={chosen}
          setChosen={setChosen}
          fullRange={fullRange}
          setFullRange={setFullRange}
          inputs={inputs}
          resolved={resolved}
          gbp={gbp}
          period={period}
        />
      )}
    </section>
  )
}

const PERIOD_SUFFIX: Record<BreakdownPeriod, string> = { year: ' a year', month: ' a month' }

function ChartBody({
  sweep,
  view,
  setView,
  chosen,
  setChosen,
  fullRange,
  setFullRange,
  inputs,
  resolved,
  gbp,
  period,
}: {
  sweep: OptimiseResult
  view: ChartView
  setView: (view: ChartView) => void
  chosen: Money | null
  setChosen: (contribution: Money) => void
  fullRange: boolean
  setFullRange: (full: boolean) => void
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
  period: BreakdownPeriod
}) {
  const percentBase = inputs.employeeContribution.mode === 'percentOfPay' ? resolved.pensionablePay : null
  const range = zoomRange(sweep)
  const shown = pointsIn(sweep, fullRange ? null : range)
  const points = shown.points
  const data = optimiserChartData({ ...sweep, ...shown }, view, { gbp, percentBase, period })
  const yLabel = viewLabel(view, period)
  const money = (pence: number) => gbp(fromPence(pence))
  const compact = (pence: number) => formatGBPCompact(fromPence(pence))
  const per = (annual: Money) => `${gbp(perPeriod(annual, period))}${PERIOD_SUFFIX[period]}`
  const now = currentPoint(sweep)
  const choice = nearestPoint(points, chosen ?? now.contribution)
  const changes = changeVsNow(points, now, view, period)
  const delta = (amount: Money) => formatGBPDelta(amount, 'pence')
  const index = points.indexOf(choice)
  const isNow = choice === now
  const options = points.map((point) => ({
    value: String(toPence(point.contribution)),
    label: `${per(point.contribution)}${point === now ? ' (your contribution now)' : ''}`,
  }))
  return (
    <>
      <p className="text-sm text-text-muted">
        Candidate contributions by {METHOD_LABELS[sweep.method].toLowerCase()}, from nothing up to the most the engine models. None is a
        recommendation. Spendable is take-home with any Child Benefit, less any annual allowance charge.
      </p>
      <Segmented id="opt-chart-view" label="Show" value={view} options={VIEW_OPTIONS} onChange={setView} />
      {range && (
        <Toggle
          id="opt-full-range"
          label="Full range"
          hint="From nothing up to the most the engine models, instead of around your contribution now and the thresholds ahead of it."
          checked={fullRange}
          onChange={setFullRange}
        />
      )}
      <p data-range-note className="text-xs text-text-muted">
        {range === null
          ? 'Showing the full range: no threshold lies ahead of your contribution now.'
          : fullRange
            ? 'Showing the full range.'
            : `Showing ${per(range.from)} to ${per(range.to)}: around your contribution now and the thresholds ahead of it.`}
      </p>
      <Select
        id="opt-chosen"
        label="Contribution to look at"
        hint="Your contribution now until you choose another. Read out below, highlighted on the chart and compared further down."
        value={String(toPence(choice.contribution))}
        options={options}
        onChange={(pence) => setChosen(fromPence(Number(pence)))}
      />
      <p data-readout aria-live="polite" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-text">
        {isNow ? 'Your contribution now' : 'At'} <strong className="tabular-nums">{per(choice.contribution)}</strong>:{' '}
        {VIEW_LABELS_LOWER[view]} <strong className="tabular-nums">{per(choice[view])}</strong>
        {isNow ? '.' : `, ${delta(changes[index]!)}${PERIOD_SUFFIX[period]} against your contribution now (${per(now.contribution)}).`}
      </p>
      <Chart
        title={`${yLabel} against your pension contribution`}
        categories={data.categories}
        series={[{ id: view, label: yLabel, kind: 'line', values: data.values }]}
        xValues={data.xValues}
        formatXTick={compact}
        markers={data.markers}
        spans={data.spans}
        pointMarkers={false}
        selectedX={data.xValues[index]}
        columns={[
          { label: 'Change vs now', values: changes.map(delta), numeric: true },
          { label: 'Marked', values: data.rowNotes },
        ]}
        xLabel={X_LABELS[period]}
        yLabel={yLabel}
        formatTick={compact}
        formatValue={money}
        integer
      />
      <div className="flex flex-col gap-1 text-xs text-text-muted">
        {data.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <p>{CURVE_NOTE}</p>
        {period === 'month' && <p data-month-note>{MONTH_NOTE}</p>}
      </div>
    </>
  )
}

const VIEW_LABELS_LOWER: Record<ChartView, string> = { spendable: 'spendable', takeHome: 'take-home' }
