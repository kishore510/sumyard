/* Chart data. Values are plain numbers (for money, integer pence); null is a gap. */

export interface ChartSeries {
  readonly id: string
  readonly label: string
  readonly kind: 'line' | 'bar'
  readonly values: readonly (number | null)[]
}

/** A horizontal reference line (a threshold), labelled. */
export interface ChartReference {
  readonly label: string
  readonly value: number
}
