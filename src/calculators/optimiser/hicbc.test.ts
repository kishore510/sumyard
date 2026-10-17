import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, MoneyError, mulRound, ratio, subtract, ZERO } from '@/lib/money'
import { CHILD_BENEFIT_WEEKS_PER_YEAR, MONTHS_PER_YEAR } from '@/lib/periods'
import { EngineInputError, hicbc, takeHome } from './calc'
import { configValues, referenceHicbc } from './fixtures/reference'
import { type ChildBenefitInput, type ChildBenefitPayments, DEFAULT_POLICY, type ModellingPolicy, type TaxInputs } from './types'

/*
 * Session G1: the High Income Child Benefit Charge (decision G1: whole steps,
 * the charge to the nearest penny; G4: weeks from the policy). Expected values
 * come from the verified 2026-27 config through fixtures/reference.ts or a
 * formula written here; no tax figure is written in this file.
 */

const config = taxYear
const v = configValues(config)
const cb = v.childBenefit
const penny = fromPence(1)
const claimed = (children: number): ChildBenefitInput => ({ children, payments: 'claimed' })
const optedOut = (children: number): ChildBenefitInput => ({ children, payments: 'optedOut' })

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

/** The year's Child Benefit, worked out here: the weeks times the eldest's rate and each other child's. */
function entitlement(children: number, weeks = DEFAULT_POLICY.childBenefitWeeks): Money {
  if (children === 0) return ZERO
  const weekly = add(cb.eldestOrOnly, mulRound(cb.additionalChild, ratio(children - 1, 1), 'nearest'))
  return mulRound(weekly, ratio(weeks, 1), 'nearest')
}

const charged = (children: number, points: number) => mulRound(entitlement(children), ratio(points, 100), 'nearest')

