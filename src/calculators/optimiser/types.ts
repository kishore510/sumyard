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

/**
 * How a benefit item is paid for (decision B10): `beforeTax`, salary given up
 * for it (salary sacrifice, an optional remuneration arrangement); `afterTax`,
 * a contribution from net pay (making good). Nothing taken is an employer-paid
 * benefit either way.
 */
export type BenefitPayment = 'beforeTax' | 'afterTax'

export const BENEFIT_PAYMENTS = ['beforeTax', 'afterTax'] as const satisfies readonly BenefitPayment[]

/** One benefit in kind for the year (B10). Annual amounts. */
export interface BenefitInput {
  /** The benefit's value under the normal rules, ignoring anything paid towards it, as the employer works it out; zero or more. */
  readonly value: Money
  /** What the employee gives for it in the year: the salary given up, or the contribution from net pay; zero or more. */
  readonly taken: Money
  readonly payment: BenefitPayment
}

/** Benefit items summed for the year (B10). */
export interface BenefitTotals {
  /** Added to taxable pay and adjusted net income: each item's relevant amount (before tax) or value less the contribution (after tax). */
  readonly taxable: Money
  /** Salary given up for benefits: off taxable pay, NI-able pay, the student loan base and take-home. */
  readonly salaryGivenUp: Money
  /** Contributions from net pay for benefits: off take-home only. */
  readonly paidAfterTax: Money
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
  /**
   * Taxable benefits in kind for the year, in pence, zero or more (none if absent): the net taxable value the employer works out,
   * after anything the employee pays towards it. Added to taxable pay and adjusted net income; not to NI-able pay or the student
   * loan base (Class 1A benefits, decision B1). Not cash, so not in take-home.
   */
  readonly taxableBenefits?: Money
  /** Amounts taken from net pay for the year with no tax effect, in pence, zero or more (none if absent). Off take-home only (B2). */
  readonly postTaxDeductions?: Money
  /** Benefit items with what is taken from pay for them (B10), in addition to `taxableBenefits`; none if absent. */
  readonly benefits?: readonly BenefitInput[]
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
  /** Employment income liable to income tax: gross pay less salary sacrificed or net pay contributions, plus any taxable benefits. */
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
  /** Step 1, net income: taxable employment pay (after salary sacrifice and net pay contributions), taxable benefits included. */
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
  /** Employment income liable to tax: the income less salary sacrificed or net pay contributions, plus any taxable benefits. */
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
  /** Salary given up for benefits (nothing without it). */
  readonly benefitSacrifice: Money
  readonly incomeTax: Money
  readonly nationalInsurance: Money
  readonly studentLoan: Money
  /** The employee's pension contribution out of pay (nothing without one). */
  readonly pension: Money
  /** The High Income Child Benefit Charge (nothing without Child Benefit). */
  readonly hicbc: Money
  /** Contributions from net pay for benefits (nothing without them). */
  readonly benefitPayments: Money
  /** Amounts taken from net pay with no tax effect (nothing without them). */
  readonly postTaxDeductions: Money
  /** Take-home pay: gross less salary given up for benefits, income tax, NI, student loan, pension, the charge, benefit payments and post-tax deductions. */
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
  /** Benefit items summed (nothing in each without them). */
  readonly benefits: BenefitTotals
  /**
   * Pay through payroll that PAYE taxes: gross pay less salary given up (for pension or benefits) and net pay contributions.
   * Benefits in kind are not in it (decision B13).
   */
  readonly payrollPay: Money
  readonly annual: PeriodView
  readonly monthly: PeriodView
  readonly weekly: PeriodView
  /** Things to know about this result (take-home below nothing), never a change to it. */
  readonly warnings: readonly EngineWarning[]
  /** Plain-language assumptions behind the result, for the UI to list. */
  readonly assumptions: readonly string[]
}

/** The engine's band list type, re-exported for tests and callers. */
export type { TaxBand }

/* Session G2: the annual allowance, carry forward, the childcare check and optimise(). Decisions G7 to G14. */

/** Unused annual allowance from an earlier tax year, as the person states it (not config). */
export interface UnusedAllowance {
  /** How many tax years before this one: one for the year just gone, and so on. A whole number of one or more. */
  readonly yearsAgo: number
  /** Allowance that year's pension savings did not use, zero or more. */
  readonly amount: Money
}

