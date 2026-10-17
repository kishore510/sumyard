import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves, type Refusal, type Sourced } from '@/config/tax/sourced'
import { add, compareRatio, fromPence, fromPounds, type Money, ratio, subtract, ZERO } from '@/lib/money'
import { DEFAULT_SWEEP_STEP } from '@/lib/sweep'
import { annualAllowanceCheck, childcareCheck, EngineInputError, optimise, takeHome, thresholdContributions } from './calc'
import {
  configValues,
  lessFrac,
  referenceMaximumContribution,
  referenceMeasure,
  referenceTakeHome,
  referenceThresholdContribution,
  referenceThresholds,
} from './fixtures/reference'
import {
  DEFAULT_POLICY,
  type OptimiseResult,
  type OptimiserInputs,
  PENSION_METHODS,
  type PensionMethod,
  type PensionSavingsInput,
  REGIONS,
  type Region,
  type StudentLoanPlanId,
  type ThresholdId,
} from './types'

/*
 * Session G2: threshold contributions (G14) and optimise() (G13). Expected
 * values come from the verified 2026-27 config through fixtures/reference.ts
 * (whose threshold search walks whole pence over its own measure, independent
 * of the engine's closed form) or from the engine's other functions at the
 * same inputs; no tax figure is written in this file.
 */

const config = taxYear
const v = configValues(config)
const penny = fromPence(1)
const NO_SAVINGS: PensionSavingsInput = { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false }
const T = referenceThresholds(config)

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

interface Make {
  grossPay: Money
  method?: PensionMethod
  contribution?: Money
  region?: Region
  children?: number
  optedOut?: boolean
  checkChildcare?: boolean
  savings?: Partial<PensionSavingsInput>
  studentLoans?: StudentLoanPlanId[]
}

const make = (m: Make): OptimiserInputs => ({
  grossPay: m.grossPay,
  region: m.region ?? 'rUK',
  studentLoans: m.studentLoans ?? [],
  pension: { method: m.method ?? 'netPay', contribution: m.contribution ?? ZERO },
  ...(m.children !== undefined ? { childBenefit: { children: m.children, payments: m.optedOut ? 'optedOut' : 'claimed' } } : {}),
  savings: { ...NO_SAVINGS, ...m.savings },
  checkChildcare: m.checkChildcare ?? false,
})

const thresholds = (i: OptimiserInputs, c: TaxYearConfig = config) => ok(thresholdContributions(i, c, DEFAULT_POLICY)).thresholds
const find = (i: OptimiserInputs, id: ThresholdId) => thresholds(i).find((t) => t.threshold === id)
const run = (i: OptimiserInputs, step = fromPounds(1_000)): OptimiseResult =>
  ok(optimise(i, config, DEFAULT_POLICY, { step, maxPoints: 100_000 }))
const nearestOf = (f: readonly [bigint, bigint]) => Number((f[0] * 2n + f[1]) / (f[1] * 2n))

describe('thresholdContributions: which thresholds', () => {
  it('refuses on an unverified year', () => {
    expect(thresholdContributions(make({ grossPay: fromPounds(1) }), FAKE_TODO_YEAR, DEFAULT_POLICY).ok).toBe(false)
  })

  it('the taper start and end and the threshold income limit always; HICBC with Child Benefit claimed; childcare if asked', () => {
    const ids = (i: OptimiserInputs) => thresholds(i).map((t) => t.threshold)
    expect(ids(make({ grossPay: fromPounds(1) }))).toEqual([
      'personalAllowanceTaperStart',
      'personalAllowanceTaperEnd',
      'annualAllowanceThresholdIncome',
    ])
    expect(ids(make({ grossPay: fromPounds(1), children: 1, checkChildcare: true }))).toEqual([
      'personalAllowanceTaperStart',
      'personalAllowanceTaperEnd',
      'hicbcThreshold',
      'hicbcFullCharge',
      'taxFreeChildcareLimit',
      'thirtyHoursLimit',
      'annualAllowanceThresholdIncome',
    ])
    expect(ids(make({ grossPay: fromPounds(1), children: 2, optedOut: true }))).not.toContain('hicbcThreshold')
    expect(ids(make({ grossPay: fromPounds(1), children: 0 }))).not.toContain('hicbcThreshold')
  })

  it('reports each limit from the config (the taper end worked out from the allowance, start and rate)', () => {
    const all = thresholds(make({ grossPay: fromPounds(1), children: 1, checkChildcare: true }))
    for (const t of all) expect(t.limit).toBe(nearestOf(T[t.threshold].limit))
  })
})

