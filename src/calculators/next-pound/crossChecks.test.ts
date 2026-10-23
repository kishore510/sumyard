import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { requireVerified } from '@/config/tax/sourced'
import { BREAK_EVEN_RATE_DENOMINATOR } from '@/lib/inputLimits'
import type { IsoDate } from '@/lib/isoDate'
import { compareRatio, fromPounds, type Money, percent, ratio, subtract, subtractRatio, toPence, ZERO } from '@/lib/money'
import type { MortgageInputs } from '../mortgage/types'
import { DEFAULT_POLICY, type PensionMethod, type Region, type StudentLoanPlanId } from '../optimiser/types'
import { accessAt, breakEvenRate, nextPound, pensionAfterTax } from './calc'
import { inputs as baseInputs, mortgageInputs, pensionInputs } from './fixtures/inputs'
import type { BreakEven, NextPoundInputs, NextPoundResult } from './types'

/*
 * Next pound cross-check harness (C1). docs/next-pound-cross-checks.json
 * holds eight cases the owner fills from documents (figures only: the
 * repository is public), each naming the engine cross-check it reproduces
 * (reproducesFrom). Until a case has an expected value it is a todo; no
 * expected value is invented here. A filled case is run through the
 * composer (or the composer's exported step for that part) and each filled
 * expected figure compared within the file's tolerance. Inputs the composer
 * needs but a case leaves null take the test defaults in fixtures/inputs.ts,
 * which the case's own figures never depend on.
 */

const FILE = join(import.meta.dirname, '..', '..', '..', 'docs', 'next-pound-cross-checks.json')

