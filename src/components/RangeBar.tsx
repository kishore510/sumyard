import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

/*
 * One horizontal bar from nothing, with an optional thin range whisker
 * (the C2 page rebuild, the next pound page's three bars). Built as
 * BridgeBar's bars are, with no new Chart type:
 *
 * - drawn in a 0 to 100 viewBox that scales with its container, so it fits
 *   any width; the bar's length is its share of a scale the caller shares
 *   across bars, so bars compare;
 * - colours only from semantic tokens (fill-* and stroke-* classes), passed
 *   by the caller; a track in the muted surface; the whisker in the text
 *   colour with end caps, so the range reads without colour;
 * - decoration only (aria-hidden): the caller puts every figure in text
 *   beside it, and a table. Stamped with the theme (useTheme) so it redraws
 *   on a change. No animation. Geometry constants are layout, not tokens.
 */

const SPAN = 100
const HEIGHT = 12
const BAR_TOP = 2
const BAR_HEIGHT = 8
const CAP = 3

const clampShare = (share: number) => Math.min(1, Math.max(0, share))

export function RangeBar({
  share,
  low,
  high,
  fill,
  className,
}: {
  /** The bar's length, as a share of the shared scale (nothing to one). */
  share: number
  /** The range's ends as shares of the same scale; null for no whisker. */
  low: number | null
  high: number | null
  /** A token fill class: fill-accent, fill-swatch-teal, fill-text-muted. */
  fill: string
  className?: string
}) {
  const { theme } = useTheme()
  const x = clampShare(share) * SPAN
  const whisker = low !== null && high !== null && high > low
  const from = clampShare(low ?? 0) * SPAN
  const to = clampShare(high ?? 0) * SPAN
  const middle = HEIGHT / 2
  return (
    <svg
      aria-hidden="true"
      data-bar-track
      data-theme={theme}
      viewBox={`0 0 ${SPAN} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('block h-3 w-full overflow-visible', className)}
    >
      <rect x={0} y={BAR_TOP} width={SPAN} height={BAR_HEIGHT} rx={1} className="fill-surface-muted" />
      <rect x={0} y={BAR_TOP} width={x} height={BAR_HEIGHT} rx={1} className={fill} />
      {whisker && (
        <g data-whisker className="stroke-text" strokeWidth={1.5}>
          <line x1={from} x2={to} y1={middle} y2={middle} vectorEffect="non-scaling-stroke" />
          <line x1={from} x2={from} y1={middle - CAP} y2={middle + CAP} vectorEffect="non-scaling-stroke" />
          <line x1={to} x2={to} y1={middle - CAP} y2={middle + CAP} vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  )
}
