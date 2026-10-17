import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import { bandScale, linearScale, niceDomain } from './scale'
import { describeChart } from './summary'
import type { ChartReference, ChartSeries } from './types'

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
 *
 * Geometry constants below are chart layout, not design tokens.
 */

const HEIGHT = 240
const MIN_WIDTH = 280
const FALLBACK_WIDTH = 640
const PAD = { top: 28, right: 12, bottom: 44 }
const CHAR = 7
const MARKER = 4

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
}: ChartProps) {
  const { theme } = useTheme()
  const [ref, width] = useWidth()
  const id = useId()
  const titleId = `${id}-title`
  const descId = `${id}-desc`
  const summary = describeChart({ categories, series, references, format: formatValue })
  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const empty = categories.length === 0 || values.length === 0

  const domain = niceDomain([...values, ...references.map((r) => r.value)], {
    includeZero: includeZero || series.some((s) => s.kind === 'bar'),
    integer,
  })
  const tickLabels = domain.ticks.map(formatTick)
  const left = Math.max(...tickLabels.map((t) => t.length), 3) * CHAR + 12
  const plot = { left, right: width - PAD.right, top: PAD.top, bottom: HEIGHT - PAD.bottom }
  const y = linearScale([domain.min, domain.max], [plot.bottom, plot.top])
  const x = bandScale(categories.length, [plot.left, plot.right], 0.3)
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
        <span id={descId} className="text-sm text-text-muted">
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
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
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
                const points = s.values.flatMap((value, i) => (value === null ? [] : [[x.center(i), y(value)] as const]))
                return (
                  <g key={s.id} data-series={s.id}>
                    <polyline
                      points={points.map(([px, py]) => `${px},${py}`).join(' ')}
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray={style.dash}
                      strokeLinejoin="round"
                      className={style.stroke}
                    />
                    {points.map(([px, py]) =>
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

            {categories.map((category, i) =>
              i % every === 0 || i === categories.length - 1 ? (
                <text key={category} x={x.center(i)} y={plot.bottom + 16} textAnchor="middle" className="fill-text-muted text-xs">
                  {category}
                </text>
              ) : null,
            )}
            <text x={(plot.left + plot.right) / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-text-muted text-xs">
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
              </tr>
            </thead>
            <tbody>
              {categories.map((category, i) => (
                <tr key={category} className="border-t border-border">
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
