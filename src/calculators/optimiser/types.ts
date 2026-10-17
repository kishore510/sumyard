import type { TaxBand, TaxYearId } from '@/config/tax/schema'
import type { Money, Ratio } from '@/lib/money'
import { CHILD_BENEFIT_WEEKS_PER_YEAR } from '@/lib/periods'

/*
 * Types for the optimiser's core tax engine (slice 1a, sessions F and G1):
 * take-home pay on employment income, with an optional pension contribution
 * by one of three methods and optional Child Benefit with the High Income
 * Child Benefit Charge. Money is integer pence, rates are
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
  /**
   * Weeks of Child Benefit in the year, a whole number of one or more
   * (decision G4). The default comes from src/lib/periods.ts; no GOV.UK page
   * read states the count for the year.
   */
  readonly childBenefitWeeks: number
}

export const TAPER_ROUNDINGS = ['exact', 'wholePoundsDown'] as const satisfies readonly ModellingPolicy['taperRounding'][]

export const DEFAULT_POLICY: ModellingPolicy = Object.freeze({ taperRounding: 'exact', childBenefitWeeks: CHILD_BENEFIT_WEEKS_PER_YEAR })

/**
 * How a pension contribution gets tax relief (docs/modelling-decisions.md, G2):
 * - `salarySacrifice`: salary given up for an employer contribution of the same amount; off taxable pay, NI-able pay and adjusted net income.
 * - `netPay`: deducted from gross pay before tax; off taxable pay and adjusted net income, not off NI-able pay.
 * - `reliefAtSource`: paid from take-home pay; the provider adds relief at the relief-at-source rate; the basic rate band is extended and adjusted net income reduced by the grossed-up amount.
 */
export type PensionMethod = 'salarySacrifice' | 'netPay' | 'reliefAtSource'

export const PENSION_METHODS = ['salarySacrifice', 'netPay', 'reliefAtSource'] as const satisfies readonly PensionMethod[]

/** One pension contribution for the year. */
export interface PensionInput {
  readonly method: PensionMethod
  /**
   * What comes out of the employee's pay for the year, in pence, zero or
   * more: the salary given up (salary sacrifice), the deduction from gross
   * pay (net pay), or the payment before the provider's relief (relief at
   * source). The gross amount into the pension may not exceed gross pay.
   */
  readonly contribution: Money
}

export type ChildBenefitPayments = 'claimed' | 'optedOut'

export const CHILD_BENEFIT_PAYMENTS = ['claimed', 'optedOut'] as const satisfies readonly ChildBenefitPayments[]

/** Child Benefit in the household, for the High Income Child Benefit Charge. */
export interface ChildBenefitInput {
  /** Children Child Benefit is due for, for the whole year: a whole number, zero or more. */
  readonly children: number
  /** Whether the Child Benefit is paid, or the payments are opted out of (then no charge is due). */
  readonly payments: ChildBenefitPayments
}

/** What takeHome needs. Annual figures; employment income only. */
export interface TaxInputs {
  /** Gross employment income for the tax year, in pence, zero or more: the contractual pay before any salary sacrifice. */
  readonly grossPay: Money
  readonly region: Region
  /** Student loan plans being repaid; empty for none. Duplicates are ignored. */
  readonly studentLoans: readonly StudentLoanPlanId[]
  /** The employee's pension contribution, if any. */
  readonly pension?: PensionInput
  /** Child Benefit, if any is due; without it there is no Child Benefit and no charge. */
  readonly childBenefit?: ChildBenefitInput
}

