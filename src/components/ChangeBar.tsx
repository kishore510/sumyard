/*
 * A small bar of two signed changes (slice 3c-2, the car decision's
 * sensitivity rows): each drawn from a centre line of nothing, left for
 * below nothing and right for above, its length against the largest change
 * in the table. Decoration beside figures in text (aria-hidden): the table
 * cells carry the values. The first change is drawn in the muted token and
 * above, the second in the accent token and below, so they differ by more
 * than colour. Token colours only; no motion. Geometry is layout, not tokens.
 */

const WIDTH = 96
const HEIGHT = 12
const BAR = 5
const GAP = 1

export function ChangeBar({ first, second, largest }: { first: number | null; second: number | null; largest: number }) {
  const middle = WIDTH / 2
  const bar = (value: number | null, top: number, className: string) => {
    if (value === null || largest <= 0) return null
    const length = (Math.abs(value) / largest) * middle
    return <rect x={value < 0 ? middle - length : middle} y={top} width={Math.max(GAP, length)} height={BAR} className={className} />
  }
  return (
    <svg aria-hidden="true" width={WIDTH} height={HEIGHT} className="block">
      <line x1={middle} x2={middle} y1={0} y2={HEIGHT} className="stroke-border-strong" />
      {bar(first, GAP, 'fill-text-muted')}
      {bar(second, HEIGHT - BAR - GAP, 'fill-accent')}
    </svg>
  )
}
