import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { bandScale, linearScale, niceDomain } from './scale'
import { describeChart, spanKey } from './summary'
import type { ChartMarker, ChartReference, ChartSeries, ChartSpan } from './types'

/*
 * A hand-rolled SVG chart (no library): bars and lines over categories,
 * horizontal reference lines for thresholds, labelled axes and markers on
 * every line point.
 *
 * - Colours come only from semantic tokens, through Tailwind fill-* and
 *   stroke-* classes, so the browser repaints on a theme change; the chart
 *   also re-renders then (useTheme) and stamps data-theme for checks.
 * - Series differ by more than colour: bars versus lines, solid versus
 *   dashed, round versus square markers; reference lines are dashed and
 *   labelled in text.
 * - Screen readers get the title and a text summary; everyone can open the
 *   same data as a table (the keyboard route to every value).
 * - It is drawn at its container's width (from 280 px), so it fits a 360 px
 *   phone, and it does not animate, so reduced motion needs nothing more.
 * - With `xValues` the x axis is numeric: points sit at their values, with
 *   value ticks. Then `markers` draw numbered vertical lines and `spans`
 *   lettered shaded ranges (the line across a range is dashed), each listed
 *   under the chart with its label and said in the text summary.
 *
 * Geometry constants below are chart layout, not design tokens.
 */

const HEIGHT = 240
const MIN_WIDTH = 280
const FALLBACK_WIDTH = 640
const PAD = { top: 28, right: 12, bottom: 44 }
const CHAR = 7
const MARKER = 4
const ROW = 14
const MARKER_GAP = 16
const MARKER_ROWS = 3
const MIN_SPAN = 3

/** Per series: stroke or fill class, dash and marker shape. Only token colours. */
const STYLES = [
  { stroke: 'stroke-accent', fill: 'fill-accent', dash: undefined, marker: 'circle' },
  { stroke: 'stroke-text', fill: 'fill-text-muted', dash: '6 3', marker: 'square' },
  { stroke: 'stroke-danger', fill: 'fill-danger', dash: '2 3', marker: 'circle' },
] as const

export interface ChartProps {
  title: string
  categories: readonly string[]
  series: readonly ChartSeries[]
  references?: readonly ChartReference[]
  xLabel: string
  yLabel: string
  /** Short labels for the y axis ticks (for money, formatGBPCompact). */
  formatTick: (value: number) => string
  /** Full values for the summary and table (for money, formatGBP). */
  formatValue: (value: number) => string
  /** Values are whole numbers (pence): ticks stay exact. */
  integer?: boolean
  /** Keep zero on the axis. Always on when there are bars. */
  includeZero?: boolean
  /** Numeric x positions, one per category, ascending: the x axis is then linear, with ticks from `formatXTick`. */
  xValues?: readonly number[]
  formatXTick?: (value: number) => string
  /** Numbered vertical markers (numeric x only). */
  markers?: readonly ChartMarker[]
  /** Lettered ranges (numeric x only). */
  spans?: readonly ChartSpan[]
  /** Draw a marker on every line point (default); off for a dense line. */
  pointMarkers?: boolean
  /** An extra table column, one text per category. */
  rowNotes?: { readonly label: string; readonly values: readonly string[] }
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, Math.max(MIN_WIDTH, width)] as const
}

