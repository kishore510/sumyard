import type { ChartReference, ChartSeries } from './types'

/*
 * The chart's text summary, read by screen readers with the chart and shown
 * under it: for each series where it starts and ends, and its highest and
 * lowest values; then each reference line.
 */

export function describeChart({
  categories,
  series,
  references = [],
  format,
}: {
  categories: readonly string[]
  series: readonly ChartSeries[]
  references?: readonly ChartReference[]
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
  return parts.join(' ')
}
