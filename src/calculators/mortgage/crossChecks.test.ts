import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isIsoDate } from '@/lib/isoDate'
import { fromPence, fromPounds, type Money, percent, toPence } from '@/lib/money'
import { overpay } from './calc'
import type { DayCount, InterestMethod, MortgageInputs, MortgageResult } from './types'

/*
 * Mortgage cross-check harness (M1). docs/mortgage-cross-checks.json holds six
 * cases the owner fills from a real statement or a lender's illustration
 * (figures only: the repository is public). Until then each case is a todo;
 * no expected value is invented here. A filled case is compared with the
 * engine within the file's tolerance. Where the document does not state the
 * interest method or day count (null), every method is tried and the case
 * passes if one matches; the test name says which, so the case settles MR-1.
 */

const FILE = join(import.meta.dirname, '..', '..', '..', 'docs', 'mortgage-cross-checks.json')

type Pounds = string | null
interface FileCase {
  id: string
  status: string
  description: string
  inputs: {
    startDate: string | null
    balance: Pounds
    termMonths: number | null
    repaymentType: 'repayment' | 'interest-only' | null
    fixedRate: string | null
    fixedEndMonth: number | null
    reversionRate: string | null
    interestMethod: InterestMethod | null
    dayCount: DayCount | null
    effect: 'reduce-term' | 'reduce-payment' | null
    regularOverpayment: Pounds
    regularFromMonth: number | null
    regularToMonth: number | null
    lumpSums: { month: number; amount: string }[]
    ercRate: string | null
    ercEndMonth: number | null
    allowanceRate: string | null
    allowanceAmount: Pounds
  }
  expected: {
    regularPayment: Pounds
    paymentAfterFixedEnd: Pounds
    interestForPeriod: Pounds
    periodFromMonth: number | null
    periodToMonth: number | null
    balanceAtFixedEnd: Pounds
    balanceAfterOverpayment: Pounds
    paymentAfterOverpayment: Pounds
    monthsLeftAfterOverpayment: number | null
    ercCharged: Pounds
  }
  source: string | null
  checkedOn: string | null
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as { tolerancePence: number; cases: FileCase[] }

const filled = (c: FileCase) => Object.values(c.expected).some((v) => v !== null)

/** The engine inputs for one method and day count. */
function toInputs(c: FileCase, interestMethod: InterestMethod, dayCount: DayCount): MortgageInputs {
  const i = c.inputs
  const need = <T>(value: T | null, what: string): T => {
    if (value === null) throw new Error(`${c.id}: ${what} is needed`)
    return value
  }
  const termMonths = need(i.termMonths, 'termMonths')
  const fixedEndMonth = i.fixedEndMonth ?? 0
  return {
    startDate: need(i.startDate, 'startDate') as MortgageInputs['startDate'],
    balance: fromPounds(need(i.balance, 'balance')),
    termMonths,
    repaymentType: need(i.repaymentType, 'repaymentType'),
    fixedRate: percent(i.fixedRate ?? i.reversionRate ?? '0'),
    fixedEndMonth,
    reversionRate: percent(i.reversionRate ?? i.fixedRate ?? '0'),
    effect: i.effect ?? 'reduce-term',
    regular:
      i.regularOverpayment === null
        ? null
        : { amount: fromPounds(i.regularOverpayment), fromMonth: i.regularFromMonth ?? 1, toMonth: i.regularToMonth ?? termMonths },
    lumpSums: i.lumpSums.map((l) => ({ month: l.month, amount: fromPounds(l.amount) })),
    erc:
      i.ercRate === null
        ? null
        : {
            rate: percent(i.ercRate),
            endMonth: i.ercEndMonth ?? fixedEndMonth,
            allowance:
              i.allowanceAmount !== null
                ? { kind: 'amount', amount: fromPounds(i.allowanceAmount) }
                : { kind: 'rate', rate: percent(i.allowanceRate ?? '0') },
          },
    policy: { interestMethod, dayCount },
  }
}

/** Every difference from the document, in pence, by name; an empty list is a match. */
function differences(c: FileCase, r: MortgageResult): string[] {
  const e = c.expected
  const s = r.overpaying
  const out: string[] = []
  const check = (name: string, expected: Pounds, actual: Money | null | undefined) => {
    if (expected === null) return
    if (actual === null || actual === undefined) return void out.push(`${name}: the engine has none`)
    const gap = toPence(actual) - toPence(fromPounds(expected))
    if (Math.abs(gap) > file.tolerancePence) out.push(`${name} differs by ${gap}p`)
  }
  const firstOverpaid = s.rows.find((row) => toPence(row.overpayment) > 0)
  check('regularPayment', e.regularPayment, s.paymentNow)
  check('paymentAfterFixedEnd', e.paymentAfterFixedEnd, s.paymentAfterFixedEnd)
  check('balanceAtFixedEnd', e.balanceAtFixedEnd, s.balanceAtFixedEnd)
  check('balanceAfterOverpayment', e.balanceAfterOverpayment, firstOverpaid?.closing)
  check('paymentAfterOverpayment', e.paymentAfterOverpayment, firstOverpaid ? s.rows[firstOverpaid.month]?.payment : undefined)
  check('ercCharged', e.ercCharged, s.totalErc)
  if (e.interestForPeriod !== null) {
    const from = e.periodFromMonth ?? 1
    const to = e.periodToMonth ?? from
    const sum = s.rows.filter((row) => row.month >= from && row.month <= to).reduce((t, row) => t + toPence(row.interest), 0)
    check('interestForPeriod', e.interestForPeriod, fromPence(sum))
  }
  if (e.monthsLeftAfterOverpayment !== null) {
    const left = firstOverpaid && s.payoffMonth !== null ? s.payoffMonth - firstOverpaid.month : null
    if (left !== e.monthsLeftAfterOverpayment) out.push(`monthsLeftAfterOverpayment: ${left} against ${e.monthsLeftAfterOverpayment}`)
  }
  return out
}

describe('mortgage cross-check file', () => {
  it('has a tolerance in whole pence and six cases with unique ids', () => {
    expect(Number.isSafeInteger(file.tolerancePence) && file.tolerancePence >= 0).toBe(true)
    expect(file.cases.map((c) => c.id)).toEqual([
      'statement-year',
      'lump-sum-reduce-term',
      'lump-sum-reduce-payment',
      'over-allowance-erc',
      'fixed-rate-end',
      'interest-only',
    ])
  })

  it('a filled case has its source and the date it was checked, and valid inputs', () => {
    for (const c of file.cases) {
      if (!filled(c)) continue
      expect(c.source, c.id).toMatch(/\S/)
      expect(isIsoDate(c.checkedOn), c.id).toBe(true)
      expect(overpay(toInputs(c, c.inputs.interestMethod ?? 'monthly', c.inputs.dayCount ?? 'actual/365')).ok, c.id).toBe(true)
    }
  })
})

describe('mortgage cross-checks', () => {
  for (const c of file.cases) {
    if (!filled(c)) {
      it.todo(`${c.id}: ${c.description} (expected figures not filled in yet)`)
      continue
    }
    const methods: InterestMethod[] = c.inputs.interestMethod ? [c.inputs.interestMethod] : ['monthly', 'daily']
    const counts: DayCount[] = c.inputs.dayCount ? [c.inputs.dayCount] : ['actual/365', 'actual/actual']
    it(`${c.id}: ${c.description}`, () => {
      const tried: string[] = []
      for (const method of methods) {
        for (const count of method === 'monthly' ? counts.slice(0, 1) : counts) {
          const outcome = overpay(toInputs(c, method, count))
          if (!outcome.ok) throw new Error(`${c.id}: refused ${JSON.stringify(outcome.problems)}`)
          const gaps = differences(c, outcome.result)
          if (gaps.length === 0) return
          tried.push(`${method}${method === 'daily' ? ` ${count}` : ''}: ${gaps.join('; ')}`)
        }
      }
      expect.fail(`${c.id} matches no method:\n${tried.join('\n')}`)
    })
  }
})
