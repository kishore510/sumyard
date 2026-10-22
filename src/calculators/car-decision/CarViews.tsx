import { useEffect, useState } from 'react'
import { ChangeBar } from '@/components/ChangeBar'
import { Chart } from '@/components/Chart/Chart'
import { StatRow } from '@/components/ResultCard'
import { Section } from '@/components/Section'
import { SETTLE_MS } from '@/components/StickyResult'
import { formatGBPCompact, formatGBPDelta } from '@/lib/format'
import { MAX_CAR_OPTIONS, SENSITIVITY_SHIFTS } from '@/lib/inputLimits'
import { fromPence, type Money, toPence, ZERO } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { AmountStyle } from '@/settings/settings'
import type { ValueCase } from '../car-ownership/types'
import { crossover, type ReadoutRow, readout } from './chart'
import { CASE_LABELS, type CarDecisionInputs, type PageOutcome, toEngineShared, uniqueNames } from './definition'
import { cardOrder } from './results'
import { byEffect, type Cell, DRIVERS, type Driver, type DriverRow, driverRow } from './sensitivity'

/*
 * The car decision's views below the cards (slice 3c-2), every figure the
 * engine's (./chart.ts, ./sensitivity.ts):
 *
 * - the crossover chart: each option's cumulative net cost month by month in
 *   the case shown, a line stopping where its coverage ends, the horizon and
 *   finance terms marked; tapping the chart or a table row picks the month;
 * - the readout at that month: each option's net cost so far, equity and
 *   cash out, and what is held fixed;
 * - the sensitivity view: each option's change in net cost per month of
 *   coverage when one input moves, worked out once the inputs settle, in
 *   steps between which the page stays responsive.
 *
 * Lines that cross are drawn, not announced: nothing here orders options.
 */

type Ok = Extract<PageOutcome, { kind: 'ok' }>
type Gbp = (amount: Money) => string

const caseWord = (valueCase: ValueCase) => CASE_LABELS[valueCase].toLowerCase()

/** The crossover chart and the readout at the selected month. */
export function CrossoverView({
  outcome,
  inputs,
  month,
  onMonth,
  gbp,
}: {
  outcome: Ok
  inputs: CarDecisionInputs
  /** The selected month, at most the horizon. */
  month: number
  onMonth: (month: number) => void
  gbp: Gbp
}) {
  const data = crossover(outcome, inputs)
  if (!data) return null
  return (
    <section
      data-crossover
      aria-labelledby="cd-crossover-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="cd-crossover-title" className="text-base font-semibold text-text">
        Month by month
      </h2>
      <p className="text-sm text-text-muted">
        Each line is an option’s net cost so far: cash out, plus any sale given up, less the equity in the car, plus the opportunity cost.
        Where two lines cross, their running totals swap over. Tap the chart, or use the arrow keys on it, to pick a month.
      </p>
      <Chart
        title={`Cumulative net cost by month, ${caseWord(inputs.valueCase)} end value`}
        categories={data.categories}
        xValues={data.xValues}
        series={data.series}
        markers={data.markers}
        xLabel="Month"
        yLabel="Net cost so far"
        formatTick={(v) => formatGBPCompact(fromPence(v))}
        formatValue={(v) => gbp(fromPence(v))}
        integer
        includeZero
        pointMarkers={false}
        endLabels
        selectedX={month}
        onSelectX={onMonth}
        selectLabel="Month on the chart"
      />
      <Readout rows={readout(outcome, inputs, month)} month={month} valueCase={inputs.valueCase} gbp={gbp} />
    </section>
  )
}

