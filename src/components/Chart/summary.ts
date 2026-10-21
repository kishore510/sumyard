import type { ChartMarker, ChartReference, ChartSeries, ChartSpan } from './types'

/*
 * The chart's text summary, read by screen readers with the chart and shown
 * under it: for each series where it starts and ends, and its highest and
 * lowest values; then each reference line, each marker by its number and
 * each range by its letter (as the chart and its list show them).
 */

/** A range's letter: A, B and so on, then A2, B2 after the alphabet. */
export const spanKey = (index: number) => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const round = Math.floor(index / letters.length)
  return `${letters[index % letters.length]}${round > 0 ? round + 1 : ''}`
}

export function describeChart({
  categories,
  series,
  references = [],
  markers = [],
  spans = [],
  format,
}: {
  categories: readonly string[]
  series: readonly ChartSeries[]
  references?: readonly ChartReference[]
  markers?: readonly ChartMarker[]
  spans?: readonly ChartSpan[]
  format: (value: number) => string
}): string {
  if (series.length === 0 || categories.length === 0) return 'No data to show.'
  const parts = series.map((s) => {
    const points = s.values.flatMap((value, index) =>
      value === null || !Number.isFinite(value) ? [] : [{ value, at: categories[index] ?? '' }],
    )
    if (points.length === 0) return `${s.label}: no values.`
    const first = points[0]!
    if (points.length === 1) return `${s.label}: ${format(first.value)} at ${first.at}.`
    const last = points.at(-1)!
    const high = points.reduce((a, b) => (b.value > a.value ? b : a))
    const low = points.reduce((a, b) => (b.value < a.value ? b : a))
    return `${s.label}: ${format(first.value)} at ${first.at} to ${format(last.value)} at ${last.at}; highest ${format(high.value)} at ${high.at}, lowest ${format(low.value)} at ${low.at}.`
  })
  for (const ref of references) parts.push(`Reference line: ${ref.label} at ${format(ref.value)}.`)
  parts.push(...markers.map((marker, i) => `Marked ${i + 1}: ${marker.label}.`))
  parts.push(...spans.map((span, i) => `Range ${spanKey(i)}: ${span.label}.`))
  return parts.join(' ')
}
