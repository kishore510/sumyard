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
  ZERO,
} from '@/lib/money'
import { employeeNI, incomeTax, studentLoan, takeHome } from './calc'
import { configValues } from './fixtures/reference'
import { type ModellingPolicy, REGIONS, type Region, STUDENT_LOAN_PLANS, type StudentLoanPlanId, TAPER_ROUNDINGS } from './types'

/*
 * Property tests over many incomes, with a seeded generator so a failure
 * repeats exactly (no new dependency). Expected values come from the config
 * through independent formulas, never from the engine.
 */

const config = taxYear
const v = configValues(config)
const POLICIES: readonly ModellingPolicy[] = TAPER_ROUNDINGS.map((taperRounding) => ({ taperRounding }))
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
      const before = ok(incomeTax(income, region, config, { taperRounding: 'exact' }))
      const after = ok(incomeTax(add(income, step), region, config, { taperRounding: 'exact' }))
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