function Readout({ rows, month, valueCase, gbp }: { rows: readonly ReadoutRow[]; month: number; valueCase: ValueCase; gbp: Gbp }) {
  return (
    <div data-readout className="flex min-w-0 flex-col gap-3">
      <h3 className="text-base font-semibold text-text">Each option at month {month}</h3>
      <p data-readout-held className="text-sm text-text-muted">
        Everything else as entered, in the {caseWord(valueCase)} end value; only the month changes. Figures are from the start to the end of
        that month.
      </p>
      {/* Plain blocks, not regions: the option cards above are the regions named by each option. */}
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <li
            key={row.index}
            data-readout-row={row.index}
            className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface-muted p-3"
          >
            <p className="text-sm font-semibold text-text [overflow-wrap:anywhere]">{row.name}</p>
            <dl className="flex flex-col">
              {row.point ? (
                <>
                  <StatRow label="Net cost so far" value={gbp(row.point.netCost)} marker="readout-net" />
                  <StatRow
                    label="Equity"
                    value={gbp(row.point.equity)}
                    detail="What the car is worth less anything still owed"
                    marker="readout-equity"
                  />
                  <StatRow label="Cash out so far" value={gbp(row.point.cashOut)} marker="readout-cash" />
                </>
              ) : (
                <StatRow label="Coverage" value={`Handed back at month ${row.handedBackAt}`} detail="No car, and no figures, after that" />
              )}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Sensitivity ------------------------------------------------------------------

const DRIVER_LABELS: Record<Driver, string> = {
  endValue: 'End value',
  savingsReturn: 'Savings return',
  annualMileage: 'Annual mileage',
  fuelPrice: 'Fuel or energy price',
}

const driverLabel = (driver: Driver, valueCase: ValueCase) =>
  driver === 'endValue' ? `${DRIVER_LABELS.endValue} (${caseWord(valueCase)} case)` : DRIVER_LABELS[driver]

const shiftLabel = (shift: number) => `${shift > 0 ? '+' : '−'}${Math.abs(shift)}%`

/** A cell's change in whole pence, for the drawn bar; null without a figure. */
const pence = (cell: Cell | undefined) => (cell && cell.change !== null ? toPence(cell.change) : null)

export interface OptionSensitivity {
  readonly index: number
  readonly rows: readonly DriverRow[]
}

export type SensitivityState =
  | { readonly kind: 'none' }
  /** The section is closed: nothing is worked out until it opens (docs/performance.md). */
  | { readonly kind: 'closed' }
  | { readonly kind: 'updating' }
  | { readonly kind: 'ready'; readonly options: readonly OptionSensitivity[]; readonly ms: number }

/** Results by inputs: a page that goes back to inputs it has seen shows them at once. Small, and cleared when full. */
const memo = new Map<string, readonly DriverRow[]>()
const MEMO_SIZE = MAX_CAR_OPTIONS * MAX_CAR_OPTIONS

/**
 * The sensitivity rows, worked out while the section is open, once the inputs have settled (SETTLE_MS), and then one input of one option per step,
 * with a break between steps, so typing and scrolling stay responsive (docs/performance.md); "updating" until done. Never
 * on each keystroke. Each option's rows are kept by its inputs, so going back to inputs already seen shows them at once.
 */
export function useSensitivity(outcome: Ok | null, inputs: CarDecisionInputs, open: boolean): SensitivityState {
  const [ready, setReady] = useState<{ for: Ok; state: SensitivityState } | null>(null)
  const any = outcome?.statuses.some((status) => status.kind === 'ok') ?? false
  useEffect(() => {
    if (!outcome || !any || !open) return
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    const shared = toEngineShared(inputs)
    const work = cardOrder(outcome, inputs.valueCase, inputs.options.length).flatMap((index) => {
      const status = outcome.statuses[index]!
      return status.kind === 'ok' ? [{ index, status, key: JSON.stringify([status.option, shared, inputs.valueCase]) }] : []
    })
    const start = performance.now()
    const done: OptionSensitivity[] = []
    let rows: DriverRow[] = []
    // One step per option and input; an option already worked out is one step.
    const step = (option: number, driver: number) => {
      if (cancelled) return
      const item = work[option]
      if (!item) {
        setReady({ for: outcome, state: { kind: 'ready', options: done, ms: Math.round(performance.now() - start) } })
        return
      }
      const known = memo.get(item.key)
      if (known) {
        done.push({ index: item.index, rows: known })
        timer = setTimeout(() => step(option + 1, 0), 0)
        return
      }
      rows.push(driverRow(item.status.option, shared, inputs.valueCase, item.status.result, DRIVERS[driver]!))
      if (driver + 1 < DRIVERS.length) {
        timer = setTimeout(() => step(option, driver + 1), 0)
        return
      }
      const sorted = byEffect(rows)
      if (memo.size >= MEMO_SIZE) memo.clear()
      memo.set(item.key, sorted)
      done.push({ index: item.index, rows: sorted })
      rows = []
      timer = setTimeout(() => step(option + 1, 0), 0)
    }
    timer = setTimeout(() => step(0, 0), SETTLE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [outcome, inputs, any, open])
  if (!any) return { kind: 'none' }
  if (!open) return { kind: 'closed' }
  return ready && ready.for === outcome ? ready.state : { kind: 'updating' }
}

/** "What moves the answer most": a table per option, rows largest effect first, with the conventions in words. */
export function SensitivityView({
  state,
  inputs,
  amounts,
  onOpenChange,
}: {
  state: SensitivityState
  inputs: CarDecisionInputs
  onOpenChange: (open: boolean) => void
  /** The Settings amount style: changes are shown signed (formatGBPDelta). */
  amounts: AmountStyle
}) {
  const names = uniqueNames(inputs.options)
  const summary =
    state.kind === 'none'
      ? 'Needs an option with results'
      : state.kind === 'closed'
        ? 'Open to work out which inputs move each option’s net cost most'
        : state.kind === 'updating'
          ? 'Updating once the inputs settle'
          : state.options.map((o) => `${names[o.index]}: ${driverLabel(o.rows[0]!.driver, inputs.valueCase).toLowerCase()} most`).join('; ')
  return (
    <div data-sensitivity data-sensitivity-ms={state.kind === 'ready' ? state.ms : undefined} className="min-w-0">
      <Section id="cd-section-sensitivity" title="Sensitivity: what moves the answer most" summary={summary} onOpenChange={onOpenChange}>
        <p className="text-sm text-text-muted">
          Each row moves one input by the percentage shown, one at a time, with every other input held at its current value. Each figure is
          the change in that option’s net cost per month of coverage against its card, from the same engine. The changes are constant
          percentages of today’s inputs, illustrative only, not a forecast and not advice. Rows are sorted with the largest change first.
          “Outside the range” means the move takes the input past what Sumyard models.
        </p>
        {state.kind === 'none' && <p className="text-sm text-text">Each card says what its option needs first.</p>}
        {state.kind === 'updating' && (
          <p data-sensitivity-status role="status" className="text-sm text-text">
            Updating once the inputs settle…
          </p>
        )}
        {state.kind === 'ready' &&
          state.options.map((o) => {
            const largest = o.rows[0]?.effect ?? ZERO
            return (
              <div key={o.index} data-sensitivity-option={o.index} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-sm font-semibold text-text [overflow-wrap:anywhere]">{names[o.index]}</h3>
                <section
                  // Named apart from the option's card, which is the region named by the option alone.
                  aria-label={`${names[o.index]}: sensitivity`}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
                  tabIndex={0}
                  className="relative overflow-x-auto rounded-md border border-border"
                >
                  <table className="w-full min-w-max border-collapse text-sm text-text">
                    <caption className="sr-only">
                      {names[o.index]}: change in net cost per month of coverage when one input moves, largest first
                    </caption>
                    <thead>
                      <tr className="text-text-muted">
                        <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                          Input moved
                        </th>
                        {SENSITIVITY_SHIFTS.map((shift) => (
                          <th key={shift} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                            {shiftLabel(shift)}
                          </th>
                        ))}
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          <span className="sr-only">Size of change, drawn</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.rows.map((row) => (
                        <tr key={row.driver} data-driver={row.driver} className="border-t border-border">
                          <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                            {driverLabel(row.driver, inputs.valueCase)}
                          </th>
                          {row.cells.map((cell) => (
                            <td
                              key={cell.shift}
                              data-shift={cell.shift}
                              className={cn(
                                'px-3 py-2 text-right whitespace-nowrap',
                                cell.change === null ? 'text-xs text-text-muted' : 'tabular-nums',
                              )}
                            >
                              {cell.change === null ? 'Outside the range' : formatGBPDelta(cell.change, amounts)}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <ChangeBar first={pence(row.cells[0])} second={pence(row.cells.at(-1))} largest={toPence(largest)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )
          })}
      </Section>
    </div>
  )
}
