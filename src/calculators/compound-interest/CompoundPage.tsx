import { type ReactNode, useMemo, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Chart } from '@/components/Chart/Chart'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { NoTaxRulesBadge } from '@/components/NoTaxRulesBadge'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { formatGBP, formatGBPCompact, formatPercent } from '@/lib/format'
import { fromPence, type Money } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { sessionFor } from '../session'
import { effectiveAnnualRate } from './calc'
import {
  AMOUNT_LIMITS,
  COMPOUNDING_FREQUENCIES,
  CONTRIBUTION_FREQUENCIES,
  type CompoundPageInputs,
  calculate,
  compoundCalculator,
  FIELD_LABELS,
  FREQUENCY_LABELS,
  inputRefusal,
  RATE_LIMITS,
  type SectionId,
  sectionSet,
  sectionSummary,
  TIMINGS,
  YEAR_LIMITS,
} from './definition'
import { chartData, paidIn, projectionFor, START_LABEL, VIEW_LABELS, VIEWS, type View } from './results'
import type { CompoundResult, Projection } from './types'

/*
 * The compound interest page (slice 2b) at #/c/compound-interest, on the 2a
 * engine, laid out as docs/ui-patterns.md: "Your savings" always visible,
 * growth and costs and the over-time inputs in sections with live summaries,
 * and results first (StickyResult): the final balance in the chosen view
 * (nominal or today's money), paid in, growth and fees, what the fee costs,
 * the rates, a chart by year, then the engine's yearly rows as a table. Uses
 * no tax rules, so "Uses no tax rules" stands where the verified badge
 * would. Every figure is the engine's (./calc.ts) through ./results.ts; the
 * page writes none and does no arithmetic on money.
 */

const session = sessionFor(compoundCalculator)

type Gbp = (amount: Money) => string

const VIEW_OPTIONS = VIEWS.map((value) => ({ value, label: VIEW_LABELS[value] }))
const CONTRIBUTION_OPTIONS = CONTRIBUTION_FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))
const COMPOUNDING_OPTIONS = COMPOUNDING_FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))
const TIMING_OPTIONS = TIMINGS.map((value) => ({ value, label: value === 'start' ? 'Start' : 'End' }))

const HEADLINE_LABELS: Record<View, string> = { nominal: 'Final balance', real: 'Final balance in today’s money' }

/** The convention behind each input, in words (decisions C1 to C5). No figures. */
const HINTS = {
  lumpSum: 'Paid in once, at the start of the first year.',
  contribution: 'Paid in every period from the first. Nothing for none.',
  contributionFrequency: 'How often you pay in.',
  timing: 'A contribution at the start of a period earns that period’s growth; one at the end starts earning from the next period.',
  years: 'Whole years to look ahead.',
  growthRate:
    'A nominal annual rate, added at the compounding frequency below. It can be negative. Each period grows at the equivalent rate, so a whole year grows at the effective annual rate.',
  compounding: 'How often growth is added. More often gives a higher effective annual rate for the same nominal rate.',
  feeRate: 'A percentage of the balance a year, charged each compounding period on the balance after that period’s growth.',
  contributionIncrease: 'Each year’s contributions are the year before’s plus this percentage.',
  inflationRate:
    'For today’s money: each amount is divided by inflation compounded to when it is paid in or reached, not by taking inflation off the growth rate.',
} as const

/** What the page adds to the engine's assumptions. No figures. */
const PAGE_ASSUMPTIONS = [
  'Returns are assumed steady: the same rate in every year. Real returns vary from year to year and can be negative, so this is an illustration, not a forecast.',
  'The Nominal / Today’s money switch shows the headline, the rows, the chart and the yearly table in that view. Today’s money is in prices at the start of the first year.',
  'The yearly table is the engine’s own rows: each year’s opening balance, paid in and growth, less fees, make its closing balance, and the years add up to the totals.',
  'Uses no tax rules: no income tax, tax on savings or investments, ISA or pension rules apply, and nothing here depends on the tax rules of any year.',
]

const SECTION_TITLES: Record<SectionId, string> = { growth: 'Growth and costs', time: 'Over time' }

