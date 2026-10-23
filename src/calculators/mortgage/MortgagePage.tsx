import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Chart } from '@/components/Chart/Chart'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { DateInput, dateInWords } from '@/components/inputs/DateInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { SliderInput } from '@/components/inputs/SliderInput'
import { Toggle } from '@/components/inputs/Toggle'
import { NoTaxRulesBadge } from '@/components/NoTaxRulesBadge'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useItemKeys } from '@/hooks/useItemKeys'
import { addMonths } from '@/lib/calendar'
import { formatGBP, formatGBPChange, formatGBPCompact, formatIsoDate, formatPercent } from '@/lib/format'
import { MAX_LIST_ITEMS } from '@/lib/inputLimits'
import { add, compare, fromPence, type Money, subtract, ZERO } from '@/lib/money'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import {
  ALLOWANCE_KINDS,
  AMOUNT_LIMITS,
  BALANCE_LIMITS,
  calculate,
  DAY_COUNT_LABELS,
  DAY_COUNTS,
  EFFECT_LABELS,
  EFFECTS,
  EXTRA_MONTH_LIMITS,
  FIELD_LABELS,
  INTEREST_METHODS,
  type LumpSumInput,
  METHOD_LABELS,
  type MortgagePageInputs,
  mortgageCalculator,
  NOT_SET,
  type PageOutcome,
  paymentMonthOnOrAfter,
  RATE_LIMITS,
  REPAYMENT_LABELS,
  REPAYMENT_TYPES,
  RESET_LIMITS,
  type SectionId,
  sectionNeeded,
  sectionSet,
  sectionSummary,
  termOf,
  withWhatIf,
  YEAR_LIMITS,
  yearsAndMonths,
} from './definition'
import { chartData, drifts, fixedRateNote, overAllowance, type ReturnLine, returnLines, START_LABEL, unusedOverpayments } from './results'
import type { MortgageInputs, MortgageResult } from './types'

/*
 * The mortgage overpayment page (M2) at #/c/mortgage, on the M1 engine, laid
 * out as docs/ui-patterns.md: inputs in sections with live summaries (open
 * on load when set or when they hold a box the results need), results first
 * (StickyResult) and answer first: interest saved, the term cut, the new
 * payoff date, total paid and any early repayment charge, with the net saving
 * and break-even when a charge is paid; then warnings, never hidden; one
 * return per rate period with what it is measured against; the balance
 * chart; a yearly table below the columns. A what-if slider tries another
 * monthly overpayment beside the inputs (U40, U41). Uses no tax rules. Every
 * figure is the engine's (./calc.ts) through ./definition.ts and ./results.ts.
 */

const session = sessionFor(mortgageCalculator)

type Gbp = (amount: Money) => string

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))
const REPAYMENT_OPTIONS = options(REPAYMENT_TYPES, REPAYMENT_LABELS)
const EFFECT_OPTIONS = options(EFFECTS, EFFECT_LABELS)
const METHOD_OPTIONS = options(INTEREST_METHODS, METHOD_LABELS)
const DAY_COUNT_OPTIONS = options(DAY_COUNTS, DAY_COUNT_LABELS)
const ALLOWANCE_OPTIONS = options(ALLOWANCE_KINDS, { rate: 'Percentage of the balance', amount: 'Amount' })

/** The convention behind each input, in words. No figures. */
const HINTS = {
  startDate: 'The day the balance below is owed, such as your last statement date. Payments fall on this day each month.',
  balance: 'What you owe on that day.',
  term: 'The time left on the mortgage, in whole years and months.',
  repaymentType: 'Repayment clears the balance by the end; interest-only pays the interest and owes the amount borrowed at the end.',
  fixed: 'Off if you are on a variable rate now: the rate below then applies from the start.',
  fixedEndDate: 'Payments on or before this date are at the fixed rate.',
  reversionRate: 'A guess: the rate you expect to pay after the fixed rate, to the end of the term.',
  variableRate: 'The rate you pay now, assumed to the end of the term.',
  monthly: 'Paid with every monthly payment from the first. An empty box counts as nothing.',
  effect: 'Keep the payment and clear the mortgage sooner, or keep the term and pay less each month.',
  lumpDate: 'Paid with the first payment on or after this date.',
  ercRate: 'A percentage of what you overpay above the penalty-free limit, from your offer documents.',
  ercEndDate: 'The last date an overpayment can be charged. Empty: when the fixed rate ends.',
  ercEndDateNoFixed: 'The last date an overpayment can be charged.',
  allowance: 'What you can overpay each year without a charge.',
  allowanceUsed: 'Already overpaid in the allowance year running now. An empty box counts as nothing.',
  paymentsToReset: 'Payments left before your allowance year starts again. Nothing for a fresh year from the first payment.',
  interestMethod: 'Monthly: a twelfth of the yearly rate on the balance. Daily: each day’s interest, added on the payment date.',
  dayCount: 'Daily interest as a share of a common year, or of each day’s own year.',
} as const

