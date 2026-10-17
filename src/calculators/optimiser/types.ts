import type { TaxBand, TaxYearId } from '@/config/tax/schema'
import type { Money, Ratio } from '@/lib/money'

/*
 * Types for the optimiser's core tax engine (slice 1a, session F): take-home
 * pay on employment income with no pension. Money is integer pence, rates are
 * exact Ratios, every tax figure comes from the year's verified config. The
 * modelling decisions behind these shapes are in docs/modelling-decisions.md.
 */

/** Which income tax bands apply: England, Wales and Northern Ireland, or Scotland. */
export type Region = 'rUK' | 'scotland'

export const REGIONS = ['rUK', 'scotland'] as const satisfies readonly Region[]

/** Undergraduate student loan plans. */
export type UndergraduatePlan = 'plan1' | 'plan2' | 'plan4' | 'plan5'

export type StudentLoanPlanId = UndergraduatePlan | 'postgraduate'

export const UNDERGRADUATE_PLANS = ['plan1', 'plan2', 'plan4', 'plan5'] as const satisfies readonly UndergraduatePlan[]

export const STUDENT_LOAN_PLANS = [...UNDERGRADUATE_PLANS, 'postgraduate'] as const satisfies readonly StudentLoanPlanId[]

/**
 * Choices the published rules leave open. Each is named so a result can say
 * which was used, and so the UI can offer the alternative later.
 */
export interface ModellingPolicy {
  /**
   * How the personal allowance reduction is settled when the income over the
   * taper start is not a whole number of steps:
   * - `exact`: the reduction is exactly the taper rate times the excess, parts of a penny included, with no rounding before output.
   * - `wholePoundsDown`: the reduction is rounded down to a whole pound.
   * The two differ by less than a pound of allowance.
   */
  readonly taperRounding: 'exact' | 'wholePoundsDown'
}

export const TAPER_ROUNDINGS = ['exact', 'wholePoundsDown'] as const satisfies readonly ModellingPolicy['taperRounding'][]

export const DEFAULT_POLICY: ModellingPolicy = Object.freeze({ taperRounding: 'exact' })

/** What takeHome needs. Annual figures; employment income only. */
export interface TaxInputs {
  /** Gross employment income for the tax year, in pence, zero or more. */
  readonly grossPay: Money
  readonly region: Region
  /** Student loan plans being repaid; empty for none. Duplicates are ignored. */
  readonly studentLoans: readonly StudentLoanPlanId[]
}

export interface PersonalAllowanceResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  /** The income figure the taper was applied to. */
  readonly income: Money
  /** The full allowance before any taper. */
  readonly fullAllowance: Money
  /** Allowance lost to the taper, rounded to the nearest penny for output. */
  readonly reduction: Money
  /** Allowance left, rounded to the nearest penny for output (income tax uses the unrounded figure). */
  readonly allowance: Money
  readonly taperRounding: ModellingPolicy['taperRounding']
}

export interface BandSlice {
  readonly name: string
  readonly rate: Ratio
  /** Taxable income (after allowances) above which the band applies. */
  readonly from: Money
  /** Where the next band starts; null for the last band. */
  readonly to: Money | null
  /** Taxable income falling in the band, to the nearest penny. */
  readonly income: Money
  /** Tax on that income, to the nearest penny. */
  readonly tax: Money
}

export interface IncomeTaxResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly region: Region
  readonly income: Money
  readonly personalAllowance: PersonalAllowanceResult
  /** Income after allowances, to the nearest penny. */
  readonly taxableIncome: Money
  /** One entry per configured band, in order, including bands with nothing in them. */
  readonly bands: readonly BandSlice[]
  /** The sum of the bands' tax. */
  readonly total: Money
}

export interface NiSlice {
  readonly rate: Ratio
  /** NI-able pay in this slice, in pence. */
  readonly earnings: Money
  /** Contribution on the slice, to the nearest penny. */
  readonly contribution: Money
}

export interface EmployeeNIResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly niablePay: Money
  /** Between the primary threshold and the upper earnings limit. */
  readonly main: NiSlice
  /** Above the upper earnings limit. */
  readonly additional: NiSlice
  readonly total: Money
}

export interface StudentLoanDeduction {
  /** 'plan' for the one undergraduate deduction, 'postgraduate' for the postgraduate loan. */
  readonly kind: 'plan' | 'postgraduate'
  /** The plans this deduction covers (an undergraduate deduction covers every undergraduate plan held). */
  readonly plans: readonly StudentLoanPlanId[]
  /** The plan whose threshold and rate were used: the lowest threshold among the plans held. */
  readonly basis: StudentLoanPlanId
  readonly threshold: Money
  readonly rate: Ratio
  /** Pay above the threshold. */
  readonly excess: Money
  /** Rounded down to a whole pound. */
  readonly repayment: Money
}

export interface StudentLoanResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly pay: Money
  readonly deductions: readonly StudentLoanDeduction[]
  readonly total: Money
}

/** One period's view of a take-home result. */
export interface PeriodView {
  readonly period: 'annual' | 'monthly' | 'weekly'
  /** How the view is worked out, for the UI to show beside it. */
  readonly label: string
  readonly gross: Money
  readonly incomeTax: Money
  readonly nationalInsurance: Money
  readonly studentLoan: Money
  readonly net: Money
}

export interface TakeHomeResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  /** Always true: results are estimates, never payroll figures. */
  readonly estimate: true
  readonly inputs: TaxInputs
  readonly policy: ModellingPolicy
  readonly incomeTax: IncomeTaxResult
  readonly nationalInsurance: EmployeeNIResult
  readonly studentLoan: StudentLoanResult
  readonly annual: PeriodView
  readonly monthly: PeriodView
  readonly weekly: PeriodView
  /** Plain-language assumptions behind the result, for the UI to list. */
  readonly assumptions: readonly string[]
}

/** The engine's band list type, re-exported for tests and callers. */
export type { TaxBand }
