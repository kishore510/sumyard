import { describe, expect, it } from 'vitest'
import { MAX_FINANCE_TERM_MONTHS } from '@/lib/inputLimits'
import { APR_DISPLAY_DIGITS, compareRatio, fromPence, type Money, type Ratio, ratio, roundRatio, toPence } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { annualRate, apr, EngineInputError, hirePurchase, loan, pcp, solveRate } from './calc'
import { generator, type RandomAgreement, randomAgreement } from './fixtures/inputs'
import { compareFraction, type Fraction, frac, presentValue } from './fixtures/reference'
import type { AprFlows, AprOutcome, DatedPayment, FinanceOutcome, FinanceResult } from './types'

/*
 * The statutory APR (slice 3a.1, decision F15 in
 * docs/modelling-decisions-car.md; the rule is logged in
 * docs/verification-log.md, CR-1 to CR-3): the annual rate X at which
 * Σ C_k (1 + X)^−t_k = Σ D_l (1 + X)^−S_l, times in years from the first
 * drawdown, a month a twelfth of a year, shown to one decimal place of a
 * percentage, a following figure of five or more rounding up.
 *
 * No worked APR example is published on the pages read (CR-1), so the cases
 * below are hand-checkable (a single repayment makes X a plain ratio) and
 * checked against exact fractions. Every amount is made up.
 */

const at = (month: number, pence: number): DatedPayment => ({ month, amount: fromPence(pence) })
const flows = (drawdown: number, ...payments: DatedPayment[]): AprFlows => ({ drawdown: fromPence(drawdown), payments })
const DISPLAY_DENOMINATOR = 10 ** APR_DISPLAY_DIGITS