export function Chart({
  title,
  categories,
  series,
  references = [],
  xLabel,
  yLabel,
  formatTick,
  formatValue,
  integer,
  includeZero,
  xValues,
  formatXTick = String,
  markers = [],
  spans = [],
  pointMarkers = true,
  rowNotes,
}: ChartProps) {
  const { theme } = useTheme()
  const [ref, width] = useWidth()
  const id = useId()
  const titleId = `${id}-title`
  const descId = `${id}-desc`
  const numeric = xValues !== undefined && xValues.length === categories.length
  const shownMarkers = numeric ? markers : []
  const shownSpans = numeric ? spans : []
  const summary = describeChart({ categories, series, references, markers: shownMarkers, spans: shownSpans, format: formatValue })
  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const empty = categories.length === 0 || values.length === 0

  const domain = niceDomain([...values, ...references.map((r) => r.value)], {
    includeZero: includeZero || series.some((s) => s.kind === 'bar'),
    integer,
  })
  const tickLabels = domain.ticks.map(formatTick)
  const left = Math.max(...tickLabels.map((t) => t.length), 3) * CHAR + 12
  const right = width - PAD.right
  // Numeric x: the scale runs over the data, with round ticks inside it.
  const xMin = numeric ? Math.min(...xValues) : 0
  const xMax = numeric ? Math.max(...xValues) : 0
  const xTicks = numeric
    ? niceDomain(xValues, { integer, targetTicks: Math.max(2, Math.floor((right - left) / 90)) }).ticks.filter(
        (t) => t >= xMin && t <= xMax,
      )
    : []
  const xScale = numeric ? linearScale([xMin, xMax], [left, right]) : null
  // Marker numbers sit in rows above the plot, a row lower when the one above is too close.
  const markerRows: number[] = []
  const lastInRow: number[] = []
  for (const marker of shownMarkers) {
    const at = xScale ? xScale(marker.x) : 0
    let row = lastInRow.findIndex((last) => at - last >= MARKER_GAP)
    if (row === -1) row = lastInRow.length < MARKER_ROWS ? lastInRow.length : lastInRow.indexOf(Math.min(...lastInRow))
    lastInRow[row] = at
    markerRows.push(row)
  }
  const extraTop = (shownMarkers.length > 0 ? lastInRow.length : 0) * ROW + (shownSpans.length > 0 ? ROW : 0)
  const height = HEIGHT + extraTop
  const plot = { left, right, top: PAD.top + extraTop, bottom: height - PAD.bottom }
  const y = linearScale([domain.min, domain.max], [plot.bottom, plot.top])
  const x = bandScale(categories.length, [plot.left, plot.right], 0.3)
  const px = (i: number) => (xScale && xValues ? xScale(xValues[i]!) : x.center(i))
  const inSpan = (i: number) =>
    !!xValues && i + 1 < xValues.length && shownSpans.some((span) => span.from <= xValues[i]! && xValues[i + 1]! <= span.to)
  const bars = series.filter((s) => s.kind === 'bar')
  const barWidth = bars.length > 0 ? x.bandwidth / bars.length : 0
  // Show every nth category label so they don't overlap on a phone.
  const longest = Math.max(...categories.map((c) => c.length), 1)
  const every = Math.max(1, Math.ceil(((longest * CHAR + 8) * categories.length) / Math.max(1, plot.right - plot.left)))
  const zero = domain.min <= 0 && domain.max >= 0 ? y(0) : null

  return (
    <figure data-chart data-theme={theme} className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span id={titleId} className="text-base font-semibold text-text">
          {title}
        </span>
        {/* With a marker list under the chart, the summary repeats it: screen readers only. */}
        <span id={descId} className={shownMarkers.length > 0 || shownSpans.length > 0 ? 'sr-only' : 'text-sm text-text-muted'}>
          {summary}
        </span>
      </figcaption>
      <div ref={ref} className="w-full min-w-0">
        {empty ? (
          <p className="rounded-md border border-dashed border-border-strong px-4 py-10 text-center text-sm text-text-muted">
            No data to show.
          </p>
        ) : (
          <svg
            role="img"
            aria-labelledby={titleId}
            aria-describedby={descId}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto max-w-full"
          >
            <title>{title}</title>
            <text x={plot.left} y={12} className="fill-text-muted text-xs">
              {yLabel}
            </text>
            {domain.ticks.map((tick, i) => (
              <g key={tick}>
                <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} className="stroke-border" />
                <text x={plot.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-text-muted text-xs tabular-nums">
                  {tickLabels[i]}
                </text>
              </g>
            ))}
            {xScale &&
              shownSpans.map((span, i) => {
                const from = xScale(span.from)
                const spanWidth = Math.max(MIN_SPAN, xScale(span.to) - from)
                return (
                  <g key={`${span.from}-${span.to}-${span.label}`} data-span>
                    <rect x={from} y={plot.top} width={spanWidth} height={plot.bottom - plot.top} className="fill-accent-subtle" />
                    <text x={from + spanWidth / 2} y={plot.top - 4} textAnchor="middle" className="fill-text text-xs font-medium">
                      {spanKey(i)}
                    </text>
                  </g>
                )
              })}
            {zero !== null && <line x1={plot.left} x2={plot.right} y1={zero} y2={zero} className="stroke-border-strong" />}
            <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} className="stroke-border-strong" />

            {bars.map((s, b) => {
              const style = STYLES[series.indexOf(s) % STYLES.length]!
              return (
                <g key={s.id} data-series={s.id}>
                  {s.values.map((value, i) => {
                    if (value === null) return null
                    const top = Math.min(y(value), y(0))
                    const height = Math.max(1, Math.abs(y(value) - y(0)))
                    return (
                      <rect
                        // biome-ignore lint/suspicious/noArrayIndexKey: one bar per category, in order.
                        key={i}
                        x={x.start(i) + b * barWidth}
                        y={top}
                        width={Math.max(1, barWidth - 1)}
                        height={height}
                        rx={2}
                        className={style.fill}
                      />
                    )
                  })}
                </g>
              )
            })}

            {series
              .filter((s) => s.kind === 'line')
              .map((s) => {
                const style = STYLES[series.indexOf(s) % STYLES.length]!
                const points = s.values.flatMap((value, i) => (value === null ? [] : [[px(i), y(value), i] as const]))
                // Runs of segments drawn alike: dashed inside a range, the series' own dash elsewhere.
                const runs: { dashed: boolean; points: (readonly [number, number, number])[] }[] = []
                points.forEach((point, k) => {
                  const next = points[k + 1]
                  if (!next) return
                  const dashed = next[2] === point[2] + 1 && inSpan(point[2])
                  const last = runs.at(-1)
                  if (last && last.dashed === dashed) last.points.push(next)
                  else runs.push({ dashed, points: [point, next] })
                })
                if (runs.length === 0 && points.length > 0) runs.push({ dashed: false, points: [...points] })
                return (
                  <g key={s.id} data-series={s.id}>
                    {runs.map((run) => (
                      <polyline
                        key={`${run.points[0]![2]}`}
                        points={run.points.map(([cx, cy]) => `${cx},${cy}`).join(' ')}
                        fill="none"
                        strokeWidth={2}
                        strokeDasharray={run.dashed ? '3 3' : style.dash}
                        strokeLinejoin="round"
                        className={style.stroke}
                      />
                    ))}
                    {(pointMarkers ? points : []).map(([px, py]) =>
                      style.marker === 'circle' ? (
                        <circle key={`${px}`} cx={px} cy={py} r={MARKER} strokeWidth={2} className={cn('fill-surface', style.stroke)} />
                      ) : (
                        <rect
                          key={`${px}`}
                          x={px - MARKER}
                          y={py - MARKER}
                          width={MARKER * 2}
                          height={MARKER * 2}
                          strokeWidth={2}
                          className={cn('fill-surface', style.stroke)}
                        />
                      ),
                    )}
                  </g>
                )
              })}

            {references.map((ref) => (
              <g key={ref.label} data-reference>
                <line
                  x1={plot.left}
                  x2={plot.right}
                  y1={y(ref.value)}
                  y2={y(ref.value)}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  className="stroke-text"
                />
                <text x={plot.right} y={y(ref.value) - 6} textAnchor="end" className="fill-text text-xs font-medium">
                  {ref.label}
                </text>
              </g>
            ))}

            {xScale &&
              shownMarkers.map((marker, i) => {
                const at = xScale(marker.x)
                const labelY = PAD.top + (markerRows[i] ?? 0) * ROW + ROW / 2
                return (
                  <g key={`${marker.x}-${marker.label}`} data-marker>
                    <line x1={at} x2={at} y1={plot.top} y2={plot.bottom} strokeWidth={1.5} strokeDasharray="2 2" className="stroke-text" />
                    <text x={at} y={labelY} dy="0.32em" textAnchor="middle" className="fill-text text-xs font-semibold tabular-nums">
                      {i + 1}
                    </text>
                  </g>
                )
              })}

            {xScale && (
              <g data-x-ticks>
                {xTicks.map((tick) => (
                  <text
                    key={tick}
                    x={xScale(tick)}
                    y={plot.bottom + 16}
                    textAnchor={tick === xMin ? 'start' : xScale(tick) > right - CHAR * 4 ? 'end' : 'middle'}
                    className="fill-text-muted text-xs tabular-nums"
                  >
                    {formatXTick(tick)}
                  </text>
                ))}
              </g>
            )}
            {!numeric &&
              categories.map((category, i) =>
                i % every === 0 || i === categories.length - 1 ? (
                  <text key={category} x={x.center(i)} y={plot.bottom + 16} textAnchor="middle" className="fill-text-muted text-xs">
                    {category}
                  </text>
                ) : null,
              )}
            <text x={(plot.left + plot.right) / 2} y={height - 6} textAnchor="middle" className="fill-text-muted text-xs">
              {xLabel}
            </text>
          </svg>
        )}
      </div>

      {(series.length > 1 || references.length > 0) && !empty && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text">
          {series.map((s, i) => {
            const style = STYLES[i % STYLES.length]!
            return (
              <li key={s.id} className="flex items-center gap-1.5">
                <svg aria-hidden="true" width={24} height={10}>
                  {s.kind === 'bar' ? (
                    <rect x={4} y={1} width={16} height={8} rx={2} className={style.fill} />
                  ) : (
                    <line x1={0} x2={24} y1={5} y2={5} strokeWidth={2} strokeDasharray={style.dash} className={style.stroke} />
                  )}
                </svg>
                {s.label} ({s.kind === 'bar' ? 'bars' : 'line'})
              </li>
            )
          })}
          {references.map((ref) => (
            <li key={ref.label} className="flex items-center gap-1.5">
              <svg aria-hidden="true" width={24} height={10}>
                <line x1={0} x2={24} y1={5} y2={5} strokeWidth={1.5} strokeDasharray="4 4" className="stroke-text" />
              </svg>
              {ref.label} (dashed line)
            </li>
          ))}
        </ul>
      )}

      {(shownMarkers.length > 0 || shownSpans.length > 0) && !empty && (
        <ul data-marker-list className="flex flex-col gap-1 text-xs text-text [overflow-wrap:anywhere]">
          {shownMarkers.map((marker, i) => (
            <li key={`m-${marker.x}-${marker.label}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{i + 1}</span>
              <span>{marker.label}</span>
            </li>
          ))}
          {shownSpans.map((span, i) => (
            <li key={`s-${span.from}-${span.to}-${span.label}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-semibold">{spanKey(i)}</span>
              <span>{span.label}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="group rounded-md border border-border">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Show the data as a table</span>
          <ChevronDown aria-hidden="true" className="size-4 text-text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {xLabel}
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                {rowNotes && (
                  <th scope="col" className="px-3 py-2 font-medium">
                    {rowNotes.label}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {categories.map((category, i) => (
                // Numeric x values are unique where formatted categories may not be (amounts shown in whole pounds).
                <tr key={numeric ? xValues[i] : category} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text">
                    {category}
                  </th>
                  {series.map((s) => {
                    const value = s.values[i]
                    return (
                      <td key={s.id} className="px-3 py-2 text-right text-text tabular-nums">
                        {value === null || value === undefined ? '–' : formatValue(value)}
                      </td>
                    )
                  })}
                  {rowNotes && <td className="px-3 py-2 text-xs text-text [overflow-wrap:anywhere]">{rowNotes.values[i] ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {references.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
              {references.map((r) => `${r.label}: ${formatValue(r.value)}`).join('. ')}.
            </p>
          )}
        </div>
      </details>
    </figure>
  )
}
