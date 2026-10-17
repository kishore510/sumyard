import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { Refusal } from '@/config/tax/sourced'
import { add, compare, fromPence, fromPounds, type Money, MoneyError, mulRound, ratio, subtract, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR, WEEKS_PER_YEAR } from '@/lib/periods'
import { annualAllowanceCheck, EngineInputError, optimise, takeHome, thresholdContributions } from './calc'
import {
  configValues,
  equalFrac,
  fracOf,
  referenceAnnualAllowance,
  referenceTakeHome,
  referenceThresholdContribution,
  referenceThresholds,
} from './fixtures/reference'
import {
  type ChildBenefitInput,
  DEFAULT_POLICY,
  type OptimiserInputs,
  PENSION_METHODS,
  type PensionInput,
  REGIONS,
  type StudentLoanPlanId,
  type TakeHomeResult,
  type TaxInputs,
} from './types'

/*
 * Session 1b-i: taxable benefits in kind and post-tax deductions (decisions
 * B1 and B2). A benefit is taxable pay and in adjusted net income (the ANI
 * guidance's step 1; PTM057100 for both annual allowance measures) but not
 * NI-able pay or the student loan base (Class 1A, not Class 1: NIM13090,
 * CSLM16030). A post-tax deduction comes off take-home and changes nothing
 * else. Expected values come from the verified 2026-27 config through
 * fixtures/reference.ts; no tax figure is written in this file. No GOV.UK page
 * read prints a worked example with a benefit in kind, so none is mirrored.
 */

const config = taxYear
const v = configValues(config)
const policy = DEFAULT_POLICY
const penny = fromPence(1)

const ok = <T extends { ok: true }>(result: T | Refusal): T => {
  if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
  return result
}

const home = (inputs: TaxInputs): TakeHomeResult => ok(takeHome(inputs, config, policy))

const base = (patch: Partial<TaxInputs> = {}): TaxInputs => ({ grossPay: fromPounds(45_000), region: 'rUK', studentLoans: [], ...patch })

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

const PLAN_SETS: readonly (readonly StudentLoanPlanId[])[] = [[], ['plan1'], ['plan2', 'postgraduate'], ['plan5']]
const CHILDREN: readonly (ChildBenefitInput | undefined)[] = [
  undefined,
  { children: 1, payments: 'claimed' },
  { children: 3, payments: 'claimed' },
  { children: 2, payments: 'optedOut' },
]

/** Random take-home inputs with a benefit and a deduction, pay up to past the zero point of the taper. */
function sample(random: () => number, count: number): TaxInputs[] {
  const top = Number(v.taperStart) * 3
  const list: TaxInputs[] = []
  for (let i = 0; i < count; i++) {
    const grossPay = fromPence(Math.floor(random() * top))
    const method = PENSION_METHODS[Math.floor(random() * (PENSION_METHODS.length + 1))]
    const pension: PensionInput | undefined = method
      ? { method, contribution: fromPence(Math.floor(random() * Number(grossPay) * 0.3)) }
      : undefined
    const childBenefit = CHILDREN[Math.floor(random() * CHILDREN.length)]
    list.push({
      grossPay,
      region: REGIONS[Math.floor(random() * REGIONS.length)]!,
      studentLoans: PLAN_SETS[Math.floor(random() * PLAN_SETS.length)]!,
      ...(pension ? { pension } : {}),
      ...(childBenefit ? { childBenefit } : {}),
      taxableBenefits: fromPence(Math.floor(random() * Number(v.taperStart) * 0.4)),
      postTaxDeductions: fromPence(Math.floor(random() * 500_000)),
    })
  }
  return list
}

