import { Link2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { DateInput, dateInWords } from '@/components/inputs/DateInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Select } from '@/components/inputs/Select'
import { Toggle } from '@/components/inputs/Toggle'
import { RangeBar } from '@/components/RangeBar'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { SETTLE_MS, StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { taxYearLabel } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
import { formatGBP, formatPercent } from '@/lib/format'
import { isIsoDate } from '@/lib/isoDate'
import { add, compare, type Money, ZERO } from '@/lib/money'
import { useStore } from '@/lib/store'
import { canonicalJson } from '@/lib/validate'
import { formatPage } from '@/pages/route'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { METHOD_LABELS, optimiserCalculator } from '../optimiser/definition'
import { configFor, sessionFor } from '../session'
import {
  AGE_LIMITS,
  AMOUNT_LIMITS,
  calculate,
  FIELD_LABELS,
  LEG_NAMES,
  type LegId,
  type NextPoundPageInputs,
  nextPoundCalculator,
  type PageOutcome,
  RATE_LIMITS,
  SECTION_TITLES,
  type SectionId,
  SOURCE_LABELS,
  sectionSet,
  sectionSummary,
  YEAR_LIMITS,
} from './definition'
import {
  type BarRow,
  BREAK_EVEN_HEADING,
  barRows,
  breakEvenBox,
  calloutFacts,
  calloutText,
  headlineParts,
  headlineText,
  LEG_ORDER,
  legLine,
  stickyLines,
} from './screen'
import {
  MORTGAGE_ID,
  type MortgageResolved,
  mortgageOptions,
  mortgageRef,
  optionValue,
  type PayResolved,
  payOptions,
  payRef,
  type SourceContext,
  TAKE_HOME_ID,
  withSources,
} from './sources'
import { GROWTH_CASES, type NextPoundWarning } from './types'

/*
 * The next pound page at #/c/next-pound, rebuilt as a decision panel (the C2
 * page rebuild) on the C1 composer: "Where does the next £X go?". The person
 * types three things (the lump sum, the years, their age); pay and pension
 * come from a saved take-home scenario or the take-home page's inputs this
 * visit, and the mortgage from a saved mortgage scenario, each with a picker
 * (sources.ts, read only: nothing here writes to another page's scenarios or
 * inputs). The rest sits in closed sections, none of it required.
 *
 * The result is a plain sentence, three bars in a fixed order on one scale
 * with their ranges, what only this page tells you, and the break-even box
 * (screen.ts builds every sentence from the composer's numbers). Nothing is
 * ranked, called best or recommended, and nothing says what anyone ought to
 * do. The composer runs once the inputs settle (SETTLE_MS): a run takes tens
 * of milliseconds (docs/performance.md).
 */

const session = sessionFor(nextPoundCalculator)
const takeHome = sessionFor(optimiserCalculator)

type Gbp = (amount: Money) => string
type Ok = Extract<PageOutcome, { kind: 'ok' }>

const TAKE_HOME_HREF = formatPage({ kind: 'calculator', id: TAKE_HOME_ID })
const MORTGAGE_HREF = formatPage({ kind: 'calculator', id: MORTGAGE_ID })

/** The convention behind each input, in words. No figures. */
const HINTS = {
  lumpSum: 'Take-home pay you could put in one place now. Each place spends all of it.',
  horizonYears: 'Whole years from now to when each is measured.',
  ageNow: 'In whole years, for when the pension can be taken. Optional: without it the access age isn’t checked.',
  asOf: 'Usually today. The pension access age is checked on this date plus the years.',
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
} as const

/** What the page adds to the composer's assumptions. No figures. */
const PAGE_ASSUMPTIONS = [
  'Page reading (C2 rebuild): your pay and pension are a saved take-home scenario or the take-home page’s inputs this visit, and the mortgage a saved mortgage scenario without its own overpayments: the lump sum is the one overpayment. This page reads them and never changes them.',
  'Page reading (C2 rebuild): by default the pay is the take-home page’s inputs this visit if they have pay, else the take-home scenario saved last; the mortgage is the mortgage scenario saved last, else none.',
  'Page reading (C2 rebuild): the headline, the bars and the sticky result show the mid growth rate in today’s money; the lines under the bars and the table show the low and high cases, and the table nominal too. The bars share one scale, set by the largest high case.',
  'Page reading (C2 rebuild): the break-even box shows the lower end of the composer’s break-even bracket, rounded down to one place, as “about”.',
  'Page reading (C2 rebuild): without your age the pension is shown with its numbers and the access age isn’t checked.',
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
 * calculate() once the inputs have stopped changing for SETTLE_MS (the first run at once): one run is tens of
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

/** Today's date from the device clock (the page may read it; the composer never does). */
function today() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return isIsoDate(date) ? date : null
}

/** Saved scenarios and the take-home page's inputs this visit: where the pay and the mortgage come from. Read only. */
function useSourceContext(): SourceContext {
  const scenarios = useStore(scenarioStore, (s) => s.scenarios)
  const other = useStore(takeHome)
  return { scenarios, takeHome: { inputs: other.inputs, loadedId: other.loadedId, taxYear: other.taxYear } }
}

/**
 * Keeps this page's inputs in step with their sources: the most recent made
 * concrete, a picked scenario's latest inputs, the pay's tax year, and a
 * fresh page's date as today. Writes only to this page's own session.
 */
function useSync(context: SourceContext, revision: number) {
  const key = canonicalJson([context, session.get().inputs.paySource, session.get().inputs.mortgageSource, revision])
  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands for the sources, the picks and the revision.
  useEffect(() => {
    const now = session.get()
    const next = withSources(now.inputs, context)
    const { pay, paySource, mortgage, mortgageSource } = next.inputs
    const patch: Partial<NextPoundPageInputs> = {
      ...(canonicalJson(next.inputs) === canonicalJson(now.inputs) ? {} : { pay, paySource, mortgage, mortgageSource }),
      ...(now.inputs.asOf === null ? { asOf: today() } : {}),
    }
    if (Object.keys(patch).length > 0) session.setInputs(patch)
    if (next.taxYear !== null && next.taxYear !== now.taxYear) session.setTaxYear(next.taxYear)
  }, [key])
}

export default function NextPoundPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const context = useSourceContext()
  useSync(context, state.revision)
  const resolved = withSources(state.inputs, context)
  const inputs = resolved.inputs
  const config = configFor(resolved.taxYear ?? state.taxYear)
  const invalid = state.invalid.length > 0
  const { outcome, stale } = useOutcome(invalid ? null : inputs, config)
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)
  const shown = invalid ? null : outcome
  const ok = shown?.kind === 'ok' ? shown : null
  const years = `${inputs.horizonYears} year${inputs.horizonYears === 1 ? '' : 's'}`
  const label = `In ${years}, mid rate, today’s money`
  const lines = ok && !stale ? stickyLines(ok, gbp) : null
  const value = lines === null ? null : lines.join('\n')
  const emptyText = invalid
    ? 'Fix the highlighted inputs'
    : shown === null || stale
      ? 'Working out…'
      : shown.kind === 'needs'
        ? `Enter ${shown.refusal.problems.map((p) => p.label.toLowerCase()).join(', ')}`
        : 'No result for these inputs'

  return (
    <div className="flex flex-col gap-6">
      <StickyResult
        label={label}
        value={value}
        emptyText={emptyText}
        announcement={lines === null ? null : `${label}: ${lines.join(', ')}`}
        controls={
          <div className="flex">
            <VerifiedBadge config={config} />
          </div>
        }
        results={<Explanations outcome={ok} stale={stale} inputs={inputs} config={config} gbp={gbp} />}
      >
        <TopCard
          key={state.revision}
          inputs={inputs}
          invalidFields={state.invalid}
          outcome={shown}
          stale={stale}
          invalid={invalid}
          pay={resolved.pay}
          mortgage={resolved.mortgage}
          context={context}
          gbp={gbp}
        />
        <ScenarioBar calculator={nextPoundCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Sections key={state.revision} inputs={inputs} invalidFields={state.invalid} />
      </StickyResult>

      <AssumptionsPanel items={[...(ok ? ok.result.assumptions : []), ...PAGE_ASSUMPTIONS]}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

/* The top card: the title, where the pay comes from, the four tiles, the headline and the bars. */

const set = (patch: Partial<NextPoundPageInputs>) => session.setInputs(patch)
const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)

function TopCard({
  inputs,
  invalidFields,
  outcome,
  stale,
  invalid,
  pay,
  mortgage,
  context,
  gbp,
}: {
  inputs: NextPoundPageInputs
  invalidFields: readonly string[]
  outcome: PageOutcome | null
  stale: boolean
  invalid: boolean
  pay: PayResolved
  mortgage: MortgageResolved
  context: SourceContext
  gbp: Gbp
}) {
  const title = compare(inputs.lumpSum, ZERO) > 0 ? `Where does the next ${gbp(inputs.lumpSum)} go?` : nextPoundCalculator.name
  return (
    <section aria-labelledby="main-title" className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none [overflow-wrap:anywhere]">
          {title}
        </h1>
        <PaySourceLine inputs={inputs} pay={pay} context={context} gbp={gbp} />
      </div>
      <Tiles inputs={inputs} invalidFields={invalidFields} mortgage={mortgage} context={context} gbp={gbp} />
      <hr className="border-border" />
      <Answer outcome={outcome} stale={stale} invalid={invalid} gbp={gbp} />
    </section>
  )
}

/** "Using your pay from take-home: £X, salary sacrifice", or the prompt to enter it there first. */
function PaySourceLine({ inputs, pay, context, gbp }: { inputs: NextPoundPageInputs; pay: PayResolved; context: SourceContext; gbp: Gbp }) {
  const [picking, setPicking] = useState(false)
  const options = payOptions(inputs, context)
  if (pay.state === 'empty')
    return (
      <p data-pay-prompt className="flex items-start gap-2 text-sm text-text-muted">
        <Link2 aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <a href={TAKE_HOME_HREF} className="font-medium text-accent underline underline-offset-2">
          Enter your pay on the take-home page first
        </a>
      </p>
    )
  const p = pay.pay
  const from =
    pay.ref.kind === 'session'
      ? 'Using your pay from take-home'
      : pay.ref.kind === 'scenario' && pay.state === 'live'
        ? `Using your pay from “${pay.ref.name}”`
        : 'Using the pay saved with this scenario'
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p data-pay-source className="text-sm text-text-muted [overflow-wrap:anywhere]">
        <Link2 aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />
        {from}: {gbp(add(p.salary, p.bonus))}, {METHOD_LABELS[p.pensionMethod].toLowerCase()}{' '}
        <button
          type="button"
          aria-expanded={picking}
          aria-controls="np-pay-picker"
          onClick={() => setPicking(!picking)}
          className="inline-flex min-h-touch items-center px-1 font-medium text-accent underline underline-offset-2"
        >
          Change
        </button>
      </p>
      {pay.notice && (
        <p data-source-notice className="text-sm text-text">
          {pay.notice}
        </p>
      )}
      {picking && (
        <div id="np-pay-picker" className="flex min-w-0 flex-col gap-2">
          <Select
            id="np-pay-source"
            label={SOURCE_LABELS.pay}
            hint="Saved take-home scenarios, newest first. This page reads them and never changes them."
            value={optionValue(inputs.paySource)}
            options={options}
            onChange={(value) => {
              const ref = payRef(value, context)
              if (ref) set({ paySource: ref })
            }}
          />
          <a href={TAKE_HOME_HREF} className="inline-flex min-h-touch items-center self-start text-sm font-medium text-accent underline">
            Change your pay on the take-home page
          </a>
        </div>
      )}
    </div>
  )
}

type TileName = 'lumpSum' | 'horizonYears' | 'ageNow' | 'mortgage'

const TILE_FIELDS: Record<TileName, string> = {
  lumpSum: 'np-lump-sum',
  horizonYears: 'np-horizon',
  ageNow: 'np-age',
  mortgage: 'np-mortgage-source',
}

/** The four tiles: compact, each opening to its normal field on tap; a tile with text that isn't valid stays open. */
function Tiles({
  inputs,
  invalidFields,
  mortgage,
  context,
  gbp,
}: {
  inputs: NextPoundPageInputs
  invalidFields: readonly string[]
  mortgage: MortgageResolved
  context: SourceContext
  gbp: Gbp
}) {
  const [open, setOpen] = useState<readonly TileName[]>([])
  const [focusOn, setFocusOn] = useState<TileName | null>(null)
  useEffect(() => {
    if (focusOn === null) return
    document.getElementById(TILE_FIELDS[focusOn])?.focus()
    setFocusOn(null)
  }, [focusOn])
  const close = (name: TileName) => {
    if (name !== 'mortgage' && invalidFields.includes(name)) return
    setOpen((was) => was.filter((n) => n !== name))
  }
  const tile = (name: TileName, label: string, shown: ReactNode, field: ReactNode) =>
    open.includes(name) ? (
      // biome-ignore lint/a11y/noStaticElementInteractions: focus leaving the field inside closes the tile; the wrapper itself takes no input.
      <div
        data-tile={name}
        className="col-span-2 flex min-w-0 flex-col gap-2 rounded-md border border-border-strong bg-surface p-3"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(name)
        }}
      >
        {field}
        <Button variant="ghost" className="h-auto min-h-touch self-end border border-border py-2" onClick={() => close(name)}>
          Done
        </Button>
      </div>
    ) : (
      <div data-tile={name} className="min-w-0">
        <button
          id={`np-tile-${name}`}
          type="button"
          aria-expanded={false}
          onClick={() => {
            setOpen((was) => [...was, name])
            setFocusOn(name)
          }}
          className="flex min-h-touch w-full min-w-0 flex-col items-start gap-1 rounded-md border border-border bg-surface-muted p-3 text-left hover:border-border-strong"
        >
          <span className="text-xs text-text-muted">{label}</span>
          {shown}
        </button>
      </div>
    )
  const big = (text: string) => <span className="text-lg font-semibold text-text tabular-nums [overflow-wrap:anywhere]">{text}</span>
  const position = mortgage.position
  const mortgageShown = (
    <>
      {big(
        position
          ? `Saved: ${position.index} of ${position.count}`
          : mortgage.state === 'kept'
            ? 'Saved here'
            : mortgage.state === 'missing'
              ? 'No longer saved'
              : 'No mortgage',
      )}
      {mortgage.ref.kind === 'scenario' && <span className="text-xs text-text-muted [overflow-wrap:anywhere]">{mortgage.ref.name}</span>}
      <span className="text-xs font-medium text-accent">Pick</span>
    </>
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {tile(
          'lumpSum',
          FIELD_LABELS.lumpSum,
          big(gbp(inputs.lumpSum)),
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
          />,
        )}
        {tile(
          'horizonYears',
          'Years',
          big(`${inputs.horizonYears}`),
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
          />,
        )}
        {tile(
          'ageNow',
          'Your age',
          big(inputs.ageNow === null ? 'Add' : `${inputs.ageNow}`),
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
          />,
        )}
        {tile(
          'mortgage',
          'Mortgage',
          mortgageShown,
          <>
            <Select
              id="np-mortgage-source"
              label={SOURCE_LABELS.mortgage}
              hint="Saved mortgage scenarios, newest first, without their own overpayments. This page reads them and never changes them."
              value={mortgage.ref.kind === 'auto' ? 'none' : optionValue(mortgage.ref)}
              options={mortgageOptions(inputs, context)}
              onChange={(value) => {
                const ref = mortgageRef(value, context)
                if (ref) set({ mortgageSource: ref })
              }}
            />
            <a href={MORTGAGE_HREF} className="inline-flex min-h-touch items-center self-start text-sm font-medium text-accent underline">
              Set up or change a mortgage on the mortgage page
            </a>
          </>,
        )}
      </div>
      {mortgage.notice && (
        <p data-source-notice className="text-sm text-text">
          {mortgage.notice}
        </p>
      )}
    </div>
  )
}

