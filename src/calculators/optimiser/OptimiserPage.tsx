import { useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { TextInput } from '@/components/inputs/TextInput'
import { Toggle } from '@/components/inputs/Toggle'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import { formatGBP } from '@/lib/format'
import { add, compare, type Money, ratio, ZERO } from '@/lib/money'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { configFor, sessionFor } from '../session'
import {
  type ContributionField,
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
  PERIOD_LABELS,
  PLAN_LABELS,
  REGION_LABELS,
  type ResolvedInputs,
  resolveInputs,
  usesPensionablePay,
} from './definition'
import { annualAmount, CONTRIBUTION_MODES, ITEM_PERIODS, type ListItem } from './pageInputs'
import { CHILD_BENEFIT_PAYMENTS, DEFAULT_POLICY, PENSION_METHODS, REGIONS, STUDENT_LOAN_PLANS, type TakeHomeResult } from './types'

/*
 * The take-home page (slice 1b, session 1b-i; part 1b-i.1 added percentage
 * contributions and itemised lists) at #/c/optimiser: inputs, take-home for
 * the year, month and week, the breakdown, warnings, assumptions and
 * scenarios, all from shared components and the engine's takeHome. No
 * figure is written here. The pension sweep, chart and threshold points
 * (optimise()) come in 1b-ii.
 */

const session = sessionFor(optimiserCalculator)

const TAX_YEARS = listTaxYears().map((y) => ({ value: y.id as string, label: taxYearLabel(y.id) }))
const REGION_OPTIONS = REGIONS.map((value) => ({ value, label: value === 'rUK' ? 'England, Wales, NI' : REGION_LABELS[value] }))
const METHOD_OPTIONS = PENSION_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))
const PAYMENT_OPTIONS = CHILD_BENEFIT_PAYMENTS.map((value) => ({ value, label: value === 'claimed' ? 'Claimed' : 'Opted out' }))
const MODE_OPTIONS = CONTRIBUTION_MODES.map((value) => ({ value, label: value === 'amount' ? MODE_LABELS.amount : 'Percentage' }))
const PERIOD_OPTIONS = ITEM_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))
const PERCENT_MIN = ratio(0, 1)

const METHOD_HINTS: Record<OptimiserPageInputs['pensionMethod'], string> = {
  salarySacrifice: 'Salary you give up for an employer contribution: less tax, National Insurance and student loan.',
  netPay: 'Taken from your pay before tax: less tax, but not less National Insurance.',
  reliefAtSource: 'Paid from your take-home pay; your provider adds basic rate relief. Enter what you pay.',
}

/** Assumptions the page adds to the engine's: what this page does and doesn't model. No figures except the policy's week count. */
const PAGE_ASSUMPTIONS = [
  `Child Benefit is counted for ${DEFAULT_POLICY.childBenefitWeeks} weeks of the year (the modelling policy), for every child entered.`,
  'Pension is counted as contributions only: what goes in this year. Growth, the annual allowance and tax on withdrawals are not shown here yet.',
  'Taxable benefits in kind are taken as entered: they are not checked against your employer’s annual statement of benefits or your tax code.',
  'No tax code: tax is worked out on the year’s figures. PAYE through your tax code can take slightly different amounts each payday.',
  'Take-home leaves out costs the employer pays: Class 1A National Insurance on benefits, employer National Insurance and the employer’s pension contribution.',
  'Flexible-benefit cash is entered as salary.',
  'A contribution entered as a percentage is that share of pensionable pay (your salary, or your own figure, with the bonus only if you include it), rounded to the nearest penny. Your scheme may round differently.',
  'Benefits in kind and post-tax deductions are each added up from your items into one figure for the year.',
  'Monthly amounts are assumed level through the year.',
]

const LIST_IDS: Record<ListField, string> = { taxableBenefits: 'opt-benefits', postTaxDeductions: 'opt-deductions' }

const LIST_HINTS: Record<ListField, string> = {
  taxableBenefits:
    'The taxable value of benefits from your job, such as employer-paid medical cover, after anything you pay towards them. Add one item for each.',
  postTaxDeductions:
    'Amounts taken from your pay after tax with no tax effect, such as medical or dental cover you pay for. Add one item for each.',
}

const CONTRIBUTION_HINTS: Record<ContributionField, string> = {
  employeeContribution: 'What you put in by this method. Zero for none.',
  employerContribution: 'Your employer’s own contribution. It doesn’t change your take-home.',
}

