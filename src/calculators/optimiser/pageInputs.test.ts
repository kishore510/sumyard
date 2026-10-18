import { describe, expect, it } from 'vitest'
import { MAX_INPUT_AMOUNT, MAX_LIST_ITEMS } from '@/lib/inputLimits'
import { fromPence, fromPounds, type Money, mulRound, ratio, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import {
  annualAmount,
  annualBenefit,
  type BenefitItem,
  type ContributionEntry,
  isAboveAllOfPay,
  type ListItem,
  listTotal,
  type PensionablePayEntry,
  pensionablePay,
  resolveContribution,
} from './pageInputs'

/*
 * Part 1b-i.1: how the page's inputs resolve to the engine's annual figures
 * (decisions B6 to B8). No tax figure: percentages and amounts here are
 * arbitrary inputs, and the months divisor comes from src/lib/periods.ts.
 */

const salary = fromPounds(48_000)
const bonus = fromPounds(6_000)
const pay = (patch: Partial<PensionablePayEntry> = {}): PensionablePayEntry => ({ own: false, amount: ZERO, includeBonus: false, ...patch })
const byPercent = (percentOfPay: string): ContributionEntry => ({ mode: 'percentOfPay', amount: fromPounds(999), percentOfPay })
const item = (amount: Money, period: ListItem['period'] = 'year', name = 'Item'): ListItem => ({ name, amount, period })

describe('pensionable pay (B6)', () => {
  it('is the salary by default, without the bonus', () => {
    expect(pensionablePay(salary, bonus, pay())).toBe(salary)
  })

  it('adds the bonus only when the switch is on', () => {
    expect(pensionablePay(salary, bonus, pay({ includeBonus: true }))).toBe(fromPounds(54_000))
  })

  it('uses the person’s own figure when set, with the bonus only if included', () => {
    const own = fromPounds(40_000)
    expect(pensionablePay(salary, bonus, pay({ own: true, amount: own }))).toBe(own)
    expect(pensionablePay(salary, bonus, pay({ own: true, amount: own, includeBonus: true }))).toBe(fromPounds(46_000))
  })

  it('keeps the own figure stored but unused when the switch is off', () => {
    expect(pensionablePay(salary, bonus, pay({ own: false, amount: fromPounds(1) }))).toBe(salary)
  })
})

describe('contributions as an amount or a percentage (B6)', () => {
  it('amount mode gives the amount, whatever the percentage says', () => {
    const entry: ContributionEntry = { mode: 'amount', amount: fromPounds(2_500), percentOfPay: '50' }
    expect(resolveContribution(entry, salary)).toBe(fromPounds(2_500))
  })

  it('percentage mode gives that share of pensionable pay, exactly when it divides', () => {
    expect(resolveContribution(byPercent('5'), salary)).toBe(fromPounds(2_400))
    expect(resolveContribution(byPercent('7.5'), salary)).toBe(fromPounds(3_600))
  })

  it('rounds to the nearest penny, where nearest and rounding down differ', () => {
    // 1,010 pence at a twentieth is 50.5 pence: nearest gives 51, down would give 50.
    const pensionable = fromPence(1_010)
    expect(mulRound(pensionable, percentRatio('5'), 'down')).toBe(fromPence(50))
    expect(resolveContribution(byPercent('5'), pensionable)).toBe(fromPence(51))
    // Just under a half rounds down: 1,009 pence gives 50.45.
    expect(resolveContribution(byPercent('5'), fromPence(1_009))).toBe(fromPence(50))
  })

  it('zero gives nothing and all of it gives all of pensionable pay', () => {
    expect(resolveContribution(byPercent('0'), salary)).toBe(ZERO)
    expect(resolveContribution(byPercent('100'), salary)).toBe(salary)
    expect(resolveContribution(byPercent('100'), ZERO)).toBe(ZERO)
  })

  it('works on the bonus-inclusive base when the switch is on', () => {
    const base = pensionablePay(salary, bonus, pay({ includeBonus: true }))
    expect(resolveContribution(byPercent('10'), base)).toBe(fromPounds(5_400))
  })

  it('flags a percentage above all of pensionable pay, but not all of it or an amount', () => {
    expect(isAboveAllOfPay(byPercent('100'))).toBe(false)
    expect(isAboveAllOfPay(byPercent('100.01'))).toBe(true)
    expect(isAboveAllOfPay({ mode: 'amount', amount: ZERO, percentOfPay: '150' })).toBe(false)
  })
})

describe('itemised lists, per month or per year (B7, B8)', () => {
  it('a monthly amount is the months in a year times it, the same as entering the annual amount', () => {
    const monthly = fromPence(12_345)
    const annual = mulRound(monthly, ratio(MONTHS_PER_YEAR, 1), 'nearest')
    expect(annualAmount(item(monthly, 'month'))).toBe(annual)
    expect(annualAmount(item(annual, 'year'))).toBe(annual)
    expect(listTotal([item(monthly, 'month')])).toBe(listTotal([item(annual, 'year')]))
  })

  it('a yearly amount is taken as it is', () => {
    expect(annualAmount(item(fromPence(1)))).toBe(fromPence(1))
  })

  it('a list totals every item for the year; an empty list is nothing', () => {
    expect(listTotal([])).toBe(ZERO)
    const items = [item(fromPounds(100), 'month'), item(fromPounds(250)), item(ZERO, 'month')]
    expect(listTotal(items)).toBe(fromPounds(100 * MONTHS_PER_YEAR + 250))
  })

  it('removing an item takes exactly its annual amount off the total', () => {
    const items = [item(fromPounds(30), 'month'), item(fromPounds(500)), item(fromPounds(7), 'month')]
    const [first, ...rest] = items
    expect((listTotal(items) as number) - (listTotal(rest) as number)).toBe(annualAmount(first!))
  })

  it('the largest list stays a safe whole number of pence', () => {
    const big = Array.from({ length: MAX_LIST_ITEMS }, () => item(MAX_INPUT_AMOUNT, 'month'))
    expect(Number.isSafeInteger(listTotal(big))).toBe(true)
  })
})

describe('benefit items for the engine (B8, B10)', () => {
  const item = (period: 'month' | 'year', payment: 'beforeTax' | 'afterTax'): BenefitItem => ({
    name: 'Medical',
    period,
    value: fromPence(4_567),
    taken: fromPence(1_234),
    payment,
  })

  it('a yearly item goes as it is; the name and period stay on the page', () => {
    expect(annualBenefit(item('year', 'afterTax'))).toEqual({ value: fromPence(4_567), taken: fromPence(1_234), payment: 'afterTax' })
  })

  it('a monthly item has both amounts times the months in a year, exactly', () => {
    expect(annualBenefit(item('month', 'beforeTax'))).toEqual({
      value: fromPence(4_567 * MONTHS_PER_YEAR),
      taken: fromPence(1_234 * MONTHS_PER_YEAR),
      payment: 'beforeTax',
    })
  })
})