/* The answer: the headline sentence and the three bars. */

function Answer({ outcome, stale, invalid, gbp }: { outcome: PageOutcome | null; stale: boolean; invalid: boolean; gbp: Gbp }) {
  if (invalid)
    return (
      <InlineNotice tone="warning" title="No results until the inputs are fixed">
        <p>Fix the highlighted inputs to see results.</p>
      </InlineNotice>
    )
  if (outcome === null)
    return (
      <p role="status" className="text-sm text-text-muted">
        Working out…
      </p>
    )
  if (outcome.kind !== 'ok') return <RefusalNotice refusal={outcome.refusal} />
  return (
    <div data-np-results aria-busy={stale} className="flex min-w-0 flex-col gap-4">
      <p role="status" className="sr-only">
        {stale ? 'Updating for your changes…' : ''}
      </p>
      <p data-headline className="text-base text-text">
        {headlineText(headlineParts(outcome), gbp)}
      </p>
      <Bars outcome={outcome} gbp={gbp} />
    </div>
  )
}

/** Three chart colours from the shared palette (Chart's accent, secondary and neutral): no danger, nothing gold, no ranking. */
const BAR_FILLS: Record<LegId, string> = { pension: 'fill-accent', mortgage: 'fill-swatch-teal', isa: 'fill-text-muted' }

