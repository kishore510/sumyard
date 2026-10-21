import { ArrowLeft } from 'lucide-react'
import { useId } from 'react'
import { CALCULATORS } from '@/calculators/index'
import {
  type CalculatorDefinition,
  type InputRefusal,
  isInputRefusal,
  type RowValue,
  type Summary,
  type SummaryRow,
} from '@/calculators/registry'
import { configFor } from '@/calculators/session'
import { NO_TAX_RULES } from '@/components/NoTaxRulesBadge'
import { refusedGroups } from '@/components/RefusalNotice'
import { SheetLink } from '@/components/SheetLink'
import { EmptyState, InlineNotice } from '@/components/states'
import { getTaxYear, taxYearLabel } from '@/config/tax/index'
import type { Refusal } from '@/config/tax/sourced'
import { formatGBP, formatGBPDelta, formatPercent, formatPercentPointDelta } from '@/lib/format'
import { subtract, subtractRatio } from '@/lib/money'
import { createStore, useStore } from '@/lib/store'
import { scenarioStore } from '@/scenarios/index'
import type { Scenario } from '@/scenarios/scenario'
import { scenariosFor } from '@/scenarios/store'
import { type AmountStyle, settingsStore } from '@/settings/settings'
import { formatPage } from './route'

/*
 * Compare (#/c/<id>/compare): two or three saved scenarios of one calculator
 * side by side, inputs and results, each column after the first with its
 * change from the first (the baseline). A page rather than a sheet, for the
 * width. On a phone the table scrolls sideways, with the row labels kept in
 * view. Results are worked out again from each scenario's inputs.
 */

export const MAX_COMPARE = 3

/** Which scenarios are picked, per calculator, for this visit. */
const selection = createStore<Readonly<Record<string, readonly string[]>>>({})

/** What a compare cell says for a scenario with no results. */
export function refusedCellText(refusal: Refusal | InputRefusal): string {
  if (isInputRefusal(refusal)) return `No results: ${refusal.problems.map((p) => p.label).join(', ')}`
  return 'No results: tax figures not verified'
}

export function formatRowValue(value: RowValue, amounts: AmountStyle): string {
  switch (value.kind) {
    case 'money':
      return formatGBP(value.amount, amounts)
    case 'ratio':
      return formatPercent(value.ratio)
    case 'count':
      return new Intl.NumberFormat('en-GB').format(value.count)
    case 'text':
      return value.text
  }
}

