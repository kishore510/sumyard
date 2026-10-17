import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { Refusal } from '@/config/tax/sourced'
import {
  add,
  compareRatio,
  fromPence,
  fromPounds,
  type Money,
  mulRound,
  type Ratio,
  ratio,
  roundToPounds,
  subtract,
  subtractRatio,
  ZERO,
} from '@/lib/money'
import { employeeNI, hicbc, incomeTax, studentLoan, takeHome } from './calc'
import {
  configValues,
  equalFrac,
  fracOf,
  referenceClaimRelief,
  referenceExactTax,
  referencePension,
  referenceTakeHome,
} from './fixtures/reference'
import {
  type ChildBenefitInput,
  DEFAULT_POLICY,
  type ModellingPolicy,
  PENSION_METHODS,
  type PensionInput,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanPlanId,
  TAPER_ROUNDINGS,
} from './types'

/*
 * Property tests over many incomes, with a seeded generator so a failure
 * repeats exactly (no new dependency). Expected values come from the config
 * through independent formulas, never from the engine.
 */

const config = taxYear
const v = configValues(config)
const POLICIES: readonly ModellingPolicy[] = TAPER_ROUNDINGS.map((taperRounding) => ({ ...DEFAULT_POLICY, taperRounding }))
const PLAN_SETS: readonly (readonly StudentLoanPlanId[])[] = [[], ...STUDENT_LOAN_PLANS.map((p) => [p]), ['plan2', 'postgraduate']]

const ok = <T extends { ok: true }>(result: T | Refusal): T => {
  if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
  return result
}

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

const zeroPoint = add(v.taperStart, mulRound(v.personalAllowance, ratio(v.taperRate.denominator, v.taperRate.numerator), 'up'))

/** Incomes worth probing: every threshold the engine reads, a penny either side, and seeded random pence up to well past the zero point. */
function sampleIncomes(count: number, seed: number): Money[] {
  const random = generator(seed)
  const ceiling = toNumber(add(zeroPoint, zeroPoint))
  const thresholds = [
    v.personalAllowance,
    v.taperStart,
    zeroPoint,
    v.ni.primaryThreshold,
    v.ni.upperEarningsLimit,
    ...REGIONS.flatMap((r) => v.bands[r].map((b) => b.from)),
    ...REGIONS.flatMap((r) => v.bands[r].map((b) => add(v.personalAllowance, b.from))),
    ...STUDENT_LOAN_PLANS.map((p) => v.plans[p].threshold),
  ]
  const probes = thresholds.flatMap((t) => [subtract(t, fromPence(1)), t, add(t, fromPence(1))]).filter((m) => m >= 0)
  const randoms = Array.from({ length: count }, () => fromPence(Math.floor(random() * ceiling)))
  return [ZERO, ...probes, ...randoms].sort((a, b) => a - b)
}

const toNumber = (m: Money) => m as number

describe('properties over many incomes', () => {
  const incomes = sampleIncomes(400, 20261017)

  it('income tax is never negative and never falls as income rises (each region and policy)', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES) {
        let previous = ZERO
        for (const income of incomes) {
          const tax = ok(incomeTax(income, region, config, policy)).total
          expect(tax).toBeGreaterThanOrEqual(0)
          expect(tax).toBeGreaterThanOrEqual(previous)
          previous = tax
        }
      }
  })

  it('NI is never negative and never falls as pay rises', () => {
    let previous = ZERO
    for (const pay of incomes) {
      const ni = ok(employeeNI(pay, config)).total
      expect(ni).toBeGreaterThanOrEqual(0)
      expect(ni).toBeGreaterThanOrEqual(previous)
      previous = ni
    }
  })

  it('student loan repayments are never negative and never fall as pay rises', () => {
    for (const plans of PLAN_SETS) {
      let previous = ZERO
      for (const pay of incomes) {
        const total = ok(studentLoan(plans, pay, config)).total
        expect(total).toBeGreaterThanOrEqual(0)
        expect(total).toBeGreaterThanOrEqual(previous)
        previous = total
      }
    }
  })

  it('take-home is never negative and never above gross, for every region, policy and plan set', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES)
        for (const plans of PLAN_SETS)
          for (const grossPay of incomes.filter((_, i) => i % 7 === 0)) {
            const result = ok(takeHome({ grossPay, region, studentLoans: plans }, config, policy))
            for (const view of [result.annual, result.monthly, result.weekly]) {
              expect(view.net).toBeGreaterThanOrEqual(0)
              expect(view.net).toBeLessThanOrEqual(view.gross)
            }
          }
  })

  it('zero income gives zero tax, NI, student loan and take-home', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES) {
        const result = ok(takeHome({ grossPay: ZERO, region, studentLoans: [...STUDENT_LOAN_PLANS] }, config, policy))
        expect([result.annual.incomeTax, result.annual.nationalInsurance, result.annual.studentLoan, result.annual.net]).toEqual([
          0, 0, 0, 0,
        ])
      }
  })
})

