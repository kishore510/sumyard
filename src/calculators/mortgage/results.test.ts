import { describe, expect, it } from 'vitest'
import { fromPounds, percent, toPence } from '@/lib/money'
import { overpay } from './calc'
import { inputs } from './fixtures/inputs'
import { chartData, drifts, fixedRateNote, overAllowance, returnLines, unusedOverpayments } from './results'
import type { MortgageInputs, MortgageResult } from './types'

/*
 * The page's readings of the engine's result (M2): the chart's points, the
 * warnings' data and the return per rate period. Every figure is the
 * engine's; contract figures are made up.
 */

function run(overrides: Partial<MortgageInputs> = {}): { i: MortgageInputs; r: MortgageResult } {
  const i = inputs(overrides)
  const outcome = overpay(i)
  if (!outcome.ok) throw new Error('refused')
  return { i, r: outcome.result }
}

describe('chartData', () => {
  it('a point a year from the start to the term, both schedules, the fixed-rate end marked', () => {
    const { i, r } = run({ termMonths: 30, regular: { amount: fromPounds(500), fromMonth: 1, toMonth: 30 } })
    const chart = chartData(r, i)
    expect(chart.xValues).toEqual([0, 1, 2, 3])
    expect(chart.categories[0]).toBe('Start')
    const [baseline, overpaying] = chart.series
    expect(baseline!.label).toBe('Without overpaying')
    expect(overpaying!.label).toBe('Overpaying')
    expect(baseline!.values).toEqual([0, 12, 24, 30].map((m) => toPence(r.balances[m]!.baseline)))
    expect(overpaying!.values).toEqual([0, 12, 24, 30].map((m) => toPence(r.balances[m]!.overpaying)))
    expect(chart.markers).toEqual([{ x: 2, label: 'Fixed rate ends' }])
  })

  it('no marker with no fixed period or a fixed rate to the term', () => {
    expect(chartData(run({ fixedEndMonth: 0 }).r, inputs({ fixedEndMonth: 0 })).markers).toEqual([])
    const all = { termMonths: 24, fixedEndMonth: 24 }
    expect(chartData(run(all).r, inputs(all)).markers).toEqual([])
  })
})

describe('drift under daily interest', () => {
  it('is flagged when the last payment is far from the level payment, never with monthly interest', () => {
    const long = { termMonths: 468, fixedEndMonth: 468, fixedRate: percent('9'), balance: fromPounds(500_000) }
    const daily = run({ ...long, policy: { interestMethod: 'daily', dayCount: 'actual/actual' } })
    expect(drifts(daily.r, daily.i)).toBe(true)
    const monthly = run(long)
    expect(drifts(monthly.r, monthly.i)).toBe(false)
  })

  it('is not flagged on a short daily schedule', () => {
    const short = run({ termMonths: 12, fixedEndMonth: 12, policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    expect(drifts(short.r, short.i)).toBe(false)
  })
})

describe('warnings’ data', () => {
  it('overpayments past the balance: the first month and the total not needed', () => {
    const { r } = run({ termMonths: 12, fixedEndMonth: 12, lumpSums: [{ month: 3, amount: fromPounds(300_000) }] })
    const unused = unusedOverpayments(r)
    expect(unused?.firstMonth).toBe(3)
    expect(toPence(unused!.total)).toBe(r.overpaying.rows.reduce((t, row) => t + toPence(row.unused), 0))
    expect(unusedOverpayments(run().r)).toBeNull()
  })

  it('each allowance year charged, with its charge', () => {
    const { r } = run({
      erc: { rate: percent('3'), endMonth: 24, allowance: { kind: 'amount', amount: fromPounds(1_000) } },
      lumpSums: [
        { month: 2, amount: fromPounds(2_000) },
        { month: 14, amount: fromPounds(500) },
      ],
    })
    expect(overAllowance(r).map((y) => [y.year, toPence(y.charged)])).toEqual([[1, 3_000]])
  })

  it('the fixed rate past the term, or ended before the first payment', () => {
    expect(fixedRateNote(inputs({ termMonths: 24, fixedEndMonth: 24 }), true)).toBe('past-term')
    expect(fixedRateNote(inputs({ fixedEndMonth: 0 }), true)).toBe('already-ended')
    expect(fixedRateNote(inputs({ fixedEndMonth: 0 }), false)).toBeNull()
    expect(fixedRateNote(inputs(), true)).toBeNull()
  })
})

describe('returnLines', () => {
  it('one per rate period, with its dates and what it is measured against', () => {
    const { i, r } = run()
    const lines = returnLines(r, i)
    expect(lines.map((l) => [l.period, l.from, l.to])).toEqual([
      ['fixed', '2026-01-15', '2028-01-15'],
      ['reversion', '2028-01-15', '2051-01-15'],
    ])
    expect(lines[0]!.effective).toEqual(r.returns[0]!.effective)
    expect(lines[0]!.against).toMatch(/fixed rate of 4\.5%, charged monthly/)
    expect(lines[1]!.against).toMatch(/your guess of 7%/)
  })

  it('daily interest names its day count', () => {
    const { i, r } = run({ policy: { interestMethod: 'daily', dayCount: 'actual/actual' } })
    expect(returnLines(r, i)[0]!.against).toMatch(/charged daily, actual\/actual/)
  })
})
