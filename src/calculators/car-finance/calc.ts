import type { Factor, Money, Ratio } from '@/lib/money'
import type {
  CashFlows,
  FinanceOutcome,
  FinanceResult,
  HirePurchaseInputs,
  LoanInputs,
  PcpInputs,
  RateBasis,
  Schedule,
  SolveFailure,
} from './types'

/* Stub (red commit): the car finance engine (slice 3a) comes in the next commit. */

export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const NOT_YET = 'not implemented'

export function monthlyFactor(_rate: Ratio, _basis: RateBasis): Factor {
  throw new Error(NOT_YET)
}

export function regularPayment(_balance: Money, _monthly: Factor, _term: number, _finalPayment: Money): Money {
  throw new Error(NOT_YET)
}

/** A monthly rate: always as a Factor; also as an exact Ratio when it is rational (the 'monthly' basis), so interest rounds exactly. */
export interface MonthlyRate {
  readonly factor: Factor
  readonly exact: Ratio | null
}

/** Which figure takes the rounding in the last month (F7). */
export type LastMonth = 'last-payment' | 'last-interest'

export function buildSchedule(
  _balance: Money,
  _monthly: MonthlyRate,
  _term: number,
  _payment: Money,
  _finalPayment: Money,
  _last: LastMonth,
): Schedule | null {
  throw new Error(NOT_YET)
}

export function solveRate(
  _flows: CashFlows,
): { readonly ok: true; readonly rate: Factor } | { readonly ok: false; readonly reason: SolveFailure } {
  throw new Error(NOT_YET)
}

export function annualRate(_monthly: Factor): Ratio {
  throw new Error(NOT_YET)
}

export function loan(_inputs: LoanInputs): FinanceOutcome {
  throw new Error(NOT_YET)
}

export function hirePurchase(_inputs: HirePurchaseInputs): FinanceOutcome {
  throw new Error(NOT_YET)
}

export function pcp(_inputs: PcpInputs): FinanceOutcome {
  throw new Error(NOT_YET)
}

export function outstandingBalance(_result: FinanceResult, _month: number): Money {
  throw new Error(NOT_YET)
}
