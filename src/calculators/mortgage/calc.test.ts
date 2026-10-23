import { describe, expect, it } from 'vitest'
import { annualRate, monthlyFactor, regularPayment } from '@/lib/amortising'
import { addMonths } from '@/lib/calendar'
import { MAX_FINANCE_RATE, MAX_INPUT_AMOUNT, MAX_LIST_ITEMS, MAX_MORTGAGE_TERM_MONTHS } from '@/lib/inputLimits'
import { compareRatio, factorToRatio, fromPence, fromPounds, type Money, percent, ratio, toPence } from '@/lib/money'
import { DEFAULT_MORTGAGE_POLICY, overpay } from './calc'
import { inputs } from './fixtures/inputs'
import type { MortgageInputs, MortgageOutcome, MortgageResult } from './types'

/*
 * The mortgage overpayment engine (M1) on hand-worked cases. Expected figures
 * were worked in exact fractions outside the engine (each case says how);
 * the general cases are in reference.test.ts and properties.test.ts.
 */

const p = (amount: Money) => toPence(amount)

function ok(outcome: MortgageOutcome): MortgageResult {
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const run = (overrides: Partial<MortgageInputs> = {}) => ok(overpay(inputs(overrides)))

const refusal = (overrides: Partial<MortgageInputs>) => {
  const outcome = overpay(inputs(overrides))
  if (outcome.ok) throw new Error('expected a refusal')
  return outcome.problems
}

describe('the default policy', () => {
  it('is monthly interest, and a common year for daily interest (MO3, MR-10)', () => {
    expect(DEFAULT_MORTGAGE_POLICY).toEqual({ interestMethod: 'monthly', dayCount: 'actual/365' })
  })
})

describe('a repayment schedule without overpayments', () => {
  // £1,000 at 12% (1% a month) over two months: P = 100000 × 0.01 / (1 − 1.01^−2) = 50750.24…, so 50751p;
  // month one: interest 1000p, closing 50249p; month two: interest 502.49 → 502p, payment 50751p.
  const r = run({ balance: fromPounds(1_000), termMonths: 2, fixedRate: percent('12'), fixedEndMonth: 2 })

  it('pays the closed-form payment and clears the balance exactly', () => {
    const [one, two] = r.baseline.rows
    expect([p(one!.interest), p(one!.payment), p(one!.closing)]).toEqual([1_000, 50_751, 50_249])
    expect([p(two!.interest), p(two!.payment), p(two!.closing)]).toEqual([502, 50_751, 0])
    expect(p(r.baseline.paymentNow)).toBe(50_751)
    expect(p(r.baseline.totalInterest)).toBe(1_502)
    expect(r.baseline.payoffMonth).toBe(2)
    expect(r.baseline.payoffDate).toBe('2026-03-15')
    expect(p(r.baseline.owedAtEnd)).toBe(0)
  })

  it('with nothing overpaid, the overpaying schedule is the baseline', () => {
    expect(r.overpaying).toEqual(r.baseline)
    expect(p(r.interestSaved)).toBe(0)
    expect(r.monthsSaved).toBe(0)
    expect(r.charge).toBeNull()
  })

  it('dates each payment on the start day, or a shorter month’s last day', () => {
    const short = run({ startDate: '2027-01-31', termMonths: 3 })
    expect(short.baseline.rows.map((row) => row.date)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30'])
  })
})

describe('the fixed-rate end (MO4)', () => {
  const r = run()

  it('charges the fixed rate to its end and the reversion rate after', () => {
    expect(r.baseline.rows.slice(0, 24).every((row) => row.period === 'fixed')).toBe(true)
    expect(r.baseline.rows.slice(24).every((row) => row.period === 'reversion')).toBe(true)
  })

  it('recalculates the payment on the balance then, over the months left, at the reversion rate', () => {
    const atEnd = r.baseline.rows[23]!.closing
    expect(r.baseline.balanceAtFixedEnd).toBe(atEnd)
    const expected = regularPayment(atEnd, monthlyFactor(percent('7'), 'monthly'), 300 - 24, fromPence(0))
    expect(r.baseline.paymentAfterFixedEnd).toBe(expected)
    expect(r.baseline.rows[24]!.payment).toBe(expected)
    expect(r.baseline.rows[23]!.payment).toBe(r.baseline.paymentNow)
  })

  it('with no fixed period, the reversion rate applies from the start', () => {
    const none = run({ fixedEndMonth: 0 })
    expect(none.baseline.rows.every((row) => row.period === 'reversion')).toBe(true)
    expect(none.baseline.balanceAtFixedEnd).toBeNull()
    expect(none.baseline.paymentAfterFixedEnd).toBeNull()
    expect(none.interestSavedToFixedEnd).toBeNull()
    expect(none.baseline.paymentNow).toBe(regularPayment(fromPounds(200_000), monthlyFactor(percent('7'), 'monthly'), 300, fromPence(0)))
  })

  it('with the fixed rate to the end of the term, nothing reverts', () => {
    const all = run({ fixedEndMonth: 300 })
    expect(all.baseline.rows.every((row) => row.period === 'fixed')).toBe(true)
    expect(all.baseline.paymentAfterFixedEnd).toBeNull()
    expect(p(all.baseline.balanceAtFixedEnd!)).toBe(0)
    expect(all.returns.map((x) => x.period)).toEqual(['fixed'])
  })
})

describe('overpayments (MO5, MO6, MO8)', () => {
  const lump = [{ month: 6, amount: fromPounds(20_000) }]

  it('reduce-term keeps the payment and clears the balance sooner', () => {
    const r = run({ lumpSums: lump, fixedEndMonth: 300 })
    expect(r.overpaying.rows.slice(0, -1).every((row) => row.payment === r.baseline.paymentNow)).toBe(true)
    expect(r.overpaying.payoffMonth).toBeLessThan(300)
    expect(r.monthsSaved).toBe(300 - r.overpaying.payoffMonth!)
    expect(p(r.overpaying.rows[5]!.overpayment)).toBe(2_000_000)
    expect(p(r.interestSaved)).toBeGreaterThan(0)
  })

  it('reduce-payment lowers the payment from the next payment date over the contract’s months left', () => {
    const r = run({ lumpSums: lump, effect: 'reduce-payment', fixedEndMonth: 300 })
    const after = r.overpaying.rows[5]!.closing
    expect(r.overpaying.rows[5]!.payment).toBe(r.baseline.paymentNow)
    expect(r.overpaying.rows[6]!.payment).toBe(regularPayment(after, monthlyFactor(percent('4.5'), 'monthly'), 300 - 6, fromPence(0)))
    expect(r.overpaying.payoffMonth).toBe(300)
    expect(r.monthsSaved).toBe(0)
  })

  it('reduce-term keeps the time saved at the fixed-rate end: the new payment is over the shortened months', () => {
    const term = run({ lumpSums: lump })
    const payment = run({ lumpSums: lump, effect: 'reduce-payment' })
    expect(term.overpaying.payoffMonth).toBeLessThan(300)
    expect(p(term.overpaying.paymentAfterFixedEnd!)).toBeGreaterThan(p(payment.overpaying.paymentAfterFixedEnd!))
    expect(payment.overpaying.payoffMonth).toBe(300)
  })

  it('a regular overpayment is paid with each payment from and to its months', () => {
    const r = run({ regular: { amount: fromPounds(100), fromMonth: 3, toMonth: 5 } })
    expect(r.overpaying.rows.slice(0, 7).map((row) => p(row.overpayment))).toEqual([0, 0, 10_000, 10_000, 10_000, 0, 0])
    expect(p(r.overpaying.totalOverpaid)).toBe(30_000)
  })

  it('an overpayment above the balance uses only what clears it, and says what was not used', () => {
    const r = run({ lumpSums: [{ month: 2, amount: fromPounds(500_000) }] })
    const row = r.overpaying.rows[1]!
    const owed = p(row.opening) + p(row.interest) - p(row.payment)
    expect(p(row.overpayment)).toBe(owed)
    expect(p(row.unused)).toBe(50_000_000 - owed)
    expect(p(row.closing)).toBe(0)
    expect(r.overpaying.payoffMonth).toBe(2)
    expect(r.overpaying.rows.slice(2).every((x) => p(x.payment) === 0 && p(x.interest) === 0 && p(x.overpayment) === 0)).toBe(true)
    expect(r.warnings).toContainEqual({ kind: 'unused-overpayment', month: 2, amount: fromPence(50_000_000 - owed) })
  })

  it('later overpayments after the payoff are not used, and are reported', () => {
    const r = run({ lumpSums: [{ month: 2, amount: fromPounds(500_000) }], regular: { amount: fromPounds(10), fromMonth: 3, toMonth: 4 } })
    expect(r.warnings.filter((w) => w.kind === 'unused-overpayment').map((w) => w.kind === 'unused-overpayment' && w.month)).toEqual([
      2, 3, 4,
    ])
  })

  it('a lump sum in the final month clears what is left and the payment shrinks to the remainder', () => {
    const base = run({ termMonths: 12 })
    const last = base.baseline.rows[11]!
    const owed = p(last.opening) + p(last.interest)
    const partial = run({ termMonths: 12, lumpSums: [{ month: 12, amount: fromPence(1_000) }] })
    expect(p(partial.overpaying.rows[11]!.overpayment)).toBe(1_000)
    expect(p(partial.overpaying.rows[11]!.payment)).toBe(owed - 1_000)
    const whole = run({ termMonths: 12, lumpSums: [{ month: 12, amount: fromPence(owed + 5) }] })
    expect(p(whole.overpaying.rows[11]!.overpayment)).toBe(owed)
    expect(p(whole.overpaying.rows[11]!.payment)).toBe(0)
    expect(p(whole.overpaying.rows[11]!.unused)).toBe(5)
    expect(p(whole.overpaying.rows[11]!.closing)).toBe(0)
  })

  it('more than one lump sum in a month add up', () => {
    const r = run({
      lumpSums: [
        { month: 4, amount: fromPounds(100) },
        { month: 4, amount: fromPounds(50) },
      ],
    })
    expect(p(r.overpaying.rows[3]!.overpayment)).toBe(15_000)
  })
})

describe('early repayment charge and allowance (MO7, MO10)', () => {
  // Balance 12345678p, allowance 10%: 1234567.8 → 1234567p (down). A £20,000 lump in month three:
  // 2000000 − 1234567 = 765433p over, × 3% = 22962.99 → 22963p (nearest).
  const erc = { rate: percent('3'), endMonth: 24, allowance: { kind: 'rate', rate: percent('10') } } as const
  const base = { balance: fromPence(12_345_678), erc }

  it('charges the excess over the allowance, the allowance rounded down and the charge to the nearest penny', () => {
    const r = run({ ...base, lumpSums: [{ month: 3, amount: fromPounds(20_000) }] })
    expect(p(r.allowances[0]!.allowance)).toBe(1_234_567)
    expect(p(r.overpaying.rows[2]!.erc)).toBe(22_963)
    expect(p(r.overpaying.totalErc)).toBe(22_963)
    expect(r.warnings).toContainEqual({ kind: 'over-allowance', year: 1, charge: fromPence(22_963) })
  })

  it('pays the charge in cash: it is not added to the balance', () => {
    const r = run({ ...base, lumpSums: [{ month: 3, amount: fromPounds(20_000) }] })
    const row = r.overpaying.rows[2]!
    expect(p(row.closing)).toBe(p(row.opening) + p(row.interest) - p(row.payment) - p(row.overpayment))
  })

  it('charges nothing within the allowance', () => {
    const r = run({ ...base, lumpSums: [{ month: 3, amount: fromPence(1_234_567) }] })
    expect(p(r.overpaying.totalErc)).toBe(0)
    expect(r.charge).toBeNull()
  })

  it('once the year’s allowance is used, the whole of a later overpayment that year is charged', () => {
    const r = run({
      ...base,
      lumpSums: [
        { month: 3, amount: fromPounds(20_000) },
        { month: 6, amount: fromPounds(1_000) },
      ],
    })
    expect(p(r.overpaying.rows[5]!.erc)).toBe(3_000)
  })

  it('the allowance resets each year on the balance at that year’s start, and unused allowance is lost', () => {
    const r = run({
      ...base,
      lumpSums: [
        { month: 3, amount: fromPounds(20_000) },
        { month: 14, amount: fromPounds(5_000) },
      ],
    })
    const yearTwoStart = BigInt(p(r.overpaying.rows[12]!.opening))
    expect(BigInt(p(r.allowances[1]!.allowance))).toBe(yearTwoStart / 10n)
    expect(p(r.overpaying.rows[13]!.erc)).toBe(0)

    const quiet = run({ ...base })
    const allowanceTwo = BigInt(p(quiet.baseline.rows[12]!.opening)) / 10n
    const over = run({ ...base, lumpSums: [{ month: 14, amount: fromPence(Number(allowanceTwo) + 10_000) }] })
    expect(p(over.overpaying.rows[13]!.erc)).toBe(300)
  })

  it('an allowance as an amount', () => {
    const r = run({
      ...base,
      erc: { ...erc, allowance: { kind: 'amount', amount: fromPounds(5_000) } },
      lumpSums: [{ month: 3, amount: fromPounds(6_000) }],
    })
    expect(p(r.overpaying.rows[2]!.erc)).toBe(3_000)
  })

  it('charges nothing after the charge’s end month', () => {
    const r = run({ ...base, lumpSums: [{ month: 25, amount: fromPounds(50_000) }] })
    expect(p(r.overpaying.totalErc)).toBe(0)
  })

  it('charges only the part of an overpayment that was used (MO8)', () => {
    const r = run({
      ...base,
      termMonths: 12,
      fixedEndMonth: 12,
      erc: { ...erc, endMonth: 12 },
      lumpSums: [{ month: 2, amount: fromPounds(1_000_000) }],
    })
    const row = r.overpaying.rows[1]!
    const charged = BigInt(p(row.overpayment)) - 1_234_567n
    expect(BigInt(p(row.erc))).toBe((charged * 3n + 50n) / 100n)
  })

  it('reports the net saving and the break-even month', () => {
    const r = run({ ...base, lumpSums: [{ month: 3, amount: fromPounds(20_000) }] })
    const charge = r.charge!
    expect(p(charge.paid)).toBe(22_963)
    expect(p(charge.netSaving)).toBe(p(r.interestSaved) - 22_963)
    // Recount: the first month from which cumulative interest saved stays at least the charge paid so far.
    let savedSoFar = 0
    let chargedSoFar = 0
    const holds: boolean[] = []
    for (let m = 0; m < 300; m++) {
      savedSoFar += p(r.baseline.rows[m]!.interest) - p(r.overpaying.rows[m]!.interest)
      chargedSoFar += p(r.overpaying.rows[m]!.erc)
      holds.push(savedSoFar >= chargedSoFar)
    }
    let from = 300
    while (from > 0 && holds[from - 1]) from--
    expect(charge.breakEvenMonth).toBe(from + 1)
    expect(charge.breakEvenMonth).toBeGreaterThan(3)
  })

  it('says when the charge is never earned back within the term', () => {
    const r = run({
      balance: fromPounds(10_000),
      termMonths: 3,
      fixedEndMonth: 3,
      fixedRate: percent('1'),
      erc: { rate: percent('5'), endMonth: 3, allowance: { kind: 'amount', amount: fromPence(0) } },
      lumpSums: [{ month: 1, amount: fromPounds(1_000) }],
    })
    expect(r.charge!.breakEvenMonth).toBeNull()
    expect(p(r.charge!.netSaving)).toBeLessThan(0)
  })
})

describe('interest methods (MO3)', () => {
  // £100,000 at 5% from 15 January: 31 days. Daily, a common year: 10000000 × 0.05 × 31/365 = 42465.75… → 42466p.
  // Monthly: 10000000 × 0.05 / 12 = 41666.67 → 41667p.
  const common = { balance: fromPounds(100_000), fixedRate: percent('5'), fixedEndMonth: 12, termMonths: 12 }

  it('monthly interest is a twelfth of the rate, to the nearest penny', () => {
    expect(p(run(common).baseline.rows[0]!.interest)).toBe(41_667)
  })

  it('daily interest counts the days to the payment date, rounded once when charged', () => {
    const r = run({ ...common, policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    expect(p(r.baseline.rows[0]!.interest)).toBe(42_466)
  })

  it('29 February accrues a day; a leap year’s days are a 366th with actual/actual', () => {
    // 1 to 29 February 2028 and on to 1 March: 29 days. 10000000 × 0.05 × 29/365 = 39726.0… → 39726p; /366 → 39617p.
    const leap = { ...common, startDate: '2028-02-01' as const }
    const a365 = run({ ...leap, policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    const aact = run({ ...leap, policy: { interestMethod: 'daily', dayCount: 'actual/actual' } })
    expect(p(a365.baseline.rows[0]!.interest)).toBe(39_726)
    expect(p(aact.baseline.rows[0]!.interest)).toBe(39_617)
  })

  it('actual/actual splits a month across the year end by each year’s length', () => {
    // 15 December 2027 to 15 January 2028: 17 days of 2027, 14 of 2028. 10000000 × 0.05 × (17/365 + 14/366) → 42413p.
    const span = { ...common, startDate: '2027-12-15' as const }
    expect(p(run({ ...span, policy: { interestMethod: 'daily', dayCount: 'actual/actual' } }).baseline.rows[0]!.interest)).toBe(42_413)
    expect(p(run({ ...span, policy: { interestMethod: 'daily', dayCount: 'actual/365' } }).baseline.rows[0]!.interest)).toBe(42_466)
  })

  it('outside a leap year the two day counts agree', () => {
    const a = run({ ...common, startDate: '2026-03-10', policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    const b = run({ ...common, startDate: '2026-03-10', policy: { interestMethod: 'daily', dayCount: 'actual/actual' } })
    expect(a.baseline.rows.slice(0, 9)).toEqual(b.baseline.rows.slice(0, 9))
  })

  it('daily and monthly differ only slightly over a year', () => {
    const daily = run({ ...common, startDate: '2026-03-10', policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    const monthly = run({ ...common, startDate: '2026-03-10' })
    expect(Math.abs(p(daily.baseline.totalInterest) - p(monthly.baseline.totalInterest))).toBeLessThan(1_000)
  })
})

describe('interest-only (MO2)', () => {
  const io = { repaymentType: 'interest-only', fixedEndMonth: 300 } as const

  it('pays the month’s interest and owes the capital at the end', () => {
    const r = run(io)
    expect(r.baseline.rows.every((row) => row.payment === row.interest && row.closing === fromPounds(200_000))).toBe(true)
    expect(p(r.baseline.owedAtEnd)).toBe(20_000_000)
    expect(r.baseline.payoffMonth).toBeNull()
    expect(p(r.baseline.rows[0]!.interest)).toBe(75_000)
  })

  it('an overpayment lowers the capital, the interest and the amount owed at the end; the effect does not apply', () => {
    const r = run({ ...io, lumpSums: [{ month: 1, amount: fromPounds(20_000) }] })
    expect(p(r.overpaying.owedAtEnd)).toBe(18_000_000)
    expect(p(r.overpaying.rows[1]!.interest)).toBe(67_500)
    expect(p(r.interestSaved)).toBeGreaterThan(0)
    expect(r.warnings).toContainEqual({ kind: 'effect-not-applicable' })
    const other = run({ ...io, effect: 'reduce-payment', lumpSums: [{ month: 1, amount: fromPounds(20_000) }] })
    expect(other.overpaying.rows).toEqual(r.overpaying.rows)
  })

  it('the payment becomes the interest at the reversion rate after the fixed end', () => {
    const r = run({ repaymentType: 'interest-only', fixedEndMonth: 24 })
    expect(p(r.baseline.rows[24]!.payment)).toBe(116_667)
    expect(p(r.baseline.paymentAfterFixedEnd!)).toBe(116_667)
  })
})

describe('no interest (zero rates)', () => {
  it('pays the balance over the months, the last payment taking the rounding', () => {
    // 100000p / 7 = 14285.7… → 14286p; the last: 100000 − 6 × 14286 = 14284p.
    const r = run({ balance: fromPounds(1_000), termMonths: 7, fixedRate: percent('0'), reversionRate: percent('0'), fixedEndMonth: 3 })
    expect(r.baseline.rows.map((row) => p(row.payment))).toEqual([14_286, 14_286, 14_286, 14_286, 14_286, 14_286, 14_284])
    expect(p(r.baseline.totalInterest)).toBe(0)
    expect(r.returns.every((x) => compareRatio(x.effective, ratio(0, 1)) === 0)).toBe(true)
  })

  it('saves nothing by overpaying', () => {
    const r = run({ fixedRate: percent('0'), reversionRate: percent('0'), lumpSums: [{ month: 2, amount: fromPounds(1_000) }] })
    expect(p(r.interestSaved)).toBe(0)
    expect(r.monthsSaved).toBeGreaterThan(0)
  })

  it('zero fixed rate then a reversion rate', () => {
    const r = run({ fixedRate: percent('0') })
    expect(r.baseline.rows.slice(0, 24).every((row) => p(row.interest) === 0)).toBe(true)
    expect(p(r.baseline.rows[24]!.interest)).toBeGreaterThan(0)
  })
})

describe('the effective guaranteed return per rate period (MO9)', () => {
  it('monthly interest: the shared annual rate of a twelfth', () => {
    const r = run()
    expect(r.returns).toHaveLength(2)
    expect(r.returns[0]).toEqual({ period: 'fixed', rate: percent('4.5'), effective: annualRate(monthlyFactor(percent('4.5'), 'monthly')) })
    expect(r.returns[1]).toEqual({ period: 'reversion', rate: percent('7'), effective: annualRate(monthlyFactor(percent('7'), 'monthly')) })
  })

  it('daily interest: twelve months from the period start, each 1 + r × days / 365, compounded', () => {
    // From 15 January 2026, twelve months of 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 days at 5%.
    const r = run({ fixedRate: percent('5'), policy: { interestMethod: 'daily', dayCount: 'actual/365' } })
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    let n = 1n
    let d = 1n
    for (const day of days) {
      n *= 365n * 20n + BigInt(day)
      d *= 365n * 20n
    }
    const expected = Number(((n - d) * 10n ** 15n + d / 2n) / d)
    expect(Math.abs(r.returns[0]!.effective.numerator * (10 ** 15 / r.returns[0]!.effective.denominator) - expected)).toBeLessThanOrEqual(1)
  })

  it('no fixed period: one return, at the reversion rate', () => {
    expect(run({ fixedEndMonth: 0 }).returns.map((x) => x.period)).toEqual(['reversion'])
  })
})

describe('outputs', () => {
  const r = run({ regular: { amount: fromPounds(200), fromMonth: 1, toMonth: 300 }, lumpSums: [{ month: 30, amount: fromPounds(10_000) }] })

  it('the balance series runs from the start to the term for both schedules', () => {
    expect(r.balances).toHaveLength(301)
    expect(r.balances[0]).toEqual({ month: 0, baseline: fromPounds(200_000), overpaying: fromPounds(200_000) })
    expect(r.balances[300]).toEqual({ month: 300, baseline: fromPence(0), overpaying: fromPence(0) })
    expect(r.balances[30]!.overpaying).toBe(r.overpaying.rows[29]!.closing)
  })

  it('the yearly rows add up to the totals', () => {
    expect(r.years).toHaveLength(25)
    const sum = (pick: (y: (typeof r.years)[number]) => Money) => r.years.reduce((t, y) => t + p(pick(y)), 0)
    expect(sum((y) => y.baselineInterest)).toBe(p(r.baseline.totalInterest))
    expect(sum((y) => y.overpayingInterest)).toBe(p(r.overpaying.totalInterest))
    expect(sum((y) => y.overpaid)).toBe(p(r.overpaying.totalOverpaid))
    expect(r.years[1]).toMatchObject({ year: 2, fromMonth: 13, toMonth: 24, overpayingClosing: r.overpaying.rows[23]!.closing })
  })

  it('a short last year', () => {
    const short = run({ termMonths: 30 })
    expect(short.years.map((y) => [y.fromMonth, y.toMonth])).toEqual([
      [1, 12],
      [13, 24],
      [25, 30],
    ])
  })

  it('interest saved to the fixed-rate end and over the term', () => {
    const toEnd = r.baseline.rows.slice(0, 24).reduce((t, row, i) => t + p(row.interest) - p(r.overpaying.rows[i]!.interest), 0)
    expect(p(r.interestSavedToFixedEnd!)).toBe(toEnd)
    expect(p(r.interestSaved)).toBe(p(r.baseline.totalInterest) - p(r.overpaying.totalInterest))
    expect(r.overpaying.payoffDate).toBe(addMonths('2026-01-15', r.overpaying.payoffMonth!))
  })

  it('total paid is payments, overpayments and charges', () => {
    const o = r.overpaying
    expect(p(o.totalPaid)).toBe(p(o.totalPayments) + p(o.totalOverpaid) + p(o.totalErc))
  })
})

describe('assumptions', () => {
  it('contain no digits, and name the method, the day count, the effect, timing, the charge, rounding and bounds', () => {
    const monthly = run().assumptions
    const daily = run({ policy: { interestMethod: 'daily', dayCount: 'actual/actual' } }).assumptions
    for (const text of [...monthly, ...daily]) expect(text).not.toMatch(/\d/)
    const all = monthly.join(' ')
    expect(all).toMatch(/twelfth of the annual rate/)
    expect(all).toMatch(/payment dates only/)
    expect(all).toMatch(/shorter term/i)
    expect(all).toMatch(/early repayment charge/i)
    expect(all).toMatch(/nearest penny/)
    expect(all).toMatch(/rounded down/)
    expect(all).toMatch(/largest/)
    expect(daily.join(' ')).toMatch(/leap year/)
    expect(run({ effect: 'reduce-payment' }).assumptions.join(' ')).toMatch(/lower payment/i)
  })
})

describe('refusals and bounds (MO12)', () => {
  it('a term under a month, or not whole, is refused', () => {
    expect(refusal({ termMonths: 0 })).toContainEqual({ field: 'termMonths', reason: 'below-minimum' })
    expect(refusal({ termMonths: 0.5 })).toContainEqual({ field: 'termMonths', reason: 'not-whole' })
    expect(refusal({ termMonths: MAX_MORTGAGE_TERM_MONTHS + 1 })).toContainEqual({ field: 'termMonths', reason: 'above-maximum' })
  })

  it('accepts the longest term with the largest balance and rate without overflow', () => {
    const r = run({
      balance: MAX_INPUT_AMOUNT,
      termMonths: MAX_MORTGAGE_TERM_MONTHS,
      fixedRate: MAX_FINANCE_RATE,
      reversionRate: MAX_FINANCE_RATE,
      fixedEndMonth: 0,
      policy: { interestMethod: 'daily', dayCount: 'actual/actual' },
      regular: { amount: MAX_INPUT_AMOUNT, fromMonth: 1, toMonth: MAX_MORTGAGE_TERM_MONTHS },
    })
    expect(r.overpaying.payoffMonth).toBeGreaterThan(0)
    expect(r.baseline.rows).toHaveLength(MAX_MORTGAGE_TERM_MONTHS)
    expect(p(r.baseline.rows.at(-1)!.closing)).toBe(0)
  })

  it('refuses each field by name', () => {
    expect(refusal({ balance: fromPence(0) })).toContainEqual({ field: 'balance', reason: 'below-minimum' })
    expect(refusal({ balance: fromPence(p(MAX_INPUT_AMOUNT) + 1) })).toContainEqual({ field: 'balance', reason: 'above-maximum' })
    expect(refusal({ balance: 1.5 as Money })).toContainEqual({ field: 'balance', reason: 'not-money' })
    expect(refusal({ startDate: '2026-02-30' as never })).toContainEqual({ field: 'startDate', reason: 'not-a-date' })
    expect(refusal({ fixedRate: ratio(-1, 100) })).toContainEqual({ field: 'fixedRate', reason: 'below-minimum' })
    expect(refusal({ reversionRate: ratio(MAX_FINANCE_RATE.numerator * 2, MAX_FINANCE_RATE.denominator) })).toContainEqual({
      field: 'reversionRate',
      reason: 'above-maximum',
    })
    expect(refusal({ fixedRate: { numerator: 1, denominator: 0 } })).toContainEqual({ field: 'fixedRate', reason: 'not-a-rate' })
    expect(refusal({ fixedEndMonth: 301 })).toContainEqual({ field: 'fixedEndMonth', reason: 'above-maximum' })
    expect(refusal({ fixedEndMonth: -1 })).toContainEqual({ field: 'fixedEndMonth', reason: 'below-minimum' })
    expect(refusal({ repaymentType: 'part-and-part' as never })).toContainEqual({ field: 'repaymentType', reason: 'not-a-choice' })
    expect(refusal({ effect: 'both' as never })).toContainEqual({ field: 'effect', reason: 'not-a-choice' })
    expect(refusal({ policy: { interestMethod: 'annual' as never, dayCount: 'actual/365' } })).toContainEqual({
      field: 'interestMethod',
      reason: 'not-a-choice',
    })
    expect(refusal({ policy: { interestMethod: 'daily', dayCount: '30/360' as never } })).toContainEqual({
      field: 'dayCount',
      reason: 'not-a-choice',
    })
  })

  it('refuses overpayments outside the term or the amount bound', () => {
    expect(refusal({ regular: { amount: fromPounds(1), fromMonth: 0, toMonth: 5 } })).toContainEqual({
      field: 'regularFromMonth',
      reason: 'below-minimum',
    })
    expect(refusal({ regular: { amount: fromPounds(1), fromMonth: 1, toMonth: 301 } })).toContainEqual({
      field: 'regularToMonth',
      reason: 'above-maximum',
    })
    expect(refusal({ regular: { amount: fromPounds(1), fromMonth: 6, toMonth: 5 } })).toContainEqual({
      field: 'regularToMonth',
      reason: 'out-of-order',
    })
    expect(refusal({ regular: { amount: fromPence(-1), fromMonth: 1, toMonth: 5 } })).toContainEqual({
      field: 'regularAmount',
      reason: 'below-minimum',
    })
    expect(refusal({ lumpSums: [{ month: 301, amount: fromPounds(1) }] })).toContainEqual({
      field: 'lumpSumMonth',
      reason: 'above-maximum',
      index: 0,
    })
    expect(
      refusal({
        lumpSums: [
          { month: 1, amount: fromPounds(1) },
          { month: 2, amount: fromPence(p(MAX_INPUT_AMOUNT) + 1) },
        ],
      }),
    ).toContainEqual({
      field: 'lumpSumAmount',
      reason: 'above-maximum',
      index: 1,
    })
    const many = Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => ({ month: i + 1, amount: fromPounds(1) }))
    expect(refusal({ lumpSums: many })).toContainEqual({ field: 'lumpSums', reason: 'too-many' })
  })

  it('refuses a charge outside its bounds', () => {
    const erc = { rate: percent('3'), endMonth: 24, allowance: { kind: 'rate', rate: percent('10') } } as const
    expect(refusal({ erc: { ...erc, endMonth: 301 } })).toContainEqual({ field: 'ercEndMonth', reason: 'above-maximum' })
    expect(refusal({ erc: { ...erc, rate: ratio(-1, 1) } })).toContainEqual({ field: 'ercRate', reason: 'below-minimum' })
    expect(refusal({ erc: { ...erc, allowance: { kind: 'amount', amount: fromPence(-1) } } })).toContainEqual({
      field: 'allowanceAmount',
      reason: 'below-minimum',
    })
    expect(refusal({ erc: { ...erc, allowance: { kind: 'rate', rate: ratio(2, 1) } } })).toContainEqual({
      field: 'allowanceRate',
      reason: 'above-maximum',
    })
    expect(refusal({ erc: { ...erc, allowance: { kind: 'other' } as never } })).toContainEqual({
      field: 'allowance',
      reason: 'not-a-choice',
    })
  })

  it('refuses a term that runs past the last date it can write', () => {
    expect(refusal({ startDate: '9990-01-01', termMonths: MAX_MORTGAGE_TERM_MONTHS })).toContainEqual({
      field: 'startDate',
      reason: 'above-maximum',
    })
  })

  it('never throws on untrusted shapes', () => {
    expect(() => overpay(null as never)).not.toThrow()
    expect(overpay({} as never).ok).toBe(false)
    expect(() => overpay(inputs({ lumpSums: null as never }))).not.toThrow()
    expect(() => overpay(inputs({ policy: null as never }))).not.toThrow()
  })
})

describe('a monthly factor sanity check', () => {
  it('the shared twelfth matches the monthly interest the schedule charges', () => {
    expect(compareRatio(factorToRatio(monthlyFactor(percent('12'), 'monthly')), ratio(1, 100))).toBe(0)
  })
})