function solved(outcome: AprOutcome): { annual: Ratio; display: Ratio } {
  if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`)
  return outcome
}

const same = (a: Ratio, b: Ratio) => compareRatio(a, b) === 0

describe('apr: hand-checkable cases', () => {
  it('one repayment a year on: X is the repayment over the credit, less one', () => {
    const result = solved(apr(flows(100_000, at(12, 110_000))))
    expect(same(result.annual, ratio(1, 10))).toBe(true)
    expect(result.display).toEqual({ numerator: 100, denominator: DISPLAY_DENOMINATOR })
  })

  it('two years on: (1 + X)^2 is the repayment over the credit', () => {
    expect(same(solved(apr(flows(100_000, at(24, 121_000)))).annual, ratio(1, 10))).toBe(true)
  })

  it('half a year on: a month is a twelfth of a year, so (1 + X)^(1/2) is the repayment over the credit', () => {
    expect(same(solved(apr(flows(100_000, at(6, 110_000)))).annual, ratio(21, 100))).toBe(true)
  })

  it('a charge at the first drawdown counts against the credit', () => {
    expect(same(solved(apr(flows(100_000, at(0, 10_000), at(12, 99_000)))).annual, ratio(1, 10))).toBe(true)
  })

  it('payments in the same month add up, in any order', () => {
    const split = solved(apr(flows(100_000, at(12, 60_000), at(0, 0), at(12, 50_000))))
    expect(same(split.annual, ratio(1, 10))).toBe(true)
  })

  it('repaying exactly the credit is a rate of nothing', () => {
    const result = solved(apr(flows(100_000, at(3, 40_000), at(9, 60_000))))
    expect(same(result.annual, ratio(0, 1))).toBe(true)
    expect(result.display).toEqual({ numerator: 0, denominator: DISPLAY_DENOMINATOR })
  })

  it('monthly payments: the annual rate is the effective monthly rate compounded over twelve months', () => {
    const payments = Array.from({ length: 24 }, (_, index) => at(index + 1, 47_000))
    const result = solved(apr(flows(1_000_000, ...payments)))
    const monthly = solveRate({ credit: fromPence(1_000_000), payments: payments.map((p) => p.amount) })
    if (!monthly.ok) throw new Error(monthly.reason)
    expect(same(result.annual, annualRate(monthly.rate))).toBe(true)
  })
})

describe('apr: rounding for display (CR-3)', () => {
  const display = (repayment: number) => solved(apr(flows(10_000_000, at(12, repayment)))).display

  it('rounds up when the following figure is five or more', () => {
    expect(display(11_235_000)).toEqual({ numerator: 124, denominator: DISPLAY_DENOMINATOR })
    expect(display(11_235_001)).toEqual({ numerator: 124, denominator: DISPLAY_DENOMINATOR })
    expect(display(10_005_000)).toEqual({ numerator: 1, denominator: DISPLAY_DENOMINATOR })
  })

  it('leaves the figure when the following figure is below five', () => {
    expect(display(11_234_999)).toEqual({ numerator: 123, denominator: DISPLAY_DENOMINATOR })
    expect(display(10_004_999)).toEqual({ numerator: 0, denominator: DISPLAY_DENOMINATOR })
  })

  it('keeps the unrounded rate alongside', () => {
    const result = solved(apr(flows(10_000_000, at(12, 11_234_999))))
    expect(same(result.annual, ratio(1_234_999, 10_000_000))).toBe(true)
  })
})

describe('apr: refusals', () => {
  it('has no rate when nothing is borrowed, nothing is repaid, or less is repaid than borrowed', () => {
    expect(apr(flows(0, at(12, 100)))).toEqual({ ok: false, reason: 'no-solution' })
    expect(apr(flows(100_000))).toEqual({ ok: false, reason: 'no-solution' })
    expect(apr(flows(100_000, at(0, 100_000), at(12, 100)))).toEqual({ ok: false, reason: 'no-solution' })
    expect(apr(flows(100_000, at(12, 99_999)))).toEqual({ ok: false, reason: 'no-solution' })
  })

  it('refuses a malformed month or amount', () => {
    expect(() => apr(flows(100_000, at(-1, 110_000)))).toThrow(EngineInputError)
    expect(() => apr(flows(100_000, at(1.5, 110_000)))).toThrow(EngineInputError)
    expect(() => apr(flows(100_000, at(MAX_FINANCE_TERM_MONTHS + 1, 110_000)))).toThrow(EngineInputError)
    expect(() => apr(flows(100_000, at(12, -1)))).toThrow(EngineInputError)
    expect(() => apr(flows(-1, at(12, 1)))).toThrow(EngineInputError)
  })
})

const whole = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

describe('apr: exact round trip on whole years (300 seeded cases)', () => {
  // X = a / 10^4; credit m × 10^(4n) pence repaid as m × (10^4 + a)^n at year n, so X is exact.
  const random = generator(31_011)
  const cases = Array.from({ length: 300 }, () => {
    const a = random() < 0.1 ? 0 : whole(random, 1, 4_000)
    const years = whole(random, 1, 2)
    const m = whole(random, 1, 9)
    const credit = m * 10_000 ** years
    const repayment = m * (10_000 + a) ** years
    const split = whole(random, 0, repayment)
    return { a, years, credit, repayment, split }
  })

  it.each(cases.map((c, index) => [index, c] as const))('case %i', (_index, { a, years, credit, repayment, split }) => {
    const month = years * MONTHS_PER_YEAR
    const result = solved(apr(flows(credit, at(month, split), at(month, repayment - split))))
    const exact = ratio(a, 10_000)
    expect(same(result.annual, exact), `annual ${JSON.stringify(result.annual)}`).toBe(true)
    expect(result.display).toEqual(roundRatio(exact, APR_DISPLAY_DIGITS, 'nearest'))
  })

  it('includes rates exactly on a rounding half, which round up', () => {
    const halves = cases.filter((c) => c.a % 10 === 5)
    expect(halves.length).toBeGreaterThan(0)
    for (const { a, years, credit, repayment } of halves) {
      const { display } = solved(apr(flows(credit, at(years * MONTHS_PER_YEAR, repayment))))
      expect(display.numerator).toBe((a + 5) / 10)
    }
  })
})

describe('apr: exact reference for yearly payments (300 seeded cases)', () => {
  // With payments only at whole years the equation is a polynomial in 1 / (1 + X), so it is checked in exact fractions.
  const random = generator(31_012)
  const cases: { credit: number; charge: number; yearly: number[] }[] = []
  while (cases.length < 300) {
    const credit = whole(random, 10_000, 10_000_000)
    const charge = random() < 0.5 ? 0 : whole(random, 1, Math.floor(credit / 10))
    const years = whole(random, 1, 10)
    const yearly = Array.from({ length: years }, () => (random() < 0.15 ? 0 : whole(random, 0, Math.floor((credit * 3) / years))))
    const total = yearly.reduce((sum, value) => sum + value, 0)
    if (total + charge >= credit) cases.push({ credit, charge, yearly })
  }
  const TOLERANCE = 10n ** 14n

  it.each(cases.map((c, index) => [index, c] as const))('case %i', (_index, { credit, charge, yearly }) => {
    const payments = [at(0, charge), ...yearly.map((amount, index) => at((index + 1) * MONTHS_PER_YEAR, amount))]
    const result = solved(apr(flows(credit, ...payments)))
    const net = frac(BigInt(credit - charge))
    const pv = (x: Fraction) => presentValue(yearly.map(BigInt), x)
    const annual = frac(BigInt(result.annual.numerator), BigInt(result.annual.denominator))

    // The unrounded rate is within 10^-14 of the root.
    const below = frac(annual.n * TOLERANCE - annual.d, annual.d * TOLERANCE)
    const above = frac(annual.n * TOLERANCE + annual.d, annual.d * TOLERANCE)
    if (annual.n > 0n) expect(compareFraction(pv(below), net)).toBe(1)
    expect(compareFraction(pv(above), net)).toBe(-1)

    // The display k / 1000 holds exactly when the root lies in [k − ½, k + ½) thousandths: PV falls as the rate rises.
    const k = BigInt(result.display.numerator)
    const scale = 2n * BigInt(DISPLAY_DENOMINATOR)
    expect(result.display.denominator).toBe(DISPLAY_DENOMINATOR)
    expect(compareFraction(pv(frac(2n * k - 1n, scale)), net)).toBeGreaterThanOrEqual(0)
    expect(compareFraction(pv(frac(2n * k + 1n, scale)), net)).toBe(-1)
  })
})

function run(agreement: RandomAgreement): FinanceOutcome {
  if (agreement.product === 'loan') return loan(agreement.inputs)
  if (agreement.product === 'hire-purchase') return hirePurchase(agreement.inputs)
  return pcp(agreement.inputs)
}

/** The engine's effective-rate cash flows (F8), as dated APR flows. */
function aprFlowsOf(agreement: RandomAgreement, result: FinanceResult): AprFlows {
  const startFee = agreement.inputs.arrangementFeeTiming === 'start' ? agreement.inputs.arrangementFee : fromPence(0)
  const payments = result.schedule.rows.map((row) => at(row.month, toPence(row.payment)))
  const term = result.schedule.rows.length
  return {
    drawdown: result.amountFinanced,
    payments: [{ month: 0, amount: startFee }, ...payments, at(term, toPence(result.own.finalPayment) + toPence(result.own.purchaseFee))],
  }
}

function sample(seed: number, count: number) {
  const random = generator(seed)
  const cases: { agreement: RandomAgreement; result: FinanceResult; random: number }[] = []
  while (cases.length < count) {
    const agreement = randomAgreement(random)
    const outcome = run(agreement)
    if (outcome.ok && outcome.result.effectiveRate.ok) cases.push({ agreement, result: outcome.result, random: random() })
  }
  return cases
}

const engineCases = sample(31_013, 300)

describe('apr: the same flows as the effective rate give the same unrounded rate (300 seeded agreements)', () => {
  it.each(engineCases.map((c, index) => [index, c] as const))('case %i', (_index, { agreement, result }) => {
    if (!result.effectiveRate.ok) throw new Error('no effective rate')
    const { annual, display } = solved(apr(aprFlowsOf(agreement, result)))
    expect(same(annual, result.effectiveRate.annual)).toBe(true)
    expect(display).toEqual(roundRatio(annual, APR_DISPLAY_DIGITS, 'nearest'))
  })
})

const plus = (payments: readonly DatedPayment[], extra: DatedPayment) => [...payments, extra]
const pence = (amount: Money) => toPence(amount)

describe('apr: properties (300 seeded agreements)', () => {
  it.each(engineCases.map((c, index) => [index, c] as const))('case %i', (_index, { agreement, result, random }) => {
    const base = aprFlowsOf(agreement, result)
    const rate = solved(apr(base))
    const effective = solveRate({
      credit: fromPence(pence(base.drawdown) - pence(base.payments[0]!.amount)),
      payments: result.schedule.rows.map((row, index, rows) =>
        index === rows.length - 1
          ? fromPence(pence(row.payment) + pence(result.own.finalPayment) + pence(result.own.purchaseFee))
          : row.payment,
      ),
    })
    if (!effective.ok) throw new Error(effective.reason)

    // A charge counted in the total charge for credit (CR-2) never lowers the APR, so the APR is at or above
    // the effective rate of the same flows without it; with a charge above nothing it is above.
    const fee = 1 + Math.floor(random * 50_000)
    const month = Math.floor(random * (result.schedule.rows.length + 1))
    const withFee = apr({ ...base, payments: plus(base.payments, at(month, fee)) })
    if (withFee.ok) {
      expect(compareRatio(withFee.annual, annualRate(effective.rate))).toBe(1)
      expect(compareRatio(withFee.display, rate.display)).toBeGreaterThanOrEqual(0)
    }

    // Paying the same amounts later never raises the rate (time is counted from the first drawdown).
    if (result.schedule.rows.length < MAX_FINANCE_TERM_MONTHS) {
      const later = apr({ ...base, payments: base.payments.map((p) => (p.month === 0 ? p : { ...p, month: p.month + 1 })) })
      expect(later.ok && compareRatio(later.annual, rate.annual) <= 0).toBe(true)
    }

    // The display is the unrounded rate to one decimal place of a percentage, within half a step.
    const shown = frac(BigInt(rate.display.numerator), BigInt(rate.display.denominator))
    const exact = frac(BigInt(rate.annual.numerator), BigInt(rate.annual.denominator))
    const gap = frac(shown.n * exact.d - exact.n * shown.d, shown.d * exact.d)
    const half = frac(1n, 2n * BigInt(DISPLAY_DENOMINATOR))
    expect(compareFraction(gap, frac(-half.n, half.d))).toBe(1)
    expect(compareFraction(gap, half)).toBeLessThanOrEqual(0)
  })
})