/** A pension contribution's effect on pay, adjusted net income and the bands. */
export interface PensionResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly method: PensionMethod
  readonly grossPay: Money
  /** What comes out of the employee's pay, as passed in. */
  readonly contribution: Money
  /** Relief the provider adds (relief at source only; nothing otherwise), to the nearest penny. */
  readonly providerRelief: Money
  /** What goes into the pension: the contribution, or for relief at source the contribution grossed up, to the nearest penny. */
  readonly grossContribution: Money
  /** Employment income liable to income tax: gross pay less salary sacrificed or net pay contributions. */
  readonly taxablePay: Money
  /** Pay for employee and employer Class 1 NI: gross pay less salary sacrificed. */
  readonly niablePay: Money
  /** Pay for student loan repayments: the same as the NI-able pay (decision G6). */
  readonly studentLoanPay: Money
  /** Taken off net income at the adjusted net income guidance's step 3: the grossed-up relief at source contribution, nothing otherwise. */
  readonly reliefAtSourceDeduction: Money
  /** How far the basic rate band is extended: the grossed-up relief at source contribution, nothing otherwise. */
  readonly basicRateBandExtension: Money
}

/** Adjusted net income, as the GOV.UK guidance's steps, for employment income. */
export interface AdjustedNetIncomeResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly grossPay: Money
  readonly method: PensionMethod | null
  /** Step 1, net income: taxable employment pay (after salary sacrifice and net pay contributions). */
  readonly netIncome: Money
  /** Step 3: the grossed-up relief at source contribution. */
  readonly reliefAtSourceDeduction: Money
  /** Net income less the step 3 deduction, to the nearest penny (the engine uses the exact figure). */
  readonly adjustedNetIncome: Money
}

/** The High Income Child Benefit Charge for one person's adjusted net income. */
export interface HicbcResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly adjustedNetIncome: Money
  readonly children: number
  readonly payments: ChildBenefitPayments
  readonly weeks: number
  /** Child Benefit due for the year if claimed: the eldest or only child's weekly rate and each other child's, times the weeks. */
  readonly entitlement: Money
  /** Child Benefit received: the entitlement if claimed, nothing if opted out. */
  readonly childBenefit: Money
  /** Whole steps of adjusted net income over the threshold. */
  readonly steps: number
  /** Percentage points of the Child Benefit charged, from zero to a hundred, for the income alone. */
  readonly percentCharged: number
  /** The charge on the Child Benefit received, to the nearest penny. */
  readonly charge: Money
  /** Child Benefit received less the charge. */
  readonly net: Money
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
  /** Taxable income (after allowances) above which the band applies, after any basic rate band extension, to the nearest penny. */
  readonly from: Money
  /** Where the next band starts (after any extension); null for the last band. */
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
  /** The gross employment income passed in. */
  readonly income: Money
  /** The pension method, if a contribution was passed in. */
  readonly pensionMethod: PensionMethod | null
  /** Employment income liable to tax: the income less salary sacrificed or net pay contributions. */
  readonly taxablePay: Money
  /** The income the taper used, to the nearest penny. */
  readonly adjustedNetIncome: Money
  /** How far the bands above the basic rate band were moved up (relief at source), to the nearest penny. */
  readonly basicRateBandExtension: Money
  /** The allowance, tapered on adjusted net income. */
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
  /** The employee's pension contribution out of pay (nothing without one). */
  readonly pension: Money
  /** The High Income Child Benefit Charge (nothing without Child Benefit). */
  readonly hicbc: Money
  /** Take-home pay: gross less income tax, NI, student loan, pension and the charge. */
  readonly net: Money
  /** Child Benefit received (nothing without it). */
  readonly childBenefit: Money
  /** Take-home pay plus the Child Benefit received. */
  readonly netIncludingChildBenefit: Money
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
  /** The pension contribution's effects; null without one. */
  readonly pension: PensionResult | null
  readonly adjustedNetIncome: AdjustedNetIncomeResult
  /** Child Benefit and the charge; null without Child Benefit. */
  readonly hicbc: HicbcResult | null
  readonly annual: PeriodView
  readonly monthly: PeriodView
  readonly weekly: PeriodView
  /** Plain-language assumptions behind the result, for the UI to list. */
  readonly assumptions: readonly string[]
}

/** The engine's band list type, re-exported for tests and callers. */
export type { TaxBand }