function Bars({ outcome, gbp }: { outcome: Ok; gbp: Gbp }) {
  const { rows } = barRows(outcome)
  const [table, setTable] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ul aria-label="What each adds at the horizon, mid rate, today’s money" className="flex min-w-0 flex-col gap-4">
        {rows.map((row) => (
          <BarItem key={row.leg} row={row} outcome={outcome} gbp={gbp} />
        ))}
      </ul>
      <Button
        variant="ghost"
        aria-expanded={table}
        aria-controls="np-table"
        className="h-auto min-h-touch self-start border border-border py-2"
        onClick={() => setTable(!table)}
      >
        {table ? 'Hide the table' : 'Show the data as a table'}
      </Button>
      {table && <DataTable outcome={outcome} gbp={gbp} />}
    </div>
  )
}

function BarItem({ row, outcome, gbp }: { row: BarRow; outcome: Ok; gbp: Gbp }) {
  const view = outcome[row.leg]
  const line = legLine(outcome, row.leg, gbp)
  const refusal = (view.kind === 'refused' || (view.kind === 'needs' && row.leg !== 'pension')) && view.refusal
  return (
    <li data-bar={row.leg} data-mid-share={row.midShare} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-text">{row.label}</span>
        {row.badge === 'guaranteed' && (
          <span data-badge="guaranteed" className="rounded-full border border-swatch-teal px-2 text-xs font-medium text-swatch-teal">
            Guaranteed
          </span>
        )}
        {row.mid && (
          <span data-bar-value className="ml-auto text-sm font-semibold text-text tabular-nums">
            {gbp(row.mid.todaysMoney)}
          </span>
        )}
      </div>
      {row.mid && view.kind !== 'nothing' && (
        <RangeBar share={row.midShare} low={row.lowShare} high={row.low ? row.highShare : null} fill={BAR_FILLS[row.leg]} />
      )}
      {line && (
        <p data-leg-line className="text-xs text-text-muted [overflow-wrap:anywhere]">
          {line}
        </p>
      )}
      {view.kind === 'nothing' && <p className="text-xs text-text-muted">Nothing: the lump sum is nothing</p>}
      {row.state && (
        <p data-bar-state className="text-sm text-text-muted [overflow-wrap:anywhere]">
          {row.state}
          {view.kind === 'none' && (
            <>
              {': '}
              <a href={MORTGAGE_HREF} className="font-medium text-accent underline underline-offset-2">
                set one up on the mortgage page
              </a>
            </>
          )}
          {view.kind === 'needs' && row.leg === 'pension' && (
            <>
              {' '}
              <a href={TAKE_HOME_HREF} className="font-medium text-accent underline underline-offset-2">
                Go to the take-home page
              </a>
            </>
          )}
        </p>
      )}
      {refusal && <RefusalNotice refusal={refusal} heading="h3" />}
    </li>
  )
}

