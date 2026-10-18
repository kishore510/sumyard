import { add, type Money, subtract } from '@/lib/money'
import type { Breakdown } from './breakdown'
import type { PayeEstimate } from './types'

/*
 * What the take-home page's results show beyond the breakdown (the page
 * redesign, UI only; decisions U7 and U8 in docs/ui-patterns.md): the split of gross pay
 * into where it goes, for the split bar, and the estimated payslip net pay
 * with a tax code. Both are sums of existing engine outputs; no engine
 * change and no tax figure here.
 */

export const SPLIT_SEGMENTS = [
  'incomeTax',
  'nationalInsurance',
  'studentLoan',
  'pension',
  'hicbc',
  'benefits',
  'postTaxDeductions',
  'takeHome',
] as const
export type SplitSegmentId = (typeof SPLIT_SEGMENTS)[number]

export const SPLIT_LABELS: Record<SplitSegmentId, string> = {
  incomeTax: 'Income tax',
  nationalInsurance: 'National Insurance',
  studentLoan: 'Student loan',
  pension: 'Employee pension',
  hicbc: 'Child Benefit charge',
  benefits: 'Benefits given up',
  postTaxDeductions: 'Post-tax deductions',
  takeHome: 'Take-home',
}

export interface SplitSegment {
  readonly id: SplitSegmentId
  readonly label: string
  readonly amount: Money
}

/** Where the period's gross pay goes, every part in order: they add up to gross pay, as the breakdown's rows do (U7). */
export function splitSegments(shown: Breakdown): SplitSegment[] {
  const { rows } = shown
  const amounts: Record<SplitSegmentId, Money> = {
    incomeTax: rows.incomeTax,
    nationalInsurance: rows.nationalInsurance,
    studentLoan: rows.studentLoan,
    pension: rows.pension,
    hicbc: rows.hicbc,
    benefits: add(rows.benefitSacrifice, rows.benefitPayments),
    postTaxDeductions: rows.postTaxDeductions,
    takeHome: shown.takeHome,
  }
  return SPLIT_SEGMENTS.map((id) => ({ id, label: SPLIT_LABELS[id], amount: amounts[id] }))
}

/**
 * Estimated payslip net pay (U8): the period's take-home with the PAYE estimate in place of its income tax; for a month,
 * the first month's PAYE (months can differ by a penny). Nothing else is swapped.
 */
export function payslipNet(shown: Breakdown, estimate: PayeEstimate): Money {
  const { paye } = estimate
  const tax = shown.period === 'year' ? paye.total : paye.months[0]!.tax
  return subtract(add(shown.takeHome, shown.rows.incomeTax), tax)
}
