import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { requireVerified } from '@/config/tax/sourced'
import { add, compare, fromPence, fromPounds, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { DEFAULT_MONTHLY_SWEEP_STEP, MAX_SWEEP_POINTS, PAGE_SWEEP_POINTS, pageSweepStep } from '@/lib/sweep'
import { optimise } from './calc'
import { calculateTakeHome, type OptimiserPageInputs, optimiserCalculator, resolveInputs, toTaxInputs } from './definition'
import { calculateOptimise, carryForwardYears, toOptimiserInputs } from './optimiserInputs'
import type { ContributionEntry } from './pageInputs'
import { DEFAULT_POLICY } from './types'

/*
 * 1b-ii-a: the page inputs mapped to optimise()'s (optimiserInputs.ts). The
 * take-home part is toTaxInputs unchanged; the pension is always passed (the
 * sweep needs the method even at nothing); savings take the resolved employer
 * contribution. No tax figure here: expected results come from the engine.
 */

const defaults = optimiserCalculator.defaultInputs()
const page = (patch: Partial<OptimiserPageInputs> = {}): OptimiserPageInputs => ({
  ...defaults,
  salary: fromPounds(110_000),
  bonus: fromPounds(10_000),
  ...patch,
})
const amount = (pence: number): ContributionEntry => ({ mode: 'amount', amount: fromPence(pence), percentOfPay: '0' })
const byPercent = (percentOfPay: string): ContributionEntry => ({ mode: 'percentOfPay', amount: ZERO, percentOfPay })

describe('toOptimiserInputs', () => {
  it('is toTaxInputs plus the pension by the method, at the resolved contribution', () => {
    const inputs = page({ pensionMethod: 'netPay', employeeContribution: amount(fromPounds(6_000)), children: 2 })
    const mapped = toOptimiserInputs(inputs)
    const { pension: _p, ...taxRest } = toTaxInputs(inputs)
    const { pension, savings: _s, checkChildcare: _c, ...rest } = mapped
    expect(rest).toEqual(taxRest)
    expect(pension).toEqual({ method: 'netPay', contribution: fromPounds(6_000) })
  })

  it('passes the method with a contribution of nothing when there is none (the sweep still needs it)', () => {
    const mapped = toOptimiserInputs(page({ pensionMethod: 'reliefAtSource' }))
    expect(mapped.pension).toEqual({ method: 'reliefAtSource', contribution: ZERO })
    expect(toTaxInputs(page())).not.toHaveProperty('pension')
  })

  it('resolves percentages of pensionable pay for both contributions, as the take-home page does', () => {
    const inputs = page({
      employeeContribution: byPercent('8'),
      employerContribution: byPercent('4.5'),
      pensionablePay: { own: false, amount: ZERO, includeBonus: true },
    })
    const resolved = resolveInputs(inputs)
    const mapped = toOptimiserInputs(inputs)
    expect(mapped.pension.contribution).toBe(resolved.employeeContribution)
    expect(mapped.savings.employerContribution).toBe(resolved.employerContribution)
    expect(compare(resolved.employerContribution, ZERO)).toBeGreaterThan(0)
  })

  it('carries the carry forward entries, the money purchase flag and the childcare check, as fresh objects', () => {
    const carryForward = [
      { yearsAgo: 1, amount: fromPounds(3_000) },
      { yearsAgo: 2, amount: fromPounds(4_000) },
    ]
    const inputs = page({ carryForward, moneyPurchaseAnnualAllowance: true, checkChildcare: true })
    const mapped = toOptimiserInputs(inputs)
    expect(mapped.savings).toEqual({ employerContribution: ZERO, carryForward, moneyPurchaseAnnualAllowance: true })
    expect(mapped.savings.carryForward).not.toBe(carryForward)
    expect(mapped.savings.carryForward[0]).not.toBe(carryForward[0])
    expect(mapped.checkChildcare).toBe(true)
    expect(toOptimiserInputs(page()).checkChildcare).toBe(false)
    expect(toOptimiserInputs(page()).savings.moneyPurchaseAnnualAllowance).toBe(false)
  })

  it('keeps the benefits and deductions toTaxInputs gives, so the sweep starts from cash pay after salary given up', () => {
    const inputs = page({
      taxableBenefits: [{ name: 'Car', period: 'year', value: fromPounds(5_000), taken: fromPounds(2_000), payment: 'beforeTax' }],
      postTaxDeductions: [{ name: 'Dental', amount: fromPounds(10), period: 'month' }],
    })
    const mapped = toOptimiserInputs(inputs)
    expect(mapped.benefits).toEqual(toTaxInputs(inputs).benefits)
    expect(mapped.postTaxDeductions).toBe(toTaxInputs(inputs).postTaxDeductions)
  })
})

describe('calculateOptimise', () => {
  it('is optimise() on the mapped inputs, with the page sweep step', () => {
    const inputs = page({ employeeContribution: amount(fromPounds(5_000)), children: 1, checkChildcare: true })
    const step = pageSweepStep(add(inputs.salary, inputs.bonus))
    const expected = optimise(toOptimiserInputs(inputs), taxYear, DEFAULT_POLICY, { step, maxPoints: MAX_SWEEP_POINTS })
    expect(calculateOptimise(inputs, taxYear)).toEqual(expected)
  })

  it('sizes the sweep step on salary plus bonus (gross pay bounds the range)', () => {
    // Salary alone fits the budget at the default step; with the bonus it needs a larger one.
    const inputs = page({ salary: fromPounds(190_000), bonus: fromPounds(20_000) })
    expect(pageSweepStep(inputs.salary)).not.toBe(pageSweepStep(add(inputs.salary, inputs.bonus)))
    const result = calculateOptimise(inputs, taxYear)
    if (!result.ok || 'problem' in result) throw new Error('no result')
    expect(result.step).toBe(pageSweepStep(add(inputs.salary, inputs.bonus)))
  })

  it('its current point is the take-home page’s own result', () => {
    const inputs = page({ pensionMethod: 'salarySacrifice', employeeContribution: amount(fromPounds(7_250)), children: 2 })
    const result = calculateOptimise(inputs, taxYear)
    const home = calculateTakeHome(inputs, taxYear)
    if (!result.ok || 'problem' in result || !home.ok || 'problem' in home) throw new Error('no result')
    const current = result.points.find((p) => p.reasons.some((r) => r.kind === 'current'))!
    expect(current.contribution).toBe(fromPounds(7_250))
    expect(current.takeHome).toBe(home.annual.net)
    expect(current.adjustedNetIncome).toBe(home.adjustedNetIncome.adjustedNetIncome)
  })

  it('keeps the number of points within the page’s budget for a very large pay', () => {
    const result = calculateOptimise(page({ salary: fromPounds(9_000_000) }), taxYear)
    if (!result.ok || 'problem' in result) throw new Error('no result')
    const sweeps = result.points.filter((p) => p.reasons.some((r) => r.kind === 'sweep'))
    expect(sweeps.length).toBeLessThanOrEqual(PAGE_SWEEP_POINTS)
    expect(sweeps.length).toBeGreaterThan(PAGE_SWEEP_POINTS / 2)
  })

  it('refuses when the year’s values are not verified, naming them', () => {
    const result = calculateOptimise(page(), FAKE_TODO_YEAR)
    expect(result).toMatchObject({ ok: false, unverified: expect.arrayContaining(['incomeTax.personalAllowance']) })
  })

  it('gives the input problem, not an exception, when the contribution is above pay', () => {
    const result = calculateOptimise(
      page({ salary: fromPounds(1_000), bonus: ZERO, employeeContribution: amount(fromPounds(2_000)) }),
      taxYear,
    )
    expect(result).toMatchObject({ ok: false, problem: expect.any(String) })
  })
})

describe('pageSweepStep', () => {
  it('is the default step while the range fits the budget, and a whole multiple of it above', () => {
    const small = pageSweepStep(fromPounds(150_000))
    const large = pageSweepStep(fromPounds(5_000_000))
    expect(pageSweepStep(ZERO)).toBe(small)
    expect(Number(large) % Number(small)).toBe(0)
    expect(Number(large)).toBeGreaterThan(Number(small))
    for (const pounds of [0, 1, 150_000, 199_999, 200_000, 200_001, 5_000_000, 10_000_000]) {
      const range = fromPounds(pounds)
      const step = pageSweepStep(range)
      expect(Math.floor(Number(range) / Number(step)) + 1, String(pounds)).toBeLessThanOrEqual(PAGE_SWEEP_POINTS)
      // The smallest such multiple: one multiple less would not fit.
      const less = Number(step) - Number(small)
      if (less > 0) expect(Math.floor(Number(range) / less) + 1, String(pounds)).toBeGreaterThan(PAGE_SWEEP_POINTS)
    }
  })
})

describe('pageSweepStep by month (1b-ii-b)', () => {
  it('in the month view is a whole multiple of the round monthly step, for the year, within the same budget', () => {
    const monthly = Number(DEFAULT_MONTHLY_SWEEP_STEP) * MONTHS_PER_YEAR
    expect(pageSweepStep(ZERO, 'month')).toBe(fromPence(monthly))
    for (const pounds of [0, 150_000, 300_000, 5_000_000]) {
      const range = fromPounds(pounds)
      const step = pageSweepStep(range, 'month')
      expect(Number(step) % monthly, String(pounds)).toBe(0)
      expect(Math.floor(Number(range) / Number(step)) + 1, String(pounds)).toBeLessThanOrEqual(PAGE_SWEEP_POINTS)
    }
    expect(pageSweepStep(fromPounds(150_000), 'year')).toBe(pageSweepStep(fromPounds(150_000)))
  })

  it('calculateOptimise sweeps at the month step in the month view', () => {
    const inputs = { ...defaults, salary: fromPounds(120_000) }
    const result = calculateOptimise(inputs, taxYear, 'month')
    if (!result.ok || 'problem' in result) throw new Error('no result')
    expect(result.step).toBe(pageSweepStep(inputs.salary, 'month'))
  })
})

describe('carryForwardYears', () => {
  it('is the verified look-back from the config, or null when it is not verified', () => {
    const granted = requireVerified(taxYear, ['pension.carryForward.yearsBack'])
    if (!granted.ok) throw new Error('not verified')
    expect(carryForwardYears(taxYear)).toBe(granted.values['pension.carryForward.yearsBack'])
    expect(carryForwardYears(FAKE_TODO_YEAR)).toBeNull()
  })
})