describe('taper zone: the marginal rate is above the band rate', () => {
  /** The band holding a taxable income, found here from the config. */
  const bandAt = (region: Region, taxable: Money) => [...v.bands[region]].reverse().find((b) => b.from < taxable)!
  /** The higher rate as the config names it. */
  const higherRate = (region: Region): Ratio => v.bands[region].find((b) => b.name === 'Higher rate')!.rate

  it.each(REGIONS)('%s: in the taper zone, an extra £100 costs the band rate times one plus the taper rate', (region) => {
    // Midpoint of the zone, on a whole number of taper steps so every figure is whole pence.
    const step = fromPounds(100)
    const quarter = roundToPounds(mulRound(subtract(zeroPoint, v.taperStart), ratio(1, 4), 'down'), 'down')
    const mid = add(v.taperStart, add(quarter, quarter))
    for (const income of [mid, add(v.taperStart, fromPounds(2000)), subtract(zeroPoint, fromPounds(2000))]) {
      const before = ok(incomeTax(income, region, config, DEFAULT_POLICY))
      const after = ok(incomeTax(add(income, step), region, config, DEFAULT_POLICY))
      const band = bandAt(region, before.taxableIncome)
      // The same band holds both ends of the step.
      expect(bandAt(region, after.taxableIncome)).toBe(band)
      // Independent formula: each pound of income adds one pound of taxable income plus the allowance it removes.
      const effective = ratio(
        band.rate.numerator * (v.taperRate.denominator + v.taperRate.numerator),
        band.rate.denominator * v.taperRate.denominator,
      )
      const marginal = ratio(subtract(after.total, before.total), step)
      expect(compareRatio(marginal, effective)).toBe(0)
      expect(compareRatio(marginal, band.rate)).toBe(1)
      expect(compareRatio(marginal, higherRate(region))).toBe(1)
    }
  })
})

