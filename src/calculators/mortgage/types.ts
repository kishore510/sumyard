import type { IsoDate } from '@/lib/isoDate'
import type { Money, Ratio } from '@/lib/money'

/*
 * Types for the mortgage overpayment engine (M1). The decisions behind these
 * shapes are MO1 to MO15 in docs/modelling-decisions.md. Months count payment
 * dates from the start date: month one is the first payment, a month after
 * the start date.
 */

/** Repayment clears the balance by the end of the term; interest-only pays the interest and owes the capital at the end (MO2). */
export type RepaymentType = 'repayment' | 'interest-only'

/** How a month's interest is worked out (MO3): a twelfth of the annual rate, or day by day. */
export type InterestMethod = 'daily' | 'monthly'

/** The day basis for daily interest (MO3, MR-10): every day a share of a common year, or of its own year. */
export type DayCount = 'actual/365' | 'actual/actual'

/** What an overpayment does on a repayment mortgage (MO5): the payment stays and the term shortens, or the payment falls. */
export type OverpaymentEffect = 'reduce-term' | 'reduce-payment'

/** Modelling choices no source settles (MO3, MR-1, MR-10); named in the assumptions. */
export interface MortgagePolicy {
  readonly interestMethod: InterestMethod
  readonly dayCount: DayCount
}

/** The same amount on every payment date from one month to another, both included (MO6). */
export interface RegularOverpayment {
  readonly amount: Money
  readonly fromMonth: number
  readonly toMonth: number
}

/** One overpayment with a month's payment (MO6). */
export interface LumpSum {
  readonly month: number
  readonly amount: Money
}

/** The penalty-free allowance a year (MO7): a share of the balance at the allowance year's start, or an amount. */
export type Allowance = { readonly kind: 'rate'; readonly rate: Ratio } | { readonly kind: 'amount'; readonly amount: Money }

/** An early repayment charge (MO7): a share of what is overpaid above the allowance, on overpayments up to its end month. */
export interface EarlyRepaymentCharge {
  readonly rate: Ratio
  /** The last month whose overpayments can be charged; nothing means no charge. */
  readonly endMonth: number
  readonly allowance: Allowance
}

export interface MortgageInputs {
  /** The day the balance is owed; payments fall on this day of each later month (MO1). */
  readonly startDate: IsoDate
  readonly balance: Money
  /** Whole months left, from one to MAX_MORTGAGE_TERM_MONTHS (MO12). */
  readonly termMonths: number
  readonly repaymentType: RepaymentType
  readonly fixedRate: Ratio
  /** The last month at the fixed rate; nothing means the reversion rate from the start (MO1). */
  readonly fixedEndMonth: number
  readonly reversionRate: Ratio
  readonly effect: OverpaymentEffect
  readonly regular: RegularOverpayment | null
  readonly lumpSums: readonly LumpSum[]
  readonly erc: EarlyRepaymentCharge | null
  readonly policy: MortgagePolicy
}

export type MortgageField =
  | 'startDate'
  | 'balance'
  | 'termMonths'
  | 'repaymentType'
  | 'fixedRate'
  | 'fixedEndMonth'
  | 'reversionRate'
  | 'effect'
  | 'regular'
  | 'regularAmount'
  | 'regularFromMonth'
  | 'regularToMonth'
  | 'lumpSums'
  | 'lumpSumAmount'
  | 'lumpSumMonth'
  | 'erc'
  | 'ercRate'
  | 'ercEndMonth'
  | 'allowance'
  | 'allowanceRate'
  | 'allowanceAmount'
  | 'interestMethod'
  | 'dayCount'
  | 'result'

export type MortgageProblemReason =
  | 'not-money'
  | 'not-whole'
  | 'not-a-rate'
  | 'not-a-choice'
  | 'not-a-date'
  | 'below-minimum'
  | 'above-maximum'
  | 'out-of-order'
  | 'too-many'
  | 'too-large'

/** Why an input was refused (MO12); `index` names the lump sum. */
export interface MortgageProblem {
  readonly field: MortgageField
  readonly reason: MortgageProblemReason
  readonly index?: number
}

/** Which rate a month is charged at. */
export type RatePeriod = 'fixed' | 'reversion'