type Value = string | number | boolean | null | readonly unknown[]
interface FileCase {
  id: string
  status: string
  description: string
  reproducesFrom: { file: string; case?: string; note?: string } | null
  inputs: Record<string, Value>
  expected: Record<string, string | boolean | null>
  source: string | null
  checkedOn: string | null
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as { tolerancePence: number; cases: FileCase[] }
const config = taxYear

const filled = (c: FileCase) => Object.values(c.expected).some((v) => v !== null)
const str = (c: FileCase, key: string): string | null => (c.inputs[key] === null ? null : String(c.inputs[key]))
const pounds = (c: FileCase, key: string): Money | null => (str(c, key) === null ? null : fromPounds(str(c, key)!))
const rate = (c: FileCase, key: string) => (str(c, key) === null ? null : percent(str(c, key)!))
const num = (c: FileCase, key: string): number | null => (c.inputs[key] === null ? null : Number(c.inputs[key]))
function need<T>(c: FileCase, value: T | null, key: string): T {
  if (value === null) throw new Error(`${c.id}: ${key} is needed`)
  return value
}

const own = (() => {
  const g = requireVerified(config, [
    'pension.minimumAge.current',
    'pension.minimumAge.announced',
    'pension.minimumAge.announcedFrom',
    'pension.lumpSum.taxFreeShare',
    'pension.lumpSum.allowance',
  ])
  if (!g.ok) throw new Error('refused')
  return g.values
})()

function run(i: NextPoundInputs): NextPoundResult {
  const r = nextPound(i, config, DEFAULT_POLICY)
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`)
  return r
}

/** The pension cases' inputs, as the optimiser page stores them (howToFill). */
function pensionCase(c: FileCase): NextPoundInputs {
  const carry = (c.inputs.carryForward ?? []) as { yearsAgo: number; amount: string }[]
  const children = num(c, 'children') ?? 0
  return baseInputs({
    lumpSum: need(c, pounds(c, 'lumpSumX'), 'lumpSumX'),
    mortgage: null,
    pension: pensionInputs({
      optimiser: {
        grossPay: need(c, pounds(c, 'grossPay'), 'grossPay'),
        region: need(c, str(c, 'region'), 'region') as Region,
        studentLoans: (c.inputs.studentLoanPlans ?? []) as StudentLoanPlanId[],
        pension: {
          method: need(c, str(c, 'pensionMethod'), 'pensionMethod') as PensionMethod,
          contribution: pounds(c, 'currentContribution') ?? ZERO,
        },
        ...(children > 0
          ? { childBenefit: { children, payments: str(c, 'childBenefitPayments') === 'optedOut' ? 'optedOut' : 'claimed' } }
          : {}),
        savings: {
          employerContribution: pounds(c, 'employerContribution') ?? ZERO,
          carryForward: carry.map((y) => ({ yearsAgo: y.yearsAgo, amount: fromPounds(y.amount) })),
          moneyPurchaseAnnualAllowance: false,
        },
        checkChildcare: false,
      },
      employerMatch: pounds(c, 'employerMatch') ?? ZERO,
    }),
  })
}

/** The mortgage cases' inputs, as docs/mortgage-cross-checks.json describes them, with the effect reduce-term (CP5). */
function mortgageCase(c: FileCase): NextPoundInputs {
  const term = need(c, num(c, 'termMonths'), 'termMonths')
  const ercRate = rate(c, 'ercRate')
  const allowanceRate = rate(c, 'allowanceRate')
  const erc: MortgageInputs['erc'] =
    ercRate === null
      ? null
      : {
          rate: ercRate,
          endMonth: need(c, num(c, 'ercEndMonth'), 'ercEndMonth'),
          allowance:
            allowanceRate !== null
              ? { kind: 'rate', rate: allowanceRate }
              : { kind: 'amount', amount: pounds(c, 'allowanceAmount') ?? ZERO },
          ...(pounds(c, 'allowanceUsed') !== null ? { usedThisYear: pounds(c, 'allowanceUsed')! } : {}),
          ...(num(c, 'paymentsToReset') !== null ? { paymentsToReset: num(c, 'paymentsToReset')! } : {}),
        }
  return baseInputs({
    lumpSum: need(c, pounds(c, 'lumpSumX'), 'lumpSumX'),
    horizonYears: need(c, num(c, 'horizonYears'), 'horizonYears'),
    asOf: (str(c, 'asOf') ?? baseInputs().asOf) as IsoDate,
    inflationRate: rate(c, 'inflationRate') ?? ratio(0, 1),
    mortgage: mortgageInputs({
      startDate: need(c, str(c, 'startDate'), 'startDate') as IsoDate,
      balance: need(c, pounds(c, 'balance'), 'balance'),
      termMonths: term,
      repaymentType: (str(c, 'repaymentType') ?? 'repayment') as MortgageInputs['repaymentType'],
      fixedRate: rate(c, 'fixedRate') ?? rate(c, 'reversionRate') ?? ratio(0, 1),
      fixedEndMonth: num(c, 'fixedEndMonth') ?? 0,
      reversionRate: rate(c, 'reversionRate') ?? rate(c, 'fixedRate') ?? ratio(0, 1),
      erc,
      policy: {
        interestMethod: (str(c, 'interestMethod') ?? 'monthly') as MortgageInputs['policy']['interestMethod'],
        dayCount: (str(c, 'dayCount') ?? 'actual/365') as MortgageInputs['policy']['dayCount'],
      },
    }),
  })
}

/** What the composer gives for each expected field of a case. */
function computed(c: FileCase): Record<string, Money | boolean | BreakEven> {
  switch (c.id) {
    case 'pension-leg-cost':
    case 'pension-leg-taper-zone': {
      const leg = run(pensionCase(c)).legs.pension
      if (leg.status !== 'accessible' && leg.status !== 'not-accessible') throw new Error(`${c.id}: ${leg.status}`)
      const k = leg.contribution
      return { extraContribution: k.extra, pensionAdded: k.pensionAdded, costInSpendable: k.cost, leftoverCash: k.leftoverCash }
    }
    case 'pension-at-horizon-tax': {
      const pot = need(c, pounds(c, 'potAtHorizon'), 'potAtHorizon')
      const available = c.inputs.otherPensionsUseAllowance === true ? ZERO : own['pension.lumpSum.allowance']
      const split = pensionAfterTax(
        pot,
        own['pension.lumpSum.taxFreeShare'],
        available,
        need(c, rate(c, 'retirementRate'), 'retirementRate'),
      )
      return { taxFreePart: split.taxFree, taxablePart: subtract(pot, split.taxFree), tax: split.tax, afterTax: split.afterTax }
    }
    case 'pension-not-accessible': {
      const ages = {
        current: own['pension.minimumAge.current'],
        announced: own['pension.minimumAge.announced'],
        announcedFrom: own['pension.minimumAge.announcedFrom'],
      }
      const access = accessAt(
        need(c, str(c, 'asOf'), 'asOf') as IsoDate,
        need(c, num(c, 'horizonYears'), 'horizonYears'),
        need(c, num(c, 'ageNow'), 'ageNow'),
        num(c, 'schemeAccessAge'),
        ages,
      )
      return { accessible: access.accessible }
    }
    case 'mortgage-leg-reduce-term':
    case 'mortgage-leg-erc': {
      const leg = run(mortgageCase(c)).legs.mortgage
      if (leg.status !== 'ok') throw new Error(`${c.id}: ${JSON.stringify(leg)}`)
      return {
        overpayment: leg.overpayment,
        ercCharged: leg.erc,
        baselineBalanceAtHorizon: leg.baselineBalance,
        overpayingBalanceAtHorizon: leg.overpayingBalance,
        paymentsFreed: leg.paymentsFreed,
        leftoverCash: leg.leftoverCash,
      }
    }
    case 'isa-leg': {
      const g = need(c, rate(c, 'growthRate'), 'growthRate')
      const leg = run(
        baseInputs({
          lumpSum: need(c, pounds(c, 'lumpSumX'), 'lumpSumX'),
          horizonYears: need(c, num(c, 'horizonYears'), 'horizonYears'),
          growth: { low: g, mid: g, high: g },
          feeRate: rate(c, 'feeRate') ?? ratio(0, 1),
          inflationRate: rate(c, 'inflationRate') ?? ratio(0, 1),
          mortgage: null,
        }),
      ).legs.isa
      if (leg.status !== 'ok') throw new Error(`${c.id}: ${leg.status}`)
      return { nominal: leg.rates.mid.value.nominal, todaysMoney: leg.rates.mid.value.todaysMoney }
    }
    case 'break-even-against-mortgage': {
      const be = breakEvenRate(
        need(c, pounds(c, 'lumpSumX'), 'lumpSumX'),
        rate(c, 'feeRate') ?? ratio(0, 1),
        need(c, num(c, 'horizonYears'), 'horizonYears'),
        ratio(0, 1),
        need(c, pounds(c, 'mortgageLegAtHorizon'), 'mortgageLegAtHorizon'),
      )
      return { breakEvenGrowthRate: be }
    }
    default:
      throw new Error(`${c.id}: no comparison for this case`)
  }
}

describe('next pound cross-check file', () => {
  it('has a tolerance in whole pence, unique ids, and eight cases each naming what it reproduces', () => {
    expect(Number.isSafeInteger(file.tolerancePence) && file.tolerancePence >= 0).toBe(true)
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(file.cases.length)
    expect(file.cases).toHaveLength(8)
    for (const c of file.cases)
      if (c.id !== 'pension-not-accessible') expect(c.reproducesFrom?.file, c.id).toMatch(/^docs\/.+-cross-checks\.json$/)
  })

  it('a filled case has a source and a date', () => {
    for (const c of file.cases) {
      if (!filled(c)) continue
      expect(c.source, c.id).toMatch(/\S/)
      expect(c.checkedOn, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('next pound cross-checks', () => {
  for (const c of file.cases) {
    const from = c.reproducesFrom
      ? ` (reproduces ${c.reproducesFrom.file}${c.reproducesFrom.case ? `, ${c.reproducesFrom.case}` : ''})`
      : ''
    if (!filled(c)) {
      it.todo(`${c.id}: ${c.description}${from} (expected result not filled in yet)`)
      continue
    }
    it(`${c.id}${from}`, () => {
      const got = computed(c)
      for (const [key, want] of Object.entries(c.expected)) {
        if (want === null) continue
        const value = got[key]
        if (value === undefined) throw new Error(`${c.id}: no computed ${key}`)
        if (typeof want === 'boolean') expect(value, `${c.id} ${key}`).toBe(want)
        else if (key === 'breakEvenGrowthRate') {
          // Percentage text; the composer's rate is on steps of one over BREAK_EVEN_RATE_DENOMINATOR, so within one step.
          const be = value as BreakEven
          if (be.kind !== 'rate') throw new Error(`${c.id}: ${be.kind}`)
          const gap = subtractRatio(be.rate, percent(want))
          expect(
            compareRatio(ratio(Math.abs(gap.numerator), gap.denominator), ratio(1, BREAK_EVEN_RATE_DENOMINATOR)),
            `${c.id} ${key}`,
          ).toBeLessThanOrEqual(0)
        } else
          expect(Math.abs(toPence(subtract(value as Money, fromPounds(want)))), `${c.id} ${key}`).toBeLessThanOrEqual(file.tolerancePence)
      }
    })
  }
})