/** The change from the baseline, or null when there is nothing to say (text that matches). */
export function formatDelta(value: RowValue, base: RowValue | undefined, amounts: AmountStyle): string | null {
  if (!base || base.kind !== value.kind) return null
  if (value.kind === 'money' && base.kind === 'money') return formatGBPDelta(subtract(value.amount, base.amount), amounts)
  if (value.kind === 'ratio' && base.kind === 'ratio') return formatPercentPointDelta(subtractRatio(value.ratio, base.ratio))
  if (value.kind === 'count' && base.kind === 'count') {
    const change = value.count - base.count
    return change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${new Intl.NumberFormat('en-GB').format(change)}`
  }
  if (value.kind === 'text' && base.kind === 'text') return value.text === base.text ? 'Same' : 'Different'
  return null
}

function Cell({
  row,
  base,
  amounts,
  isBase,
}: {
  row: SummaryRow | undefined
  base: SummaryRow | undefined
  amounts: AmountStyle
  isBase: boolean
}) {
  if (!row) return <td className="px-3 py-2 text-right text-text-muted">–</td>
  const delta = isBase ? null : formatDelta(row.value, base?.value, amounts)
  return (
    <td className="px-3 py-2 text-right align-top text-text tabular-nums">
      <span className="block font-medium">{formatRowValue(row.value, amounts)}</span>
      {delta && <span className="block text-xs text-text-muted">{delta}</span>}
    </td>
  )
}

function CompareTable({ calculator, picked }: { calculator: CalculatorDefinition; picked: readonly Scenario[] }) {
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const captionId = useId()
  const summaries: Summary[] = picked.map((s) => calculator.summarise(s.inputs, configFor(s.taxYear)))
  const labels = (pick: (s: Summary) => readonly SummaryRow[]) => [...new Set(summaries.flatMap((s) => pick(s).map((r) => r.label)))]
  const inputLabels = labels((s) => s.inputs)
  const resultLabels = labels((s) => (s.results.ok ? s.results.rows : []))
  const refused = summaries.flatMap((s) => (s.results.ok || isInputRefusal(s.results) ? [] : [s.results]))
  const sectionRow = (title: string) => (
    <tr className="border-t border-border bg-surface-muted">
      <th
        scope="colgroup"
        colSpan={picked.length + 1}
        className="sticky left-0 bg-surface-muted px-3 py-2 text-left text-xs font-semibold tracking-wide text-text-muted uppercase"
      >
        {title}
      </th>
    </tr>
  )
  const find = (rows: readonly SummaryRow[], label: string) => rows.find((r) => r.label === label)

  return (
    <div className="flex flex-col gap-3">
      <p id={captionId} className="text-sm font-semibold text-text">
        {picked.length} scenarios side by side. Changes are from {picked[0]?.name}, the baseline.
      </p>
      <section
        aria-labelledby={captionId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
      >
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">
            {picked.length} scenarios side by side. Changes are from {picked[0]?.name}, the baseline.
          </caption>
          <thead>
            <tr className="border-t border-border">
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium text-text-muted">
                <span className="sr-only">Row</span>
              </th>
              {picked.map((s, i) => (
                <th key={s.id} scope="col" className="max-w-48 px-3 py-2 text-right align-bottom font-semibold break-words text-text">
                  {s.name}
                  <span className="block text-xs font-normal text-text-muted">
                    {i === 0 ? 'Baseline' : `Compared with ${picked[0]!.name}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionRow('Inputs')}
            {calculator.taxRules === 'none' ? (
              <tr className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal text-text">
                  Tax rules
                </th>
                {picked.map((s) => (
                  <td key={s.id} className="px-3 py-2 text-right text-text">
                    {NO_TAX_RULES}
                  </td>
                ))}
              </tr>
            ) : (
              <tr className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal text-text">
                  Tax year
                </th>
                {picked.map((s, i) => (
                  <td key={s.id} className="px-3 py-2 text-right text-text">
                    <span className="block font-medium">{taxYearLabel(s.taxYear ?? '')}</span>
                    {!getTaxYear(s.taxYear ?? '') && (
                      <span className="block text-xs text-text-muted">Not in this version; worked out with the latest year</span>
                    )}
                    {i > 0 && (
                      <span className="block text-xs text-text-muted">{s.taxYear === picked[0]!.taxYear ? 'Same' : 'Different'}</span>
                    )}
                  </td>
                ))}
              </tr>
            )}
            {inputLabels.map((label) => (
              <tr key={label} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal text-text">
                  {label}
                </th>
                {summaries.map((summary, i) => (
                  <Cell
                    key={picked[i]!.id}
                    row={find(summary.inputs, label)}
                    base={find(summaries[0]!.inputs, label)}
                    amounts={amounts}
                    isBase={i === 0}
                  />
                ))}
              </tr>
            ))}
            {sectionRow('Results')}
            {resultLabels.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={picked.length + 1} className="px-3 py-2 text-text-muted">
                  No results to compare.
                </td>
              </tr>
            )}
            {resultLabels.map((label) => {
              const baseRows = summaries[0]!.results.ok ? summaries[0]!.results.rows : []
              return (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal text-text">
                    {label}
                  </th>
                  {summaries.map((summary, i) =>
                    summary.results.ok ? (
                      <Cell
                        key={picked[i]!.id}
                        row={find(summary.results.rows, label)}
                        base={find(baseRows, label)}
                        amounts={amounts}
                        isBase={i === 0}
                      />
                    ) : (
                      <td key={picked[i]!.id} className="px-3 py-2 text-right text-xs text-text-muted">
                        {refusedCellText(summary.results)}
                      </td>
                    ),
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      {refused.length > 0 && (
        <InlineNotice tone="warning" title="Some results are missing">
          <p>
            Some scenarios need tax figures that aren’t verified yet ({[...new Set(refused.flatMap(refusedGroups))].join(', ')}), so they
            show no results.
          </p>
          <SheetLink route={{ kind: 'tax-data' }} className="inline-flex min-h-touch items-center self-start">
            See tax data
          </SheetLink>
        </InlineNotice>
      )}
    </div>
  )
}

export function ComparePage({ calculatorId }: { calculatorId: string }) {
  const calculator = CALCULATORS.get(calculatorId)!
  const all = useStore(scenarioStore, (s) => s.scenarios)
  const mine = scenariosFor({ scenarios: all }, calculatorId)
  const chosen = useStore(selection, (s) => s[calculatorId])
  const ids = (chosen ?? mine.slice(0, 2).map((s) => s.id)).filter((id) => mine.some((s) => s.id === id))
  const picked = ids.map((id) => mine.find((s) => s.id === id)!)
  const toggle = (id: string, on: boolean) =>
    selection.set({ ...selection.get(), [calculatorId]: on ? [...ids, id].slice(0, MAX_COMPARE) : ids.filter((x) => x !== id) })
  const back = formatPage({ kind: 'calculator', id: calculatorId })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <a
          href={back}
          className="inline-flex min-h-touch items-center gap-1 self-start text-sm font-medium text-accent underline underline-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the {calculator.name}
        </a>
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          Compare scenarios
        </h1>
        <p className="text-text-muted">
          {calculator.name}: pick {MAX_COMPARE === 3 ? 'two or three' : `up to ${MAX_COMPARE}`} saved scenarios. Each is worked out again
          from its inputs.
        </p>
      </div>

      {mine.length < 2 ? (
        <EmptyState title="Not enough scenarios to compare">
          Save at least two scenarios on the {calculator.name} page, then come back.
        </EmptyState>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1 text-sm font-medium text-text">
              Scenarios to compare ({picked.length} of {MAX_COMPARE} picked)
            </legend>
            <ul className="flex flex-col gap-1">
              {mine.map((s) => {
                const on = ids.includes(s.id)
                const full = !on && ids.length >= MAX_COMPARE
                return (
                  <li key={s.id}>
                    <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-text hover:bg-surface-muted has-disabled:cursor-default has-disabled:opacity-60">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={full}
                        onChange={(e) => toggle(s.id, e.currentTarget.checked)}
                        className="size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 break-words">{s.name}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {ids.length >= MAX_COMPARE && <p className="text-xs text-text-muted">Untick one to pick another.</p>}
          </fieldset>
          {picked.length < 2 ? (
            <InlineNotice tone="info">
              <p>Pick at least two scenarios.</p>
            </InlineNotice>
          ) : (
            <CompareTable calculator={calculator} picked={picked} />
          )}
        </>
      )}
    </div>
  )
}
