import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP } from '@/lib/format'
import { compare, fromPounds, type Money, mulRound, subtract, ZERO } from '@/lib/money'
import { perPeriod } from './breakdown'
import { type OptimiserPageInputs, optimiserCalculator } from './definition'
import { calculateOptimise } from './optimiserInputs'
import {
  CHILDCARE_NOT_CHECKED,
  childcareRuns,
  costOfMore,
  currentPoint,
  nearestPoint,
  ONE_POUND,
  THRESHOLD_NAMES,
  thresholdWords,
  warningRuns,
} from './reading'
import type { OptimiseResult, ThresholdContribution } from './types'

/*
 * 1b-ii-b: reading optimise()'s result on the page (reading.ts). Expected
 * values come from the engine's own result; no tax figure here.
 */

const page = (patch: Partial<OptimiserPageInputs> = {}): OptimiserPageInputs => ({
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(115_000),
  bonus: fromPounds(5_000),
  employeeContribution: { mode: 'amount', amount: fromPounds(6_000), percentOfPay: '0' },
  children: 2,
  checkChildcare: true,
  ...patch,
})

function result(patch: Partial<OptimiserPageInputs> = {}, period: 'year' | 'month' = 'year'): OptimiseResult {
  const r = calculateOptimise(page(patch), taxYear, period)
  if (!r.ok || 'problem' in r) throw new Error('no result')
  return r
}

describe('currentPoint and nearestPoint', () => {
  it('finds the point at the current contribution', () => {
    const r = result()
    expect(currentPoint(r).contribution).toBe(r.currentContribution)
    expect(currentPoint(r).reasons.some((reason) => reason.kind === 'current')).toBe(true)
  })

  it('finds the nearest point to a contribution, the lower one on a tie', () => {
    const r = result()
    const [a, b] = [r.points[0]!, r.points[1]!]
    expect(nearestPoint(r.points, a.contribution)).toBe(a)
    expect(nearestPoint(r.points, b.contribution)).toBe(b)
    expect(nearestPoint(r.points, fromPounds(10_000_000))).toBe(r.points.at(-1))
    expect(nearestPoint(r.points, ZERO)).toBe(r.points[0])
  })
})

describe('costOfMore', () => {
  it('is the engine’s net cost per pound and marginal rate as pence of a pound, each against what it is measured from', () => {
    const r = result()
    r.points.forEach((p, i) => {
      const cost = costOfMore(r.points, p)
      if (p.netCostPerPound === null) expect(cost.sinceNothing).toBeNull()
      else expect(cost.sinceNothing).toBe(mulRound(ONE_POUND, p.netCostPerPound, 'nearest'))
      if (p.marginalRate === null) expect(cost.sincePrevious).toBeNull()
      else {
        const kept = mulRound(ONE_POUND, p.marginalRate, 'nearest')
        expect(cost.sincePrevious).toEqual({ from: r.points[i - 1]!.contribution, kept, cost: subtract(ONE_POUND, kept) })
      }
    })
    expect(costOfMore(r.points, r.points[0]!)).toEqual({ sinceNothing: null, sincePrevious: null })
  })
})

