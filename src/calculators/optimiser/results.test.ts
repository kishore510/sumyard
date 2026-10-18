import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { add, fromPounds, type Money, subtract, ZERO } from '@/lib/money'
import { breakdown } from './breakdown'
import { takeHome } from './calc'
import { payeEstimate } from './paye'
import { payslipNet, SPLIT_SEGMENTS, splitSegments } from './results'
import { DEFAULT_POLICY, type PensionMethod, type TakeHomeResult, type TaxInputs } from './types'

/*
 * 0.12.0: the split bar's parts and the estimated payslip net pay, both sums
 * of existing engine outputs. Expected values come from the engine; no
 * figure is written here except made-up inputs.
 */

/** A small deterministic generator, so a failure always reproduces. */
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648
    return s / 2_147_483_648
  }
}

const METHODS: PensionMethod[] = ['salarySacrifice', 'netPay', 'reliefAtSource']

function randomInputs(next: () => number): TaxInputs {
  const pounds = (max: number) => fromPounds(Math.floor(next() * max))
  const gross = pounds(200_000)
  return {
    grossPay: gross,
    region: next() < 0.5 ? 'rUK' : 'scotland',
    studentLoans: next() < 0.3 ? ['plan2'] : [],
    ...(next() < 0.6
      ? { pension: { method: METHODS[Math.floor(next() * METHODS.length)]!, contribution: pounds(Number(gross) / 400) } }
      : {}),
    ...(next() < 0.3 ? { childBenefit: { children: 1 + Math.floor(next() * 3), payments: 'claimed' as const } } : {}),
    benefits: next() < 0.5 ? [{ value: pounds(3_000), taken: pounds(2_000), payment: next() < 0.5 ? 'beforeTax' : 'afterTax' }] : [],
    postTaxDeductions: next() < 0.4 ? pounds(1_000) : ZERO,
  }
}

const result = (inputs: TaxInputs): TakeHomeResult => {
  const r = takeHome(inputs, taxYear, DEFAULT_POLICY)
  if (!r.ok) throw new Error('refused')
  return r
}

describe('splitSegments', () => {
  it('lists every part in the bar’s order, take-home last', () => {
    const r = result({ grossPay: fromPounds(40_000), region: 'rUK', studentLoans: [] })
    expect(splitSegments(breakdown(r.annual, 'year')).map((s) => s.id)).toEqual([...SPLIT_SEGMENTS])
  })

  it('adds up to gross pay, for the year and for a month, on 300 random cases', () => {
    const next = random(12)
    for (let i = 0; i < 300; i++) {
      const inputs = randomInputs(next)
      let r: TakeHomeResult
      try {
        r = result(inputs)
      } catch {
        continue // a contribution above pay is refused by the engine
      }
      for (const period of ['year', 'month'] as const) {
        const shown = breakdown(r.annual, period)
        const total = splitSegments(shown).reduce((sum, s) => add(sum, s.amount), ZERO)
        expect(total, `${i} ${period}`).toBe(shown.gross)
      }
    }
  })

  it('benefits given up are the salary given up plus the payments after tax; take-home is the breakdown’s', () => {
    const r = result({
      grossPay: fromPounds(60_000),
      region: 'rUK',
      studentLoans: [],
      benefits: [
        { value: fromPounds(500), taken: fromPounds(600), payment: 'beforeTax' },
        { value: fromPounds(400), taken: fromPounds(100), payment: 'afterTax' },
      ],
    })
    const shown = breakdown(r.annual, 'year')
    const parts = Object.fromEntries(splitSegments(shown).map((s) => [s.id, s.amount]))
    expect(parts.benefits).toBe(add(shown.rows.benefitSacrifice, shown.rows.benefitPayments))
    expect(parts.takeHome).toBe(shown.takeHome)
    expect(parts.incomeTax).toBe(shown.rows.incomeTax)
    expect(parts.hicbc).toBe(shown.rows.hicbc)
  })
})

describe('payslipNet', () => {
  const r = result({
    grossPay: fromPounds(70_000),
    region: 'rUK',
    studentLoans: ['plan1'],
    benefits: [{ value: fromPounds(1_400), taken: ZERO, payment: 'beforeTax' }],
  })
  const estimate = (code: string) => {
    const e = payeEstimate(code, r, taxYear)
    if (!e.ok) throw new Error('no estimate')
    return e
  }

  it('for the year: take-home with the PAYE estimate in place of the year’s income tax', () => {
    for (const code of ['900L', '1100L', '500T']) {
      const e = estimate(code)
      const shown = breakdown(r.annual, 'year')
      expect(payslipNet(shown, e), code).toBe(subtract(add(shown.takeHome, shown.rows.incomeTax), e.paye.total))
      expect(payslipNet(shown, e), code).toBe(subtract(r.annual.net, e.difference) as Money)
    }
  })

  it('for a month: the month’s take-home with the first month’s PAYE in place of the month’s income tax', () => {
    const e = estimate('900L')
    const shown = breakdown(r.annual, 'month')
    expect(payslipNet(shown, e)).toBe(subtract(add(shown.takeHome, shown.rows.incomeTax), e.paye.months[0]!.tax))
  })
})