/** Pension savings beyond the employee's own contribution, for the annual allowance. All money purchase (defined contribution). */
export interface PensionSavingsInput {
  /** Employer contributions for the year other than a salary sacrifice (which counts on its own), zero or more. */
  readonly employerContribution: Money
  /** Unused allowance from earlier years; empty for none. One entry per year at most. */
  readonly carryForward: readonly UnusedAllowance[]
  /** The money purchase annual allowance applies for the whole year (pension flexibly accessed in an earlier tax year). */
  readonly moneyPurchaseAnnualAllowance: boolean
}

/** A warning on a result: a code for the UI and a plain-language message with no figures. */
export interface EngineWarning {
  readonly code:
    | 'overAllowance'
    | 'overMoneyPurchaseAllowance'
    | 'tapered'
    | 'carryForwardUsed'
    | 'carryForwardOutOfTime'
    | 'childcareOverLimit'
    | 'takeHomeBelowNothing'
    | 'benefitSalarySacrifice'
  readonly message: string
}

/** One earlier year's unused allowance, and how much of it this year uses (earliest year first). */
export interface CarryForwardUse {
  readonly yearsAgo: number
  readonly available: Money
  readonly used: Money
  readonly left: Money
}

/** One band's share of the annual allowance charge. */
export interface ChargeSlice {
  readonly name: string
  /** The rate charged: the band's rate, or the basic rate for a band below the basic rate band. */
  readonly rate: Ratio
  /** Excess pension savings falling in the band, to the nearest penny. */
  readonly excess: Money
  /** The charge on it, to the nearest penny. */
  readonly charge: Money
}

export interface AnnualAllowanceChargeResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly region: Region
  /** Pension savings over the available allowance. */
  readonly excess: Money
  /** Taxable income after allowances ('reduced net income') the excess is added to, to the nearest penny. */
  readonly reducedNetIncome: Money
  /** One entry per configured band, in order. */
  readonly bands: readonly ChargeSlice[]
  /** The sum of the bands' charge. */
  readonly total: Money
}

export interface AnnualAllowanceResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  /** Net income + salary sacrificed − gross relief at source contributions (G7), to the nearest penny. */
  readonly thresholdIncome: Money
  /** Net income + net pay contributions + employer contributions (G7). */
  readonly adjustedIncome: Money
  /** Whether the taper applies: both measures over their limits. */
  readonly tapered: boolean
  readonly standardAllowance: Money
  /** Allowance lost to the taper, rounded down to a pound, limited by the minimum. */
  readonly taperReduction: Money
  /** This year's allowance after any taper. */
  readonly allowance: Money
  /** Earlier years' unused allowance within the look-back, earliest first, with what this year uses. */
  readonly carryForward: readonly CarryForwardUse[]
  readonly carryForwardUsed: Money
  /** The money purchase annual allowance if it applies, otherwise null. */
  readonly moneyPurchaseAnnualAllowance: Money | null
  /** Which limit binds: the annual allowance with carry forward ('standard'), or the MPAA ('moneyPurchase'). */
  readonly route: 'standard' | 'moneyPurchase'
  /** The binding limit: the allowance plus carry forward, or the MPAA if lower. */
  readonly allowanceAvailable: Money
  /** Pension savings counted: the gross employee contribution, the salary sacrificed and other employer contributions. */
  readonly counted: { readonly employee: Money; readonly employer: Money; readonly total: Money }
  /** What is left of the available allowance; nothing if over. */
  readonly headroom: Money
  /** Pension savings over the available allowance; nothing if under. */
  readonly excess: Money
  /** The annual allowance charge on the excess (G11). */
  readonly charge: AnnualAllowanceChargeResult
  readonly warnings: readonly EngineWarning[]
  readonly assumptions: readonly string[]
}

export type ChildcareScheme = 'taxFreeChildcare' | 'thirtyHours'

export const CHILDCARE_SCHEMES = ['taxFreeChildcare', 'thirtyHours'] as const satisfies readonly ChildcareScheme[]