describe('hicbc', () => {
  it('Child Benefit for the year: the eldest or only child’s rate and each other child’s, for the policy’s weeks', () => {
    for (const children of [0, 1, 2, 3, 6]) {
      const result = ok(hicbc(ZERO, claimed(children), config, DEFAULT_POLICY))
      expect(result.entitlement).toBe(entitlement(children))
      expect(result.childBenefit).toBe(entitlement(children))
      expect(result.charge).toBe(ZERO)
      expect(result.weeks).toBe(CHILD_BENEFIT_WEEKS_PER_YEAR)
    }
    const policy: ModellingPolicy = { ...DEFAULT_POLICY, childBenefitWeeks: DEFAULT_POLICY.childBenefitWeeks + 1 }
    const longer = ok(hicbc(ZERO, claimed(2), config, policy))
    expect(longer.weeks).toBe(DEFAULT_POLICY.childBenefitWeeks + 1)
    expect(longer.entitlement).toBe(entitlement(2, DEFAULT_POLICY.childBenefitWeeks + 1))
  })

  it('nothing at or below the threshold, nor for a part step above it (whole steps, decision G1)', () => {
    for (const ani of [
      ZERO,
      subtract(cb.threshold, penny),
      cb.threshold,
      add(cb.threshold, penny),
      subtract(add(cb.threshold, cb.incomePerPercent), penny),
    ]) {
      const result = ok(hicbc(ani, claimed(2), config, DEFAULT_POLICY))
      expect([result.steps, result.percentCharged, result.charge]).toEqual([0, 0, ZERO])
      expect(result.net).toBe(entitlement(2))
    }
  })

  it('one percentage point for each whole step: a penny either side of a step', () => {
    const one = add(cb.threshold, cb.incomePerPercent)
    expect(ok(hicbc(one, claimed(1), config, DEFAULT_POLICY))).toMatchObject({ steps: 1, percentCharged: 1, charge: charged(1, 1) })
    expect(ok(hicbc(add(one, penny), claimed(1), config, DEFAULT_POLICY))).toMatchObject({ steps: 1, percentCharged: 1 })
    const seven = add(cb.threshold, mulRound(cb.incomePerPercent, ratio(7, 1), 'nearest'))
    expect(ok(hicbc(subtract(seven, penny), claimed(3), config, DEFAULT_POLICY))).toMatchObject({ steps: 6, charge: charged(3, 6) })
    expect(ok(hicbc(seven, claimed(3), config, DEFAULT_POLICY))).toMatchObject({ steps: 7, charge: charged(3, 7) })
  })

  it('the full charge: a penny either side of the full-charge point, and far above it', () => {
    for (const ani of [subtract(cb.fullChargeAt, penny), cb.fullChargeAt, add(cb.fullChargeAt, penny), fromPounds(500_000)]) {
      const result = ok(hicbc(ani, claimed(2), config, DEFAULT_POLICY))
      const ref = referenceHicbc(ani, claimed(2), config, DEFAULT_POLICY)
      expect([result.steps, result.percentCharged, result.charge]).toEqual([ref.steps, ref.percent, ref.charge])
    }
    const above = ok(hicbc(add(cb.fullChargeAt, penny), claimed(2), config, DEFAULT_POLICY))
    expect(above.percentCharged).toBe(100)
    expect(above.charge).toBe(above.childBenefit)
    expect(above.net).toBe(ZERO)
    expect(ok(hicbc(subtract(cb.fullChargeAt, penny), claimed(2), config, DEFAULT_POLICY)).percentCharged).toBeLessThan(100)
  })

  it('agrees with the reference across the charge band, for several families', () => {
    for (const children of [0, 1, 2, 4])
      for (
        let ani = subtract(cb.threshold, fromPounds(500));
        ani <= add(cb.fullChargeAt, fromPounds(500));
        ani = add(ani, fromPence(13_337))
      ) {
        const result = ok(hicbc(ani, claimed(children), config, DEFAULT_POLICY))
        const ref = referenceHicbc(ani, claimed(children), config, DEFAULT_POLICY)
        expect([result.entitlement, result.steps, result.percentCharged, result.charge]).toEqual([
          ref.entitlement,
          ref.steps,
          ref.percent,
          ref.charge,
        ])
      }
  })

  it('opted out: no Child Benefit and no charge, whatever the income', () => {
    for (const ani of [ZERO, add(cb.threshold, cb.incomePerPercent), add(cb.fullChargeAt, penny)]) {
      const result = ok(hicbc(ani, optedOut(2), config, DEFAULT_POLICY))
      expect(result).toMatchObject({ payments: 'optedOut', childBenefit: ZERO, charge: ZERO, net: ZERO })
      expect(result.entitlement).toBe(entitlement(2))
    }
  })

  it('zero children: nothing received and nothing charged', () => {
    const result = ok(hicbc(add(cb.fullChargeAt, penny), claimed(0), config, DEFAULT_POLICY))
    expect([result.entitlement, result.childBenefit, result.charge, result.net]).toEqual([ZERO, ZERO, ZERO, ZERO])
  })

  it('refuses on unverified Child Benefit values, listing each', () => {
    expect(hicbc(ZERO, claimed(1), FAKE_TODO_YEAR, DEFAULT_POLICY)).toEqual({
      ok: false,
      taxYear: FAKE_TODO_YEAR.id,
      unverified: [
        'childBenefit.weeklyRates.eldestOrOnly',
        'childBenefit.weeklyRates.additionalChild',
        'childBenefit.hicbc.threshold',
        'childBenefit.hicbc.fullChargeAt',
        'childBenefit.hicbc.incomePerPercent',
      ],
    })
  })

  it('rejects bad inputs: negative income, children that are not a whole number, unknown payments, bad weeks', () => {
    expect(() => hicbc(fromPence(-1), claimed(1), config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => hicbc(0.5 as Money, claimed(1), config, DEFAULT_POLICY)).toThrow(MoneyError)
    for (const children of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => hicbc(ZERO, claimed(children), config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => hicbc(ZERO, { children: 1, payments: 'sometimes' as ChildBenefitPayments }, config, DEFAULT_POLICY)).toThrow(
      EngineInputError,
    )
    for (const childBenefitWeeks of [0, -1, 1.5, Number.NaN])
      expect(() => hicbc(ZERO, claimed(1), config, { ...DEFAULT_POLICY, childBenefitWeeks })).toThrow(EngineInputError)
  })
})

describe('takeHome with Child Benefit', () => {
  /** Half-way-ish into the charge band: fifty whole steps over the threshold (a test input). */
  const midBand = add(cb.threshold, mulRound(cb.incomePerPercent, ratio(50, 1), 'nearest'))
  const inputs = (patch: Partial<TaxInputs> = {}): TaxInputs => ({
    grossPay: midBand,
    region: 'rUK',
    studentLoans: [],
    childBenefit: claimed(2),
    ...patch,
  })

  it('takes the charge off take-home pay and shows the Child Benefit beside it', () => {
    const result = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    const charge = ok(hicbc(midBand, claimed(2), config, DEFAULT_POLICY))
    expect(result.hicbc).toEqual(charge)
    expect(result.annual.hicbc).toBe(charge.charge)
    expect(result.annual.childBenefit).toBe(charge.childBenefit)
    const beforeCharge = subtract(subtract(midBand, result.annual.incomeTax), result.annual.nationalInsurance)
    expect(result.annual.net).toBe(subtract(beforeCharge, charge.charge))
    expect(result.annual.netIncludingChildBenefit).toBe(add(result.annual.net, charge.childBenefit))
  })

  it('the charge runs on adjusted net income: a pension can bring it down', () => {
    const without = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    // Sacrificing the pay above the threshold brings adjusted net income down to it.
    const sacrifice = subtract(midBand, cb.threshold)
    const withPension = ok(takeHome(inputs({ pension: { method: 'salarySacrifice', contribution: sacrifice } }), config, DEFAULT_POLICY))
    expect(withPension.hicbc?.adjustedNetIncome).toBe(cb.threshold)
    expect(withPension.hicbc?.charge).toBe(ZERO)
    expect(without.hicbc!.charge).toBeGreaterThan(0)
  })

  it('uses the exact adjusted net income: a quarter penny under a step is no step, though it rounds to the step', () => {
    // A relief at source payment of a penny grosses up to a penny and a part, so ANI ends in part of a penny.
    const step = add(cb.threshold, cb.incomePerPercent)
    const result = ok(
      takeHome(inputs({ grossPay: add(step, penny), pension: { method: 'reliefAtSource', contribution: penny } }), config, DEFAULT_POLICY),
    )
    expect(result.adjustedNetIncome.adjustedNetIncome).toBe(step)
    expect(result.hicbc?.steps).toBe(0)
    expect(result.hicbc?.charge).toBe(ZERO)
  })

  it('opted out: no charge and no Child Benefit', () => {
    const result = ok(takeHome(inputs({ grossPay: fromPounds(90_000), childBenefit: optedOut(3) }), config, DEFAULT_POLICY))
    expect([result.annual.hicbc, result.annual.childBenefit]).toEqual([ZERO, ZERO])
    expect(result.annual.netIncludingChildBenefit).toBe(result.annual.net)
  })

  it('without Child Benefit there is no charge and no Child Benefit value is needed', () => {
    const result = ok(takeHome(inputs({ childBenefit: undefined }), config, DEFAULT_POLICY))
    expect(result.hicbc).toBeNull()
    const refusal = takeHome(inputs({ childBenefit: undefined }), FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(!refusal.ok && refusal.unverified.some((path) => path.startsWith('childBenefit.'))).toBe(false)
    const withChildren = takeHome(inputs(), FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(!withChildren.ok && withChildren.unverified).toEqual(expect.arrayContaining(['childBenefit.hicbc.threshold']))
  })

  it('monthly and weekly views divide the charge and the Child Benefit too', () => {
    const result = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    for (const key of ['pension', 'hicbc', 'childBenefit', 'netIncludingChildBenefit'] as const) {
      expect(result.monthly[key]).toBe(mulRound(result.annual[key], ratio(1, MONTHS_PER_YEAR), 'nearest'))
    }
  })

  it('lists Child Benefit, the weeks, the whole steps and the opt-out in its assumptions, with no figures', () => {
    const text = ok(takeHome(inputs(), config, DEFAULT_POLICY)).assumptions.join(' ')
    expect(text).toMatch(/Child Benefit/)
    expect(text).toMatch(/weeks/i)
    expect(text).toMatch(/whole step/i)
    expect(text).toMatch(/partner/i)
    expect(ok(takeHome(inputs({ childBenefit: optedOut(1) }), config, DEFAULT_POLICY)).assumptions.join(' ')).toMatch(/opted out/i)
    for (const line of ok(takeHome(inputs(), config, DEFAULT_POLICY)).assumptions) expect(line).not.toMatch(/\d/)
  })
})