describe('thresholdWords', () => {
  const gbp = (amount: Money) => formatGBP(amount, 'pence')
  // An arbitrary limit, not a tax figure: the words are tested, not the threshold.
  const limit = fromPounds(123_456)
  const t = (patch: Partial<ThresholdContribution>): ThresholdContribution => ({
    threshold: 'personalAllowanceTaperStart',
    measure: 'adjustedNetIncome',
    limit,
    status: 'reachable',
    reason: null,
    contribution: fromPounds(9_000),
    extra: fromPounds(3_000),
    measureAt: limit,
    ...patch,
  })

  it('already met: already under, at the contribution now', () => {
    const words = thresholdWords(t({ status: 'alreadyMet', extra: ZERO }), 'netPay', 'year', gbp)
    expect(words.status).toBe('alreadyUnder')
    expect(words.text).toMatch(/^Already under/)
    expect(words.text).toContain(gbp(limit))
  })

  it('reachable: contribute the extra more, for the period, a month rounded up to the penny', () => {
    const year = thresholdWords(t({}), 'netPay', 'year', gbp)
    expect(year.status).toBe('contributeMore')
    expect(year.text).toContain(`Contribute ${gbp(fromPounds(3_000))} more a year`)
    const odd = t({ extra: fromPounds(1_000) })
    const month = thresholdWords(odd, 'netPay', 'month', gbp)
    expect(month.text).toContain(`Contribute ${gbp(perPeriod(fromPounds(1_000), 'month', 'up'))} more a month`)
    expect(perPeriod(fromPounds(1_000), 'month', 'up')).not.toBe(perPeriod(fromPounds(1_000), 'month', 'down'))
  })

  it('unreachable: out of reach, with the reason in words', () => {
    const over = thresholdWords(t({ status: 'unreachable', reason: 'overGrossPay' }), 'netPay', 'year', gbp)
    expect(over.status).toBe('outOfReach')
    expect(over.text).toMatch(/^Out of reach/)
    expect(over.text).toMatch(/more than your pay/)
    const allowance = thresholdWords(t({ status: 'unreachable', reason: 'overAllowance' }), 'netPay', 'year', gbp)
    expect(allowance.text).toMatch(/^Out of reach/)
    expect(allowance.text).toMatch(/annual allowance/)
    const method = thresholdWords(
      t({
        threshold: 'annualAllowanceThresholdIncome',
        measure: 'thresholdIncome',
        status: 'unreachable',
        reason: 'notLoweredByMethod',
        contribution: null,
        extra: null,
        measureAt: null,
      }),
      'salarySacrifice',
      'year',
      gbp,
    )
    expect(method.text).toMatch(/^Out of reach/)
    expect(method.text).toMatch(/salary sacrifice/i)
    expect(method.text).toMatch(/threshold income/)
  })

  it('says plainly that the Child Benefit charge’s full-charge point still carries the whole charge, which first falls a penny below it', () => {
    const words = thresholdWords(t({ threshold: 'hicbcFullCharge' }), 'netPay', 'year', gbp)
    expect(words.text).toMatch(/whole charge still applies/)
    expect(words.text).toMatch(/first falls a penny below/)
    expect(thresholdWords(t({}), 'netPay', 'year', gbp).text).not.toMatch(/penny below/)
  })

  it('names every threshold, and calls none the best', () => {
    for (const name of Object.values(THRESHOLD_NAMES)) expect(name).not.toMatch(/\b(best|optimal|recommended)\b/i)
    const r = result()
    for (const threshold of r.thresholds) {
      const words = thresholdWords(threshold, r.method, 'month', gbp)
      expect(words.name).toBe(THRESHOLD_NAMES[threshold.threshold])
      expect(words.text).not.toMatch(/\b(best|optimal|recommended)\b/i)
    }
  })
})

describe('warningRuns and childcareRuns', () => {
  const inside = (runs: readonly { from: Money; to: Money }[], amount: Money) =>
    runs.some((run) => compare(amount, run.from) >= 0 && compare(amount, run.to) <= 0)

  it('says, for every warning any point carries, each run of neighbouring points carrying it: none hidden', () => {
    const r = result({
      salary: fromPounds(300_000),
      bonus: ZERO,
      carryForward: [{ yearsAgo: 1, amount: fromPounds(20_000) }],
    })
    const runs = warningRuns(r.points)
    const codes = new Set(r.points.flatMap((p) => p.warnings.map((w) => w.code)))
    expect(codes.has('tapered')).toBe(true)
    expect(codes.has('carryForwardUsed')).toBe(true)
    expect(codes.has('overAllowance')).toBe(true)
    expect(new Set(runs.map((run) => run.code))).toEqual(codes)
    for (const run of runs) {
      for (const p of r.points) {
        const has = p.warnings.some((w) => w.code === run.code)
        expect(inside(run.runs, p.contribution), `${run.code} ${p.contribution}`).toBe(has)
      }
      expect(run.message).toBe(r.points.flatMap((p) => p.warnings).find((w) => w.code === run.code)!.message)
    }
  })

  it('has no runs when no point carries a warning', () => {
    const r = result({ salary: fromPounds(40_000), bonus: ZERO, children: 0, checkChildcare: false })
    expect(warningRuns(r.points)).toEqual([])
    expect(childcareRuns(r.points)).toEqual([])
  })

  it('gives each childcare scheme’s runs of points eligible on income, and says what is not checked', () => {
    const r = result()
    const schemes = childcareRuns(r.points)
    expect(schemes.map((s) => s.scheme).sort()).toEqual(['taxFreeChildcare', 'thirtyHours'])
    for (const s of schemes)
      for (const p of r.points) {
        const eligible = p.childcare.find((c) => c.scheme === s.scheme)!.eligibleOnIncome
        expect(inside(s.eligible, p.contribution)).toBe(eligible)
      }
    expect(CHILDCARE_NOT_CHECKED).toMatch(/not checked/i)
    expect(CHILDCARE_NOT_CHECKED).toMatch(/partner/)
  })
})
