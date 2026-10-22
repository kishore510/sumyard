import { ChevronDown } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { bandScale, linearScale, niceDomain, ticksWithin } from './scale'
import { describeChart, spanKey } from './summary'
import type { ChartMarker, ChartReference, ChartSeries, ChartSpan, ChartStyle } from './types'

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
 *   value ticks. Then `markers` draw numbered vertical lines (markers closer
 *   than a number's width share one number) and `spans`
 *   lettered shaded ranges (the line across a range is dashed), each listed
 *   under the chart with its label and said in the text summary, and
 *   `selectedX` highlights one point (on the line and in the table).
 * - `columns` adds text columns to the table after the series. The table
 *   scrolls sideways in its own keyboard-focusable region on a narrow screen.
 * - Up to four line styles (accent solid, contrast dashed, danger dotted,
 *   neutral dash-dot), each with its own marker shape; a series picks one
 *   by `style` or takes its place's. `endLabels` names each line at its
 *   last value (a line may stop before the x range does), nudged apart so
 *   labels never overlap.
 * - With `onSelectX` (numeric x only) the plot is a slider: a tap or click
 *   picks the nearest x, arrows step, Home and End jump; the selected x is
 *   marked across the plot and on every line, its table row is highlighted
 *   (each row's x is a button that selects it) and the summary names it.
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
const MIN_SPAN = 3

const END_LABEL_GAP = 12
const PAGE_STEPS = 10

type Shape = 'circle' | 'square' | 'diamond'

/** Per style: stroke or fill class, dash and marker shape. Only token colours; no two differ by colour alone. */
const STYLES: Record<ChartStyle, { stroke: string; fill: string; dash: string | undefined; marker: Shape }> = {
  accent: { stroke: 'stroke-accent', fill: 'fill-accent', dash: undefined, marker: 'circle' },
  contrast: { stroke: 'stroke-text', fill: 'fill-text-muted', dash: '6 3', marker: 'square' },
  danger: { stroke: 'stroke-danger', fill: 'fill-danger', dash: '2 3', marker: 'circle' },
  neutral: { stroke: 'stroke-text-muted', fill: 'fill-text-muted', dash: '10 3 2 3', marker: 'diamond' },
}

/** The style a series takes by its place when it names none (the first three as before 3c-2). */
const ORDER: readonly ChartStyle[] = ['accent', 'contrast', 'danger', 'neutral']

const styleOf = (series: ChartSeries, index: number) => STYLES[series.style ?? ORDER[index % ORDER.length]!]

/** A point marker of a shape, centred on (cx, cy). A diamond is a square turned, so its box still centres on the point. */
function MarkerShape({ shape, cx, cy, r, className, ...rest }: { shape: Shape; cx: number; cy: number; r: number; className: string }) {
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={r} strokeWidth={2} className={className} {...rest} />
  return (
    <rect
      x={cx - r}
      y={cy - r}
      width={r * 2}
      height={r * 2}
      strokeWidth={2}
      transform={shape === 'diamond' ? `rotate(45 ${cx} ${cy})` : undefined}
      className={className}
      {...rest}
    />
  )
}

/** End-label heights, nudged apart to at least the gap, kept inside [top, bottom]. Ys in, in any order; the same order out. */
function spreadLabels(ys: readonly number[], top: number, bottom: number): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0])
  const placed: number[] = []
  for (const [y] of order) placed.push(Math.max(y, top, (placed.at(-1) ?? -Infinity) + END_LABEL_GAP))
  // Pushed past the bottom: shift the run back up, keeping the gaps.
  const over = (placed.at(-1) ?? bottom) - bottom
  const shifted = over > 0 ? placed.map((y) => y - over) : placed
  const out: number[] = []
  order.forEach(([, i], k) => {
    out[i] = shifted[k]!
  })
  return out
}

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
  /** Extra table columns after the series, one text per category each; `numeric` ones are right-aligned. */
  columns?: readonly { readonly label: string; readonly values: readonly string[]; readonly numeric?: boolean }[]
  /** Numeric x only: the x value of a point to highlight on the first line series and in the table. */
  selectedX?: number
  /** Label each line at its last value with its name and marker. */
  endLabels?: boolean
  /** Numeric x only: makes the chart a slider (pointer, arrows, Home, End) and the table rows buttons that report the x chosen. */
  onSelectX?: (x: number) => void
  /** The slider's name, such as "Month on the chart". */
  selectLabel?: string
}

/** One label's most characters before it is cut short (the legend and table carry the whole name). */
const END_LABEL_CHARS = 18

