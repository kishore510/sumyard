import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Chart } from '@/components/Chart/Chart'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { Toggle } from '@/components/inputs/Toggle'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { InlineNotice } from '@/components/states'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import { formatGBP, formatGBPCompact, formatIsoDate, formatPercent } from '@/lib/format'
import { fromPence, toPence } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { configFor, sessionFor } from '../session'
import { CHART_STYLES, calculateHello, HELLO_LIMITS, type HelloInputs } from './calc'
import { helloCalculator, ROUNDING_LABELS } from './definition'

/*
 * The Hello calculator page: a placeholder that exercises every shared part
 * (inputs, validation, results, assumptions, chart, scenarios, compare and
 * the refusal notice). Removed when the first real calculator ships.
 */

const session = sessionFor(helloCalculator)

const TAX_YEARS = listTaxYears().map((y) => ({ value: y.id as string, label: taxYearLabel(y.id) }))
const ROUNDING_OPTIONS = (Object.keys(ROUNDING_LABELS) as HelloInputs['rounding'][]).map((value) => ({
  value,
  label: ROUNDING_LABELS[value],
}))
const CHART_OPTIONS = CHART_STYLES.map((value) => ({ value, label: value === 'line' ? 'Line' : 'Bars' }))

export default function HelloPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const config = configFor(state.taxYear)
  const set = (patch: Partial<HelloInputs>) => session.setInputs(patch)
  const valid = (field: string) => (ok: boolean) => session.setFieldValid(field, ok)
  const invalid = state.invalid.length > 0
  const result = invalid ? null : calculateHello(inputs, config)
  const money = (pence: number) => formatGBP(fromPence(pence), amounts)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="inline-flex self-start rounded-full border border-dashed border-border-strong px-3 py-1 text-xs font-medium text-text">
          {helloCalculator.placeholder}
        </p>
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {helloCalculator.name}
        </h1>
        <p className="text-text-muted">{helloCalculator.summary}</p>
        <VerifiedBadge config={config} />
      </div>

      <ScenarioBar calculator={helloCalculator} session={session} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section
          aria-labelledby="hello-inputs"
          className="flex min-w-0 flex-col gap-4 self-start rounded-lg border border-border bg-surface p-5 shadow-sm lg:col-span-2"
        >
          <h2 id="hello-inputs" className="text-base font-semibold">
            Inputs
          </h2>
          {/* Keyed by revision: a loaded scenario or a fresh start resets every box. */}
          <div key={state.revision} className="flex flex-col gap-4">
            <Select
              id="hello-tax-year"
              label="Tax year"
              value={state.taxYear}
              options={TAX_YEARS}
              onChange={(taxYear) => session.setTaxYear(taxYear)}
            />
            <CurrencyInput
              id="hello-amount"
              label="Amount"
              hint={`From ${formatGBP(HELLO_LIMITS.minAmount, 'pounds')} to ${formatGBP(HELLO_LIMITS.maxAmount, 'pounds')}. Pence are fine.`}
              value={inputs.amount}
              min={HELLO_LIMITS.minAmount}
              max={HELLO_LIMITS.maxAmount}
              onChange={(amount) => set({ amount })}
              onValidityChange={valid('amount')}
            />
            <PercentInput
              id="hello-percent"
              label="Percentage"
              hint={`From ${formatPercent(HELLO_LIMITS.minPercent)} to ${formatPercent(HELLO_LIMITS.maxPercent)}, up to two decimal places.`}
              value={inputs.percent}
              min={HELLO_LIMITS.minPercent}
              max={HELLO_LIMITS.maxPercent}
              onChange={(percent) => set({ percent })}
              onValidityChange={valid('percent')}
            />
            <Select
              id="hello-rounding"
              label="Rounding to the penny"
              value={inputs.rounding}
              options={ROUNDING_OPTIONS}
              onChange={(rounding) => set({ rounding })}
            />
            <NumberInput
              id="hello-steps"
              label="Steps in the chart"
              hint={`From ${HELLO_LIMITS.minSteps} to ${HELLO_LIMITS.maxSteps}.`}
              value={inputs.steps}
              min={HELLO_LIMITS.minSteps}
              max={HELLO_LIMITS.maxSteps}
              onChange={(steps) => set({ steps })}
              onValidityChange={valid('steps')}
            />
            <Segmented
              id="hello-chart"
              label="Chart style"
              value={inputs.chart}
              options={CHART_OPTIONS}
              onChange={(chart) => set({ chart })}
            />
            <Toggle
              id="hello-reference"
              label="Reference line at the amount"
              checked={inputs.referenceLine}
              onChange={(referenceLine) => set({ referenceLine })}
            />
            <Toggle
              id="hello-dates"
              label="Show the tax year’s dates"
              hint="Needs verified tax data, so it shows the “not verified” notice instead of results until the dates are checked."
              checked={inputs.useTaxYearDates}
              onChange={(useTaxYearDates) => set({ useTaxYearDates })}
            />
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          {invalid || !result ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : !result.ok ? (
            <RefusalNotice refusal={result} />
          ) : (
            <>
              <ResultCard title="Results" headlineLabel="Amount × percentage" headline={formatGBP(result.product, amounts)}>
                <StatRow label="Amount" value={formatGBP(inputs.amount, amounts)} />
                <StatRow label="Percentage" value={formatPercent(percentRatio(inputs.percent))} />
                <StatRow label="Amount plus that" value={formatGBP(result.total, amounts)} />
                <StatRow
                  label={`After ${inputs.steps} steps`}
                  value={formatGBP(result.series.at(-1) ?? inputs.amount, amounts)}
                  detail={`Rounded ${ROUNDING_LABELS[inputs.rounding].toLowerCase()} at each step`}
                />
                {result.taxYearDates && (
                  <StatRow
                    label="Tax year"
                    value={`${formatIsoDate(result.taxYearDates.start)} to ${formatIsoDate(result.taxYearDates.end)}`}
                  />
                )}
              </ResultCard>
              <section aria-label="Chart" className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <Chart
                  title="The amount, step by step"
                  categories={result.series.map((_, i) => `Step ${i + 1}`)}
                  series={[{ id: 'amount', label: 'Amount after the step', kind: inputs.chart, values: result.series.map(toPence) }]}
                  references={inputs.referenceLine ? [{ label: 'Starting amount', value: toPence(inputs.amount) }] : []}
                  xLabel="Step"
                  yLabel="Amount"
                  formatTick={(v) => formatGBPCompact(fromPence(v))}
                  formatValue={money}
                  integer
                  includeZero
                />
              </section>
            </>
          )}

          <AssumptionsPanel
            items={[
              'This is a placeholder that shows how Sumyard’s calculators work. It uses no tax figures.',
              'The result is the amount times the percentage, rounded to a whole penny the way you choose.',
              'Each chart step applies the percentage to the previous step’s amount, rounding at every step.',
              `Results show ${amounts === 'pence' ? 'pounds and pence' : 'whole pounds'}, as set in Settings.`,
              'The tax year matters only when “Show the tax year’s dates” is on, and that needs verified tax data.',
            ]}
          />
        </div>
      </div>

      <p className="text-sm text-text-muted">
        <strong className="font-semibold text-text">Illustrative only, not financial advice.</strong> {DISCLAIMER}
      </p>
    </div>
  )
}