describe('taxable benefits in kind (B1)', () => {
  it('zero, or absent, gives the same result as before', () => {
    const without = home(base())
    const zero = home(base({ taxableBenefits: ZERO, postTaxDeductions: ZERO }))
    expect(zero.annual).toEqual(without.annual)
    expect(zero.incomeTax.total).toBe(without.incomeTax.total)
  })

  it('adds the benefit to taxable pay and adjusted net income, and not to NI-able pay or the student loan base', () => {
    for (const method of [undefined, ...PENSION_METHODS]) {
      const pension: PensionInput | undefined = method ? { method, contribution: fromPounds(3_000) } : undefined
      const benefit = fromPounds(1_234.56)
      const before = home(base({ studentLoans: ['plan2'], ...(pension ? { pension } : {}) }))
      const after = home(base({ studentLoans: ['plan2'], ...(pension ? { pension } : {}), taxableBenefits: benefit }))
      expect(after.incomeTax.taxablePay, String(method)).toBe(add(before.incomeTax.taxablePay, benefit))
      expect(after.adjustedNetIncome.netIncome, String(method)).toBe(add(before.adjustedNetIncome.netIncome, benefit))
      expect(after.adjustedNetIncome.adjustedNetIncome, String(method)).toBe(add(before.adjustedNetIncome.adjustedNetIncome, benefit))
      expect(after.nationalInsurance.niablePay, String(method)).toBe(before.nationalInsurance.niablePay)
      expect(after.nationalInsurance.total, String(method)).toBe(before.nationalInsurance.total)
      expect(after.studentLoan.pay, String(method)).toBe(before.studentLoan.pay)
      expect(after.studentLoan.total, String(method)).toBe(before.studentLoan.total)
      // Not cash: gross pay is unchanged, and take-home falls by the extra tax alone.
      expect(after.annual.gross, String(method)).toBe(before.annual.gross)
      expect(after.annual.net, String(method)).toBe(subtract(before.annual.net, subtract(after.incomeTax.total, before.incomeTax.total)))
      expect(compare(after.incomeTax.total, before.incomeTax.total), String(method)).toBe(1)
    }
  })

  it('agrees with the reference on random inputs with benefits and deductions', () => {
    const random = generator(1_501)
    for (const inputs of sample(random, 300)) {
      const result = home(inputs)
      const ref = referenceTakeHome(inputs, config, policy)
      const label = JSON.stringify(inputs)
      expect(result.annual.incomeTax, label).toBe(ref.tax)
      expect(result.annual.nationalInsurance, label).toBe(ref.ni)
      expect(result.annual.studentLoan, label).toBe(ref.loan)
      expect(result.annual.hicbc, label).toBe(ref.charge)
      expect(result.annual.postTaxDeductions, label).toBe(ref.deductions)
      expect(result.annual.net, label).toBe(ref.net)
      expect(result.adjustedNetIncome.adjustedNetIncome, label).toBe(ref.ani)
    }
  })

  it('never lowers tax, and more benefit never means less tax', () => {
    const random = generator(77)
    for (const inputs of sample(random, 200)) {
      const without = home({ ...inputs, taxableBenefits: ZERO })
      const less = home({ ...inputs, taxableBenefits: fromPence(Math.floor(Number(inputs.taxableBenefits) / 2)) })
      const more = home(inputs)
      expect(compare(less.incomeTax.total, without.incomeTax.total), JSON.stringify(inputs)).toBeGreaterThanOrEqual(0)
      expect(compare(more.incomeTax.total, less.incomeTax.total), JSON.stringify(inputs)).toBeGreaterThanOrEqual(0)
      expect(compare(more.annual.hicbc, without.annual.hicbc), JSON.stringify(inputs)).toBeGreaterThanOrEqual(0)
    }
  })

  it('moves adjusted net income across the taper start: a penny either side', () => {
    const benefit = fromPounds(8_000)
    const pay = (offset: number) => fromPence(Number(v.taperStart) - Number(benefit) + offset)
    const at = home(base({ grossPay: pay(0), taxableBenefits: benefit }))
    expect(at.adjustedNetIncome.adjustedNetIncome).toBe(v.taperStart)
    expect(at.incomeTax.personalAllowance.allowance).toBe(v.personalAllowance)
    const under = home(base({ grossPay: pay(-1), taxableBenefits: benefit }))
    expect(under.incomeTax.personalAllowance.allowance).toBe(v.personalAllowance)
    // Two pence over: the exact reduction is the taper rate on two pence, which shows once rounded.
    const over = home(base({ grossPay: pay(2), taxableBenefits: benefit }))
    const reduction = mulRound(fromPence(2), v.taperRate, 'nearest')
    expect(over.incomeTax.personalAllowance.allowance).toBe(subtract(v.personalAllowance, reduction))
    // Without the benefit the same pay is well under the start.
    expect(home(base({ grossPay: pay(2) })).incomeTax.personalAllowance.allowance).toBe(v.personalAllowance)
  })

  it('moves adjusted net income across the HICBC threshold and the first step: a penny either side', () => {
    const benefit = fromPounds(5_000)
    const childBenefit: ChildBenefitInput = { children: 2, payments: 'claimed' }
    const charge = (offset: number) =>
      home(
        base({ grossPay: fromPence(Number(v.childBenefit.threshold) - Number(benefit) + offset), taxableBenefits: benefit, childBenefit }),
      ).hicbc!
    const step = Number(v.childBenefit.incomePerPercent)
    expect(charge(0)).toMatchObject({ steps: 0, charge: ZERO })
    expect(charge(1)).toMatchObject({ steps: 0, charge: ZERO })
    expect(charge(step - 1)).toMatchObject({ steps: 0, charge: ZERO })
    expect(charge(step).steps).toBe(1)
    expect(compare(charge(step).charge, ZERO)).toBe(1)
    // Without the benefit there is no charge at that pay.
    const plain = home(base({ grossPay: fromPence(Number(v.childBenefit.threshold) - Number(benefit) + step), childBenefit }))
    expect(plain.hicbc!.steps).toBe(0)
  })

  it('is allowed above gross pay, with no warning unless take-home falls below nothing', () => {
    const big = home(base({ grossPay: fromPounds(10_000), taxableBenefits: fromPounds(30_000) }))
    expect(big.incomeTax.taxablePay).toBe(fromPounds(40_000))
    expect(big.warnings).toEqual([])
    const none = home(base({ grossPay: ZERO, taxableBenefits: fromPounds(30_000) }))
    expect(compare(none.incomeTax.total, ZERO)).toBe(1)
    expect(none.annual.net).toBe(subtract(ZERO, none.incomeTax.total))
    expect(none.warnings.map((w) => w.code)).toEqual(['takeHomeBelowNothing'])
  })

  it('enters both annual allowance measures, and is not counted as pension savings', () => {
    const benefit = fromPounds(20_000)
    const savings = { employerContribution: fromPounds(4_000), carryForward: [], moneyPurchaseAnnualAllowance: false }
    for (const method of PENSION_METHODS) {
      const inputs = base({ grossPay: fromPounds(190_000), pension: { method, contribution: fromPounds(6_000) }, taxableBenefits: benefit })
      const result = ok(annualAllowanceCheck(inputs, savings, config, policy))
      const ref = referenceAnnualAllowance(inputs, savings, config)
      const without = ok(annualAllowanceCheck({ ...inputs, taxableBenefits: ZERO }, savings, config, policy))
      expect(equalFrac(fracOf(result.thresholdIncome), ref.thresholdIncome), method).toBe(true)
      expect(result.adjustedIncome, method).toBe(ref.adjustedIncome)
      expect(result.thresholdIncome, method).toBe(add(without.thresholdIncome, benefit))
      expect(result.adjustedIncome, method).toBe(add(without.adjustedIncome, benefit))
      expect(result.counted, method).toEqual(without.counted)
      expect(result.tapered, method).toBe(ref.tapered)
    }
  })

  it('is in adjusted net income for the childcare check and the threshold contributions', () => {
    const benefit = fromPounds(12_000)
    for (const method of PENSION_METHODS) {
      const inputs: OptimiserInputs = {
        ...base({ grossPay: fromPounds(100_000), taxableBenefits: benefit, childBenefit: { children: 1, payments: 'claimed' } }),
        pension: { method, contribution: ZERO },
        savings: { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
        checkChildcare: true,
      }
      const thresholds = ok(thresholdContributions(inputs, config, policy)).thresholds
      const limits = referenceThresholds(config)
      for (const t of thresholds) {
        const { limit, measure } = limits[t.threshold]
        const expected = referenceThresholdContribution(inputs.grossPay, method, limit, measure, config, benefit)
        if (t.status === 'unreachable' && t.reason === 'notLoweredByMethod') continue
        expect(t.contribution === null ? null : Number(t.contribution), `${method} ${t.threshold}`).toBe(expected)
      }
      const result = ok(optimise(inputs, config, policy, { step: fromPounds(20_000), maxPoints: 100 }))
      const zero = result.points[0]!
      expect(zero.adjustedNetIncome, method).toBe(add(inputs.grossPay, benefit))
      expect(
        zero.childcare.every((s) => !s.eligibleOnIncome),
        method,
      ).toBe(true)
    }
  })
})

describe('post-tax deductions (B2)', () => {
  it('reduce take-home by exactly the deduction and change no tax, NI, student loan, HICBC or ANI', () => {
    const random = generator(4_242)
    for (const inputs of sample(random, 200)) {
      const without = home({ ...inputs, postTaxDeductions: ZERO })
      const result = home(inputs)
      const d = inputs.postTaxDeductions!
      const label = JSON.stringify(inputs)
      expect(result.incomeTax, label).toEqual(without.incomeTax)
      expect(result.nationalInsurance, label).toEqual(without.nationalInsurance)
      expect(result.studentLoan, label).toEqual(without.studentLoan)
      expect(result.hicbc, label).toEqual(without.hicbc)
      expect(result.adjustedNetIncome, label).toEqual(without.adjustedNetIncome)
      expect(result.annual.postTaxDeductions, label).toBe(d)
      expect(result.annual.net, label).toBe(subtract(without.annual.net, d))
      expect(result.annual.netIncludingChildBenefit, label).toBe(subtract(without.annual.netIncludingChildBenefit, d))
    }
  })

  it('the annual breakdown adds up to take-home', () => {
    const random = generator(9)
    for (const inputs of sample(random, 100)) {
      const { annual } = home(inputs)
      const rows = [annual.incomeTax, annual.nationalInsurance, annual.studentLoan, annual.pension, annual.hicbc, annual.postTaxDeductions]
      expect(
        rows.reduce((left, row) => subtract(left, row), annual.gross),
        JSON.stringify(inputs),
      ).toBe(annual.net)
    }
  })

  it('monthly and weekly views divide the deduction evenly, to the nearest penny', () => {
    const d = fromPounds(1_000)
    const result = home(base({ postTaxDeductions: d }))
    expect(result.monthly.postTaxDeductions).toBe(mulRound(d, ratio(1, MONTHS_PER_YEAR), 'nearest'))
    expect(result.weekly.postTaxDeductions).toBe(mulRound(d, ratio(1, WEEKS_PER_YEAR), 'nearest'))
    expect(result.monthly.net).toBe(mulRound(result.annual.net, ratio(1, MONTHS_PER_YEAR), 'nearest'))
  })

  it('above take-home: kept, never capped, with a warning', () => {
    const plain = home(base())
    const over = home(base({ postTaxDeductions: add(plain.annual.net, penny) }))
    expect(over.annual.net).toBe(subtract(ZERO, penny))
    expect(over.warnings.map((w) => w.code)).toEqual(['takeHomeBelowNothing'])
    expect(over.warnings[0]!.message).not.toMatch(/\d/)
    const exact = home(base({ postTaxDeductions: plain.annual.net }))
    expect(exact.annual.net).toBe(ZERO)
    expect(exact.warnings).toEqual([])
  })

  it('reduce spendable in optimise() by the deduction at every point, and change nothing else', () => {
    const d = fromPounds(2_400)
    const inputs: OptimiserInputs = {
      ...base({ grossPay: fromPounds(70_000), childBenefit: { children: 2, payments: 'claimed' } }),
      pension: { method: 'netPay', contribution: fromPounds(2_000) },
      savings: { employerContribution: fromPounds(1_000), carryForward: [], moneyPurchaseAnnualAllowance: false },
      checkChildcare: false,
    }
    const options = { step: fromPounds(5_000), maxPoints: 100 }
    const without = ok(optimise(inputs, config, policy, options))
    const result = ok(optimise({ ...inputs, postTaxDeductions: d }, config, policy, options))
    expect(result.points.map((p) => p.spendable)).toEqual(without.points.map((p) => subtract(p.spendable, d)))
    expect(result.points.map((p) => p.adjustedNetIncome)).toEqual(without.points.map((p) => p.adjustedNetIncome))
    expect(result.points.map((p) => p.marginalRate)).toEqual(without.points.map((p) => p.marginalRate))
    expect(result.thresholds).toEqual(without.thresholds)
  })
})

describe('inputs', () => {
  it('rejects negative benefits and deductions, and amounts that are not whole pence', () => {
    expect(() => takeHome(base({ taxableBenefits: fromPence(-1) }), config, policy)).toThrow(EngineInputError)
    expect(() => takeHome(base({ postTaxDeductions: fromPence(-1) }), config, policy)).toThrow(EngineInputError)
    expect(() => takeHome(base({ taxableBenefits: 0.5 as Money }), config, policy)).toThrow(MoneyError)
    expect(() => takeHome(base({ postTaxDeductions: (Number.MAX_SAFE_INTEGER * 2) as Money }), config, policy)).toThrow(MoneyError)
  })

  it('echoes them in the result’s inputs when given', () => {
    const inputs = base({ taxableBenefits: fromPounds(900), postTaxDeductions: fromPounds(300) })
    expect(home(inputs).inputs).toEqual(inputs)
    expect(home(base()).inputs).toEqual(base())
  })

  it('assumptions name benefits and deductions without figures', () => {
    const text = home(base({ taxableBenefits: fromPounds(900), postTaxDeductions: fromPounds(300) })).assumptions.join(' ')
    expect(text).toMatch(/benefits in kind/i)
    // The engine's strings hold no digits (literals.test.ts), so Class 1A is named in words.
    expect(text).toMatch(/National Insurance the employer pays on benefits/i)
    expect(text).toMatch(/post-tax deductions/i)
    expect(text).not.toMatch(/\d/)
    expect(home(base()).assumptions.join(' ')).not.toMatch(/post-tax deductions/i)
  })
})