/** The engine lists the taper rounding with its results; without results the page says it. */
const TAPER_ASSUMPTION = 'Personal allowance taper: the reduction is worked out exactly, with nothing rounded until the result.'

const sameAmount = (a: Money, b: Money) => compare(a, b) === 0

export default function OptimiserPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const config = configFor(state.taxYear)
  const set = (patch: Partial<OptimiserPageInputs>) => session.setInputs(patch)
  const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
  const invalid = state.invalid.length > 0
  const result = invalid ? null : calculateTakeHome(inputs, config)
  const resolved = resolveInputs(inputs)
  const warnings = invalid ? [] : inputWarnings(inputs)
  const gbp = (amount: Money) => formatGBP(amount, amounts)
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {optimiserCalculator.name}
        </h1>
        <p className="text-text-muted">{optimiserCalculator.summary}</p>
        <div className="flex">
          <VerifiedBadge config={config} />
        </div>
      </div>

      <ScenarioBar calculator={optimiserCalculator} session={session} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section
          aria-labelledby="opt-inputs"
          className="flex min-w-0 flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5 shadow-sm lg:col-span-2"
        >
          <h2 id="opt-inputs" className="text-base font-semibold">
            Inputs
          </h2>
          {/* Keyed by revision: a loaded scenario or a fresh start resets every box. */}
          <div key={state.revision} className="flex flex-col gap-4">
            <Select
              id="opt-tax-year"
              label="Tax year"
              value={state.taxYear}
              options={TAX_YEARS}
              onChange={(taxYear) => session.setTaxYear(taxYear)}
            />
            <Segmented
              id="opt-region"
              label="Where you live"
              value={inputs.region}
              options={REGION_OPTIONS}
              onChange={(region) => set({ region })}
            />
            {amountInput('opt-salary', 'salary', 'Your annual salary before tax. Include any flexible-benefit cash.')}
            {amountInput('opt-bonus', 'bonus', 'Any bonus for the year, added to salary.')}

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

            <ItemList field="taxableBenefits" items={inputs.taxableBenefits} total={resolved.taxableBenefits} gbp={gbp} />
            <ItemList field="postTaxDeductions" items={inputs.postTaxDeductions} total={resolved.postTaxDeductions} gbp={gbp} />

            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="pb-1.5 text-sm font-medium text-text">Student loans</legend>
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
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <InputWarnings warnings={warnings} />
          {invalid || !result ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : isInputProblem(result) ? (
            <div data-input-problem>
              <InlineNotice tone="warning" title="These inputs can’t be worked out">
                <p>{result.problem}</p>
              </InlineNotice>
            </div>
          ) : !result.ok ? (
            <RefusalNotice refusal={result} />
          ) : (
            <Results result={result} inputs={inputs} resolved={resolved} gbp={gbp} />
          )}

          <AssumptionsPanel items={[...(result?.ok ? result.assumptions : [TAPER_ASSUMPTION]), ...PAGE_ASSUMPTIONS]}>
            <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
          </AssumptionsPanel>
        </div>
      </div>
    </div>
  )
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
          <p id={`${id}-resolved`} className="text-sm text-text" aria-live="polite">
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
      <p id="opt-pensionable-resolved" className="text-sm text-text" aria-live="polite">
        Percentages apply to <span className="font-semibold tabular-nums">{gbp(resolved.pensionablePay)}</span> a year.
      </p>
    </fieldset>
  )
}

/** Keys for a list's items that stay with each item as others are added or removed. Held by the page only, never stored. */
function useItemKeys(count: number) {
  const [state, setState] = useState(() => ({ next: count, keys: Array.from({ length: count }, (_, i) => i) }))
  let { keys } = state
  if (keys.length !== count) {
    // The list changed from outside (it shouldn't, as a load remounts the inputs): start the keys afresh.
    keys = Array.from({ length: count }, (_, i) => state.next + i)
    setState({ next: state.next + count, keys })
  }
  return {
    keys,
    added: () => setState((s) => ({ next: s.next + 1, keys: [...s.keys, s.next] })),
    removed: (index: number) => setState((s) => ({ ...s, keys: s.keys.filter((_, i) => i !== index) })),
  }
}