/** What the page adds to the engine's assumptions. No figures. */
const PAGE_ASSUMPTIONS = [
  'Dates become payment dates: the fixed rate and the charge cover the payments on or before their end dates, and a lump sum is paid with the first payment on or after its date.',
  'A regular overpayment runs from the first payment to the end of the term, or until the mortgage is cleared.',
  'Lender terms vary, so check your offer documents for how your lender works out interest, the early repayment charge and the penalty-free limit. A statement can confirm the figures.',
  'Uses no tax rules: nothing here depends on the tax rules of any year.',
]

const SECTION_TITLES: Record<SectionId | 'whatif', string> = {
  loan: 'Your mortgage',
  fixed: 'Fixed rate',
  overpay: 'Overpaying',
  whatif: 'What if',
  erc: 'Early repayment charge',
  advanced: 'Advanced: interest method',
}

/** What-ifs tied to the inputs' revision: a load or a fresh start drops them (U41). */
interface Overlay {
  readonly revision: number
  readonly monthly?: Money
}

const okResult = (outcome: PageOutcome | null) => (outcome?.kind === 'ok' ? outcome : null)

/** The sticky figure: interest saved, and the term cut (repayment) or what is owed at the end (interest-only). */
function stickyValue(engine: MortgageInputs, result: MortgageResult, gbp: Gbp): string {
  const saved = gbp(result.interestSaved)
  return engine.repaymentType === 'repayment'
    ? `${saved}, ${yearsAndMonths(result.monthsSaved)} sooner`
    : `${saved}, ${gbp(result.overpaying.owedAtEnd)} owed at the end`
}

