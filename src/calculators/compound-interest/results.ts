import type { ChartSeries } from '@/components/Chart/types'
import { add, type Money, toPence } from '@/lib/money'
import type { CompoundResult, Projection } from './types'

/*
 * What the compound interest page shows from the engine's result (slice 2b):
 * the view (nominal or today's money), paid in, and the chart's data. Every
 * figure is the engine's; the only sum is paid in (the lump sum plus the
 * contributions), through money.ts. No UI.
 */

/** Nominal: pounds of the day. Real: today's money (decision C5). Chosen on the page, never stored. */
export type View = 'nominal' | 'real'

export const VIEWS: readonly View[] = ['nominal', 'real']

export const VIEW_LABELS: Record<View, string> = { nominal: 'Nominal', real: 'Today’s money' }

/** The projection with the fee, in a view: what the headline, the rows and the table show. */
export const projectionFor = (result: CompoundResult, view: View): Projection => result.withFee[view]

/** Everything paid in: the lump sum and the contributions. */
export const paidIn = (projection: Projection): Money => add(projection.lumpSum, projection.contributions)

/** The chart's x categories: the start, then each year end. */
export const START_LABEL = 'Start'

/**
 * The balance by year with the fee, without it, and everything paid in so
 * far, in a view, from the start (the lump sum) to each year end. Values are
 * whole pence.
 */
export function chartData(result: CompoundResult, view: View) {
  const withFee = result.withFee[view]
  const noFee = result.noFee[view]
  const start = toPence(withFee.lumpSum)
  const series: ChartSeries[] = [
    { id: 'withFee', label: 'Balance', kind: 'line', values: [start, ...withFee.rows.map((r) => toPence(r.closing))] },
    { id: 'noFee', label: 'Balance without the fee', kind: 'line', values: [start, ...noFee.rows.map((r) => toPence(r.closing))] },
    {
      id: 'paidIn',
      label: 'Paid in',
      kind: 'line',
      // A reference for the balances, not a warning: the neutral style, not the danger colour.
      style: 'neutral',
      values: [start, ...withFee.rows.map((r) => toPence(add(withFee.lumpSum, r.cumulativeContributions)))],
    },
  ]
  return {
    categories: [START_LABEL, ...withFee.rows.map((r) => `Year ${r.year}`)],
    xValues: [0, ...withFee.rows.map((r) => r.year)],
    series,
  }
}