export interface ChildcareSchemeResult {
  readonly scheme: ChildcareScheme
  readonly incomeLimit: Money
  /** Eligible on income alone: adjusted net income at or under the limit. Other conditions are not checked. */
  readonly eligibleOnIncome: boolean
  /** How far adjusted net income is under the limit (nothing if over), to the nearest penny down. */
  readonly headroom: Money
  /** How far adjusted net income is over the limit (nothing if not), to the nearest penny up. */
  readonly over: Money
}

export interface ChildcareResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly adjustedNetIncome: Money
  /** Always true: the limit is a cliff, the whole support is lost a penny over it (G12). */
  readonly cliff: true
  readonly schemes: readonly ChildcareSchemeResult[]
  readonly warnings: readonly EngineWarning[]
  readonly assumptions: readonly string[]
}

/** The optimiser's inputs: take-home inputs with the current pension, plus savings for the annual allowance. */
export interface OptimiserInputs extends TaxInputs {
  /** The method to sweep and the current contribution (zero for none). */
  readonly pension: PensionInput
  readonly savings: PensionSavingsInput
  /** Include the childcare limits as thresholds and check eligibility at each point. */
  readonly checkChildcare: boolean
}

export interface OptimiseOptions {
  /** Distance between sweep points, in pence, above zero. */
  readonly step: Money
  /** The most sweep points allowed; a step too small for the range throws rather than run long. */
  readonly maxPoints: number
}

export type ThresholdId =
  | 'personalAllowanceTaperStart'
  | 'personalAllowanceTaperEnd'
  | 'hicbcThreshold'
  | 'hicbcFullCharge'
  | 'taxFreeChildcareLimit'
  | 'thirtyHoursLimit'
  | 'annualAllowanceThresholdIncome'

export interface ThresholdContribution {
  readonly threshold: ThresholdId
  readonly measure: 'adjustedNetIncome' | 'thresholdIncome'
  /** The threshold, to the nearest penny (the solver uses the exact figure). */
  readonly limit: Money
  /**
   * - `alreadyMet`: the measure is at or under the limit at the current contribution.
   * - `reachable`: a larger contribution brings it there.
   * - `unreachable`: see `reason`.
   */
  readonly status: 'alreadyMet' | 'reachable' | 'unreachable'
  /** Why it is unreachable: the gross amount would exceed gross pay, savings would exceed the allowance, or the method does not lower the measure. */
  readonly reason: 'overGrossPay' | 'overAllowance' | 'notLoweredByMethod' | null
  /** The smallest total contribution that brings the measure to the limit or under; null if the method cannot. */
  readonly contribution: Money | null
  /** That contribution less the current one (nothing if already met); null if the method cannot. */
  readonly extra: Money | null
  /** The measure at that contribution, to the nearest penny; null if the method cannot. */
  readonly measureAt: Money | null
}

export interface ThresholdContributionsResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly method: PensionMethod
  readonly currentContribution: Money
  readonly thresholds: readonly ThresholdContribution[]
}

export type PointReason =
  | { readonly kind: 'sweep' }
  | { readonly kind: 'current' }
  | { readonly kind: 'maximum' }
  | { readonly kind: 'threshold'; readonly threshold: ThresholdId }

export interface OptimiserPoint {
  readonly contribution: Money
  /** The contribution less the current one; negative below it. */
  readonly extra: Money
  readonly reasons: readonly PointReason[]
  /** Annual take-home pay. */
  readonly takeHome: Money
  readonly childBenefit: Money
  readonly takeHomeIncludingChildBenefit: Money
  readonly annualAllowanceCharge: Money
  /** Take-home with Child Benefit, less the annual allowance charge. */
  readonly spendable: Money
  /** Into the pension for the year: out of pay (a salary sacrifice counts here), other employer contributions, the provider's relief. */
  readonly pension: { readonly employee: Money; readonly employer: Money; readonly relief: Money; readonly total: Money }
  readonly adjustedNetIncome: Money
  readonly thresholdIncome: Money
  /** Spendable given up per pound of extra pension, against no contribution; null at no contribution. */
  readonly netCostPerPound: Ratio | null
  /** Share of each extra pound into the pension since the previous point that did not come out of spendable income; null at the first point. */
  readonly marginalRate: Ratio | null
  readonly annualAllowance: {
    readonly tapered: boolean
    readonly allowanceAvailable: Money
    readonly counted: Money
    readonly headroom: Money
    readonly excess: Money
  }
  /** Childcare eligibility on income, if asked; empty otherwise. */
  readonly childcare: readonly { readonly scheme: ChildcareScheme; readonly eligibleOnIncome: boolean }[]
  readonly warnings: readonly EngineWarning[]
}

