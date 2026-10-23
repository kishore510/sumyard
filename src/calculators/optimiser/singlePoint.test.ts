import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, toPence, ZERO } from '@/lib/money'
import { EngineInputError, evaluateContribution, optimise } from './calc'
import {
  DEFAULT_POLICY,
  type OptimiseResult,
  type OptimiserInputs,
  PENSION_METHODS,
  REGIONS,
  STUDENT_LOAN_PLANS,
  TAPER_ROUNDINGS,
} from './types'

/*
 * C1, part 1: the optimiser's single-point evaluation (CP3's engine note).
 * evaluateContribution() runs the same evaluate() step optimise() runs at
 * each sweep point, for one contribution, without the sweep. These tests
 * prove two things: optimise()'s points are unchanged by the export (a
 * fingerprint of its output on seeded cases, taken before the export was
 * added), and the single point equals the sweep's point at the same
 * contribution on 300 seeded cases.
 */

const config = taxYear

const ok = <T extends { ok: true }>(result: T | Refusal): T => {
  if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
  return result
}

/** Mulberry32, as the other property tests: a seeded generator so a failure repeats exactly. */
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
const pick = <T>(random: () => number, list: readonly T[]): T => list[between(random, 0, list.length - 1)]!

/** Optimiser inputs across pay, methods, regions, loans, Child Benefit, childcare and the annual allowance. */
function randomInputs(random: () => number): OptimiserInputs {
  const grossPay = fromPence(between(random, 0, 30_000_000))
  const method = pick(random, PENSION_METHODS)
  // A current contribution up to a fifth of pay keeps relief at source within gross pay.
  const contribution = fromPence(between(random, 0, Math.floor(toPence(grossPay) / 5)))
  const children = random() < 0.4 ? between(random, 1, 4) : 0
  return {
    grossPay,
    region: pick(random, REGIONS),
    studentLoans: random() < 0.3 ? [pick(random, STUDENT_LOAN_PLANS)] : [],
    pension: { method, contribution },
    ...(children > 0 ? { childBenefit: { children, payments: random() < 0.8 ? 'claimed' : 'optedOut' } } : {}),
    ...(random() < 0.2 ? { taxableBenefits: fromPence(between(random, 0, 1_000_000)) } : {}),
    savings: {
      employerContribution: random() < 0.5 ? fromPence(between(random, 0, 4_000_000)) : ZERO,
      carryForward: random() < 0.3 ? [{ yearsAgo: between(random, 1, 3), amount: fromPence(between(random, 0, 4_000_000)) }] : [],
      moneyPurchaseAnnualAllowance: random() < 0.1,
    },
    checkChildcare: random() < 0.3,
  }
}

/** A coarse step keeps 300 sweeps quick; the sweep's own points are what is compared. */
const OPTIONS = { step: fromPounds(2_500), maxPoints: 10_000 }

const policyFor = (random: () => number) => ({ ...DEFAULT_POLICY, taperRounding: pick(random, TAPER_ROUNDINGS) })

describe('optimise(): points unchanged by the single-point export', () => {
  /**
   * The SHA-256 of optimise()'s points on 60 seeded cases (seed 4301), taken
   * on the code before evaluateContribution() was added. Any change to a
   * point, its order or its fields changes the hash.
   */
  const FINGERPRINT = 'fe72547ae1c991f7f3a45680553ac02029719ad13523632603391efd038c5b37'

  it('gives the same points as before on seeded cases', () => {
    const random = generator(4301)
    const all: OptimiseResult['points'][] = []
    for (let n = 0; n < 60; n++) {
      const inputs = randomInputs(random)
      all.push(ok(optimise(inputs, config, policyFor(random), OPTIONS)).points)
    }
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe(FINGERPRINT)
  })
})

describe('evaluateContribution(): one point without a sweep', () => {
  it('equals the sweep point at the same contribution on 300 seeded cases', () => {
    const random = generator(4302)
    let compared = 0
    for (let n = 0; n < 300; n++) {
      const inputs = randomInputs(random)
      const policy = policyFor(random)
      const sweep = ok(optimise(inputs, config, policy, OPTIONS))
      // The current point, the maximum and one sweep point at random each time.
      const chosen = [
        sweep.points.find((p) => p.reasons.some((r) => r.kind === 'current'))!,
        sweep.points.at(-1)!,
        pick(random, sweep.points),
      ]
      for (const point of chosen) {
        const single = ok(evaluateContribution(inputs, config, policy, point.contribution))
        const { reasons: _r, netCostPerPound: _n, marginalRate: _m, ...expected } = point
        expect(single.point).toEqual(expected)
        expect(single.maximumContribution).toBe(sweep.maximumContribution)
        expect(single.taxYear).toBe(sweep.taxYear)
        compared++
      }
    }
    expect(compared).toBe(900)
  })

  it('refuses on unverified config, as optimise() does, with the same list', () => {
    const inputs = randomInputs(generator(4303))
    const single = evaluateContribution(inputs, FAKE_TODO_YEAR, DEFAULT_POLICY, ZERO)
    const sweep = optimise(inputs, FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(single.ok).toBe(false)
    expect(single).toEqual(sweep)
  })

  it('throws on a contribution above the most the engine models, or below nothing', () => {
    const inputs: OptimiserInputs = {
      grossPay: fromPounds(40_000),
      region: 'rUK',
      studentLoans: [],
      pension: { method: 'netPay', contribution: ZERO },
      savings: { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
      checkChildcare: false,
    }
    const { maximumContribution } = ok(evaluateContribution(inputs, config, DEFAULT_POLICY, ZERO))
    expect(ok(evaluateContribution(inputs, config, DEFAULT_POLICY, maximumContribution)).point.contribution).toBe(maximumContribution)
    expect(() => evaluateContribution(inputs, config, DEFAULT_POLICY, add(maximumContribution, fromPence(1)))).toThrow(EngineInputError)
    expect(() => evaluateContribution(inputs, config, DEFAULT_POLICY, fromPence(-1) as Money)).toThrow(EngineInputError)
  })
})