export default function MortgagePage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const invalid = state.invalid.length > 0
  const [stored, setOverlay] = useState<Overlay>(() => ({ revision: state.revision }))
  const overlay = stored.revision === state.revision ? stored : { revision: state.revision }
  const whatIfInputs = overlay.monthly === undefined ? inputs : withWhatIf(inputs, overlay.monthly)
  const active = compare(whatIfInputs.monthly, inputs.monthly) !== 0
  const outcome = useMemo(() => (invalid ? null : calculate(inputs)), [invalid, inputs])
  // biome-ignore lint/correctness/useExhaustiveDependencies: the what-if is the inputs with one amount; both stand for it.
  const alternative = useMemo(() => (active && !invalid ? calculate(whatIfInputs) : null), [active, invalid, inputs, overlay.monthly])
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)

  const base = okResult(outcome)
  const whatIf = base ? okResult(alternative) : null
  const shown = whatIf ?? base
  const label = `Interest saved${whatIf ? ' with your what-if' : ''}`
  const value = shown ? stickyValue(shown.inputs, shown.result, gbp) : null

  const apply = () => {
    const before = inputs
    const revision = state.revision
    session.setInputs({ monthly: whatIfInputs.monthly })
    setOverlay({ revision })
    toasts.show({
      message: 'Applied your what-if to your inputs.',
      undo: {
        blocked: () => (session.get().revision !== revision ? 'Couldn’t undo: other inputs have been loaded since.' : undefined),
        run: () => session.setInputs(before),
        done: 'Your inputs are back as they were.',
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {mortgageCalculator.name}
        </h1>
        <p className="text-text-muted">{mortgageCalculator.summary}</p>
        {/* On a phone the badge is in the sticky bar instead. */}
        <div className="hidden md:flex">
          <NoTaxRulesBadge />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={
          invalid
            ? 'Fix the highlighted inputs'
            : outcome?.kind === 'missing'
              ? 'Enter your mortgage to see results'
              : 'No result for these inputs'
        }
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <div className="flex">
            <NoTaxRulesBadge />
          </div>
        }
        results={
          outcome === null ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : outcome.kind === 'missing' ? (
            <div data-missing>
              <InlineNotice tone="info" title="Enter these to see results">
                <ul className="list-disc pl-5">
                  {outcome.refusal.problems.map((p) => (
                    <li key={p.field}>{p.label}</li>
                  ))}
                </ul>
              </InlineNotice>
            </div>
          ) : outcome.kind === 'refused' ? (
            <RefusalNotice refusal={outcome.refusal} />
          ) : (
            <Results shown={shown!} base={outcome} whatIf={whatIf} pageInputs={inputs} gbp={gbp} />
          )
        }
      >
        <ScenarioBar calculator={mortgageCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Inputs
          key={state.revision}
          inputs={inputs}
          invalidFields={state.invalid}
          overlay={overlay}
          setOverlay={setOverlay}
          whatIfActive={active}
          apply={apply}
          gbp={gbp}
        />
      </StickyResult>

      {shown && <YearlyTable result={shown.result} engine={shown.inputs} gbp={gbp} whatIf={whatIf !== null} />}

      <AssumptionsPanel items={[...new Set([...(shown ? shown.result.assumptions : []), ...PAGE_ASSUMPTIONS])]}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

const set = (patch: Partial<MortgagePageInputs>) => session.setInputs(patch)
const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
const forget = (...fields: string[]) => {
  for (const field of fields) session.setFieldValid(field, true)
}
const forgetLumps = () => forget(...session.get().invalid.filter((field) => field.startsWith('lumpSums.')))

/**
 * The inputs, a section each (U1 to U3), open on mount when set or when they hold a box the results need (U42).
 * Remounted (by key) on a load or a fresh start, so the open sections follow the inputs; never stored.
 */
function Inputs({
  inputs,
  invalidFields,
  overlay,
  setOverlay,
  whatIfActive,
  apply,
  gbp,
}: {
  inputs: MortgagePageInputs
  invalidFields: readonly string[]
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
  whatIfActive: boolean
  apply: () => void
  gbp: Gbp
}) {
  const ids: SectionId[] = ['loan', 'fixed', 'overpay', 'erc', 'advanced']
  const [openOnMount] = useState(() => Object.fromEntries(ids.map((id) => [id, sectionSet(id, inputs) || sectionNeeded(id, inputs)])))
  const lumpKeys = useItemKeys(inputs.lumpSums.length)
  const section = (id: SectionId, children: ReactNode) => (
    <Section
      id={`mo-section-${id}`}
      title={SECTION_TITLES[id]}
      summary={sectionSummary(id, inputs, invalidFields)}
      defaultOpen={openOnMount[id]}
    >
      {children}
    </Section>
  )
  const rate = (id: string, field: 'fixedRate' | 'reversionRate' | 'ercRate' | 'allowanceRate', label: string, hint: string) => (
    <PercentInput
      id={id}
      label={label}
      hint={hint}
      value={inputs[field]}
      allowEmpty
      min={RATE_LIMITS.min}
      max={RATE_LIMITS.max}
      maxDecimals={RATE_LIMITS.maxDecimals}
      onChange={(value) => set({ [field]: value })}
      onValidityChange={valid(field)}
    />
  )
  const date = (id: string, field: 'startDate' | 'fixedEndDate' | 'ercEndDate', label: string, hint: string) => (
    <div className="flex flex-col gap-1">
      <DateInput
        id={id}
        label={label}
        hint={hint}
        value={inputs[field]}
        allowEmpty
        onChange={(value) => set({ [field]: value })}
        onValidityChange={valid(field)}
      />
      {inputs[field] && <p className="text-xs text-text-muted">{dateInWords(inputs[field])}</p>}
    </div>
  )
  const setLump = (index: number, patch: Partial<LumpSumInput>) =>
    set({ lumpSums: inputs.lumpSums.map((lump, i) => (i === index ? { ...lump, ...patch } : lump)) })
  const removeLump = (index: number) => {
    lumpKeys.removed(index)
    forgetLumps()
    set({ lumpSums: inputs.lumpSums.filter((_, i) => i !== index) })
  }
  const term = termOf(inputs)

  return (
    <>
      {section(
        'loan',
        <>
          {date('mo-start', 'startDate', FIELD_LABELS.startDate, HINTS.startDate)}
          <CurrencyInput
            id="mo-balance"
            label={FIELD_LABELS.balance}
            hint={HINTS.balance}
            value={inputs.balance}
            allowEmpty
            min={BALANCE_LIMITS.min}
            max={BALANCE_LIMITS.max}
            onChange={(balance) => set({ balance })}
            onValidityChange={valid('balance')}
          />
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm font-medium text-text">Term left</legend>
            <p className="text-xs text-text-muted">{HINTS.term}</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                id="mo-years"
                label={FIELD_LABELS.termYears}
                value={inputs.termYears}
                allowEmpty
                min={YEAR_LIMITS.min}
                max={YEAR_LIMITS.max}
                suffix="years"
                onChange={(termYears) => set({ termYears })}
                onValidityChange={valid('termYears')}
              />
              <NumberInput
                id="mo-months"
                label={FIELD_LABELS.termExtraMonths}
                value={inputs.termExtraMonths}
                emptyValue={0}
                placeholder="0"
                min={EXTRA_MONTH_LIMITS.min}
                max={EXTRA_MONTH_LIMITS.max}
                suffix="months"
                onChange={(termExtraMonths) => set({ termExtraMonths })}
                onValidityChange={valid('termExtraMonths')}
              />
            </div>
          </fieldset>
          <Segmented
            id="mo-repayment"
            label={FIELD_LABELS.repaymentType}
            hint={HINTS.repaymentType}
            value={inputs.repaymentType}
            options={REPAYMENT_OPTIONS}
            onChange={(repaymentType) => set({ repaymentType })}
          />
        </>,
      )}
      {section(
        'fixed',
        <>
          <Toggle
            id="mo-fixed"
            label="On a fixed rate now?"
            hint={HINTS.fixed}
            checked={inputs.fixed}
            onChange={(fixed) => {
              if (!fixed) forget('fixedRate', 'fixedEndDate')
              set({ fixed })
            }}
          />
          {inputs.fixed && rate('mo-fixed-rate', 'fixedRate', FIELD_LABELS.fixedRate, 'The rate you pay now.')}
          {inputs.fixed && date('mo-fixed-end', 'fixedEndDate', FIELD_LABELS.fixedEndDate, HINTS.fixedEndDate)}
          {rate(
            'mo-reversion-rate',
            'reversionRate',
            inputs.fixed ? FIELD_LABELS.reversionRate : 'Your interest rate',
            inputs.fixed ? HINTS.reversionRate : HINTS.variableRate,
          )}
        </>,
      )}
      {section(
        'overpay',
        <>
          <CurrencyInput
            id="mo-monthly"
            label={FIELD_LABELS.monthly}
            hint={HINTS.monthly}
            value={inputs.monthly}
            emptyValue={ZERO}
            placeholder="0"
            min={AMOUNT_LIMITS.min}
            max={AMOUNT_LIMITS.max}
            onChange={(monthly) => set({ monthly })}
            onValidityChange={valid('monthly')}
          />
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="text-sm font-medium text-text">{FIELD_LABELS.lumpSums}</legend>
            {inputs.lumpSums.length === 0 && <p className="text-xs text-text-muted">None yet.</p>}
            {inputs.lumpSums.map((lump, index) => {
              const key = lumpKeys.keys[index] ?? index
              const month =
                inputs.startDate && lump.date && lump.date > inputs.startDate
                  ? paymentMonthOnOrAfter(inputs.startDate, lump.date, term)
                  : null
              return (
                <div key={key} className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
                  <DateInput
                    id={`mo-lump-${key}-date`}
                    label={`Lump sum ${index + 1} date`}
                    hint={HINTS.lumpDate}
                    value={lump.date}
                    allowEmpty
                    onChange={(value) => setLump(index, { date: value })}
                    onValidityChange={valid(`lumpSums.${key}.date`)}
                  />
                  <CurrencyInput
                    id={`mo-lump-${key}-amount`}
                    label={`Lump sum ${index + 1} amount`}
                    value={lump.amount}
                    emptyValue={ZERO}
                    placeholder="0"
                    min={AMOUNT_LIMITS.min}
                    max={AMOUNT_LIMITS.max}
                    onChange={(amount) => setLump(index, { amount })}
                    onValidityChange={valid(`lumpSums.${key}.amount`)}
                  />
                  {month !== null && inputs.startDate && (
                    <p className="text-xs text-text-muted">Paid with the payment on {formatIsoDate(addMonths(inputs.startDate, month))}.</p>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => removeLump(index)}
                    className="h-auto min-h-touch self-start border border-border py-2"
                  >
                    <Trash2 aria-hidden="true" />
                    Remove lump sum {index + 1}
                  </Button>
                </div>
              )
            })}
            <Button
              variant="ghost"
              disabled={inputs.lumpSums.length >= MAX_LIST_ITEMS}
              onClick={() => {
                lumpKeys.inserted(inputs.lumpSums.length)
                set({ lumpSums: [...inputs.lumpSums, { date: null, amount: ZERO }] })
              }}
              className="h-auto min-h-touch self-start border border-border py-2"
            >
              <Plus aria-hidden="true" />
              Add a lump sum
            </Button>
            {inputs.lumpSums.length >= MAX_LIST_ITEMS && (
              <p className="text-xs text-text-muted">That is as many lump sums as the page holds.</p>
            )}
          </fieldset>
          {inputs.repaymentType === 'repayment' ? (
            <Segmented
              id="mo-effect"
              label="Overpaying should"
              hint={HINTS.effect}
              value={inputs.effect}
              options={EFFECT_OPTIONS}
              onChange={(effect) => set({ effect })}
            />
          ) : (
            <p className="text-xs text-text-muted">
              On an interest-only mortgage, overpaying lowers what is owed and so the interest; shortening the term or lowering the payment
              does not apply.
            </p>
          )}
        </>,
      )}
      <WhatIfSection inputs={inputs} overlay={overlay} setOverlay={setOverlay} active={whatIfActive} apply={apply} gbp={gbp} />
      {section(
        'erc',
        <>
          <Toggle
            id="mo-erc"
            label="Does an early repayment charge apply?"
            hint="From your offer documents. Usually while a fixed rate lasts."
            checked={inputs.erc}
            onChange={(erc) => {
              if (!erc) forget('ercRate', 'ercEndDate', 'allowanceRate', 'allowanceAmount', 'allowanceUsed', 'paymentsToReset')
              set({ erc })
            }}
          />
          {inputs.erc && (
            <>
              {rate('mo-erc-rate', 'ercRate', FIELD_LABELS.ercRate, HINTS.ercRate)}
              {date('mo-erc-end', 'ercEndDate', FIELD_LABELS.ercEndDate, inputs.fixed ? HINTS.ercEndDate : HINTS.ercEndDateNoFixed)}
              <Segmented
                id="mo-allowance-kind"
                label={FIELD_LABELS.allowanceKind}
                value={inputs.allowanceKind}
                options={ALLOWANCE_OPTIONS}
                onChange={(allowanceKind) => {
                  forget('allowanceRate', 'allowanceAmount')
                  set({ allowanceKind })
                }}
              />
              {inputs.allowanceKind === 'rate' ? (
                rate(
                  'mo-allowance-rate',
                  'allowanceRate',
                  'Penalty-free limit a year',
                  `${HINTS.allowance} A share of the balance at the start of each allowance year.`,
                )
              ) : (
                <CurrencyInput
                  id="mo-allowance-amount"
                  label="Penalty-free limit a year"
                  hint={HINTS.allowance}
                  value={inputs.allowanceAmount}
                  allowEmpty
                  min={AMOUNT_LIMITS.min}
                  max={AMOUNT_LIMITS.max}
                  onChange={(allowanceAmount) => set({ allowanceAmount })}
                  onValidityChange={valid('allowanceAmount')}
                />
              )}
              <CurrencyInput
                id="mo-allowance-used"
                label={FIELD_LABELS.allowanceUsed}
                hint={HINTS.allowanceUsed}
                value={inputs.allowanceUsed}
                emptyValue={ZERO}
                placeholder="0"
                min={AMOUNT_LIMITS.min}
                max={AMOUNT_LIMITS.max}
                onChange={(allowanceUsed) => set({ allowanceUsed })}
                onValidityChange={valid('allowanceUsed')}
              />
              <NumberInput
                id="mo-payments-to-reset"
                label={FIELD_LABELS.paymentsToReset}
                hint={HINTS.paymentsToReset}
                value={inputs.paymentsToReset}
                emptyValue={0}
                placeholder="0"
                min={RESET_LIMITS.min}
                max={RESET_LIMITS.max}
                suffix="payments"
                onChange={(paymentsToReset) => set({ paymentsToReset })}
                onValidityChange={valid('paymentsToReset')}
              />
            </>
          )}
        </>,
      )}
      {section(
        'advanced',
        <>
          <Segmented
            id="mo-method"
            label={FIELD_LABELS.interestMethod}
            hint={HINTS.interestMethod}
            value={inputs.interestMethod}
            options={METHOD_OPTIONS}
            onChange={(interestMethod) => set({ interestMethod })}
          />
          {inputs.interestMethod === 'daily' && (
            <Select
              id="mo-day-count"
              label={FIELD_LABELS.dayCount}
              hint={HINTS.dayCount}
              value={inputs.dayCount}
              options={DAY_COUNT_OPTIONS}
              onChange={(dayCount) => set({ dayCount })}
            />
          )}
        </>,
      )}
    </>
  )
}

/** One slider for the monthly overpayment (U40, U41): page state only. Reset and Apply (with Undo). */
function WhatIfSection({
  inputs,
  overlay,
  setOverlay,
  active,
  apply,
  gbp,
}: {
  inputs: MortgagePageInputs
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
  active: boolean
  apply: () => void
  gbp: Gbp
}) {
  const [bad, setBad] = useState(false)
  return (
    <Section id="mo-section-whatif" title={SECTION_TITLES.whatif} summary={active ? 'One what-if, not saved' : NOT_SET}>
      <p className="-mt-1 text-xs text-text-muted">
        Try another monthly overpayment: the results show it beside your inputs. What-ifs are never saved; Apply puts it into your inputs.
      </p>
      <SliderInput
        id="mo-wi"
        label="Monthly overpayment, what if"
        unit="per month"
        value={overlay.monthly ?? inputs.monthly}
        scaleFrom={inputs.monthly}
        max={AMOUNT_LIMITS.max}
        onChange={(monthly) => setOverlay({ ...overlay, monthly })}
        onValidityChange={(ok) => setBad(!ok)}
        hint={`Your inputs say ${gbp(inputs.monthly)}.`}
      />
      {bad && <p className="text-xs font-medium text-danger">Fix the what-if; until then it keeps its last amount and can’t be applied.</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          id="mo-wi-reset"
          variant="ghost"
          disabled={!active}
          onClick={() => setOverlay({ revision: overlay.revision })}
          className="h-auto min-h-touch max-w-full border border-border py-2 text-left whitespace-normal"
        >
          <RotateCcw />
          Reset what-if
        </Button>
        <Button
          id="mo-wi-apply"
          disabled={!active || bad}
          onClick={apply}
          className="h-auto min-h-touch max-w-full py-2 text-left whitespace-normal"
        >
          Apply to my inputs
        </Button>
      </div>
    </Section>
  )
}

type Ok = Extract<PageOutcome, { kind: 'ok' }>

const dateOf = (engine: MortgageInputs, month: number) => formatIsoDate(addMonths(engine.startDate, month))

/** The results column (U6): warnings, the answer, the what-if beside your inputs, payments, returns, the chart. */
function Results({
  shown,
  base,
  whatIf,
  pageInputs,
  gbp,
}: {
  shown: Ok
  base: Ok
  whatIf: Ok | null
  pageInputs: MortgagePageInputs
  gbp: Gbp
}) {
  const { result, inputs: engine } = shown
  const { overpaying, baseline } = result
  const repayment = engine.repaymentType === 'repayment'
  const suffix = whatIf ? ', with your what-if' : ''
  return (
    <>
      <Warnings shown={shown} fixed={pageInputs.fixed} gbp={gbp} />

      <div data-answer>
        <ResultCard
          title={`What overpaying does${suffix}`}
          headline={gbp(result.interestSaved)}
          headlineLabel="Interest saved over the term"
        >
          <StatRow
            label="Interest saved"
            value={gbp(result.interestSaved)}
            detail="Interest without overpaying, less interest with it, the rate after the fixed rate assumed to the end."
          />
          {repayment ? (
            <>
              <StatRow label="Term cut" value={yearsAndMonths(result.monthsSaved)} />
              <StatRow
                label="New payoff date"
                value={overpaying.payoffDate ? formatIsoDate(overpaying.payoffDate) : 'Not paid off in the term'}
                detail={baseline.payoffDate ? `Without overpaying: ${formatIsoDate(baseline.payoffDate)}` : undefined}
              />
            </>
          ) : (
            <StatRow label="Owed at the end" value={gbp(overpaying.owedAtEnd)} detail={`Without overpaying: ${gbp(baseline.owedAtEnd)}`} />
          )}
          <StatRow
            label="Total paid"
            value={gbp(overpaying.totalPaid)}
            detail={`Payments, overpayments and charges. Without overpaying: ${gbp(baseline.totalPaid)}${repayment ? '' : ', with the amount borrowed still owed'}.`}
          />
          <StatRow label="Early repayment charge paid" value={gbp(overpaying.totalErc)} />
          {result.charge && (
            <>
              <StatRow label="Net saving" value={gbp(result.charge.netSaving)} detail="Interest saved less the charge, in pounds." />
              <StatRow
                label="Break-even"
                value={result.charge.breakEvenMonth === null ? 'Not within the term' : dateOf(engine, result.charge.breakEvenMonth)}
                detail={
                  result.charge.breakEvenMonth === null
                    ? 'The interest saved never catches up with the charge before the term ends.'
                    : `Payment ${result.charge.breakEvenMonth}: from then on, the interest saved so far stays at least the charge paid so far.`
                }
              />
            </>
          )}
        </ResultCard>
      </div>

      {whatIf && <WhatIfResults base={base.result} whatIf={whatIf.result} repayment={repayment} gbp={gbp} />}

      <ResultCard title={`Payments and balance${suffix}`}>
        <StatRow label="Payment now" value={gbp(baseline.paymentNow)} />
        {baseline.paymentAfterFixedEnd !== null && (
          <StatRow
            label="Payment after the fixed rate"
            value={gbp(overpaying.paymentAfterFixedEnd ?? ZERO)}
            detail={`Without overpaying: ${gbp(baseline.paymentAfterFixedEnd)}${overpaying.paymentAfterFixedEnd === null ? '. Overpaying clears the mortgage before then.' : ''}`}
          />
        )}
        {overpaying.balanceAtFixedEnd !== null && baseline.balanceAtFixedEnd !== null && (
          <StatRow
            label="Balance when the fixed rate ends"
            value={gbp(overpaying.balanceAtFixedEnd)}
            detail={`Without overpaying: ${gbp(baseline.balanceAtFixedEnd)}`}
          />
        )}
        {result.interestSavedToFixedEnd !== null && (
          <StatRow
            label="Interest saved while fixed"
            value={gbp(result.interestSavedToFixedEnd)}
            detail="Does not rest on the rate after the fixed rate."
          />
        )}
      </ResultCard>

      <Returns lines={returnLines(result, engine)} />

      <BalanceChart result={result} engine={engine} gbp={gbp} />
    </>
  )
}

/** Warnings at these inputs, shown in full, never collapsed or capped. */
function Warnings({ shown, fixed, gbp }: { shown: Ok; fixed: boolean; gbp: Gbp }) {
  const { result, inputs: engine } = shown
  const unused = unusedOverpayments(result, engine)
  const charged = overAllowance(result)
  const note = fixedRateNote(engine, fixed)
  const drift = drifts(result, engine)
  const notInterestOnly = result.warnings.some((w) => w.kind === 'effect-not-applicable')
  const last = result.baseline.payoffMonth
  return (
    <>
      {charged.length > 0 && (
        <div data-warning="over-allowance">
          <InlineNotice tone="warning" title="Over the penalty-free limit">
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {charged.map((year) => {
                const over = subtract(add(year.usedBefore, year.overpaid), year.allowance)
                return (
                  <li key={year.year}>
                    Allowance year {year.year} ({dateOf(engine, year.fromMonth)} to {dateOf(engine, year.toMonth)}): {gbp(over)} over the
                    limit of {gbp(year.allowance)}
                    {compare(year.usedBefore, ZERO) > 0 ? `, ${gbp(year.usedBefore)} of it already used` : ''}, so a charge of{' '}
                    {gbp(year.charged)}.
                  </li>
                )
              })}
            </ul>
            <p>The charge is paid on the day, from your pocket. Overpayments are never capped at the limit.</p>
          </InlineNotice>
        </div>
      )}
      {unused && (
        <div data-warning="unused">
          <InlineNotice tone="warning" title="Overpayment capped at the balance">
            <p>
              From {dateOf(engine, unused.firstMonth)}, {gbp(unused.total)} of the overpayments entered is not needed: it would take the
              balance below nothing. It is left out, and no charge is worked out on it.
            </p>
          </InlineNotice>
        </div>
      )}
      {drift && last !== null && (
        <div data-warning="drift">
          <InlineNotice tone="warning" title="Daily interest drift">
            <p>
              Without overpaying, the last payment is {gbp(result.baseline.rows[last - 1]!.payment)} against a regular{' '}
              {gbp(result.baseline.rows[last - 2]!.payment)}: this schedule drifts under daily interest, so treat the figures as
              approximate.
            </p>
          </InlineNotice>
        </div>
      )}
      {note === 'past-term' && (
        <div data-warning="fixed-past-term">
          <InlineNotice tone="info">
            <p>The fixed rate lasts to the end of the term, so the rate after it is not used.</p>
          </InlineNotice>
        </div>
      )}
      {note === 'already-ended' && (
        <div data-warning="fixed-ended">
          <InlineNotice tone="warning">
            <p>The fixed rate ends before the first payment, so the rate after it applies from the start.</p>
          </InlineNotice>
        </div>
      )}
      {notInterestOnly && (
        <div data-warning="effect">
          <InlineNotice tone="info">
            <p>
              Interest-only: overpaying lowers what is owed at the end and the interest. A shorter term or a lower payment does not apply.
            </p>
          </InlineNotice>
        </div>
      )}
    </>
  )
}

/** Your inputs beside the what-if, with the change (U41). */
function WhatIfResults({ base, whatIf, repayment, gbp }: { base: MortgageResult; whatIf: MortgageResult; repayment: boolean; gbp: Gbp }) {
  const moneyRow = (label: string, pick: (r: MortgageResult) => Money) => ({
    label,
    base: gbp(pick(base)),
    next: gbp(pick(whatIf)),
    change: formatGBPChange(subtract(pick(whatIf), pick(base)), 'pence'),
  })
  const months = whatIf.monthsSaved - base.monthsSaved
  const rows = [
    moneyRow('Interest saved', (r) => r.interestSaved),
    ...(repayment
      ? [
          {
            label: 'Term cut',
            base: yearsAndMonths(base.monthsSaved),
            next: yearsAndMonths(whatIf.monthsSaved),
            change: months === 0 ? 'No change' : `${months > 0 ? '+' : '−'}${yearsAndMonths(Math.abs(months))}`,
          },
        ]
      : [moneyRow('Owed at the end', (r) => r.overpaying.owedAtEnd)]),
    moneyRow('Total paid', (r) => r.overpaying.totalPaid),
    moneyRow('Early repayment charge paid', (r) => r.overpaying.totalErc),
  ]
  const cell = 'px-3 py-2 text-right tabular-nums'
  return (
    <section
      data-what-if-results
      aria-labelledby="mo-what-if-title"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="mo-what-if-title" className="text-base font-semibold text-text">
        Your inputs and your what-if
      </h2>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable). */}
      <section tabIndex={0} aria-label="Your inputs and your what-if, as a table" className="overflow-x-auto">
        <table className="w-full text-sm text-text">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                <span className="sr-only">Figure</span>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Your inputs
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                What if
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {row.label}
                </th>
                <td className={cell}>{row.base}</td>
                <td className={cell}>{row.next}</td>
                <td className={`${cell} font-medium`}>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}

/** One effective guaranteed return per rate period (MO9), each saying what it is measured against. */
function Returns({ lines }: { lines: readonly ReturnLine[] }) {
  return (
    <div data-returns>
      <ResultCard title="Guaranteed return of a pound overpaid">
        {lines.map((line) => (
          <StatRow
            key={line.period}
            label={line.period === 'fixed' ? 'While fixed' : 'After the fixed rate'}
            value={formatPercent(line.effective)}
            detail={`A year, effective; ${formatIsoDate(line.from)} to ${formatIsoDate(line.to)}. Measured against ${line.against.charAt(0).toLowerCase()}${line.against.slice(1)}`}
          />
        ))}
      </ResultCard>
    </div>
  )
}

function BalanceChart({ result, engine, gbp }: { result: MortgageResult; engine: MortgageInputs; gbp: Gbp }) {
  const chart = chartData(result, engine)
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <Chart
        title="Balance by year, without and with overpaying"
        categories={chart.categories}
        xValues={chart.xValues}
        series={chart.series}
        markers={chart.markers}
        xLabel="Year"
        yLabel="Balance owed"
        formatTick={(v) => formatGBPCompact(fromPence(v))}
        formatValue={(v) => gbp(fromPence(v))}
        formatXTick={(x) => (x === 0 ? START_LABEL : Number.isInteger(x) ? String(x) : x.toFixed(1))}
        integer
        includeZero
        pointMarkers={false}
      />
    </div>
  )
}

/** The engine's yearly rows: interest each way, overpaid, charges and the balance each way. Scrolls sideways; the year stays in view. */
function YearlyTable({ result, engine, gbp, whatIf }: { result: MortgageResult; engine: MortgageInputs; gbp: Gbp; whatIf: boolean }) {
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap'
  const head = 'px-3 py-2 text-right font-medium whitespace-nowrap'
  const title = `Year by year${whatIf ? ', with your what-if' : ''}`
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="mo-yearly-title" className="text-base font-semibold text-text">
        {title}
      </h2>
      <section
        aria-labelledby="mo-yearly-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
      >
        <table data-yearly-table className="w-full min-w-max border-collapse text-sm text-text">
          <caption className="sr-only">
            {title}: interest without and with overpaying, overpaid, early repayment charges, and the balance at each year’s end
          </caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                Year
              </th>
              <th scope="col" className={head}>
                Interest without
              </th>
              <th scope="col" className={head}>
                Interest overpaying
              </th>
              <th scope="col" className={head}>
                Overpaid
              </th>
              <th scope="col" className={head}>
                Charge
              </th>
              <th scope="col" className={head}>
                Balance without
              </th>
              <th scope="col" className={head}>
                Balance overpaying
              </th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((row) => (
              <tr key={row.year} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal whitespace-nowrap">
                  {row.year}
                  <span className="block text-xs text-text-muted">to {dateOf(engine, row.toMonth)}</span>
                </th>
                <td className={cell}>{gbp(row.baselineInterest)}</td>
                <td className={cell}>{gbp(row.overpayingInterest)}</td>
                <td className={cell}>{gbp(row.overpaid)}</td>
                <td className={cell}>{gbp(row.erc)}</td>
                <td className={cell}>{gbp(row.baselineClosing)}</td>
                <td className={cell}>{gbp(row.overpayingClosing)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong font-semibold">
              <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left">
                Total
              </th>
              <td className={cell}>{gbp(result.baseline.totalInterest)}</td>
              <td className={cell}>{gbp(result.overpaying.totalInterest)}</td>
              <td className={cell}>{gbp(result.overpaying.totalOverpaid)}</td>
              <td className={cell}>{gbp(result.overpaying.totalErc)}</td>
              <td className={cell}>{gbp(result.baseline.owedAtEnd)}</td>
              <td className={cell}>{gbp(result.overpaying.owedAtEnd)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <p className="text-xs text-text-muted">
        Years run twelve payments from the start date. Each year’s balance is what is owed after its last payment.
      </p>
    </div>
  )
}
