import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { add, compare, fromPounds, max, subtract, ZERO } from '@/lib/money'
import { perPeriod } from './breakdown'
import { type OptimiserPageInputs, optimiserCalculator } from './definition'
import { calculateOptimise } from './optimiserInputs'
import { changeVsNow, currentPoint, nearestPoint, pointsIn, zoomRange } from './reading'
import type { OptimiseResult } from './types'

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

describe('changeVsNow', () => {
  it('is each point’s value for the period less the value at the current contribution, signed, nothing at now', () => {
    for (const period of ['year', 'month'] as const) {
      const r = result({}, period)
      const now = currentPoint(r)
      for (const view of ['spendable', 'takeHome'] as const) {
        const changes = changeVsNow(r.points, now, view, period)
        expect(changes).toHaveLength(r.points.length)
        r.points.forEach((p, i) => {
          const expected = subtract(perPeriod(p[view], period), perPeriod(now[view], period))
          expect(changes[i], `${period} ${view} ${i}`).toBe(expected)
        })
        const at = r.points.indexOf(now)
        expect(changes[at]).toBe(ZERO)
        // Both signs occur: below the current contribution take-home is higher, above it lower.
        expect(changes.some((c) => compare(c, ZERO) > 0)).toBe(true)
        expect(changes.some((c) => compare(c, ZERO) < 0)).toBe(true)
      }
    }
  })
})

describe('zoomRange and pointsIn', () => {
  /** Threshold points the zoom is drawn around: above the current contribution, within the modelled range. */
  const ahead = (r: OptimiseResult) =>
    r.thresholds.flatMap((t) =>
      t.contribution !== null && compare(t.contribution, r.currentContribution) > 0 && compare(t.contribution, r.maximumContribution) <= 0
        ? [t.contribution]
        : [],
    )

  it('runs from around the current contribution to past the furthest threshold point that lies ahead, inside the range', () => {
    for (const period of ['year', 'month'] as const) {
      const r = result({}, period)
      const range = zoomRange(r)!
      expect(range).not.toBeNull()
      const top = max(ahead(r)[0]!, ...ahead(r))
      expect(compare(range.from, r.currentContribution)).toBeLessThanOrEqual(0)
      expect(compare(range.from, ZERO)).toBeGreaterThanOrEqual(0)
      // A margin past the furthest point: at least two steps, unless the range ends first.
      const margin = add(top, add(r.step, r.step))
      expect(compare(range.to, margin) >= 0 || range.to === r.maximumContribution).toBe(true)
      expect(compare(range.to, r.maximumContribution)).toBeLessThanOrEqual(0)
      expect(compare(range.to, r.maximumContribution)).toBeLessThan(0)
      const shown = pointsIn(r, range)
      expect(shown.points).toContain(currentPoint(r))
      expect(shown.points.length).toBeLessThan(r.points.length)
      expect(shown.points.every((p) => compare(p.contribution, range.from) >= 0 && compare(p.contribution, range.to) <= 0)).toBe(true)
      expect(shown.points).toEqual(
        r.points.filter((p) => compare(p.contribution, range.from) >= 0 && compare(p.contribution, range.to) <= 0),
      )
      for (const c of shown.cliffs) expect(compare(c.from, range.from) >= 0 && compare(c.to, range.to) <= 0).toBe(true)
    }
  })

  it('is null (the full range) when no threshold point lies ahead', () => {
    const r = result({ salary: fromPounds(40_000), bonus: ZERO, children: 0, checkChildcare: false })
    expect(ahead(r)).toEqual([])
    expect(zoomRange(r)).toBeNull()
    expect(pointsIn(r, null).points).toEqual(r.points)
    expect(pointsIn(r, null).cliffs).toEqual(r.cliffs)
  })
})