describe('session G1 properties: pensions, adjusted net income and HICBC', () => {
  const random = generator(20261018)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const pence = (most: number) => fromPence(Math.floor(random() * most))
  const ceiling = toNumber(add(zeroPoint, zeroPoint))
  const FAMILIES: readonly (ChildBenefitInput | undefined)[] = [
    undefined,
    { children: 0, payments: 'claimed' },
    { children: 1, payments: 'claimed' },
    { children: 3, payments: 'claimed' },
    { children: 2, payments: 'optedOut' },
  ]

  /** A random pension whose gross amount fits in the pay. */
  function randomPension(pay: Money): PensionInput | undefined {
    const method = pick([...PENSION_METHODS, undefined])
    if (!method) return undefined
    const most = method === 'reliefAtSource' ? mulRound(pay, subtractRatio(ratio(1, 1), v.reliefAtSourceRate), 'down') : pay
    return { method, contribution: fromPence(Math.floor(random() * (toNumber(most) + 1))) }
  }

  const cases = Array.from({ length: 300 }, () => {
    const grossPay = pence(ceiling)
    return {
      grossPay,
      region: pick(REGIONS),
      studentLoans: pick(PLAN_SETS),
      pension: randomPension(grossPay),
      childBenefit: pick(FAMILIES),
      policy: pick(POLICIES),
    }
  })

  it('tax and NI are never negative, and the engine agrees with the independent reference', () => {
    for (const { policy, ...inputs } of cases) {
      const result = ok(takeHome(inputs, config, policy))
      expect(result.annual.incomeTax).toBeGreaterThanOrEqual(0)
      expect(result.annual.nationalInsurance).toBeGreaterThanOrEqual(0)
      const ref = referenceTakeHome(inputs, config, policy)
      expect([result.annual.incomeTax, result.annual.nationalInsurance, result.annual.studentLoan, result.annual.hicbc]).toEqual([
        ref.tax,
        ref.ni,
        ref.loan,
        ref.charge,
      ])
      expect([result.annual.net, result.annual.childBenefit]).toEqual([ref.net, ref.childBenefit])
    }
  })

  it('HICBC is never above the Child Benefit received', () => {
    for (const { grossPay, childBenefit, policy } of cases) {
      if (!childBenefit) continue
      const result = ok(hicbc(grossPay, childBenefit, config, policy))
      expect(result.charge).toBeGreaterThanOrEqual(0)
      expect(result.charge).toBeLessThanOrEqual(result.childBenefit)
      expect(result.net).toBeGreaterThanOrEqual(0)
    }
  })

  it('with the pension unchanged, take-home never rises by more than gross pay does', () => {
    for (const { policy, ...inputs } of cases) {
      const rise = pence(toNumber(fromPounds(20_000)))
      const before = ok(takeHome(inputs, config, policy)).annual
      const after = ok(takeHome({ ...inputs, grossPay: add(inputs.grossPay, rise) }, config, policy)).annual
      expect(subtract(after.net, before.net)).toBeLessThanOrEqual(rise)
      expect(subtract(after.netIncludingChildBenefit, before.netIncludingChildBenefit)).toBeLessThanOrEqual(rise)
    }
  })

  it('with the pension unchanged and no Child Benefit, take-home never falls when gross pay rises by a hundred pounds or more', () => {
    // A penny more can cost more than a penny: student loan repayments round down to whole pounds, so a repayment
    // can step up by a pound. The HICBC's whole steps are a cliff by design (decision G1), so Child Benefit is left out.
    for (const { policy, childBenefit: _, ...inputs } of cases) {
      const rise = add(fromPounds(100), pence(toNumber(fromPounds(20_000))))
      const before = ok(takeHome(inputs, config, policy)).annual.net
      const after = ok(takeHome({ ...inputs, grossPay: add(inputs.grossPay, rise) }, config, policy)).annual.net
      expect(after).toBeGreaterThanOrEqual(before)
    }
  })

  it('salary sacrifice never lowers take-home, against no pension, by more than the amount sacrificed', () => {
    for (const { policy, pension: _, ...inputs } of cases) {
      const contribution = pence(toNumber(inputs.grossPay) + 1)
      const none = ok(takeHome(inputs, config, policy)).annual
      const sacrifice = ok(takeHome({ ...inputs, pension: { method: 'salarySacrifice', contribution } }, config, policy)).annual
      expect(subtract(none.net, sacrifice.net)).toBeLessThanOrEqual(contribution)
      expect(subtract(none.netIncludingChildBenefit, sacrifice.netIncludingChildBenefit)).toBeLessThanOrEqual(contribution)
    }
  })

  it('relief at source: the band extension gives exactly the claim relief GOV.UK states, at any pay, in each region', () => {
    for (const { grossPay, region, policy } of cases) {
      const net = mulRound(grossPay, ratio(Math.floor(random() * 100), 100), 'down')
      const most = mulRound(grossPay, subtractRatio(ratio(1, 1), v.reliefAtSourceRate), 'down')
      const p = referencePension(grossPay, { method: 'reliefAtSource', contribution: net < most ? net : most }, config)
      const plain = referenceExactTax(p.taxablePay, p.ani, fracOf(0), region, config, policy)
      const extended = referenceExactTax(p.taxablePay, p.ani, p.extension, region, config, policy)
      const total = (xs: readonly (readonly [bigint, bigint])[]) =>
        xs.reduce<readonly [bigint, bigint]>(([a, b], [c, d]) => [a * d + c * b, b * d], [0n, 1n])
      const [pn, pd] = total(plain.bandTax)
      const [en, ed] = total(extended.bandTax)
      expect(equalFrac([pn * ed - en * pd, pd * ed], referenceClaimRelief(plain.taxable, p.extension, region, config))).toBe(true)
    }
  })

  it('relief at source never leaves less take-home than net pay putting the same amount in (to a penny per band)', () => {
    for (const { grossPay, region, studentLoans, policy } of cases) {
      const net = mulRound(grossPay, ratio(Math.floor(random() * 80), 100), 'down')
      const viaRas = ok(
        takeHome({ grossPay, region, studentLoans, pension: { method: 'reliefAtSource', contribution: net } }, config, policy),
      )
      const pot = viaRas.pension!.grossContribution
      const viaNetPay = ok(takeHome({ grossPay, region, studentLoans, pension: { method: 'netPay', contribution: pot } }, config, policy))
      expect(viaRas.annual.net).toBeGreaterThanOrEqual(viaNetPay.annual.net - v.bands[region].length)
    }
  })
})
