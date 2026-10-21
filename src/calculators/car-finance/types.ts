import type { Money, Ratio } from '@/lib/money'

/*
 * Types for the car finance engine (slice 3a). The decisions behind these
 * shapes are in docs/modelling-decisions-car.md (F5 to F14).
 */

/** How the annual rate a person enters becomes a monthly rate (F6). */
export type RateBasis = 'monthly' | 'annual'

/** An agreement is priced by its interest rate or by its regular payment (F6). */
export type Pricing =
  | { readonly kind: 'rate'; readonly rate: Ratio; readonly basis: RateBasis }
  | { readonly kind: 'payment'; readonly payment: Money }

/** An arrangement fee is paid at the start or added to the balance (F10). */
export type FeeTiming = 'start' | 'added'

interface Common {
  /** Whole months, from one to the bound. */
  readonly term: number
  readonly pricing: Pricing
  readonly arrangementFee: Money
  readonly arrangementFeeTiming: FeeTiming
}

/** A personal loan: the amount pays for the car, which is owned from the start (F11). */
export interface LoanInputs extends Common {
  readonly amount: Money
}

/** Hire purchase: owned at the end once the option to purchase fee is paid; a balloon is allowed and required (F11). */
export interface HirePurchaseInputs extends Common {
  readonly cashPrice: Money
  readonly deposit: Money
  readonly balloon: Money
  readonly optionFee: Money
}

/** PCP: at the end, buy (final payment and purchase fee) or hand back (excess mileage only) (F11). */
export interface PcpInputs extends Common {
  readonly cashPrice: Money
  readonly deposit: Money
  readonly finalPayment: Money
  readonly purchaseFee: Money
  /** Whole miles allowed over the whole agreement. */
  readonly mileageAllowance: number
  /** Whole miles expected over the whole agreement. */
  readonly expectedMileage: number
  /** Whole pence for each mile over the allowance. */
  readonly excessPerMile: Money
}

export type Product = 'loan' | 'hire-purchase' | 'pcp'

/** One month of the schedule, in whole pence (F7): closing = opening + interest − payment. */
export interface ScheduleRow {
  readonly month: number
  readonly opening: Money
  readonly interest: Money
  readonly payment: Money
  readonly closing: Money
}

export interface Schedule {
  readonly rows: readonly ScheduleRow[]
  /** Every month's payment but (possibly) the last. */
  readonly regularPayment: Money
  /** The last month's payment, which takes the rounding (F7). */
  readonly lastPayment: Money
  /** Owed after the last regular payment: the balloon or optional final payment, or nothing. */
  readonly finalPayment: Money
  readonly totalInterest: Money
  /** The sum of the monthly payments (not the final payment). */
  readonly totalPayments: Money
}

/** The effective rate (F8), or why it has none (F9). Not the statutory APR. */
export type EffectiveRate =
  | { readonly ok: true; readonly monthly: Ratio; readonly annual: Ratio }
  | { readonly ok: false; readonly reason: SolveFailure }

export type SolveFailure = 'no-solution' | 'no-convergence'

/** What happens at the end of the term (F11). */
export interface EndPath {
  readonly ownsCar: boolean
  readonly finalPayment: Money
  readonly purchaseFee: Money
  readonly excessMiles: number
  readonly excessMileageCharge: Money
  /** Deposit + arrangement fee + monthly payments + whatever this path pays at the end. */
  readonly totalCost: Money
}

export interface FinanceResult {
  readonly estimate: true
  readonly product: Product
  /** Cash price less deposit (the loan amount for a loan): the credit before any fee. */
  readonly amountFinanced: Money
  readonly deposit: Money
  /** The balance interest first runs on: the amount financed, plus the arrangement fee if added (F10). */
  readonly balanceFinanced: Money
  /** The monthly rate the schedule uses (entered or solved), to fifteen decimal places. */
  readonly monthlyRate: Ratio
  readonly schedule: Schedule
  readonly arrangementFee: Money
  /** Total interest + arrangement fee + purchase fee (F10). Not the statutory total charge for credit. */
  readonly costOfCredit: Money
  readonly effectiveRate: EffectiveRate
  /** Loan and HP: the one path. PCP: buy. */
  readonly own: EndPath
  /** PCP only. */
  readonly handBack: EndPath | null
  /** Plain-language assumptions with no figures, for the page to show. */
  readonly assumptions: readonly string[]
}

export type FinanceField =
  | 'amount'
  | 'cashPrice'
  | 'deposit'
  | 'term'
  | 'pricing'
  | 'rate'
  | 'basis'
  | 'payment'
  | 'arrangementFee'
  | 'arrangementFeeTiming'
  | 'balloon'
  | 'optionFee'
  | 'finalPayment'
  | 'purchaseFee'
  | 'mileageAllowance'
  | 'expectedMileage'
  | 'excessPerMile'

/** Why an input or the result is refused (F13). */
export type FinanceProblemReason =
  | 'not-money'
  | 'not-a-rate'
  | 'not-whole'
  | 'not-a-choice'
  | 'below-minimum'
  | 'above-maximum'
  | 'not-payable'
  | 'too-large'

export interface FinanceProblem {
  readonly field: FinanceField | 'result'
  readonly reason: FinanceProblemReason
}

/** A result, or a typed refusal that names each problem. Never a wrong number. */
export type FinanceOutcome =
  | { readonly ok: true; readonly result: FinanceResult }
  | { readonly ok: false; readonly problems: readonly FinanceProblem[] }

/** A series for the rate solver (F9): credit received at the start, then a payment (zero or more) at the end of each period. */
export interface CashFlows {
  readonly credit: Money
  readonly payments: readonly Money[]
}
