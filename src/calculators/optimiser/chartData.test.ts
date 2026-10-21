import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP, formatPercent } from '@/lib/format'
import { fromPence, fromPounds, type Money, ratio, toPence, ZERO } from '@/lib/money'
import { CHART_VIEWS, CLIFF_LABELS, cliffRuns, optimiserChartData, REASON_LABELS, THRESHOLD_LABELS } from './chartData'
import { type OptimiserPageInputs, optimiserCalculator } from './definition'
import { calculateOptimise } from './optimiserInputs'
import type { Cliff, OptimiseResult } from './types'

/*
 * 1b-ii-a: the optimiser chart's data (chartData.ts), from optimise()'s
 * result: one value per point, a marker for the current contribution, the
 * maximum and each threshold point, and each run of cliffs as a labelled
 * range. Expected values come from the engine's own result; no tax figure
 * here. No label calls a point the best.
 */

const gbp = (amount: Money) => formatGBP(amount, 'pence')
const page = (patch: Partial<OptimiserPageInputs> = {}): OptimiserPageInputs => ({
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(115_000),
  bonus: fromPounds(5_000),
  employeeContribution: { mode: 'amount', amount: fromPounds(6_000), percentOfPay: '0' },
  children: 2,
  checkChildcare: true,
  ...patch,
})

function result(patch: Partial<OptimiserPageInputs> = {}): OptimiseResult {
  const r = calculateOptimise(page(patch), taxYear)
  if (!r.ok || 'problem' in r) throw new Error('no result')
  return r
}

describe('optimiserChartData', () => {
  it('has one category, x and value per point, by contribution, for either view', () => {
    const r = result()
    for (const view of CHART_VIEWS) {
      const data = optimiserChartData(r, view, { gbp, percentBase: null })
      expect(data.xValues).toEqual(r.points.map((p) => toPence(p.contribution)))
      expect(data.categories).toEqual(r.points.map((p) => gbp(p.contribution)))
      expect(data.values).toEqual(r.points.map((p) => toPence(view === 'spendable' ? p.spendable : p.takeHome)))
      expect(data.rowNotes).toHaveLength(r.points.length)
    }
  })

  it('marks every point that is not only a sweep point, with its reasons and amount, in order', () => {
    const r = result()
    const data = optimiserChartData(r, 'spendable', { gbp, percentBase: null })
    const marked = r.points.filter((p) => p.reasons.some((reason) => reason.kind !== 'sweep'))
    expect(data.markers.map((m) => m.x)).toEqual(marked.map((p) => toPence(p.contribution)))
    const current = data.markers.find((m) => m.x === toPence(r.currentContribution))!
    expect(current.label).toContain(REASON_LABELS.current)
    expect(current.label).toContain(gbp(r.currentContribution))
    const maximum = data.markers.at(-1)!
    expect(maximum.x).toBe(toPence(r.maximumContribution))
    expect(maximum.label).toContain(REASON_LABELS.maximum)
    for (const t of r.thresholds.filter((t) => t.contribution !== null && t.contribution <= r.maximumContribution))
      expect(
        data.markers.some((m) => m.x === toPence(t.contribution!) && m.label.includes(THRESHOLD_LABELS[t.threshold])),
        t.threshold,
      ).toBe(true)
  })

  it('puts the markers’ reasons in the table rows, and nothing on plain sweep points', () => {
    const r = result()
    const data = optimiserChartData(r, 'takeHome', { gbp, percentBase: null })
    r.points.forEach((p, i) => {
      const plain = p.reasons.every((reason) => reason.kind === 'sweep')
      expect(data.rowNotes[i] === '', gbp(p.contribution)).toBe(plain)
    })
  })

  it('a contribution entered as a percentage shows each marker as a percentage of pensionable pay too', () => {
    const r = result()
    const base = fromPounds(115_000)
    const data = optimiserChartData(r, 'spendable', { gbp, percentBase: base })
    for (const m of data.markers)
      expect(m.label).toContain(`${formatPercent(ratio(m.x, toPence(base)))} of pensionable pay`)
    expect(optimiserChartData(r, 'spendable', { gbp, percentBase: null }).markers.some((m) => m.label.includes('pensionable'))).toBe(false)
    // No pensionable pay: no percentage, rather than a division by nothing.
    expect(optimiserChartData(r, 'spendable', { gbp, percentBase: ZERO }).markers.some((m) => m.label.includes('%'))).toBe(false)
  })

  it('draws each run of cliffs of one kind as one labelled range; student loan steps are a note, not a range', () => {
    const r = result({ studentLoans: ['plan2'], pensionMethod: 'salarySacrifice' })
    const data = optimiserChartData(r, 'spendable', { gbp, percentBase: null })
    const runs = cliffRuns(r.cliffs)
    const ranges = runs.filter((run) => run.kind !== 'studentLoanWholePounds')
    expect(data.spans).toEqual(
      ranges.map((run) => ({
        from: toPence(run.from),
        to: toPence(run.to),
        label: `${CLIFF_LABELS[run.kind]}: between ${gbp(run.from)} and ${gbp(run.to)}`,
      })),
    )
    expect(ranges.some((run) => run.kind === 'hicbcStep')).toBe(true)
    expect(runs.some((run) => run.kind === 'studentLoanWholePounds')).toBe(true)
    expect(data.notes.some((note) => note.startsWith(CLIFF_LABELS.studentLoanWholePounds))).toBe(true)
  })

  it('calls no point the best, and claims nothing about the curve’s direction', () => {
    const data = optimiserChartData(result({ studentLoans: ['plan1'] }), 'spendable', { gbp, percentBase: fromPounds(115_000) })
    const text = [...data.markers.map((m) => m.label), ...data.spans.map((s) => s.label), ...data.notes, ...data.rowNotes].join(' ')
    expect(text).not.toMatch(/\b(best|optimal|optimum|recommended|always (falls|rises)|never (falls|rises))\b/i)
    for (const label of [...Object.values(REASON_LABELS), ...Object.values(THRESHOLD_LABELS), ...Object.values(CLIFF_LABELS)])
      expect(label).not.toMatch(/\b(best|optimal|recommended)\b/i)
  })
})

describe('cliffRuns', () => {
  const c = (kind: Cliff['kind'], from: number, to: number): Cliff => ({ kind, from: fromPence(from), to: fromPence(to) })

  it('joins neighbouring cliffs of one kind, keeps kinds apart, and splits a run at a gap', () => {
    const cliffs = [c('hicbcStep', 0, 10), c('studentLoanWholePounds', 0, 10), c('hicbcStep', 10, 20), c('hicbcStep', 30, 40), c('childcareLimit', 20, 30)]
    expect(cliffRuns(cliffs)).toEqual([
      { kind: 'hicbcStep', from: fromPence(0), to: fromPence(20) },
      { kind: 'studentLoanWholePounds', from: fromPence(0), to: fromPence(10) },
      { kind: 'childcareLimit', from: fromPence(20), to: fromPence(30) },
      { kind: 'hicbcStep', from: fromPence(30), to: fromPence(40) },
    ])
    expect(cliffRuns([])).toEqual([])
  })
})