/** Every figure the bars and lines show, today's money and nominal, in a focusable region that scrolls when wide. */
function DataTable({ outcome, gbp }: { outcome: Ok; gbp: Gbp }) {
  type Row = { key: string; leg: string; detail: string; today: string; nominal: string }
  const rows: Row[] = LEG_ORDER.flatMap((leg): Row[] => {
    const view = outcome[leg]
    const name = LEG_NAMES[leg]
    if (view.kind === 'shown' && 'rates' in view.leg) {
      const rates = view.leg.rates
      return GROWTH_CASES.map((c) => ({
        key: `${leg}-${c}`,
        leg: name,
        detail: `${c === 'low' ? 'Low' : c === 'mid' ? 'Mid' : 'High'}, ${formatPercent(rates[c].growthRate)} a year`,
        today: gbp(rates[c].value.todaysMoney),
        nominal: gbp(rates[c].value.nominal),
      }))
    }
    if (view.kind === 'shown' && 'value' in view.leg)
      return [{ key: leg, leg: name, detail: 'Guaranteed', today: gbp(view.leg.value.todaysMoney), nominal: gbp(view.leg.value.nominal) }]
    if (view.kind === 'nothing') return [{ key: leg, leg: name, detail: 'Nothing', today: gbp(ZERO), nominal: gbp(ZERO) }]
    const state = barRows(outcome).rows.find((r) => r.leg === leg)?.state ?? 'No result'
    return [{ key: leg, leg: name, detail: state, today: '', nominal: '' }]
  })
  return (
    // A table wider than its card scrolls sideways in a region that can be focused (axe scrollable-region-focusable), as SplitBar's.
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this names a scrolling table.
    <div
      id="np-table"
      role="group"
      aria-label="The data as a table"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable.
      tabIndex={0}
      className="min-w-0 overflow-x-auto"
    >
      <table data-np-table className="w-full text-left text-sm">
        <caption className="sr-only">What each adds at the horizon, today’s money and nominal</caption>
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Place
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Case
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Today’s money
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Nominal
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 font-medium">
                {r.leg}
              </th>
              <td className="py-2 pr-3 text-text-muted">{r.detail}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.today}</td>
              <td className="py-2 text-right tabular-nums">{r.nominal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Beside the answer: what only this page tells you, the break-even box, warnings and the footer note. */

function Explanations({
  outcome,
  stale,
  inputs,
  config,
  gbp,
}: {
  outcome: Ok | null
  stale: boolean
  inputs: NextPoundPageInputs
  config: TaxYearConfig
  gbp: Gbp
}) {
  const facts = outcome ? calloutFacts(outcome) : null
  return (
    <div aria-busy={stale} className="flex min-w-0 flex-col gap-4">
      {facts && (
        <section data-callout aria-labelledby="np-callout" className="flex flex-col gap-1 rounded-lg bg-accent-subtle p-4">
          <h2 id="np-callout" className="text-sm font-semibold text-text">
            What only this page tells you
          </h2>
          <p className="text-sm text-text">{calloutText(facts, gbp)}</p>
        </section>
      )}
      {outcome && <BreakEven outcome={outcome} />}
      {outcome && <Warnings warnings={outcome.warnings} gbp={gbp} />}
      <div data-footnote className="flex flex-col gap-2 text-xs text-text-muted">
        <p>
          Growth rates are illustrative: {formatPercentOf(inputs.growthLow)}, {formatPercentOf(inputs.growthMid)} and{' '}
          {formatPercentOf(inputs.growthHigh)} a year, set under {SECTION_TITLES.growth.toLowerCase()}. Figures are in today’s money at the
          mid rate unless the table says nominal. Tax rules for the {taxYearLabel(config.id)} tax year.
        </p>
        <div className="flex">
          <VerifiedBadge config={config} />
        </div>
      </div>
    </div>
  )
}

const formatPercentOf = (text: string) => `${text}%`

function BreakEven({ outcome }: { outcome: Ok }) {
  const box = breakEvenBox(outcome)
  return (
    <section
      data-break-even
      aria-labelledby="np-break-even"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4"
    >
      <h2 id="np-break-even" className="text-sm font-semibold text-text">
        {BREAK_EVEN_HEADING}
      </h2>
      {box.lines.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-text">
          {box.lines.map((l) => (
            <li key={l.against} data-break-even-line={l.against} className="tabular-nums">
              {l.text}
            </li>
          ))}
        </ul>
      )}
      {box.omitted.map((o) => (
        <p key={o.against} data-break-even-omitted={o.against} className="text-xs text-text-muted">
          {o.reason}
        </p>
      ))}
      {box.reversionNote && (
        <p data-reversion-note className="text-xs text-text">
          {box.reversionNote}
        </p>
      )}
    </section>
  )
}

function Warnings({ warnings, gbp }: { warnings: Ok['warnings']; gbp: Gbp }) {
  const legs = LEG_ORDER.filter((id) => warnings[id].length > 0)
  if (legs.length === 0) return null
  return (
    <section
      aria-labelledby="np-warnings"
      data-warnings
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="np-warnings" className="text-sm font-semibold">
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

/* The sections: everything else, closed on load unless set, none of it required. */

function Sections({ inputs, invalidFields }: { inputs: NextPoundPageInputs; invalidFields: readonly string[] }) {
  const ids: SectionId[] = ['growth', 'pension', 'isa', 'date']
  const now = today()
  const [openOnMount] = useState(() => new Set(ids.filter((id) => sectionSet(id, inputs, now))))
  const section = (id: SectionId, children: ReactNode) => (
    <Section
      id={`np-section-${id}`}
      title={SECTION_TITLES[id]}
      summary={sectionSummary(id, inputs, invalidFields, now)}
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
  return (
    <>
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
        'pension',
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
            label="Other pensions use my lump sum allowance"
            hint={HINTS.otherPensionsUseAllowance}
            checked={inputs.otherPensionsUseAllowance}
            onChange={(otherPensionsUseAllowance) => set({ otherPensionsUseAllowance })}
          />
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
      {section(
        'date',
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
              session.setFieldValid('asOf', true)
              set({ asOf: today() })
            }}
          >
            Use today’s date
          </Button>
        </div>,
      )}
    </>
  )
}
