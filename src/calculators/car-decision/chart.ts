import type { ChartMarker, ChartSeries, ChartStyle } from '@/components/Chart/types'
import { toPence } from '@/lib/money'
import type { CarOption, MonthPoint } from '../car-ownership/types'
import { type CarDecisionInputs, type OptionStatus, type PageOutcome, uniqueNames } from './definition'
import { cardOrder } from './results'

/*
 * The car decision's crossover chart and the readout at a month (slice
 * 3c-2), from the engine's months (MonthPoint, cumulative from month 0):
 * a line per costed option of its net cost so far in the case shown, which
 * stops where its coverage ends (a PCP handed back), with the horizon and
 * each finance term marked. Every value is the engine's, only read here:
 * no money arithmetic. No UI.
 */

/**
 * Each option's line style, by its place in the editor, so a line keeps its look when the order changes. None is the
 * danger colour: no option is a warning.
 */
export const SERIES_STYLES: readonly ChartStyle[] = ['accent', 'contrast', 'neutral', 'secondary']

type Ok = Extract<PageOutcome, { kind: 'ok' }>
type Costed = Extract<OptionStatus, { kind: 'ok' }>

export const monthLabel = (month: number) => `Month ${month}`

/** The costed options in the cards' order, with their page index. */
function costedInOrder(outcome: Ok, inputs: CarDecisionInputs): [number, Costed][] {
  return cardOrder(outcome, inputs.valueCase, inputs.options.length).flatMap((index) => {
    const status = outcome.statuses[index]!
    return status.kind === 'ok' ? [[index, status] as [number, Costed]] : []
  })
}

/** A finance agreement's term in months (a kept car's payments left); null for cash and keep without finance. */
function termOf(option: CarOption): number | null {
  const { acquisition } = option
  if (acquisition.kind === 'keep') return acquisition.existingFinance?.paymentsLeft ?? null
  return acquisition.kind === 'cash' ? null : acquisition.finance.term
}

export interface Crossover {
  readonly categories: readonly string[]
  readonly xValues: readonly number[]
  readonly series: readonly ChartSeries[]
  readonly markers: readonly ChartMarker[]
}

/** The chart's months, lines and markers for the case shown; null when no option has results. */
export function crossover(outcome: Ok, inputs: CarDecisionInputs): Crossover | null {
  const costed = costedInOrder(outcome, inputs)
  if (costed.length === 0) return null
  const horizon = inputs.horizonMonths
  const names = uniqueNames(inputs.options)
  const xValues = Array.from({ length: horizon + 1 }, (_, month) => month)
  const series = costed.map(([index, status]): ChartSeries => {
    const months = status.result.cases[inputs.valueCase].months
    return {
      id: `o${index}`,
      label: names[index]!,
      kind: 'line',
      style: SERIES_STYLES[index % SERIES_STYLES.length],
      // Months after the coverage ends have no point: the line stops there.
      values: xValues.map((month) => (months[month] ? toPence(months[month]!.netCost) : null)),
    }
  })
  const ends = costed.flatMap(([index, status]): ChartMarker[] => {
    const name = names[index]!
    if (!status.result.fullCoverage) {
      const at = status.result.coverageMonths
      return [{ x: at, label: `${name}: handed back at month ${at}` }]
    }
    const term = termOf(status.option)
    return term !== null && term <= horizon ? [{ x: term, label: `${name}: finance term ends at month ${term}` }] : []
  })
  // In order of month; at the horizon, the horizon's own marker last.
  const markers = [...ends.sort((a, b) => a.x - b.x), { x: horizon, label: `Horizon: month ${horizon}` }].sort((a, b) => a.x - b.x)
  return { categories: xValues.map(monthLabel), xValues, series, markers }
}

export interface ReadoutRow {
  readonly index: number
  readonly name: string
  /** The month read, at most the horizon. */
  readonly month: number
  /** The engine's position at the month; null once the car has been handed back. */
  readonly point: MonthPoint | null
  /** The month a car handed back before the horizon went back; null for one held to the horizon. */
  readonly handedBackAt: number | null
}

/** Each costed option's position at a month (a month past the horizon reads as the horizon), in the cards' order. */
export function readout(outcome: Ok, inputs: CarDecisionInputs, month: number): ReadoutRow[] {
  const at = Math.min(month, inputs.horizonMonths)
  const names = uniqueNames(inputs.options)
  return costedInOrder(outcome, inputs).map(([index, status]) => ({
    index,
    name: names[index]!,
    month: at,
    point: status.result.cases[inputs.valueCase].months[at] ?? null,
    handedBackAt: status.result.fullCoverage ? null : status.result.coverageMonths,
  }))
}