describe('thresholdContributions: solved in exact pence (G14)', () => {
  const ids: ThresholdId[] = [
    'personalAllowanceTaperStart',
    'personalAllowanceTaperEnd',
    'hicbcThreshold',
    'hicbcFullCharge',
    'taxFreeChildcareLimit',
    'thirtyHoursLimit',
    'annualAllowanceThresholdIncome',
  ]
  const pays = [fromPounds(61_234), add(fromPounds(100_000), fromPence(1)), fromPounds(130_000), fromPence(21_000_003), fromPounds(250_000)]

  it.each(PENSION_METHODS)(
    '%s: the same contribution as a whole-pence search over the reference, and a penny test either side',
    (method) => {
      for (const grossPay of pays) {
        const i = make({ grossPay, method, children: 1, checkChildcare: true, savings: { carryForward: [] } })
        for (const id of ids) {
          const t = find(i, id)!
          const { limit, measure } = T[id]
          const expected = referenceThresholdContribution(grossPay, method, limit, measure, config)
          if (method === 'salarySacrifice' && measure === 'threshold') {
            if (expected === 0) expect(t.status).toBe('alreadyMet')
            else expect(t).toMatchObject({ status: 'unreachable', reason: 'notLoweredByMethod', contribution: null, extra: null })
            continue
          }
          expect(expected).not.toBeNull()
          expect(t.contribution).toBe(expected)
          const at = referenceMeasure(grossPay, { method, contribution: t.contribution! }, measure, config)
          expect(lessFrac(limit, at)).toBe(false)
          expect(t.measureAt).toBe(nearestOf(at))
          if (t.contribution! > 0) {
            const before = referenceMeasure(grossPay, { method, contribution: subtract(t.contribution!, penny) }, measure, config)
            expect(lessFrac(limit, before)).toBe(true)
          }
        }
      }
    },
  )

  it('already met: nothing extra, status says so', () => {
    const t = find(make({ grossPay: fromPounds(50_000) }), 'personalAllowanceTaperStart')!
    expect(t).toMatchObject({ status: 'alreadyMet', contribution: ZERO, extra: ZERO, reason: null })
  })

  it('extra is measured from the current contribution, and is nothing once the current one is enough', () => {
    const grossPay = add(v.taperStart, fromPounds(3_000))
    const fresh = find(make({ grossPay, method: 'netPay' }), 'personalAllowanceTaperStart')!
    expect(fresh).toMatchObject({ status: 'reachable', contribution: fromPounds(3_000), extra: fromPounds(3_000) })
    const part = find(make({ grossPay, method: 'netPay', contribution: fromPounds(1_000) }), 'personalAllowanceTaperStart')!
    expect(part).toMatchObject({ status: 'reachable', contribution: fromPounds(3_000), extra: fromPounds(2_000) })
    const done = find(make({ grossPay, method: 'netPay', contribution: fromPounds(4_000) }), 'personalAllowanceTaperStart')!
    expect(done).toMatchObject({ status: 'alreadyMet', extra: ZERO })
  })

  it('relief at source: the payment is the reduction times one less the rate, rounded up to a penny', () => {
    const grossPay = add(v.childBenefit.threshold, fromPence(1))
    const t = find(make({ grossPay, method: 'reliefAtSource', children: 1 }), 'hicbcThreshold')!
    // A one-penny reduction needs a payment of less than a penny, so one penny.
    expect(t.contribution).toBe(penny)
  })

  it('unreachable when the savings would be over the available allowance; the contribution is still reported', () => {
    const grossPay = add(v.childcare.taxFreeChildcare, add(v.annualAllowance.standard, fromPounds(1_000)))
    const t = find(make({ grossPay, method: 'netPay', checkChildcare: true }), 'taxFreeChildcareLimit')!
    expect(t).toMatchObject({ status: 'unreachable', reason: 'overAllowance' })
    expect(t.contribution).toBe(subtract(grossPay, v.childcare.taxFreeChildcare))
    // With enough carry forward it becomes reachable.
    const withCarry = find(
      make({
        grossPay,
        method: 'netPay',
        checkChildcare: true,
        savings: { carryForward: [{ yearsAgo: 1, amount: fromPounds(1_000) }] },
      }),
      'taxFreeChildcareLimit',
    )!
    expect(withCarry.status).toBe('reachable')
  })

  it('unreachable over gross pay: a zero limit that relief at source cannot quite reach', () => {
    const zeroLimit = mapLeaves(
      config,
      (path, current): Sourced<unknown> =>
        path === 'childcare.taxFreeChildcare.incomeLimit' && current.status === 'verified' ? { ...current, value: ZERO } : current,
    )
    const grossPay = fromPence(101)
    const t = thresholds(make({ grossPay, method: 'reliefAtSource', checkChildcare: true }), zeroLimit).find(
      (x) => x.threshold === 'taxFreeChildcareLimit',
    )!
    expect(referenceThresholdContribution(grossPay, 'reliefAtSource', [0n, 1n], 'ani', zeroLimit)).toBeNull()
    expect(t).toMatchObject({ status: 'unreachable', reason: 'overGrossPay' })
  })

  it('a bonus that pushes adjusted net income over the HICBC threshold: the contribution that brings it back is the amount over', () => {
    const salary = subtract(v.childBenefit.threshold, fromPounds(2_000))
    const bonus = fromPounds(5_000)
    const t = find(make({ grossPay: add(salary, bonus), method: 'salarySacrifice', children: 2 }), 'hicbcThreshold')!
    expect(t.contribution).toBe(subtract(add(salary, bonus), v.childBenefit.threshold))
  })

  it('rejects a negative current contribution or pay', () => {
    expect(() => thresholdContributions(make({ grossPay: fromPence(-1) }), config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => thresholdContributions(make({ grossPay: fromPounds(1), contribution: fromPence(-1) }), config, DEFAULT_POLICY)).toThrow(
      EngineInputError,
    )
  })
})

describe('optimise: points', () => {
  it('refuses on an unverified year', () => {
    expect(optimise(make({ grossPay: fromPounds(1) }), FAKE_TODO_YEAR, DEFAULT_POLICY).ok).toBe(false)
  })

  it('sweeps from nothing to the maximum in steps, adding the current contribution and the reachable thresholds, in order', () => {
    const grossPay = add(v.taperStart, fromPounds(3_333))
    const r = run(make({ grossPay, method: 'netPay', contribution: fromPounds(1_500), children: 1 }), fromPounds(10_000))
    const cs = r.points.map((p) => p.contribution)
    expect(cs).toEqual([...cs].sort((a, b) => a - b))
    expect(new Set(cs).size).toBe(cs.length)
    expect(cs[0]).toBe(ZERO)
    expect(cs.at(-1)).toBe(grossPay)
    expect(r.maximumContribution).toBe(grossPay)
    for (const p of r.points.filter((x) => x.reasons.some((why) => why.kind === 'sweep')))
      expect(p.contribution % fromPounds(10_000)).toBe(0)
    expect(r.points.find((p) => p.contribution === fromPounds(1_500))?.reasons).toContainEqual({ kind: 'current' })
    for (const t of r.thresholds.filter((x) => x.status === 'reachable')) {
      const p = r.points.find((x) => x.contribution === t.contribution)!
      expect(p.reasons).toContainEqual({ kind: 'threshold', threshold: t.threshold })
    }
    expect(r.points.at(-1)?.reasons).toContainEqual({ kind: 'maximum' })
    expect(r.estimate).toBe(true)
  })

  it('the maximum for relief at source is the largest payment whose gross amount is not over gross pay', () => {
    const grossPay = fromPence(12_345_67)
    expect(run(make({ grossPay, method: 'reliefAtSource' }), fromPounds(5_000)).maximumContribution).toBe(
      referenceMaximumContribution(grossPay, 'reliefAtSource', config),
    )
  })

  it('zero gross pay: a single point', () => {
    const r = run(make({ grossPay: ZERO }))
    expect(r.points.map((p) => p.contribution)).toEqual([ZERO])
    expect(r.points[0]?.netCostPerPound).toBeNull()
    expect(r.points[0]?.marginalRate).toBeNull()
  })

  it('uses the default step from outside the engine when none is given', () => {
    const r = ok(optimise(make({ grossPay: fromPounds(20_000) }), config, DEFAULT_POLICY))
    expect(r.step).toBe(DEFAULT_SWEEP_STEP)
  })

  it('rejects a step of nothing, or one that would make too many points', () => {
    const i = make({ grossPay: fromPounds(100_000) })
    expect(() => optimise(i, config, DEFAULT_POLICY, { step: ZERO, maxPoints: 10 })).toThrow(EngineInputError)
    expect(() => optimise(i, config, DEFAULT_POLICY, { step: fromPounds(1), maxPoints: 10 })).toThrow(EngineInputError)
  })

  it.each(PENSION_METHODS)(
    '%s: each point agrees with takeHome, the annual allowance check and the reference at the same contribution',
    (method) => {
      const i = make({
        grossPay: fromPounds(118_000),
        method,
        children: 2,
        checkChildcare: true,
        studentLoans: ['plan2'],
        savings: { employerContribution: fromPounds(8_000), carryForward: [{ yearsAgo: 2, amount: fromPounds(3_000) }] },
      })
      const r = run(i, fromPounds(7_500))
      for (const p of r.points) {
        const at = { ...i, pension: { method, contribution: p.contribution } }
        const th = ok(takeHome(at, config, DEFAULT_POLICY))
        const al = ok(annualAllowanceCheck(at, i.savings, config, DEFAULT_POLICY))
        const ref = referenceTakeHome(at, config, DEFAULT_POLICY)
        expect(p.takeHome).toBe(th.annual.net)
        expect(p.takeHome).toBe(ref.net)
        expect(p.childBenefit).toBe(th.annual.childBenefit)
        expect(p.takeHomeIncludingChildBenefit).toBe(th.annual.netIncludingChildBenefit)
        expect(p.annualAllowanceCharge).toBe(al.charge.total)
        expect(p.spendable).toBe(subtract(p.takeHomeIncludingChildBenefit, p.annualAllowanceCharge))
        expect(p.annualAllowance).toEqual({
          tapered: al.tapered,
          allowanceAvailable: al.allowanceAvailable,
          counted: al.counted.total,
          headroom: al.headroom,
          excess: al.excess,
        })
        expect(p.adjustedNetIncome).toBe(th.adjustedNetIncome.adjustedNetIncome)
        expect(p.thresholdIncome).toBe(al.thresholdIncome)
        expect(p.pension.total).toBe(add(add(p.pension.employee, p.pension.employer), p.pension.relief))
        expect(p.pension.total).toBe(al.counted.total)
        expect(p.pension.employer).toBe(i.savings.employerContribution)
        expect(p.extra).toBe(subtract(p.contribution, i.pension.contribution))
        const cc = ok(childcareCheck(i.grossPay, at.pension, config))
        expect(p.childcare).toEqual(cc.schemes.map((s) => ({ scheme: s.scheme, eligibleOnIncome: s.eligibleOnIncome })))
      }
    },
  )

  it('net cost per pound and the marginal rate follow from neighbouring points', () => {
    const r = run(make({ grossPay: fromPounds(70_000), method: 'netPay' }), fromPounds(5_000))
    const base = r.points[0]!
    for (let k = 1; k < r.points.length; k++) {
      const p = r.points[k]!
      const prev = r.points[k - 1]!
      expect(p.netCostPerPound).toEqual(ratio(base.spendable - p.spendable, p.pension.total - base.pension.total))
      const dPension = p.pension.total - prev.pension.total
      expect(p.marginalRate).toEqual(ratio(dPension - (prev.spendable - p.spendable), dPension))
    }
  })

  it('a basic rate taxpayer’s marginal rate: net pay saves the basic rate; salary sacrifice also saves NI', () => {
    const grossPay = add(v.ni.primaryThreshold, fromPounds(20_000))
    const np = run(make({ grossPay, method: 'netPay' }), fromPounds(1_000)).points[1]!
    const ss = run(make({ grossPay, method: 'salarySacrifice' }), fromPounds(1_000)).points[1]!
    const basic = v.bands.rUK[0]!.rate
    expect(compareRatio(np.marginalRate!, basic)).toBe(0)
    expect(
      compareRatio(
        ss.marginalRate!,
        ratio(
          basic.numerator * v.ni.mainRate.denominator + v.ni.mainRate.numerator * basic.denominator,
          basic.denominator * v.ni.mainRate.denominator,
        ),
      ),
    ).toBe(0)
  })

  it('a contribution over the allowance is a point with its excess and charge, never capped', () => {
    const grossPay = fromPounds(150_000)
    const r = run(make({ grossPay, method: 'netPay' }), fromPounds(10_000))
    const over = r.points.filter((p) => p.annualAllowance.excess > 0)
    expect(over.length).toBeGreaterThan(0)
    for (const p of over) {
      expect(p.annualAllowanceCharge).toBeGreaterThan(0)
      expect(p.warnings.map((w) => w.code)).toContain('overAllowance')
      expect(p.annualAllowance.counted).toBe(p.contribution)
    }
  })

  it('the assumptions say timing within the year is not modelled, and hold no figures', () => {
    const r = run(make({ grossPay: fromPounds(60_000) }))
    expect(r.assumptions.some((a) => /timing/i.test(a))).toBe(true)
    for (const text of r.assumptions) expect(text).not.toMatch(/\d/)
  })
})

describe('optimise: cliffs and shape', () => {
  const spendableNeverRisesOutsideCliffs = (r: OptimiseResult) => {
    for (let k = 1; k < r.points.length; k++) {
      const prev = r.points[k - 1]!
      const p = r.points[k]!
      const flagged = r.cliffs.some((c) => c.from === prev.contribution && c.to === p.contribution && c.kind !== 'childcareLimit')
      if (!flagged) expect(p.spendable).toBeLessThanOrEqual(prev.spendable)
    }
  }

  it('HICBC steps are flagged as cliffs; elsewhere spendable never rises as the contribution rises', () => {
    const r = run(make({ grossPay: add(v.childBenefit.threshold, fromPounds(9_000)), method: 'netPay', children: 3 }), fromPounds(100))
    expect(r.cliffs.some((c) => c.kind === 'hicbcStep')).toBe(true)
    spendableNeverRisesOutsideCliffs(r)
  })

  it('the childcare limit is flagged where eligibility changes', () => {
    const r = run(make({ grossPay: add(v.childcare.taxFreeChildcare, fromPounds(5_000)), method: 'salarySacrifice', checkChildcare: true }))
    const cliff = r.cliffs.find((c) => c.kind === 'childcareLimit')!
    expect(cliff).toBeDefined()
    const before = r.points.find((p) => p.contribution === cliff.from)!
    const after = r.points.find((p) => p.contribution === cliff.to)!
    expect(before.childcare[0]?.eligibleOnIncome).toBe(false)
    expect(after.childcare[0]?.eligibleOnIncome).toBe(true)
  })

  it('the taper switching off at the threshold income limit is a cliff for net pay, never for salary sacrifice', () => {
    const grossPay = add(v.annualAllowance.thresholdIncomeLimit, fromPounds(10_000))
    const savings = { employerContribution: v.annualAllowance.standard }
    const np = run(make({ grossPay, method: 'netPay', savings }), fromPounds(2_500))
    expect(np.cliffs.some((c) => c.kind === 'annualAllowanceTaper')).toBe(true)
    spendableNeverRisesOutsideCliffs(np)
    const ss = run(make({ grossPay, method: 'salarySacrifice', savings }), fromPounds(2_500))
    expect(ss.cliffs.some((c) => c.kind === 'annualAllowanceTaper')).toBe(false)
  })

  it('student loan whole pounds: flagged under salary sacrifice only (the other methods leave the loan base alone)', () => {
    const grossPay = add(v.plans.plan2.threshold, fromPounds(4_000))
    const ss = run(make({ grossPay, method: 'salarySacrifice', studentLoans: ['plan2'] }), fromPence(37))
    expect(ss.cliffs.some((c) => c.kind === 'studentLoanWholePounds')).toBe(true)
    spendableNeverRisesOutsideCliffs(ss)
    const np = run(make({ grossPay, method: 'netPay', studentLoans: ['plan2'] }), fromPence(3_700))
    expect(np.cliffs.some((c) => c.kind === 'studentLoanWholePounds')).toBe(false)
  })

  it.each(REGIONS)('%s: spendable never rises as the contribution rises, for each method, away from flagged cliffs', (region) => {
    for (const method of PENSION_METHODS)
      for (const grossPay of [fromPounds(30_000), fromPounds(105_000), fromPounds(210_000)])
        spendableNeverRisesOutsideCliffs(run(make({ grossPay, method, region, children: 1, studentLoans: ['plan1'] }), fromPounds(1_500)))
  })

  it('income tax is never negative at any point', () => {
    for (const method of PENSION_METHODS) {
      const i = make({ grossPay: fromPounds(40_000), method })
      for (const p of run(i, fromPounds(2_000)).points) {
        const th = ok(takeHome({ ...i, pension: { method, contribution: p.contribution } }, config, DEFAULT_POLICY))
        expect(th.annual.incomeTax).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('Scotland and rUK: the same threshold contributions on adjusted net income, different take-home', () => {
    const base = { grossPay: fromPounds(108_000), method: 'netPay' as const, children: 1 }
    const ruk = run(make({ ...base, region: 'rUK' }))
    const sco = run(make({ ...base, region: 'scotland' }))
    expect(sco.thresholds.map((t) => t.contribution)).toEqual(ruk.thresholds.map((t) => t.contribution))
    expect(sco.points[0]?.takeHome).not.toBe(ruk.points[0]?.takeHome)
  })

  it('a bonus that pushes adjusted net income over the HICBC threshold: the threshold point removes the charge the bonus caused', () => {
    const salary = subtract(v.childBenefit.threshold, fromPounds(1_000))
    const bonus = fromPounds(6_000)
    const i = make({ grossPay: add(salary, bonus), method: 'netPay', children: 1 })
    const r = run(i, fromPounds(2_000))
    const t = r.thresholds.find((x) => x.threshold === 'hicbcThreshold')!
    const at = r.points.find((p) => p.contribution === t.contribution)!
    expect(at.adjustedNetIncome).toBe(v.childBenefit.threshold)
    const charge = (contribution: Money) =>
      ok(takeHome({ ...i, pension: { method: 'netPay', contribution } }, config, DEFAULT_POLICY)).annual.hicbc
    expect(charge(ZERO)).toBeGreaterThan(0)
    expect(charge(t.contribution!)).toBe(ZERO)
  })
})