/** One payment date. Every amount is whole pence; closing = opening + interest − payment − overpayment. */
export interface MonthRow {
  readonly month: number
  readonly date: IsoDate
  readonly period: RatePeriod
  readonly opening: Money
  readonly interest: Money
  readonly payment: Money
  /** The overpayment used: never more than clears the balance (MO8). */
  readonly overpayment: Money
  /** The part of the overpayment asked for that was not needed (MO8). */
  readonly unused: Money
  /** The early repayment charge paid in cash that day, not added to the balance (MO7). */
  readonly erc: Money
  readonly closing: Money
}

/** One schedule, to the end of the term (rows after the payoff are nothing). */
export interface Schedule {
  readonly rows: readonly MonthRow[]
  /** The first payment. */
  readonly paymentNow: Money
  /** The first payment at the reversion rate; null with no reversion period or once paid off. */
  readonly paymentAfterFixedEnd: Money | null
  /** The balance after the last fixed-rate month; null with no fixed period. */
  readonly balanceAtFixedEnd: Money | null
  readonly totalInterest: Money
  /** Interest in the fixed-rate months; nothing with no fixed period. */
  readonly interestToFixedEnd: Money
  readonly totalPayments: Money
  readonly totalOverpaid: Money
  readonly totalErc: Money
  /** Payments, overpayments and early repayment charges. */
  readonly totalPaid: Money
  /** The month the balance reaches nothing; null when capital is still owed at the end (interest-only). */
  readonly payoffMonth: number | null
  readonly payoffDate: IsoDate | null
  /** The capital owed after the last month: nothing on a repayment mortgage. */
  readonly owedAtEnd: Money
}

/** One year of twelve payment dates from the start (the last may be shorter). */
export interface YearRow {
  readonly year: number
  readonly fromMonth: number
  readonly toMonth: number
  readonly baselineInterest: Money
  readonly overpayingInterest: Money
  readonly overpaid: Money
  readonly erc: Money
  readonly baselineClosing: Money
  readonly overpayingClosing: Money
}

/** The balance after each month, without and with overpayments; month nothing is the start. */
export interface BalancePoint {
  readonly month: number
  readonly baseline: Money
  readonly overpaying: Money
}

/** The effective guaranteed return of a pound overpaid in one rate period (MO9): an effective annual rate. */
export interface PeriodReturn {
  readonly period: RatePeriod
  readonly rate: Ratio
  readonly effective: Ratio
}

/** With an early repayment charge paid (MO9): what is left of the saving, and when it is reached. */
export interface ChargeOutcome {
  readonly paid: Money
  /** Interest saved less the charge; below nothing when the charge is larger. */
  readonly netSaving: Money
  /** The first month from which interest saved so far stays at least the charge paid so far; null if never within the term. */
  readonly breakEvenMonth: number | null
}

/** One allowance year of twelve payment dates (MO7): the penalty-free amount, what was overpaid in charged months, and the charge. */
export interface AllowanceYear {
  readonly year: number
  readonly allowance: Money
  readonly overpaid: Money
  readonly charged: Money
}

export type MortgageWarning =
  | { readonly kind: 'unused-overpayment'; readonly month: number; readonly amount: Money }
  | { readonly kind: 'over-allowance'; readonly year: number; readonly charge: Money }
  | { readonly kind: 'effect-not-applicable' }

export interface MortgageResult {
  readonly baseline: Schedule
  readonly overpaying: Schedule
  /** Months sooner the balance reaches nothing (the term cut). */
  readonly monthsSaved: number
  /** Over the whole term, the reversion rate assumed to the end (MO9). */
  readonly interestSaved: Money
  /** To the fixed-rate end; null with no fixed period (MO9). */
  readonly interestSavedToFixedEnd: Money | null
  /** Null when no early repayment charge is paid. */
  readonly charge: ChargeOutcome | null
  /** Each allowance year up to the charge's end month; empty with no charge in the inputs. */
  readonly allowances: readonly AllowanceYear[]
  readonly years: readonly YearRow[]
  readonly balances: readonly BalancePoint[]
  readonly returns: readonly PeriodReturn[]
  readonly warnings: readonly MortgageWarning[]
  /** Plain words, no figures: what the result rests on. */
  readonly assumptions: readonly string[]
}

export type MortgageOutcome =
  | { readonly ok: true; readonly result: MortgageResult }
  | { readonly ok: false; readonly problems: readonly MortgageProblem[] }
