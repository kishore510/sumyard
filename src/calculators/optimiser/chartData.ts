import type { ChartMarker, ChartSpan } from '@/components/Chart/types'
import { formatGBP, formatPercent } from '@/lib/format'
import { compare, type Money, mulRound, ratio, toPence, ZERO } from '@/lib/money'
import { ONE_POUND } from './reading'
import type { Cliff, CliffKind, OptimiseResult, OptimiserPoint, PointReason, ThresholdId } from './types'

/*
 * The cost chart's data (the compare redesign), from optimise()'s result:
 * per point, the engine's net cost per pound (spendable given up for each
 * pound into the pension, on average from no contribution) as pence of a
 * pound to the nearest penny, over the whole sweep; a marker for every point
 * that is there for a reason other than the sweep (the contribution now, the
 * maximum, each threshold point) and for the target; and each run of cliffs
 * of one kind as one labelled range. Pure; amounts are formatted by the
 * caller's `gbp`. No point is called the best, and nothing here says which
 * way the line goes: between neighbouring points it can move a little
 * either way.
 */

/** The y axis and the table heading. */
export const COST_LABEL = `Average cost of each ${formatGBP(ONE_POUND, 'pounds')} in, from no contribution`

/** The x axis and the table's first heading. */
export const X_LABEL = 'Your contribution a year'

/** The target's marker. */
export const TARGET_LABEL = 'Your target'

export const REASON_LABELS: Record<Exclude<PointReason['kind'], 'sweep' | 'threshold'>, string> = {
  current: 'Your contribution now',
  maximum: 'Most modelled (into the pension, gross, equals your pay)',
}

/** Each threshold point: the smallest contribution that brings the measure down to the limit. */
export const THRESHOLD_LABELS: Record<ThresholdId, string> = {
  personalAllowanceTaperStart: 'Adjusted net income down to the personal allowance taper start',
  personalAllowanceTaperEnd: 'Adjusted net income down to the personal allowance taper end',
  hicbcThreshold: 'Adjusted net income down to the Child Benefit charge threshold',
  hicbcFullCharge: 'Adjusted net income down to the Child Benefit charge full-charge point',
  taxFreeChildcareLimit: 'Adjusted net income down to the Tax-Free Childcare income limit',
  thirtyHoursLimit: 'Adjusted net income down to the Free Childcare for Working Parents income limit',
  annualAllowanceThresholdIncome: 'Threshold income down to the annual allowance taper limit',
}

export const CLIFF_LABELS: Record<CliffKind, string> = {
  hicbcStep: 'The Child Benefit charge moves in whole steps',
  childcareLimit: 'A childcare income limit is crossed (the support itself is not counted in spendable)',
  annualAllowanceTaper: 'The annual allowance taper starts or stops applying',
  studentLoanWholePounds: 'Student loan repayments move in whole pounds',
}

/** Shown under the chart whatever the inputs. */
export const CURVE_NOTE =
  'The line joins the points worked out. Between two neighbouring points the figure can move a little either way, from rounding; a jump can lie anywhere inside a lettered range. There is no figure at no contribution: nothing has been given up yet.'

export interface CliffRun {
  readonly kind: CliffKind
  readonly from: Money
  readonly to: Money
}

/** Neighbouring cliffs of one kind (each starting where the last ended) joined into one run, in order of where each run starts. */
export function cliffRuns(cliffs: readonly Cliff[]): CliffRun[] {
  const runs: { kind: CliffKind; from: Money; to: Money }[] = []
  for (const cliff of cliffs) {
    const open = runs.findLast((run) => run.kind === cliff.kind)
    if (open && compare(open.to, cliff.from) === 0) open.to = cliff.to
    else runs.push({ kind: cliff.kind, from: cliff.from, to: cliff.to })
  }
  return runs
    .map((run, index) => ({ run, index }))
    .sort((a, b) => compare(a.run.from, b.run.from) || a.index - b.index)
    .map(({ run }) => run)
}

export interface CostChartData {
  readonly categories: readonly string[]
  readonly xValues: readonly number[]
  /** Pence given up per pound in, per point; null at no contribution. */
  readonly values: readonly (number | null)[]
  readonly markers: readonly ChartMarker[]
  readonly spans: readonly ChartSpan[]
  /** Things to say beside the chart that are not drawn (student loan steps). */
  readonly notes: readonly string[]
  /** Per point, what its marker says; empty for a sweep point only. */
  readonly rowNotes: readonly string[]
}

function reasonLabels(point: OptimiserPoint): string[] {
  return point.reasons.flatMap((reason) =>
    reason.kind === 'sweep' ? [] : [reason.kind === 'threshold' ? THRESHOLD_LABELS[reason.threshold] : REASON_LABELS[reason.kind]],
  )
}

export interface ChartOptions {
  readonly gbp: (amount: Money) => string
  /** Pensionable pay when the contribution was entered as a percentage of it (each marker then says its share too), otherwise null. */
  readonly percentBase: Money | null
  /** The target the page compares with now: marked unless it is the contribution now. */
  readonly target: Money
}

/** The cost chart over the whole sweep, a year's contribution on the x axis. */
export function costChartData(result: OptimiseResult, { gbp, percentBase, target }: ChartOptions): CostChartData {
  const share = (amount: Money) =>
    percentBase !== null && compare(percentBase, ZERO) > 0
      ? ` (${formatPercent(ratio(toPence(amount), toPence(percentBase)))} of pensionable pay)`
      : ''
  const labelled = result.points.map((point) => {
    const reasons = reasonLabels(point)
    return reasons.length === 0 ? '' : `${reasons.join('; ')}: ${gbp(point.contribution)}${share(point.contribution)}`
  })
  const runs = cliffRuns(result.cliffs)
  const between = (run: CliffRun) => `between ${gbp(run.from)} and ${gbp(run.to)}`
  const targetMarker =
    compare(target, result.currentContribution) === 0
      ? []
      : [{ x: toPence(target), label: `${TARGET_LABEL}: ${gbp(target)}${share(target)}` }]
  return {
    categories: result.points.map((point) => gbp(point.contribution)),
    xValues: result.points.map((point) => toPence(point.contribution)),
    values: result.points.map((point) =>
      point.netCostPerPound === null ? null : toPence(mulRound(ONE_POUND, point.netCostPerPound, 'nearest')),
    ),
    markers: [
      ...result.points.flatMap((point, i) => (labelled[i] ? [{ x: toPence(point.contribution), label: labelled[i] }] : [])),
      ...targetMarker,
    ].sort((a, b) => a.x - b.x),
    spans: runs
      .filter((run) => run.kind !== 'studentLoanWholePounds')
      .map((run) => ({ from: toPence(run.from), to: toPence(run.to), label: `${CLIFF_LABELS[run.kind]}: ${between(run)}` })),
    notes: runs
      .filter((run) => run.kind === 'studentLoanWholePounds')
      .map((run) => `${CLIFF_LABELS[run.kind]}, so the line moves in small steps ${between(run)}.`),
    rowNotes: labelled,
  }
}
