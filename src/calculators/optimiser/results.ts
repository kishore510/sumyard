import { type Money, ZERO } from '@/lib/money'
import type { Breakdown } from './breakdown'
import type { PayeEstimate } from './types'

/*
 * What the take-home page's results show beyond the breakdown (0.12.0, UI
 * only; docs/ui-patterns.md): the split of gross pay into where it goes, for
 * the split bar, and the estimated payslip net pay with a tax code. Both are
 * sums of existing engine outputs; no engine change and no tax figure here.
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

export function splitSegments(_shown: Breakdown): SplitSegment[] {
  return []
}

export function payslipNet(_shown: Breakdown, _estimate: PayeEstimate): Money {
  return ZERO
}
