import type { ChartMarker, ChartSeries, ChartStyle } from '@/components/Chart/types'
import type { MonthPoint } from '../car-ownership/types'
import type { CarDecisionInputs, PageOutcome } from './definition'

/* Stub (3c-2 red): the crossover chart's data and the readout at a month. */

export const SERIES_STYLES: readonly ChartStyle[] = []

export interface Crossover {
  readonly categories: readonly string[]
  readonly xValues: readonly number[]
  readonly series: readonly ChartSeries[]
  readonly markers: readonly ChartMarker[]
}

export function crossover(_outcome: Extract<PageOutcome, { kind: 'ok' }>, _inputs: CarDecisionInputs): Crossover | null {
  return null
}

export interface ReadoutRow {
  readonly index: number
  readonly name: string
  readonly month: number
  readonly point: MonthPoint | null
  readonly handedBackAt: number | null
}

export function readout(_outcome: Extract<PageOutcome, { kind: 'ok' }>, _inputs: CarDecisionInputs, _month: number): ReadoutRow[] {
  return []
}
