import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { Refusal } from '@/config/tax/sourced'
import {
  add,
  compare,
  compareRatio,
  fromPence,
  fromPounds,
  type Money,
  mulRound,
  type Ratio,
  ratio,
  subtract,
  toPence,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { optimise, takeHome } from './calc'
import { type ContributionComparison, compareContributions, comparePoints, type MeasureComparison, pointAt } from './compare'
import {
  DEFAULT_POLICY,
  type OptimiseResult,
  type OptimiserInputs,
  type OptimiserPoint,
  PENSION_METHODS,
  type PensionMethod,
  REGIONS,
  type Region,
} from './types'

/*
 * compareContributions (the compare redesign, 0.21.0): the contribution now
 * against a target, from two engine points. Expected values come from the
 * engine (takeHome, optimise) at the same inputs; the only amounts written
 * here are inputs (pay, contributions), never a tax figure.
 */

const config = taxYear
// One sweep step past any pay here: optimise() then works out only the points it must (nothing, now, the maximum, thresholds).
const WIDE = { step: fromPounds(10_000_000), maxPoints: 10 }

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

interface Make {
  grossPay: Money
  method?: PensionMethod
  region?: Region
  children?: number
  employer?: Money
}

const make = (m: Make): OptimiserInputs => ({
  grossPay: m.grossPay,
  region: m.region ?? 'rUK',
  studentLoans: [],
  pension: { method: m.method ?? 'netPay', contribution: ZERO },
  ...(m.children !== undefined ? { childBenefit: { children: m.children, payments: 'claimed' as const } } : {}),
  savings: { employerContribution: m.employer ?? ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
  checkChildcare: false,
})

const compareAt = (inputs: OptimiserInputs, now: Money, target: Money, pensionablePay: Money | null = inputs.grossPay) =>
  ok(compareContributions(inputs, config, DEFAULT_POLICY, now, target, { pensionablePay, step: WIDE.step }))

const point = (inputs: OptimiserInputs, contribution: Money): OptimiserPoint => {
  const result = pointAt(inputs, config, DEFAULT_POLICY, contribution, WIDE)
  if (!('contribution' in result)) throw new Error('refused')
  return result
}

const net = (inputs: OptimiserInputs, contribution: Money) =>
  ok(takeHome({ ...inputs, pension: { method: inputs.pension.method, contribution } }, config, DEFAULT_POLICY)).annual.net

const month = (annual: Money) => mulRound(annual, ratio(1, MONTHS_PER_YEAR), 'nearest')

/** Two exact ratios are equal (whatever their terms). */
const same = (a: Ratio | null, b: Ratio) => a !== null && compareRatio(a, b) === 0

const MEASURES = ['ownContribution', 'totalIntoPension', 'takeHome'] as const

/** Mulberry32: a small seeded generator for repeatable samples. */
function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

/** Seeded random inputs and two contributions within the engine's maximum. */
function randomCase(random: () => number) {
  const inputs = make({
    grossPay: fromPence(between(random, 0, 30_000_000)),
    method: PENSION_METHODS[between(random, 0, PENSION_METHODS.length - 1)]!,
    region: REGIONS[between(random, 0, REGIONS.length - 1)]!,
    ...(random() < 0.4 ? { children: between(random, 1, 4) } : {}),
    ...(random() < 0.4 ? { employer: fromPence(between(random, 0, 1_500_000)) } : {}),
  })
  const sweep = ok(optimise(inputs, config, DEFAULT_POLICY, WIDE))
  const pick = () => fromPence(between(random, 0, toPence(sweep.maximumContribution)))
  return { inputs, now: pick(), target: pick() }
}

const addsUp = (m: MeasureComparison) => {
  expect(add(m.annual.now, m.annual.change)).toBe(m.annual.new)
  expect(add(m.monthly.now, m.monthly.change)).toBe(m.monthly.new)
}

describe('compareContributions: each row adds up (300 seeded cases)', () => {
  const random = generator(20_261_022)
  const cases = Array.from({ length: 300 }, () => randomCase(random))
  it.each(cases.map((c, i) => [i, c] as const))('case %i', (_i, { inputs, now, target }) => {
    const c = compareAt(inputs, now, target)
    for (const measure of MEASURES) {
      addsUp(c[measure])
      // The month figures are the year's to the nearest penny; the change is from the month figures shown.
      expect(c[measure].monthly.now).toBe(month(c[measure].annual.now))
      expect(c[measure].monthly.new).toBe(month(c[measure].annual.new))
    }
  })
})

describe('compareContributions: both points are the engine’s', () => {
  it.each(PENSION_METHODS.flatMap((method) => REGIONS.map((region) => [method, region] as const)))('%s, %s', (method, region) => {
    const inputs = make({ grossPay: fromPounds(105_000), method, region, children: 2, employer: fromPounds(3_000) })
    const now = fromPounds(2_000)
    const target = fromPounds(9_000)
    const c = compareAt(inputs, now, target)
    expect(c.takeHome.annual.now).toBe(net(inputs, now))
    expect(c.takeHome.annual.new).toBe(net(inputs, target))
    expect(c.ownContribution.annual.now).toBe(now)
    expect(c.ownContribution.annual.new).toBe(target)
    expect(c.totalIntoPension.annual.now).toBe(point(inputs, now).pension.total)
    expect(c.totalIntoPension.annual.new).toBe(point(inputs, target).pension.total)
    // The same as a full sweep's point at that contribution.
    const sweep = ok(optimise({ ...inputs, pension: { method, contribution: now } }, config, DEFAULT_POLICY))
    const at = (contribution: Money) => sweep.points.find((p) => compare(p.contribution, contribution) === 0)
    if (at(target)) expect(c.totalIntoPension.annual.new).toBe(at(target)!.pension.total)
    expect(c.totalIntoPension.annual.now).toBe(at(now)!.pension.total)
    expect(c.marginalAtTarget).toEqual(point(inputs, target).marginalRate)
    expect(c.netCostPerPoundAtTarget).toEqual(point(inputs, target).netCostPerPound)
  })
})

describe('compareContributions: edge cases', () => {
  const inputs = make({ grossPay: fromPounds(80_000), children: 1 })

  it('identical points give zero changes and no cost per pound', () => {
    const c = compareAt(inputs, fromPounds(4_000), fromPounds(4_000))
    for (const measure of MEASURES) {
      expect(c[measure].annual.change).toBe(ZERO)
      expect(c[measure].monthly.change).toBe(ZERO)
      expect(c[measure].annual.percentChange).toEqual(ratio(0, 1))
    }
    expect(c.ownContribution.shareOfPay!.changeInPoints).toEqual(ratio(0, 1))
    expect(c.costPerPound).toBeNull()
  })

  it('a baseline of nothing gives no percent change for the contribution', () => {
    const c = compareAt(inputs, ZERO, fromPounds(4_000))
    expect(c.ownContribution.annual.percentChange).toBeNull()
    expect(c.takeHome.annual.percentChange).not.toBeNull()
  })

  it('no pensionable pay gives no share of pay', () => {
    expect(compareAt(inputs, ZERO, fromPounds(4_000), null).ownContribution.shareOfPay).toBeNull()
    expect(compareAt(inputs, ZERO, fromPounds(4_000), ZERO).ownContribution.shareOfPay).toBeNull()
  })

  it('percentage points and percent change are separate fields', () => {
    // From 5% to 10% of pay: up 5 points, a 100% change.
    const pay = fromPounds(80_000)
    const c = compareAt(inputs, fromPounds(4_000), fromPounds(8_000), pay)
    expect(c.ownContribution.shareOfPay).toEqual({ now: ratio(1, 20), new: ratio(1, 10), changeInPoints: ratio(1, 20) })
    expect(c.ownContribution.annual.percentChange).toEqual(ratio(1, 1))
  })

  it('a lower target keeps the signs: the contribution falls and take-home rises', () => {
    const c = compareAt(inputs, fromPounds(8_000), fromPounds(2_000))
    expect(compare(c.ownContribution.annual.change, ZERO)).toBe(-1)
    expect(compare(c.ownContribution.monthly.change, ZERO)).toBe(-1)
    expect(compare(c.totalIntoPension.annual.change, ZERO)).toBe(-1)
    expect(compare(c.takeHome.annual.change, ZERO)).toBe(1)
    expect(compare(c.takeHome.monthly.change, ZERO)).toBe(1)
    expect(c.ownContribution.annual.percentChange!.numerator).toBeLessThan(0)
    expect(c.ownContribution.shareOfPay!.changeInPoints.numerator).toBeLessThan(0)
    // Take-home given up per pound more pension: both negative, so the cost is positive.
    expect(c.costPerPound!.numerator).toBeGreaterThan(0)
  })

  it('percent change is on the figure now', () => {
    const c = compareAt(inputs, fromPounds(4_000), fromPounds(5_000))
    expect(c.ownContribution.annual.percentChange).toEqual(ratio(1, 4))
    const t = c.takeHome.annual
    expect(same(t.percentChange, ratio(toPence(t.change), toPence(t.now)))).toBe(true)
  })

  it('the month and year rows are not swapped', () => {
    const c = compareAt(inputs, fromPounds(1_200), fromPounds(2_400))
    expect(c.ownContribution.annual).toMatchObject({ now: fromPounds(1_200), new: fromPounds(2_400), change: fromPounds(1_200) })
    expect(c.ownContribution.monthly).toEqual({ now: fromPounds(100), new: fromPounds(200), change: fromPounds(100) })
  })

  it('cost per pound is take-home given up over the extra total paid into the pension', () => {
    const c = compareAt(inputs, fromPounds(1_000), fromPounds(6_000))
    const given = subtract(c.takeHome.annual.now, c.takeHome.annual.new)
    expect(same(c.costPerPound, ratio(toPence(given), toPence(c.totalIntoPension.annual.change)))).toBe(true)
  })
})

describe('compareContributions: employer contributions and relief', () => {
  it('an employer contribution is in the total paid in at both points, never in your contribution', () => {
    for (const method of PENSION_METHODS) {
      const employer = fromPounds(5_000)
      const inputs = make({ grossPay: fromPounds(60_000), method, employer })
      const c = compareAt(inputs, fromPounds(1_000), fromPounds(4_000))
      expect(c.totalIntoPension.annual.now, method).toBe(point(inputs, fromPounds(1_000)).pension.total)
      expect(compare(c.totalIntoPension.annual.now, c.ownContribution.annual.now), method).toBe(1)
      expect(c.totalIntoPension.annual.change, method).toBe(
        subtract(point(inputs, fromPounds(4_000)).pension.total, point(inputs, fromPounds(1_000)).pension.total),
      )
    }
  })

  it('with relief at source the total paid in changes by more than your contribution, as the engine says', () => {
    const inputs = make({ grossPay: fromPounds(60_000), method: 'reliefAtSource', employer: fromPounds(5_000) })
    const c = compareAt(inputs, fromPounds(1_000), fromPounds(4_000))
    expect(compare(c.totalIntoPension.annual.change, c.ownContribution.annual.change)).toBe(1)
    const relief = (p: OptimiserPoint) => p.pension.relief
    expect(subtract(c.totalIntoPension.annual.change, c.ownContribution.annual.change)).toBe(
      subtract(relief(point(inputs, fromPounds(4_000))), relief(point(inputs, fromPounds(1_000)))),
    )
  })
})

describe('compareContributions: thresholds and cliffs', () => {
  const sweepFor = (inputs: OptimiserInputs): OptimiseResult => ok(optimise(inputs, config, DEFAULT_POLICY, WIDE))

  it.each(REGIONS)('a target at a threshold point is the engine’s point there (%s)', (region) => {
    const inputs = make({ grossPay: fromPounds(115_000), region, children: 2 })
    const t = sweepFor(inputs).thresholds.find((x) => x.status === 'reachable' && x.contribution !== null)!
    const c = compareAt(inputs, ZERO, t.contribution!)
    expect(c.takeHome.annual.new).toBe(net(inputs, t.contribution!))
    expect(c.totalIntoPension.annual.new).toBe(point(inputs, t.contribution!).pension.total)
  })

  it.each(PENSION_METHODS)('a target across a Child Benefit charge step is the engine’s figure on both sides (%s)', (method) => {
    const inputs = make({ grossPay: fromPounds(70_000), method, children: 3 })
    const t = sweepFor(inputs).thresholds.find((x) => x.threshold === 'hicbcThreshold')!
    const target = add(t.contribution!, fromPounds(100))
    const c = compareAt(inputs, ZERO, target)
    expect(c.takeHome.annual.now).toBe(net(inputs, ZERO))
    expect(c.takeHome.annual.new).toBe(net(inputs, target))
    addsUp(c.takeHome)
  })
})

describe('comparePoints is arithmetic on the two points it is given', () => {
  it('reads the totals from the points, not from the contribution change', () => {
    const inputs = make({ grossPay: fromPounds(60_000), method: 'reliefAtSource', employer: fromPounds(2_000) })
    const a = point(inputs, fromPounds(1_000))
    const b = point(inputs, fromPounds(3_000))
    const c: ContributionComparison = comparePoints(a, b, inputs.grossPay)
    expect(c.totalIntoPension.annual).toMatchObject({ now: a.pension.total, new: b.pension.total })
    expect(c.takeHome.annual).toMatchObject({ now: a.takeHome, new: b.takeHome })
  })
})
