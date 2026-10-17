/*
 * FOR TESTS ONLY. The input cases for the HMRC cross-check harness
 * (docs/hmrc-cross-checks.json), derived from a tax year's verified config:
 * around the personal allowance taper, for each region, with and without each
 * student loan plan. The owner fills the expected results from HMRC's own
 * online calculators; nothing here computes or guesses them.
 */

import type { TaxYearConfig } from '@/config/tax/schema'
import { requireVerified } from '@/config/tax/sourced'
import { add, fromPounds, type Money, mulRound, ratio, subtract, toPence } from '@/lib/money'
import { REGIONS, type Region, STUDENT_LOAN_PLANS, type StudentLoanPlanId } from '../types'

export interface CrossCheckInputs {
  /** Gross annual employment income in pounds, as "12345.67". */
  readonly grossPay: string
  readonly region: Region
  readonly studentLoans: readonly StudentLoanPlanId[]
}

export interface CrossCheckCase {
  readonly id: string
  readonly description: string
  readonly inputs: CrossCheckInputs
}

/** Pence as a pounds string with two decimals ("12345.67"). Amounts here are never negative. */
export function poundsText(amount: Money): string {
  const pence = toPence(amount)
  return `${Math.trunc(pence / 100)}.${String(pence % 100).padStart(2, '0')}`
}

const PLAN_SETS: readonly (readonly StudentLoanPlanId[])[] = [[], ...STUDENT_LOAN_PLANS.map((plan) => [plan])]

const REGION_NAMES: Record<Region, string> = { rUK: 'England, Wales and Northern Ireland', scotland: 'Scotland' }

export function crossCheckCases(config: TaxYearConfig): CrossCheckCase[] {
  const granted = requireVerified(config, ['incomeTax.personalAllowance', 'incomeTax.taperStart', 'incomeTax.taperRate'] as const)
  if (!granted.ok) throw new Error(`cross-checks: ${config.id} has unverified values: ${granted.unverified.join(', ')}`)
  const start = granted.values['incomeTax.taperStart']
  const allowance = granted.values['incomeTax.personalAllowance']
  const rate = granted.values['incomeTax.taperRate']
  const pound = fromPounds(1)
  const zeroPoint = add(start, mulRound(allowance, ratio(rate.denominator, rate.numerator), 'up'))
  const points: readonly [string, string, Money][] = [
    ['taper-start-minus-1', 'taper start less £1', subtract(start, pound)],
    ['taper-start', 'at the taper start', start],
    ['taper-start-plus-1', 'taper start plus £1', add(start, pound)],
    ['taper-midpoint', 'midpoint of the taper zone', mulRound(add(start, zeroPoint), ratio(1, 2), 'nearest')],
    ['taper-zero-point', 'where the allowance reaches zero', zeroPoint],
    ['zero-point-plus-10000', '£10,000 above the zero point', add(zeroPoint, fromPounds(10_000))],
  ]
  return REGIONS.flatMap((region) =>
    points.flatMap(([pointId, pointText, gross]) =>
      PLAN_SETS.map((plans) => ({
        id: `${config.id}-${region}-${pointId}-${plans[0] ?? 'no-loan'}`,
        description: `${REGION_NAMES[region]}, ${pointText} (£${poundsText(gross)}), ${plans[0] ? `student loan ${plans[0]}` : 'no student loan'}`,
        inputs: { grossPay: poundsText(gross), region, studentLoans: plans },
      })),
    ),
  )
}
