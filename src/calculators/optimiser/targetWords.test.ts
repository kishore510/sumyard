import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { Refusal } from '@/config/tax/sourced'
import { formatGBP } from '@/lib/format'
import { compare, fromPounds, type Money, subtract, ZERO } from '@/lib/money'
import { optimise } from './calc'
import { compareContributions } from './compare'
import { THRESHOLD_NAMES } from './reading'
import { changeSentence, clampTarget, defaultTarget, milestoneWords, pickerStops, runWords, warningSplit } from './targetWords'
import { DEFAULT_POLICY, type OptimiseResult, type OptimiserInputs, type ThresholdContribution } from './types'

/*
 * The compare redesign's words (0.21.0): picker stops, the default target,
 * clamping, the one-sentence summary, warnings at the target and elsewhere,
 * and milestones. Amounts here are inputs; expected figures come from the
 * engine.
 */

const gbp = (amount: Money) => formatGBP(amount, 'pence')
const BANNED = /\bbest\b|optimal|recommend|successfully|please|should/i

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error('refused')
  return result
}

const inputs = (grossPay: Money, contribution: Money = ZERO, children?: number): OptimiserInputs => ({
  grossPay,
  region: 'rUK',
  studentLoans: [],
  pension: { method: 'netPay', contribution },
  ...(children ? { childBenefit: { children, payments: 'claimed' as const } } : {}),
  savings: { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
  checkChildcare: false,
})

const sweepOf = (i: OptimiserInputs): OptimiseResult => ok(optimise(i, taxYear, DEFAULT_POLICY))
const comparison = (i: OptimiserInputs, now: Money, target: Money, pay: Money | null = i.grossPay) =>
  ok(compareContributions(i, taxYear, DEFAULT_POLICY, now, target, { pensionablePay: pay }))

describe('picker stops and the default target', () => {
  it('Now, then each threshold still ahead within the maximum, in order, then Maximum', () => {
    const sweep = sweepOf(inputs(fromPounds(120_000), fromPounds(1_000), 2))
    const stops = pickerStops(sweep)
    expect(stops[0]).toMatchObject({ id: 'now', amount: sweep.currentContribution })
    expect(stops.at(-1)).toMatchObject({ id: 'maximum', amount: sweep.maximumContribution })
    const ahead = sweep.thresholds.filter(
      (t) =>
        t.contribution !== null &&
        compare(t.contribution, sweep.currentContribution) > 0 &&
        compare(t.contribution, sweep.maximumContribution) <= 0,
    )
    expect(ahead.length).toBeGreaterThan(0)
    const middle = stops.slice(1, -1)
    expect(middle.map((s) => s.id).sort()).toEqual(ahead.map((t) => t.threshold).sort())
    for (const stop of middle) expect(stop.label).toBe(THRESHOLD_NAMES[stop.id as keyof typeof THRESHOLD_NAMES])
    for (let i = 1; i < middle.length; i++) expect(compare(middle[i - 1]!.amount, middle[i]!.amount)).toBeLessThanOrEqual(0)
  })

  it('opens on the nearest threshold ahead, or on now when none is', () => {
    const ahead = sweepOf(inputs(fromPounds(120_000), fromPounds(1_000), 2))
    expect(defaultTarget(ahead)).toBe(pickerStops(ahead)[1]!.amount)
    const none = sweepOf(inputs(fromPounds(30_000), fromPounds(1_000)))
    expect(pickerStops(none).map((s) => s.id)).toEqual(['now', 'maximum'])
    expect(defaultTarget(none)).toBe(none.currentContribution)
  })

  it('clamps above the maximum and says so; never below nothing', () => {
    expect(clampTarget(fromPounds(9), fromPounds(5))).toEqual({ target: fromPounds(5), clamped: true })
    expect(clampTarget(fromPounds(3), fromPounds(5))).toEqual({ target: fromPounds(3), clamped: false })
    expect(clampTarget(fromPounds(5), fromPounds(5))).toEqual({ target: fromPounds(5), clamped: false })
  })
})

describe('the one-sentence summary', () => {
  const i = inputs(fromPounds(60_000))

  it('a rise: share of pay, take-home falls, pension rises, month then year', () => {
    const c = comparison(i, fromPounds(3_000), fromPounds(6_000))
    const text = changeSentence(c, gbp)
    expect(text).toMatch(/^Moving from 5% to 10% of pay: /)
    expect(text).toContain(
      `your take-home falls by ${gbp(subtract(ZERO, c.takeHome.monthly.change))} a month (${gbp(subtract(ZERO, c.takeHome.annual.change))} a year)`,
    )
    expect(text).toContain(`the total paid into your pension rises by ${gbp(c.totalIntoPension.monthly.change)} a month`)
    expect(text).toContain(`(${gbp(c.totalIntoPension.annual.change)} a year)`)
    expect(text).toMatch(/\.$/)
    expect(text).not.toMatch(BANNED)
  })

  it('a fall: take-home rises, pension falls; amounts are given without a sign', () => {
    const text = changeSentence(comparison(i, fromPounds(6_000), fromPounds(3_000)), gbp)
    expect(text).toMatch(/take-home rises by £/)
    expect(text).toMatch(/pension falls by £/)
    expect(text).not.toMatch(/[-−]£/)
  })

  it('no change says plainly there is nothing to compare', () => {
    const text = changeSentence(comparison(i, fromPounds(3_000), fromPounds(3_000)), gbp)
    expect(text).toMatch(/no change to compare/i)
    expect(text).not.toMatch(/£/)
  })

  it('without a share of pay, it says the amounts a year instead', () => {
    const text = changeSentence(comparison(i, fromPounds(3_000), fromPounds(6_000), null), gbp)
    expect(text).toMatch(
      new RegExp(`^Moving from ${gbp(fromPounds(3_000)).replace('.', '\\.')} to ${gbp(fromPounds(6_000)).replace('.', '\\.')} a year: `),
    )
  })
})

describe('warnings at the target and elsewhere', () => {
  it('splits the sweep’s warnings: the target’s in full, the rest with where they apply', () => {
    const sweep = sweepOf(inputs(fromPounds(300_000)))
    const target = sweep.points[0]!
    const { atTarget, elsewhere } = warningSplit(sweep.points, target)
    expect(atTarget).toEqual(target.warnings)
    const codes = new Set(sweep.points.flatMap((p) => p.warnings.map((w) => w.code)))
    for (const code of codes) expect(atTarget.some((w) => w.code === code) !== elsewhere.some((w) => w.code === code), code).toBe(true)
    expect(elsewhere.length).toBeGreaterThan(0)
  })

  it('says what the range is measured on: your own contribution', () => {
    const max = fromPounds(50_000)
    expect(runWords([{ from: fromPounds(40_000), to: fromPounds(45_000) }], max, gbp)).toBe(
      `if your own contribution is between ${gbp(fromPounds(40_000))} and ${gbp(fromPounds(45_000))} a year`,
    )
    expect(runWords([{ from: fromPounds(40_000), to: max }], max, gbp)).toBe(
      `if your own contribution is ${gbp(fromPounds(40_000))} a year or more`,
    )
    expect(runWords([{ from: fromPounds(1_000), to: fromPounds(1_000) }], max, gbp)).toBe(
      `if your own contribution is ${gbp(fromPounds(1_000))} a year`,
    )
  })
})

describe('milestones in words', () => {
  const base: ThresholdContribution = {
    threshold: 'hicbcFullCharge',
    measure: 'adjustedNetIncome',
    limit: fromPounds(80_000),
    status: 'reachable',
    reason: null,
    contribution: fromPounds(5_000),
    extra: fromPounds(1_200),
    measureAt: fromPounds(80_000),
  }

  it('already under, contribute more (a year and a month), out of reach with the reason', () => {
    expect(milestoneWords({ ...base, status: 'alreadyMet', extra: ZERO }, 'netPay', gbp)).toMatchObject({
      status: 'alreadyUnder',
      label: 'Already under',
    })
    const more = milestoneWords(base, 'netPay', gbp)
    expect(more.status).toBe('contributeMore')
    expect(more.text).toContain(`Contribute ${gbp(fromPounds(1_200))} a year (${gbp(fromPounds(100))} a month) more`)
    const out = milestoneWords({ ...base, status: 'unreachable', reason: 'overGrossPay' }, 'netPay', gbp)
    expect(out.label).toBe('Out of reach')
    expect(out.text).toMatch(/^Out of reach: /)
  })

  it('says plainly that the whole charge still applies at the full-charge point', () => {
    expect(milestoneWords(base, 'netPay', gbp).text).toMatch(/whole charge still applies/)
    expect(milestoneWords({ ...base, threshold: 'hicbcThreshold' }, 'netPay', gbp).text).not.toMatch(/whole charge/)
  })

  it('names the threshold without figures of its own', () => {
    expect(milestoneWords(base, 'netPay', gbp).name).toBe(THRESHOLD_NAMES.hicbcFullCharge)
    expect(milestoneWords(base, 'netPay', gbp).text).not.toMatch(BANNED)
  })
})
