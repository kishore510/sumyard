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

/** A vertical marker at an x value (numeric x only), numbered on the chart and listed with its label. */
export interface ChartMarker {
  readonly x: number
  readonly label: string
}

/** A range of x values (numeric x only), lettered and shaded on the chart; the line across it is dashed. */
export interface ChartSpan {
  readonly from: number
  readonly to: number
  readonly label: string
}
