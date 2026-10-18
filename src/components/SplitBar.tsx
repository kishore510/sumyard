import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { formatPercent } from '@/lib/format'
import { ratio } from '@/lib/money'

/*
 * One horizontal bar split into parts of a total (docs/ui-patterns.md, U7):
 * where gross pay goes. The shared Chart draws bars and lines over
 * categories and has no stacked bar, so this is a small component built the
 * same way:
 *
 * - hand-rolled SVG at its container's width; colours only from semantic
 *   tokens through fill-* and stroke-* classes (and token-stroked hatching),
 *   re-rendered on a theme change (useTheme, stamped as data-theme);
 * - parts differ by more than colour: their order, a gap between each,
 *   solid or hatched fills, and a legend naming each with its value;
 * - screen readers get the title and a text summary; everyone can open the
 *   same figures, with each part's share, as a table;
 * - no animation, so reduced motion needs nothing more.
 *
 * A part below nothing, or parts that don't add up to the total, can't be
 * drawn: the bar says so and keeps the summary and table. Geometry
 * constants are layout, not design tokens.
 */

const HEIGHT = 36
const FALLBACK_WIDTH = 640
const GAP = 2
const HATCH = 6

type Style = { readonly fill: string; readonly hatch?: string }

/** Per part, by its place in the list: solid token fills, then token hatching over the surface. The highlight is the accent. */
const STYLES: readonly Style[] = [
  { fill: 'fill-text' },
  { fill: 'fill-text-muted' },
  { fill: 'fill-border-strong' },
  { fill: 'fill-surface', hatch: 'stroke-text' },
  { fill: 'fill-surface', hatch: 'stroke-text-muted' },
  { fill: 'fill-surface', hatch: 'stroke-border-strong' },
]
const HIGHLIGHT: Style = { fill: 'fill-accent' }

export interface SplitBarSegment {
  readonly id: string
  readonly label: string
  /** Whole units (for money, pence). */
  readonly value: number
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
  return [ref, width] as const
}

export function SplitBar({
  title,
  segments,
  total,
  totalLabel,
  formatValue,
  highlight,
}: {
  title: string
  /** Every part, in order; parts of nothing are left out of the bar, legend and table. */
  segments: readonly SplitBarSegment[]
  total: number
  /** What the total is ("Gross pay"). */
  totalLabel: string
  formatValue: (value: number) => string
  /** The id of the part to show in the accent (take-home). */
  highlight?: string
}) {
  const { theme } = useTheme()
  const [ref, width] = useWidth()
  const uid = useId().replace(/[^\w-]/g, '')
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`
  const styled = segments.map((s, i) => ({ ...s, style: s.id === highlight ? HIGHLIGHT : STYLES[i % STYLES.length]! }))
  const shown = styled.filter((s) => s.value !== 0)
  const sum = shown.reduce((a, s) => a + s.value, 0)
  const problem =
    total <= 0
      ? 'Nothing to show yet: enter your pay.'
      : shown.some((s) => s.value < 0) || sum !== total
        ? 'This can’t be drawn as a bar: a part is below nothing. The figures are below.'
        : null
  const summary = `${totalLabel} ${formatValue(total)}, split into ${shown.map((s) => `${s.label}: ${formatValue(s.value)}`).join(', ')}.`
  const share = (value: number) => (total > 0 ? formatPercent(ratio(value, total), 1) : '–')
  const hatchId = (s: { style: Style }) => `${uid}-hatch-${STYLES.indexOf(s.style)}`

  let start = 0
  const parts = shown.map((s) => {
    const x = (start / total) * width
    start += s.value
    return { ...s, x, w: (start / total) * width - x }
  })

  return (
    <figure data-theme={theme} className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span id={titleId} className="text-base font-semibold text-text">
          {title}
        </span>
        <span id={descId} className="text-sm text-text-muted">
          {summary}
        </span>
      </figcaption>
      <div ref={ref} className="w-full min-w-0">
        {problem ? (
          <p className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-text-muted">{problem}</p>
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
            <defs>
              {STYLES.filter((style) => style.hatch).map((style) => (
                <pattern
                  key={style.hatch}
                  id={`${uid}-hatch-${STYLES.indexOf(style)}`}
                  width={HATCH}
                  height={HATCH}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`rotate(${STYLES.indexOf(style) % 2 === 0 ? 45 : -45})`}
                >
                  <line x1={0} y1={0} x2={0} y2={HATCH} strokeWidth={GAP} className={style.hatch} />
                </pattern>
              ))}
            </defs>
            {parts.map((p) => (
              <g key={p.id} data-segment={p.id} data-value={p.value}>
                <rect x={p.x} y={0} width={p.w} height={HEIGHT} strokeWidth={GAP} className={`${p.style.fill} stroke-surface`} />
                {p.style.hatch && (
                  <path
                    d={`M${p.x + GAP} ${GAP}h${Math.max(0, p.w - GAP * 2)}v${HEIGHT - GAP * 2}h${-Math.max(0, p.w - GAP * 2)}Z`}
                    fill={`url(#${hatchId(p)})`}
                  />
                )}
              </g>
            ))}
          </svg>
        )}
      </div>

      {!problem && (
        <ul data-legend className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <svg aria-hidden="true" width={14} height={14} className="shrink-0">
                <rect x={1} y={1} width={12} height={12} rx={2} strokeWidth={1} className={`${p.style.fill} stroke-border-strong`} />
                {p.style.hatch && <rect x={1} y={1} width={12} height={12} rx={2} fill={`url(#${hatchId(p)})`} />}
              </svg>
              <span>{p.label}</span> <span className="font-medium tabular-nums">{formatValue(p.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="group min-w-0 rounded-md border border-border">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Show as a table</span>
          <ChevronDown aria-hidden="true" className="size-4 text-text-muted group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  Part
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text">
                    {s.label}
                  </th>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{formatValue(s.value)}</td>
                  <td className="px-3 py-2 text-right text-text tabular-nums">{share(s.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-medium">
                <th scope="row" className="px-3 py-2 text-left text-text">
                  {totalLabel}
                </th>
                <td className="px-3 py-2 text-right text-text tabular-nums">{formatValue(total)}</td>
                <td className="px-3 py-2 text-right text-text tabular-nums">{share(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </figure>
  )
}
