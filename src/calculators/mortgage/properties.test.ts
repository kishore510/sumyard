import { describe, expect, it } from 'vitest'
import { fromPence, type Money, toPence } from '@/lib/money'
import { overpay } from './calc'
import { generator, randomInputs } from './fixtures/inputs'
import type { MortgageInputs, MortgageResult, Schedule } from './types'

/*
 * Properties of the mortgage engine over seeded random inputs (a failure
 * names its case): every kind of overpayment, both effects, both interest
 * methods and day counts, repayment and interest-only, with and without an
 * early repayment charge, terms from one month to the bound.
 */

const CASES = 200
const SEED = 20_261_023
const p = (amount: Money) => toPence(amount)

function sample(seed: number, withCharge?: boolean): { inputs: MortgageInputs; result: MortgageResult }[] {
  const random = generator(seed)
  const cases: { inputs: MortgageInputs; result: MortgageResult }[] = []
  while (cases.length < CASES) {
    const inputs = randomInputs(random, withCharge)
    const outcome = overpay(inputs)
    if (!outcome.ok) throw new Error(`refused ${JSON.stringify(inputs)}: ${JSON.stringify(outcome.problems)}`)
    cases.push({ inputs, result: outcome.result })
  }
  return cases
}

const CHARGED = sample(SEED)
const UNCHARGED = sample(SEED + 1, false)
const payoff = (s: Schedule, term: number) => s.payoffMonth ?? term + 1

describe('mortgage engine properties (seeded)', () => {
  it('the balance is never below nothing, and every row adds up', () => {
    for (const { inputs, result } of CHARGED) {
      for (const s of [result.baseline, result.overpaying]) {
        expect(s.rows).toHaveLength(inputs.termMonths)
        for (const row of s.rows) {
          expect(p(row.closing), JSON.stringify(inputs)).toBeGreaterThanOrEqual(0)
          expect(p(row.closing)).toBe(p(row.opening) + p(row.interest) - p(row.payment) - p(row.overpayment))
          expect(Math.min(p(row.interest), p(row.payment), p(row.overpayment), p(row.unused), p(row.erc))).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('a repayment mortgage is cleared by the end of the term', () => {
    for (const { inputs, result } of CHARGED) {
      if (inputs.repaymentType !== 'repayment') continue
      expect(p(result.baseline.owedAtEnd), JSON.stringify(inputs)).toBe(0)
      expect(result.baseline.payoffMonth).toBe(inputs.termMonths)
      expect(p(result.overpaying.owedAtEnd)).toBe(0)
    }
  })

  it('total paid is the balance plus interest plus charges, less anything still owed', () => {
    for (const { inputs, result } of CHARGED) {
      for (const s of [result.baseline, result.overpaying]) {
        expect(p(s.totalPaid) + p(s.owedAtEnd), JSON.stringify(inputs)).toBe(p(inputs.balance) + p(s.totalInterest) + p(s.totalErc))
      }
    }
  })

  it('interest saved is never below nothing without a charge', () => {
    for (const { inputs, result } of UNCHARGED) {
      expect(p(result.interestSaved), JSON.stringify(inputs)).toBeGreaterThanOrEqual(0)
      if (result.interestSavedToFixedEnd !== null) expect(p(result.interestSavedToFixedEnd)).toBeGreaterThanOrEqual(0)
      expect(result.charge).toBeNull()
    }
  })

  it('the overpaying balance is never above the baseline', () => {
    for (const { inputs, result } of CHARGED) {
      for (const point of result.balances) expect(p(point.overpaying), JSON.stringify(inputs)).toBeLessThanOrEqual(p(point.baseline))
    }
  })

  it('with no overpayment, the overpaying schedule is the baseline', () => {
    for (const { inputs } of CHARGED) {
      const none = overpay({ ...inputs, regular: null, lumpSums: [] })
      const zeros = overpay({
        ...inputs,
        regular: inputs.regular && { ...inputs.regular, amount: fromPence(0) },
        lumpSums: inputs.lumpSums.map((l) => ({ ...l, amount: fromPence(0) })),
      })
      for (const outcome of [none, zeros]) {
        if (!outcome.ok) throw new Error('refused')
        expect(outcome.result.overpaying, JSON.stringify(inputs)).toEqual(outcome.result.baseline)
        expect(p(outcome.result.interestSaved)).toBe(0)
        expect(outcome.result.charge).toBeNull()
      }
    }
  })

  it('more overpayment never lengthens the term nor raises the interest', () => {
    for (const { inputs, result } of CHARGED) {
      const more = overpay({
        ...inputs,
        lumpSums: [
          ...inputs.lumpSums.slice(0, 2),
          { month: 1 + Math.floor(inputs.termMonths / 2), amount: fromPence(Math.ceil(p(inputs.balance) / 10)) },
        ],
      })
      if (!more.ok) throw new Error('refused')
      const fewer = overpay({ ...inputs, lumpSums: inputs.lumpSums.slice(0, 2) })
      if (!fewer.ok) throw new Error('refused')
      expect(payoff(more.result.overpaying, inputs.termMonths), JSON.stringify(inputs)).toBeLessThanOrEqual(
        payoff(fewer.result.overpaying, inputs.termMonths),
      )
      expect(p(more.result.overpaying.totalInterest), JSON.stringify(inputs)).toBeLessThanOrEqual(p(fewer.result.overpaying.totalInterest))
      expect(payoff(result.overpaying, inputs.termMonths)).toBeLessThanOrEqual(payoff(result.baseline, inputs.termMonths))
    }
  })

  it('overpayment used and unused add up to what was asked for', () => {
    for (const { inputs, result } of CHARGED) {
      const asked = new Map<number, number>()
      if (inputs.regular) for (let m = inputs.regular.fromMonth; m <= inputs.regular.toMonth; m++) asked.set(m, p(inputs.regular.amount))
      for (const l of inputs.lumpSums) asked.set(l.month, (asked.get(l.month) ?? 0) + p(l.amount))
      for (const row of result.overpaying.rows)
        expect(p(row.overpayment) + p(row.unused), JSON.stringify(inputs)).toBe(asked.get(row.month) ?? 0)
    }
  })

  it('a charge falls only in charged months, and the yearly charges add up', () => {
    for (const { inputs, result } of CHARGED) {
      const end = inputs.erc?.endMonth ?? 0
      for (const row of result.overpaying.rows) if (row.month > end) expect(p(row.erc)).toBe(0)
      expect(result.allowances.reduce((t, y) => t + p(y.charged), 0)).toBe(p(result.overpaying.totalErc))
      if (p(result.overpaying.totalErc) > 0)
        expect(p(result.charge!.netSaving)).toBe(p(result.interestSaved) - p(result.overpaying.totalErc))
      else expect(result.charge).toBeNull()
      expect(p(result.baseline.totalErc)).toBe(0)
    }
  })

  it('assumptions never carry a digit', () => {
    for (const { result } of CHARGED) for (const text of result.assumptions) expect(text).not.toMatch(/\d/)
  })
})