export default function CompoundPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const invalid = state.invalid.length > 0
  // The slowest run (a century of weekly steps with daily compounding) is the engine's; redo it only when inputs change.
  const outcome = useMemo(() => (invalid ? null : calculate(inputs)), [invalid, inputs])
  const [view, setView] = useState<View>('nominal')
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)
  const result = outcome?.ok ? outcome.result : null
  const label = HEADLINE_LABELS[view]
  const value = result ? gbp(projectionFor(result, view).closing) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {compoundCalculator.name}
        </h1>
        <p className="text-text-muted">{compoundCalculator.summary}</p>
        {/* On a phone the badge is in the sticky bar instead. */}
        <div className="hidden md:flex">
          <NoTaxRulesBadge />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={invalid ? 'Fix the highlighted inputs' : 'No result for these inputs'}
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <>
            <Segmented id="ci-view-bar" label="Show amounts" value={view} options={VIEW_OPTIONS} onChange={setView} />
            <div className="flex">
              <NoTaxRulesBadge />
            </div>
          </>
        }
        results={
          outcome === null ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : outcome.ok ? (
            <Results result={outcome.result} inputs={inputs} view={view} setView={setView} gbp={gbp} />
          ) : (
            <RefusalNotice refusal={inputRefusal(outcome.problems)} />
          )
        }
      >
        <ScenarioBar calculator={compoundCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Inputs key={state.revision} inputs={inputs} invalidFields={state.invalid} />
      </StickyResult>

      {result && <YearlyTable projection={projectionFor(result, view)} view={view} gbp={gbp} />}

      <AssumptionsPanel items={[...new Set([...(result ? result.assumptions : []), ...PAGE_ASSUMPTIONS])]}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

const valid = (field: keyof CompoundPageInputs) => (ok: boolean) => session.setFieldValid(field, ok)
const set = (patch: Partial<CompoundPageInputs>) => session.setInputs(patch)

/** The growth input's effective annual rate, from the engine (C2); nothing while the rate or compounding is being fixed. */
function EffectiveRate({ inputs, invalidFields }: { inputs: CompoundPageInputs; invalidFields: readonly string[] }) {
  const pending = invalidFields.includes('growthRate')
  return (
    <p data-effective-rate className="text-sm text-text">
      Effective annual rate:{' '}
      <span className="font-medium tabular-nums">
        {pending
          ? 'not until the growth rate is fixed'
          : formatPercent(effectiveAnnualRate(percentRatio(inputs.growthRate), inputs.compounding))}
      </span>
    </p>
  )
}

/**
 * The inputs: "Your savings" always visible, then a section each (U1 to U3), open on mount when its inputs differ from
 * the defaults. Remounted (by key) on a load or a fresh start, so the open sections follow the inputs; never stored.
 */
function Inputs({ inputs, invalidFields }: { inputs: CompoundPageInputs; invalidFields: readonly string[] }) {
  const [openOnMount] = useState(() => ({ growth: sectionSet('growth', inputs), time: sectionSet('time', inputs) }))
  const rateInput = (id: string, field: keyof typeof RATE_LIMITS) => (
    <PercentInput
      id={id}
      label={FIELD_LABELS[field]}
      hint={HINTS[field]}
      value={inputs[field]}
      min={RATE_LIMITS[field].min}
      max={RATE_LIMITS[field].max}
      maxDecimals={RATE_LIMITS[field].maxDecimals}
      onChange={(value) => set({ [field]: value })}
      onValidityChange={valid(field)}
    />
  )
  const section = (id: SectionId, children: ReactNode) => (
    <Section
      id={`ci-section-${id}`}
      title={SECTION_TITLES[id]}
      summary={sectionSummary(id, inputs, invalidFields)}
      defaultOpen={openOnMount[id]}
    >
      {children}
    </Section>
  )
  return (
    <>
      <section
        aria-labelledby="ci-your-savings"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="ci-your-savings" className="text-base font-semibold">
          Your savings
        </h2>
        {(['lumpSum', 'contribution'] as const).map((field) => (
          <CurrencyInput
            key={field}
            id={field === 'lumpSum' ? 'ci-lump-sum' : 'ci-contribution'}
            label={FIELD_LABELS[field]}
            hint={HINTS[field]}
            value={inputs[field]}
            min={AMOUNT_LIMITS.min}
            max={AMOUNT_LIMITS.max}
            onChange={(value) => set({ [field]: value })}
            onValidityChange={valid(field)}
          />
        ))}
        <Select
          id="ci-frequency"
          label={FIELD_LABELS.contributionFrequency}
          hint={HINTS.contributionFrequency}
          value={inputs.contributionFrequency}
          options={CONTRIBUTION_OPTIONS}
          onChange={(contributionFrequency) => set({ contributionFrequency })}
        />
        <Segmented
          id="ci-timing"
          label="Paid in at the start or end of each period"
          hint={HINTS.timing}
          value={inputs.timing}
          options={TIMING_OPTIONS}
          onChange={(timing) => set({ timing })}
        />
        <NumberInput
          id="ci-years"
          label={FIELD_LABELS.years}
          hint={HINTS.years}
          value={inputs.years}
          min={YEAR_LIMITS.min}
          max={YEAR_LIMITS.max}
          suffix="years"
          onChange={(years) => set({ years })}
          onValidityChange={valid('years')}
        />
      </section>
      {section(
        'growth',
        <>
          {rateInput('ci-growth', 'growthRate')}
          <Select
            id="ci-compounding"
            label={FIELD_LABELS.compounding}
            hint={HINTS.compounding}
            value={inputs.compounding}
            options={COMPOUNDING_OPTIONS}
            onChange={(compounding) => set({ compounding })}
          />
          <EffectiveRate inputs={inputs} invalidFields={invalidFields} />
          {rateInput('ci-fee', 'feeRate')}
        </>,
      )}
      {section(
        'time',
        <>
          {rateInput('ci-increase', 'contributionIncrease')}
          {rateInput('ci-inflation', 'inflationRate')}
        </>,
      )}
    </>
  )
}

const otherView = (view: View): View => (view === 'nominal' ? 'real' : 'nominal')
const inView = (view: View) => (view === 'nominal' ? 'in pounds of the day' : 'in today’s money')

/** The results column (U6): the headline with the view switch and the caveat, what the fee costs, the rates, the chart. */
function Results({
  result,
  inputs,
  view,
  setView,
  gbp,
}: {
  result: CompoundResult
  inputs: CompoundPageInputs
  view: View
  setView: (view: View) => void
  gbp: Gbp
}) {
  const projection = projectionFor(result, view)
  const other = otherView(view)
  const chart = chartData(result, view)
  return (
    <>
      <div className="flex flex-col gap-3">
        <Segmented id="ci-view" label="Show amounts" value={view} options={VIEW_OPTIONS} onChange={setView} />
        <ResultCard
          title={`After ${inputs.years === 1 ? 'one year' : `${inputs.years} years`}`}
          headline={gbp(projection.closing)}
          headlineLabel={`${HEADLINE_LABELS[view]}, with the fee`}
        >
          <StatRow
            label="Paid in"
            value={gbp(paidIn(projection))}
            detail={`Lump sum ${gbp(projection.lumpSum)} and contributions ${gbp(projection.contributions)}`}
          />
          <StatRow label="Growth" value={gbp(projection.growth)} detail={view === 'real' ? 'After the loss to inflation' : undefined} />
          <StatRow label="Fees" value={gbp(projection.fees)} />
        </ResultCard>
        <div data-caveat>
          <InlineNotice tone="info">
            <p>
              This assumes the same steady return every year. Real returns vary and can be negative: it is an illustration, not a forecast.
            </p>
          </InlineNotice>
        </div>
      </div>

      <ResultCard title="What the fee costs">
        <StatRow label="Without the fee" value={gbp(result.noFee[view].closing)} />
        <StatRow label="With the fee" value={gbp(projection.closing)} />
        <StatRow
          label="Fee drag"
          value={gbp(result.feeDrag[view])}
          detail={`${gbp(result.feeDrag[other])} ${other === 'real' ? 'in today’s money' : 'in pounds of the day'}. The fees and the growth they would have earned.`}
        />
      </ResultCard>

      <ResultCard title="Rates">
        <StatRow label="Effective annual rate" value={formatPercent(result.effectiveAnnualRate)} detail="Growth before fees" />
        <StatRow label="After fees" value={formatPercent(result.effectiveAnnualRateAfterFees)} />
        <StatRow
          label="After fees and inflation"
          value={formatPercent(result.realAnnualRate)}
          detail="The real rate, by the Fisher relation"
        />
      </ResultCard>

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <Chart
          title={`Balance by year, ${inView(view)}`}
          categories={chart.categories}
          xValues={chart.xValues}
          series={chart.series}
          xLabel="Year"
          yLabel={view === 'nominal' ? 'Balance' : 'Balance in today’s money'}
          formatTick={(v) => formatGBPCompact(fromPence(v))}
          formatValue={(v) => gbp(fromPence(v))}
          formatXTick={(x) => (x === 0 ? START_LABEL : String(x))}
          integer
          includeZero
          pointMarkers={false}
        />
      </div>
    </>
  )
}

/** The engine's yearly rows in the chosen view, with its totals. Scrolls sideways in its own region; the year stays in view. */
function YearlyTable({ projection, view, gbp }: { projection: Projection; view: View; gbp: Gbp }) {
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap'
  const head = 'px-3 py-2 text-right font-medium whitespace-nowrap'
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="ci-yearly-title" className="text-base font-semibold text-text">
        Year by year, {inView(view)}
      </h2>
      <section
        aria-labelledby="ci-yearly-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
      >
        <table data-yearly-table className="w-full min-w-max border-collapse text-sm text-text">
          <caption className="sr-only">Year by year, {inView(view)}: opening balance, paid in, growth, fees and closing balance</caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                Year
              </th>
              <th scope="col" className={head}>
                Opening
              </th>
              <th scope="col" className={head}>
                Paid in
              </th>
              <th scope="col" className={head}>
                Growth
              </th>
              <th scope="col" className={head}>
                Fees
              </th>
              <th scope="col" className={head}>
                Closing
              </th>
            </tr>
          </thead>
          <tbody>
            {projection.rows.map((row) => (
              <tr key={row.year} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                  {row.year}
                </th>
                <td className={cell}>{gbp(row.opening)}</td>
                <td className={cell}>{gbp(row.contributions)}</td>
                <td className={cell}>{gbp(row.growth)}</td>
                <td className={cell}>{gbp(row.fees)}</td>
                <td className={cell}>{gbp(row.closing)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong font-semibold">
              <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left">
                Total
              </th>
              <td className={cell}>{gbp(projection.lumpSum)}</td>
              <td className={cell}>{gbp(projection.contributions)}</td>
              <td className={cell}>{gbp(projection.growth)}</td>
              <td className={cell}>{gbp(projection.fees)}</td>
              <td className={cell}>{gbp(projection.closing)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
      <p className="text-xs text-text-muted">
        The total row’s opening is the lump sum. Each row’s opening, paid in and growth, less fees, make its closing balance.
      </p>
    </div>
  )
}