/** A list of named items (benefits in kind or post-tax deductions), each per month or per year, with its total for the year. */
function ItemList({ field, items, total, gbp }: { field: ListField; items: readonly ListItem[]; total: Money; gbp: Gbp }) {
  const id = LIST_IDS[field]
  const noun = ITEM_NOUNS[field]
  const { keys, added, removed } = useItemKeys(items.length)
  const full = items.length >= INPUT_LIMITS.maxItems
  const setItems = (next: readonly ListItem[]) => session.setInputs({ [field]: next })
  const update = (index: number, patch: Partial<ListItem>) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const fieldName = (key: number, part: string) => `${field}-${key}-${part}`
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
        return (
          <fieldset key={key} id={itemId} data-item className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">{`${noun.replace(/^./, (c) => c.toUpperCase())} ${index + 1}`}</legend>
            <TextInput
              id={`${itemId}-name`}
              label="Name"
              value={item.name}
              maxLength={INPUT_LIMITS.maxNameLength}
              onChange={(name) => update(index, { name })}
              onValidityChange={(ok) => session.setFieldValid(fieldName(key, 'name'), ok)}
            />
            <CurrencyInput
              id={`${itemId}-amount`}
              label="Amount"
              value={item.amount}
              min={ZERO}
              max={INPUT_LIMITS.maxAmount}
              onChange={(amount) => update(index, { amount })}
              onValidityChange={(ok) => session.setFieldValid(fieldName(key, 'amount'), ok)}
            />
            <Segmented
              id={`${itemId}-period`}
              label="How often"
              value={item.period}
              options={PERIOD_OPTIONS}
              onChange={(period) => update(index, { period })}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-text-muted">
                <span className="tabular-nums">{gbp(annualAmount(item))}</span> for the year
              </p>
              <Button
                id={`${itemId}-remove`}
                aria-label={`Remove ${label}`}
                onClick={() => {
                  forget(fieldName(key, 'name'), fieldName(key, 'amount'))
                  removed(index)
                  setItems(items.filter((_, i) => i !== index))
                }}
              >
                Remove
              </Button>
            </div>
          </fieldset>
        )
      })}
      <p id={`${id}-total`} className="text-sm text-text" aria-live="polite">
        Total for the year: <span className="font-semibold tabular-nums">{gbp(total)}</span>
        {items.length === 0 ? ' (none added)' : ''}
      </p>
      <div className="flex flex-col gap-1.5">
        <Button
          id={`${id}-add`}
          disabled={full}
          aria-describedby={full ? `${id}-full` : undefined}
          onClick={() => {
            added()
            setItems([...items, { name: '', amount: ZERO, period: 'month' }])
          }}
          className="self-start"
        >
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

function Results({
  result,
  inputs,
  resolved,
  gbp,
}: {
  result: TakeHomeResult
  inputs: OptimiserPageInputs
  resolved: ResolvedInputs
  gbp: Gbp
}) {
  const { annual, monthly, weekly } = result
  const intoPension = add(result.pension?.grossContribution ?? ZERO, resolved.employerContribution)
  const hasChildren = inputs.children > 0
  return (
    <>
      {result.warnings.map((warning) => (
        <div key={warning.code} data-warning={warning.code}>
          <InlineNotice tone="warning">
            <p>{warning.message}</p>
          </InlineNotice>
        </div>
      ))}

      <ResultCard title="Take-home pay" headlineLabel="Take-home for the year" headline={gbp(annual.net)}>
        <StatRow label="Year" value={gbp(annual.net)} detail={annual.label} />
        <StatRow label="Month" value={gbp(monthly.net)} detail={monthly.label} />
        <StatRow label="Week" value={gbp(weekly.net)} detail={weekly.label} />
      </ResultCard>
      <InlineNotice>
        <p>
          Worked out for the whole tax year. Monthly and weekly are the annual figures divided evenly, so your payslips may differ,
          especially in a month with a bonus.
        </p>
      </InlineNotice>

      <ResultCard title="Breakdown">
        <StatRow label="Gross pay" value={gbp(annual.gross)} detail="Salary plus bonus" />
        <StatRow label="Income tax" value={gbp(annual.incomeTax)} />
        <StatRow label="National Insurance" value={gbp(annual.nationalInsurance)} />
        <StatRow label="Student loan" value={gbp(annual.studentLoan)} />
        <StatRow
          label="Employee pension"
          value={gbp(annual.pension)}
          detail={result.pension ? METHOD_LABELS[result.pension.method] : undefined}
        />
        <StatRow label="High Income Child Benefit Charge" value={gbp(annual.hicbc)} />
        <StatRow label="Post-tax deductions" value={gbp(annual.postTaxDeductions)} />
        <StatRow label="Take-home" value={gbp(annual.net)} detail="Gross pay less every row above" />
      </ResultCard>

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
