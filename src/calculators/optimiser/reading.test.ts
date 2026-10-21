import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { compare, fromPounds, subtract, ZERO } from '@/lib/money'
import { perPeriod } from './breakdown'
import { type OptimiserPageInputs, optimiserCalculator } from './definition'
import { calculateOptimise } from './optimiserInputs'
import { changeVsNow, currentPoint, nearestPoint } from './reading'
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