export type CliffKind = 'hicbcStep' | 'childcareLimit' | 'annualAllowanceTaper' | 'studentLoanWholePounds'

/** A jump in the curve between two neighbouring points. */
export interface Cliff {
  readonly kind: CliffKind
  /** The contributions of the two points it lies between. */
  readonly from: Money
  readonly to: Money
}

export interface OptimiseResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly estimate: true
  readonly method: PensionMethod
  readonly currentContribution: Money
  /** The largest contribution the engine models: its gross amount equals gross pay. */
  readonly maximumContribution: Money
  readonly step: Money
  /** Every candidate, in order of contribution; no point is called the best. */
  readonly points: readonly OptimiserPoint[]
  readonly thresholds: readonly ThresholdContribution[]
  readonly cliffs: readonly Cliff[]
  readonly assumptions: readonly string[]
}

/* Tax codes and the PAYE estimate (decisions B11 to B13). */

/** Which bands a code's prefix selects: none, England and Northern Ireland; S, Scotland; C, Wales. */
export type TaxCodeRegime = 'rUK' | 'scotland' | 'wales'

export type TaxCodeSuffix = 'L' | 'M' | 'N' | 'T'

/** A supported code: a number with a suffix letter, and an optional S or C prefix. */
export interface TaxCode {
  /** The code in its canonical form: upper case, no spaces. */
  readonly text: string
  readonly regime: TaxCodeRegime
  /** The number, a whole number of one or more. */
  readonly number: number
  readonly suffix: TaxCodeSuffix
}

/** Codes GOV.UK defines that the estimate does not model (B12). */
export type UnsupportedTaxCode = 'K' | 'BR' | 'D' | '0T' | 'NT' | 'emergency'

export type ParsedTaxCode =
  | { readonly ok: true; readonly code: TaxCode }
  /** A real code the estimate does not model; `text` is its canonical form. */
  | { readonly ok: false; readonly reason: 'unsupported'; readonly kind: UnsupportedTaxCode; readonly text: string }
  | { readonly ok: false; readonly reason: 'invalid' }

/** No estimate for this code, and why, in words without figures. Distinct from a config Refusal (which lists unverified values). */
export interface PayeNotModelled {
  readonly ok: false
  readonly reason: 'unsupported' | 'invalid'
  readonly kind: UnsupportedTaxCode | null
  readonly message: string
}

/** One month of level pay on the cumulative basis. "To date" figures run from the start of the year to the end of the month. */
export interface PayeMonth {
  /** One for the first month of the tax year, and so on. */
  readonly month: number
  /** This month's pay, to the nearest penny. */
  readonly pay: Money
  readonly payToDate: Money
  readonly freePayToDate: Money
  /** Pay to date less free pay to date, never below nothing. */
  readonly taxablePayToDate: Money
  /** Tax on taxable pay to date with the bands' share to date, rounded once to the nearest penny. */
  readonly taxToDate: Money
  /** Tax to date less the previous month's: this month's deduction. */
  readonly tax: Money
}

export interface PayeResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly estimate: true
  readonly code: TaxCode
  /** Which configured bands were used. */
  readonly bands: Region
  /** The code's number times the config's code unit. */
  readonly codeAllowance: Money
  /** The year's pay through payroll. */
  readonly pay: Money
  readonly months: readonly PayeMonth[]
  /** The year's tax: the last month's tax to date. */
  readonly total: Money
  readonly assumptions: readonly string[]
}

/** The PAYE estimate beside the year's liability. */
export interface PayeEstimate {
  readonly ok: true
  readonly paye: PayeResult
  /** The annual liability's income tax (the headline figure). */
  readonly liability: Money
  /** The estimate less the liability: above nothing, PAYE takes more than the year's tax. */
  readonly difference: Money
}
