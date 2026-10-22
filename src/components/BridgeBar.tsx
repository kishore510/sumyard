import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { useTheme } from '@/hooks/useTheme'

/*
 * Bars that go either way from a line of nothing (session 3d-2,
 * docs/ui-patterns.md, U38): how a difference between two things splits
 * into parts, a row per part that differs and the total last. Built as
 * SplitBar is, with no new Chart type:
 *
 * - each row's label and signed figure in text, with a bar under it drawn
 *   from the centre line, right for above nothing and left for below, its
 *   length against the largest size of any row or the total;
 * - colours only from semantic tokens (fill-* and stroke-* classes): above
 *   nothing the accent, below it the muted text, the total the text colour;
 *   never the danger colour, since no part is a warning. Rows differ by side
 *   and sign as well as colour, and a key says which side is which;
 * - the drawing is one image, named by its title and described by a text
 *   summary of every part; everyone can open the same figures, the parts
 *   that are the same included, as a table in a focusable region;
 * - the bars scale with their container (a 0 to 100 viewBox), so they fit
 *   at any width; stamped with the theme (useTheme) so they redraw on a
 *   change. No animation. Geometry constants are layout, not design tokens.
 */

const SPAN = 100
const MIDDLE = SPAN / 2
const BAR = 10

export interface BridgeBarRow {
  readonly id: string
  readonly label: string
  /** Whole units, signed (for money, pence). */
  readonly value: number
}

function Bar({ value, largest, className }: { value: number; largest: number; className: string }) {
  const length = largest > 0 ? (Math.abs(value) / largest) * MIDDLE : 0
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${SPAN} ${BAR}`} preserveAspectRatio="none" className="block h-2.5 w-full">
      <rect x={value < 0 ? MIDDLE - length : MIDDLE} y={0} width={length} height={BAR} className={className} />
      <line x1={MIDDLE} x2={MIDDLE} y1={0} y2={BAR} vectorEffect="non-scaling-stroke" className="stroke-border-strong" />
    </svg>
  )
}

export function BridgeBar({
  title,
  rows,
  total,
  totalLabel,
  formatValue,
  more,
  less,
}: {
  title: string
  /** Every part, in order; parts of nothing are drawn as none and named as the same. */
  rows: readonly BridgeBarRow[]
  /** The rows' sum. */
  total: number
  totalLabel: string
  /** A signed figure ("+£12.34"). */
  formatValue: (value: number) => string
  /** What above nothing means ("More for the first option"), and below. */
  more: string
  less: string
}) {
  const { theme } = useTheme()
  const uid = useId().replace(/[^\w-]/g, '')
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`
  const drawn = rows.filter((row) => row.value !== 0)
  const same = rows.filter((row) => row.value === 0)
  const largest = Math.max(Math.abs(total), ...drawn.map((row) => Math.abs(row.value)))
  const summary = [
    `${totalLabel} ${formatValue(total)}${drawn.length > 0 ? `: ${drawn.map((row) => `${row.label} ${formatValue(row.value)}`).join(', ')}` : ''}.`,
    drawn.length === 0
      ? 'Every part is the same for both.'
      : same.length > 0
        ? `The same for both: ${same.map((row) => row.label).join(', ')}.`
        : '',
  ]
    .filter(Boolean)
    .join(' ')
  const tone = (value: number) => (value < 0 ? 'fill-text-muted' : 'fill-accent')

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
      {drawn.length === 0 ? (
        <p data-bridge-same className="rounded-md border border-dashed border-border-strong px-4 py-4 text-center text-sm text-text-muted">
          Every part is the same for both.
        </p>
      ) : (
        <>
          <ul data-bridge-key className="flex flex-col gap-1 text-xs text-text [overflow-wrap:anywhere]">
            <li className="flex items-center gap-1.5">
              <svg aria-hidden="true" width={14} height={14} className="shrink-0">
                <rect x={1} y={1} width={12} height={12} rx={2} className="fill-accent" />
              </svg>
              <span>Right of the line: {more}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <svg aria-hidden="true" width={14} height={14} className="shrink-0">
                <rect x={1} y={1} width={12} height={12} rx={2} className="fill-text-muted" />
              </svg>
              <span>Left of the line: {less}</span>
            </li>
          </ul>
          <div role="img" aria-labelledby={titleId} aria-describedby={descId} className="flex min-w-0 flex-col gap-2">
            {drawn.map((row) => (
              <div key={row.id} data-bridge-row={row.id} data-value={row.value} className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm text-text">
                  <span className="min-w-0">{row.label}</span>
                  <span data-bridge-value className="shrink-0 tabular-nums">
                    {formatValue(row.value)}
                  </span>
                </div>
                <Bar value={row.value} largest={largest} className={tone(row.value)} />
              </div>
            ))}
            <div data-bridge-total data-value={total} className="flex min-w-0 flex-col gap-1 border-t border-border pt-2">
              <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-text">
                <span className="min-w-0">{totalLabel}</span>
                <span className="shrink-0 tabular-nums">{formatValue(total)}</span>
              </div>
              <Bar value={total} largest={largest} className="fill-text" />
            </div>
          </div>
        </>
      )}

      <details className="group min-w-0 rounded-md border border-border">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Show as a table</span>
          <ChevronDown aria-hidden="true" className="size-4 text-text-muted group-open:rotate-180" />
        </summary>
        {/* A table wider than its container scrolls sideways in a region that can be focused (axe scrollable-region-focusable). */}
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this names a scrolling table. */}
        <div
          role="group"
          aria-label={`${title}, as a table`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable.
          tabIndex={0}
          className="overflow-x-auto border-t border-border"
        >
          <table data-bridge-table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  Part
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Difference a month
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-text">
                    {row.label}
                  </th>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-text tabular-nums">{formatValue(row.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-medium">
                <th scope="row" className="px-3 py-2 text-left text-text">
                  {totalLabel}
                </th>
                <td className="px-3 py-2 text-right whitespace-nowrap text-text tabular-nums">{formatValue(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </figure>
  )
}