const shorten = (label: string) =>
  Array.from(label).length > END_LABEL_CHARS
    ? `${Array.from(label)
        .slice(0, END_LABEL_CHARS - 1)
        .join('')}…`
    : label

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
  columns = [],
  selectedX,
  endLabels = false,
  onSelectX,
  selectLabel,
}: ChartProps) {
  const { theme } = useTheme()
  const [ref, width] = useWidth()
  const svgRef = useRef<SVGSVGElement>(null)
  const id = useId()
  const titleId = `${id}-title`
  const descId = `${id}-desc`
  const numeric = xValues !== undefined && xValues.length === categories.length
  const shownMarkers = numeric ? markers : []
  const shownSpans = numeric ? spans : []
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
  const xTicks = numeric ? ticksWithin(xValues, { integer, targetTicks: Math.max(2, Math.floor((right - left) / 90)) }) : []
  const xScale = numeric ? linearScale([xMin, xMax], [left, right]) : null
  // Markers closer than a number's width share one number, at the first one's place; the list says each label under it.
  const groups: { at: number; markers: ChartMarker[] }[] = []
  for (const marker of shownMarkers) {
    const at = xScale ? xScale(marker.x) : 0
    const last = groups.at(-1)
    const labelWidth = Math.max(MARKER_GAP, String(groups.length).length * CHAR + CHAR)
    if (last && at - last.at < labelWidth) last.markers.push(marker)
    else groups.push({ at, markers: [marker] })
  }
  const extraTop = (groups.length > 0 ? ROW : 0) + (shownSpans.length > 0 ? ROW : 0)
  const merged = groups.map((group) => ({ x: group.markers[0]!.x, label: group.markers.map((m) => m.label).join('; ') }))
  const interactive = numeric && onSelectX !== undefined
  const selectedIndex = numeric && selectedX !== undefined ? xValues.indexOf(selectedX) : -1
  const summary = describeChart({
    categories,
    series,
    references,
    markers: merged,
    spans: shownSpans,
    format: formatValue,
    selectedIndex: interactive && selectedIndex >= 0 ? selectedIndex : undefined,
  })
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
  const lines = series.filter((s) => s.kind === 'line')
  // Without selection the highlight is on the first line only (as before 3c-2); with it, on every line.
  const highlighted = selectedIndex < 0 ? [] : interactive ? lines : lines.slice(0, 1)
  const ends = endLabels
    ? lines.flatMap((s) => {
        const last = s.values.findLastIndex((v) => v !== null)
        return last < 0 ? [] : [{ s, at: last, x: px(last), y: y(s.values[last]!) }]
      })
    : []
  const endYs = spreadLabels(
    ends.map((e) => e.y - MARKER - 4),
    plot.top + ROW / 2,
    plot.bottom - 4,
  )
  const valueText = (i: number) =>
    `${categories[i] ?? ''}: ${lines.map((s) => `${s.label} ${s.values[i] === null || s.values[i] === undefined ? 'no value' : formatValue(s.values[i]!)}`).join(', ')}`
  const select = (i: number) => {
    if (interactive && xValues[i] !== undefined) onSelectX(xValues[i]!)
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = categories.length - 1
    const at = selectedIndex >= 0 ? selectedIndex : last
    const page = Math.max(1, Math.round(categories.length / PAGE_STEPS))
    const next: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowUp: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at - 1,
      PageUp: at + page,
      PageDown: at - page,
      Home: 0,
      End: last,
    }
    if (!(event.key in next)) return
    event.preventDefault()
    select(Math.min(last, Math.max(0, next[event.key]!)))
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    if (box.width <= 0) return
    const at = (event.clientX - box.left) * (width / box.width)
    let nearest = 0
    categories.forEach((_, i) => {
      if (Math.abs(px(i) - at) < Math.abs(px(nearest) - at)) nearest = i
    })
    select(nearest)
  }
  const sliderProps = interactive
    ? {
        role: 'slider',
        tabIndex: 0,
        'aria-label': selectLabel ?? xLabel,
        'aria-valuemin': xMin,
        'aria-valuemax': xMax,
        'aria-valuenow': selectedIndex >= 0 ? xValues[selectedIndex] : xMax,
        'aria-valuetext': valueText(selectedIndex >= 0 ? selectedIndex : categories.length - 1),
        'aria-describedby': descId,
        onKeyDown: onKey,
        onClick,
      }
    : {}

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
      <div ref={ref} {...sliderProps} className={cn('w-full min-w-0', interactive && 'cursor-pointer rounded-md')}>
        {empty ? (
          <p className="rounded-md border border-dashed border-border-strong px-4 py-10 text-center text-sm text-text-muted">
            No data to show.
          </p>
        ) : (
          <svg
            ref={svgRef}
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
              const style = styleOf(s, series.indexOf(s))
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
                const style = styleOf(s, series.indexOf(s))
                const end = ends.find((e) => e.s === s)
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
                    {(pointMarkers ? points : []).map(([px, py]) => (
                      <MarkerShape
                        key={`${px}`}
                        shape={style.marker}
                        cx={px}
                        cy={py}
                        r={MARKER}
                        className={cn('fill-surface', style.stroke)}
                      />
                    ))}
                    {end && !pointMarkers && (
                      <MarkerShape
                        shape={style.marker}
                        cx={end.x}
                        cy={end.y}
                        r={MARKER}
                        className={cn('fill-surface', style.stroke)}
                        {...{ 'data-end-marker': '' }}
                      />
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

            {interactive && selectedIndex >= 0 && (
              <line
                data-selected-position
                x1={px(selectedIndex)}
                x2={px(selectedIndex)}
                y1={plot.top}
                y2={plot.bottom}
                strokeWidth={2}
                className="stroke-accent"
              />
            )}
            {highlighted.map((s) => {
              const value = s.values[selectedIndex]
              if (value === null || value === undefined) return null
              return interactive ? (
                <MarkerShape
                  key={s.id}
                  shape={styleOf(s, series.indexOf(s)).marker}
                  cx={px(selectedIndex)}
                  cy={y(value)}
                  r={MARKER + 2}
                  className={cn('fill-surface', styleOf(s, series.indexOf(s)).stroke)}
                  {...{ 'data-selected': '' }}
                />
              ) : (
                <circle
                  key={s.id}
                  data-selected
                  cx={px(selectedIndex)}
                  cy={y(value)}
                  r={MARKER + 2}
                  strokeWidth={2}
                  className="fill-accent stroke-surface"
                />
              )
            })}

            {ends.map((e, k) => (
              <g key={e.s.id} data-end-label={e.s.id}>
                <text
                  x={Math.max(plot.left + CHAR, e.x - MARKER - 4)}
                  y={endYs[k]}
                  textAnchor="end"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="fill-text stroke-surface text-xs font-medium"
                >
                  {shorten(e.s.label)}
                </text>
              </g>
            ))}

            {xScale &&
              groups.map((group, i) => (
                <g key={`${group.markers[0]!.x}-${group.markers[0]!.label}`} data-marker>
                  {group.markers.map((marker) => (
                    <line
                      key={`${marker.x}-${marker.label}`}
                      x1={xScale(marker.x)}
                      x2={xScale(marker.x)}
                      y1={plot.top}
                      y2={plot.bottom}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      className="stroke-text"
                    />
                  ))}
                  <text
                    x={group.at}
                    y={PAD.top + ROW / 2}
                    dy="0.32em"
                    textAnchor="middle"
                    className="fill-text text-xs font-semibold tabular-nums"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}

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
            const style = styleOf(s, i)
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
          {groups.map((group, i) => (
            <li key={`m-${group.markers[0]!.x}-${group.markers[0]!.label}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{i + 1}</span>
              <span className="flex min-w-0 flex-col">
                {group.markers.map((marker) => (
                  <span key={`${marker.x}-${marker.label}`}>{marker.label}</span>
                ))}
              </span>
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
        <section
          aria-labelledby={titleId}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
          tabIndex={0}
          className="overflow-x-auto border-t border-border"
        >
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
                {columns.map((column) => (
                  <th key={column.label} scope="col" className={cn('px-3 py-2 font-medium', column.numeric && 'text-right')}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category, i) => (
                // Numeric x values are unique where formatted categories may not be (amounts shown in whole pounds).
                <tr
                  key={numeric ? xValues[i] : category}
                  data-selected-row={i === selectedIndex ? '' : undefined}
                  className={cn('border-t border-border', i === selectedIndex && 'bg-accent-subtle')}
                >
                  <th scope="row" className={cn('text-left font-normal text-text', interactive ? 'p-0' : 'px-3 py-2')}>
                    {interactive ? (
                      <button
                        type="button"
                        aria-pressed={i === selectedIndex}
                        onClick={() => select(i)}
                        className="min-h-touch w-full cursor-pointer px-3 text-left whitespace-nowrap underline-offset-2 hover:underline"
                      >
                        {category}
                      </button>
                    ) : (
                      category
                    )}
                  </th>
                  {series.map((s) => {
                    const value = s.values[i]
                    return (
                      <td key={s.id} className="px-3 py-2 text-right text-text tabular-nums">
                        {value === null || value === undefined ? '–' : formatValue(value)}
                      </td>
                    )
                  })}
                  {columns.map((column) => (
                    <td
                      key={column.label}
                      className={cn(
                        'px-3 py-2 text-text',
                        column.numeric ? 'text-right tabular-nums whitespace-nowrap' : 'text-xs [overflow-wrap:anywhere]',
                      )}
                    >
                      {column.values[i] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {references.length > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
              {references.map((r) => `${r.label}: ${formatValue(r.value)}`).join('. ')}.
            </p>
          )}
        </section>
      </details>
    </figure>
  )
}
