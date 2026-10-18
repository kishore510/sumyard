/* Stub (red commit): the split bar arrives in the green commit. */
export interface SplitBarSegment {
  readonly id: string
  readonly label: string
  readonly value: number
}

export function SplitBar(_props: {
  title: string
  segments: readonly SplitBarSegment[]
  total: number
  totalLabel: string
  formatValue: (value: number) => string
  highlight?: string
}) {
  return null
}
