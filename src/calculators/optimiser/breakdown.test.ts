import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { fromPence, fromPounds, type Money, mulRound, ratio, subtract } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { breakdown, DEDUCTION_ROWS } from './breakdown'
import { takeHome } from './calc'
import { configValues } from './fixtures/reference'
import { DEFAULT_POLICY, PENSION_METHODS, type TakeHomeResult, type TaxInputs } from './types'

/*
 * 0.11.0: the breakdown for a year or a month (decision B14). Each yearly row
 * divided by MONTHS_PER_YEAR to the nearest penny; take-home per month is
 * gross less the rounded rows, so the month adds up; the difference from the
 * year's take-home divided evenly is stated. Expected values are worked out
 * here from the engine's annual figures, not from a figure written down.
 */

const v = configValues(taxYear)

const home = (inputs: TaxInputs): TakeHomeResult => {
  const r = takeHome(inputs, taxYear, DEFAULT_POLICY)
  if (!r.ok) throw new Error('refused')
  return r
}

const share = (amount: Money) => mulRound(amount, ratio(1, MONTHS_PER_YEAR), 'nearest')

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

const random = generator(14)
const pence = (max: number) => fromPence(Math.floor(random() * max))

const CASES: TaxInputs[] = Array.from({ length: 200 }, () => {
  const grossPay = pence(v.taperStart * 2)
  return {
    grossPay,
    region: random() < 0.5 ? 'rUK' : 'scotland',
    studentLoans: random() < 0.5 ? ['plan2'] : [],
    ...(random() < 0.6 ? { pension: { method: PENSION_METHODS[Math.floor(random() * 3)]!, contribution: pence(grossPay / 5) } } : {}),
    ...(random() < 0.4 ? { childBenefit: { children: 2, payments: 'claimed' as const } } : {}),
    benefits: [
      { value: pence(v.personalAllowance / 4), taken: pence(grossPay / 10), payment: 'beforeTax' as const },
      { value: pence(v.personalAllowance / 4), taken: pence(v.personalAllowance / 8), payment: 'afterTax' as const },
    ],
    postTaxDeductions: pence(v.personalAllowance / 4),
  }
})

describe('breakdown (B14)', () => {
  it('the year is the engine’s annual view, with no difference', () => {
    for (const inputs of CASES.slice(0, 20)) {
      const { annual } = home(inputs)
      const year = breakdown(annual, 'year')
      expect(year.gross).toBe(annual.gross)
      for (const row of DEDUCTION_ROWS) expect(year.rows[row], row).toBe(annual[row])
      expect(year.takeHome).toBe(annual.net)
      expect(year.evenShare).toBe(annual.net)
      expect(year.difference).toBe(0)
    }
  })

  it('a month: each row the yearly one over the months, to the nearest penny', () => {
    for (const inputs of CASES) {
      const { annual } = home(inputs)
      const month = breakdown(annual, 'month')
      expect(month.gross).toBe(share(annual.gross))
      for (const row of DEDUCTION_ROWS) expect(month.rows[row], row).toBe(share(annual[row]))
    }
  })

  it('rows add up to take-home in both views (property)', () => {
    for (const inputs of CASES) {
      const { annual } = home(inputs)
      for (const period of ['year', 'month'] as const) {
        const b = breakdown(annual, period)
        const sum = DEDUCTION_ROWS.reduce((left, row) => left - b.rows[row], b.gross as number)
        expect(b.takeHome, period).toBe(sum)
      }
    }
  })

  it('states the difference from the year’s take-home divided evenly; it is a few pennies at most', () => {
    let seen = 0
    for (const inputs of CASES) {
      const { annual } = home(inputs)
      const month = breakdown(annual, 'month')
      expect(month.evenShare).toBe(share(annual.net))
      expect(month.difference).toBe(subtract(month.takeHome, month.evenShare))
      // Each of the rows and gross is off by at most half a penny, and the even share by half a penny too.
      expect(Math.abs(month.difference)).toBeLessThanOrEqual(Math.ceil((DEDUCTION_ROWS.length + 2) / 2))
      if (month.difference !== 0) seen++
    }
    // The case the owner asked to state does happen.
    expect(seen).toBeGreaterThan(0)
  })

  it('a year below nothing still adds up by month', () => {
    const { annual } = home({ grossPay: fromPounds(10_000), region: 'rUK', studentLoans: [], postTaxDeductions: fromPounds(30_000) })
    const month = breakdown(annual, 'month')
    expect(month.takeHome).toBeLessThan(0)
    expect(DEDUCTION_ROWS.reduce((left, row) => left - month.rows[row], month.gross as number)).toBe(month.takeHome)
  })
})
