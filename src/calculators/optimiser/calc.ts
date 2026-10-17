import type { LeafPath, TaxBand, TaxYearConfig } from '@/config/tax/schema'
import { type Granted, type Refusal, requireVerified } from '@/config/tax/sourced'
import {
  add,
  compare,
  compareExact,
  type ExactPence,
  exact,
  exactMul,
  exactSubtract,
  type Money,
  max,
  min,
  mulRound,
  ratio,
  roundExact,
  roundToPounds,
  subtract,
  toPence,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR, WEEKS_PER_YEAR } from '@/lib/periods'
import {
  type AdjustedNetIncomeResult,
  type BandSlice,
  type ChildBenefitInput,
  type EmployeeNIResult,
  type HicbcResult,
  type IncomeTaxResult,
  type ModellingPolicy,
  type NiSlice,
  type PensionInput,
  type PensionResult,
  type PeriodView,
  type PersonalAllowanceResult,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanDeduction,
  type StudentLoanPlanId,
  type StudentLoanResult,
  TAPER_ROUNDINGS,
  type TakeHomeResult,
  type TaxInputs,
} from './types'

/*
 * The optimiser's core tax engine (slice 1a, session F): take-home pay on
 * employment income with no pension. Pure: inputs and a tax-year config in,
 * results out. Every rate, threshold and allowance comes from the config
 * through requireVerified; if any value a function needs is unverified it
 * returns the typed refusal and no result. literals.test.ts fails if a number
 * other than 0, 1, 2 or 100 appears in this file.
 *
 * The rules and the rounding are the owner's modelling decisions
 * (docs/modelling-decisions.md, docs/money.md):
 * - annual model: NI and student loans use the annual thresholds;
 * - bands are marginal: a band's rate applies to taxable income above its start;
 * - no rounding before output: exact pence (fractions of a penny included)
 *   until each component is rounded to the nearest penny; NI to the nearest
 *   penny per rate; each student loan repayment down to a whole pound;
 * - the personal allowance taper follows the published rule, with odd amounts
 *   settled by ModellingPolicy.taperRounding.
 */

export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const ALLOWANCE_PATHS = ['incomeTax.personalAllowance', 'incomeTax.taperStart', 'incomeTax.taperRate'] as const
const BAND_PATHS = { rUK: 'incomeTax.bands.rUK', scotland: 'incomeTax.bands.scotland' } as const satisfies Record<Region, LeafPath>
const NI_PATHS = [
  'nationalInsurance.employee.primaryThreshold',
  'nationalInsurance.employee.upperEarningsLimit',
  'nationalInsurance.employee.mainRate',
  'nationalInsurance.employee.additionalRate',
] as const

type PlanPath = `studentLoans.${StudentLoanPlanId}.${'threshold' | 'rate'}`
const planPaths = (plan: StudentLoanPlanId): PlanPath[] => [`studentLoans.${plan}.threshold`, `studentLoans.${plan}.rate`]

type Values<P extends LeafPath> = Granted<P>['values']
type AllowanceValues = Values<(typeof ALLOWANCE_PATHS)[number]>
type BandValues = Values<(typeof BAND_PATHS)[Region]>
type NiValues = Values<(typeof NI_PATHS)[number]>
type PlanValues = Values<PlanPath>

/* Input checks. A Money that is not a safe whole number of pence throws MoneyError (toPence); a negative one throws EngineInputError. */

function checkAmount(amount: Money, what: string): Money {
  toPence(amount)
  if (compare(amount, ZERO) < 0) throw new EngineInputError(`${what} must be zero or more`)
  return amount
}

function checkRegion(region: Region): Region {
  if (!REGIONS.includes(region)) throw new EngineInputError(`unknown region ${JSON.stringify(region)}`)
  return region
}

function checkPolicy(policy: ModellingPolicy): ModellingPolicy {
  if (!TAPER_ROUNDINGS.includes(policy?.taperRounding)) {
    throw new EngineInputError(`unknown taper rounding ${JSON.stringify(policy?.taperRounding)}`)
  }
  return policy
}

/** The plans held, without duplicates, in a fixed order. */
function checkPlans(plans: readonly StudentLoanPlanId[]): StudentLoanPlanId[] {
  for (const plan of plans)
    if (!STUDENT_LOAN_PLANS.includes(plan)) throw new EngineInputError(`unknown student loan plan ${JSON.stringify(plan)}`)
  return STUDENT_LOAN_PLANS.filter((plan) => plans.includes(plan))
}

/* Personal allowance. */

const NOTHING = exact(ZERO)
const atLeastNothing = (amount: ExactPence) => (compareExact(amount, NOTHING) < 0 ? NOTHING : amount)

/** The allowance left after the taper, exactly (parts of a penny kept under the 'exact' policy). */
function allowanceLeft(income: Money, values: AllowanceValues, policy: ModellingPolicy): ExactPence {
  const full = exact(values['incomeTax.personalAllowance'])
  const start = values['incomeTax.taperStart']
  if (compare(income, start) <= 0) return full
  let reduction = exactMul(exact(subtract(income, start)), values['incomeTax.taperRate'])
  if (policy.taperRounding === 'wholePoundsDown') reduction = exact(roundToPounds(roundExact(reduction, 'down'), 'down'))
  return atLeastNothing(exactSubtract(full, reduction))
}

function allowanceResult(income: Money, values: AllowanceValues, policy: ModellingPolicy, taxYear: TaxYearConfig['id']) {
  const fullAllowance = values['incomeTax.personalAllowance']
  const allowance = roundExact(allowanceLeft(income, values, policy), 'nearest')
  const result: PersonalAllowanceResult = {
    ok: true,
    taxYear,
    income,
    fullAllowance,
    // Reported as the full allowance less the rounded allowance, so the two always add up.
    reduction: subtract(fullAllowance, allowance),
    allowance,
    taperRounding: policy.taperRounding,
  }
  return result
}

/**
 * The personal allowance after the taper: reduced by the taper rate on the
 * income over the taper start, never below nothing. The income figure is
 * passed in (adjusted net income comes in session G).
 */
export function personalAllowance(income: Money, config: TaxYearConfig, policy: ModellingPolicy): PersonalAllowanceResult | Refusal {
  checkAmount(income, 'income')
  checkPolicy(policy)
  const granted = requireVerified(config, ALLOWANCE_PATHS)
  if (!granted.ok) return granted
  return allowanceResult(income, granted.values, policy, config.id)
}

/* Income tax. */

function checkBands(bands: readonly TaxBand[]): readonly TaxBand[] {
  const first = bands[0]
  if (!first || compare(first.from, ZERO) !== 0) throw new Error('income tax bands must start at zero')
  for (let i = 1; i < bands.length; i++) {
    if (compare(bands[i]!.from, bands[i - 1]!.from) <= 0) throw new Error('income tax bands must rise')
  }
  return bands
}

function computeIncomeTax(
  income: Money,
  region: Region,
  values: AllowanceValues & BandValues,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): IncomeTaxResult {
  const bands = checkBands(values[BAND_PATHS[region]])
  const taxable = atLeastNothing(exactSubtract(exact(income), allowanceLeft(income, values, policy)))
  const slices: BandSlice[] = bands.map((band, i) => {
    const next = bands[i + 1]
    let inBand = atLeastNothing(exactSubtract(taxable, exact(band.from)))
    if (next) {
      const width = exact(subtract(next.from, band.from))
      if (compareExact(inBand, width) > 0) inBand = width
    }
    return {
      name: band.name,
      rate: band.rate,
      from: band.from,
      to: next ? next.from : null,
      income: roundExact(inBand, 'nearest'),
      tax: roundExact(exactMul(inBand, band.rate), 'nearest'),
    }
  })
  return {
    ok: true,
    taxYear,
    region,
    income,
    pensionMethod: null,
    taxablePay: income,
    adjustedNetIncome: income,
    basicRateBandExtension: ZERO,
    personalAllowance: allowanceResult(income, values, policy, taxYear),
    taxableIncome: roundExact(taxable, 'nearest'),
    bands: slices,
    total: slices.reduce((sum, slice) => add(sum, slice.tax), ZERO),
  }
}

/**
 * Income tax on an income for rUK or Scotland: the tapered personal allowance
 * comes off first, then each band's rate applies to the taxable income above
 * that band's start, up to the next band's start.
 */
export function incomeTax(
  income: Money,
  region: Region,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  pension?: PensionInput,
): IncomeTaxResult | Refusal {
  void pension
  checkAmount(income, 'income')
  checkRegion(region)
  checkPolicy(policy)
  const granted = requireVerified(config, [...ALLOWANCE_PATHS, BAND_PATHS[region]])
  if (!granted.ok) return granted
  return computeIncomeTax(income, region, granted.values, policy, config.id)
}

/* National Insurance. */

function slice(earnings: Money, rate: NiSlice['rate']): NiSlice {
  return { rate, earnings, contribution: mulRound(earnings, rate, 'nearest') }
}

function computeNI(niablePay: Money, values: NiValues, taxYear: TaxYearConfig['id']): EmployeeNIResult {
  const primary = values['nationalInsurance.employee.primaryThreshold']
  const upper = max(primary, values['nationalInsurance.employee.upperEarningsLimit'])
  const main = slice(max(ZERO, subtract(min(niablePay, upper), primary)), values['nationalInsurance.employee.mainRate'])
  const additional = slice(max(ZERO, subtract(niablePay, upper)), values['nationalInsurance.employee.additionalRate'])
  return { ok: true, taxYear, niablePay, main, additional, total: add(main.contribution, additional.contribution) }
}

/**
 * Employee Class 1 National Insurance on a year's NI-able pay, with the annual
 * thresholds: the main rate between the primary threshold and the upper
 * earnings limit, the additional rate above it, each to the nearest penny.
 */
export function employeeNI(niablePay: Money, config: TaxYearConfig): EmployeeNIResult | Refusal {
  checkAmount(niablePay, 'NI-able pay')
  const granted = requireVerified(config, NI_PATHS)
  if (!granted.ok) return granted
  return computeNI(niablePay, granted.values, config.id)
}

/* Student loans. */

function deduction(
  kind: StudentLoanDeduction['kind'],
  plans: StudentLoanPlanId[],
  basis: StudentLoanPlanId,
  pay: Money,
  values: PlanValues,
): StudentLoanDeduction {
  const threshold = values[`studentLoans.${basis}.threshold`]
  const rate = values[`studentLoans.${basis}.rate`]
  const excess = max(ZERO, subtract(pay, threshold))
  return { kind, plans, basis, threshold, rate, excess, repayment: roundToPounds(mulRound(excess, rate, 'down'), 'down') }
}

function computeStudentLoan(plans: StudentLoanPlanId[], pay: Money, values: PlanValues, taxYear: TaxYearConfig['id']): StudentLoanResult {
  const undergraduate = plans.filter((plan) => plan !== 'postgraduate')
  const deductions: StudentLoanDeduction[] = []
  if (undergraduate.length > 0) {
    // One repayment, at the lowest threshold of the plans held (the first such plan on a tie).
    const threshold = (plan: StudentLoanPlanId) => values[`studentLoans.${plan}.threshold`]
    const basis = undergraduate.reduce((lowest, plan) => (compare(threshold(plan), threshold(lowest)) < 0 ? plan : lowest))
    deductions.push(deduction('plan', undergraduate, basis, pay, values))
  }
  if (plans.includes('postgraduate')) deductions.push(deduction('postgraduate', ['postgraduate'], 'postgraduate', pay, values))
  return { ok: true, taxYear, pay, deductions, total: deductions.reduce((sum, d) => add(sum, d.repayment), ZERO) }
}

/**
 * Student loan repayments on a year's pay (the caller passes NI-able pay): one
 * repayment for the undergraduate plans held, at the lowest of their
 * thresholds, and the postgraduate loan's on top. Each is the plan's rate on
 * pay above its threshold, rounded down to a whole pound.
 */
export function studentLoan(plans: readonly StudentLoanPlanId[], pay: Money, config: TaxYearConfig): StudentLoanResult | Refusal {
  checkAmount(pay, 'pay')
  const held = checkPlans(plans)
  const granted = requireVerified(config, held.flatMap(planPaths))
  if (!granted.ok) return granted
  return computeStudentLoan(held, pay, granted.values, config.id)
}

/* Pensions, adjusted net income and the High Income Child Benefit Charge (session G1). */

/** The effect of a pension contribution on taxable pay, NI-able pay, adjusted net income and the bands. */
export function pensionContribution(pension: PensionInput, grossPay: Money, config: TaxYearConfig): PensionResult | Refusal {
  void pension
  void grossPay
  void config
  throw new Error('pensionContribution: not implemented yet')
}

/** Adjusted net income for employment income with an optional pension contribution. */
export function adjustedNetIncome(
  grossPay: Money,
  pension: PensionInput | undefined,
  config: TaxYearConfig,
): AdjustedNetIncomeResult | Refusal {
  void pension
  void grossPay
  void config
  throw new Error('adjustedNetIncome: not implemented yet')
}

/** The High Income Child Benefit Charge on an adjusted net income. */
export function hicbc(ani: Money, children: ChildBenefitInput, config: TaxYearConfig, policy: ModellingPolicy): HicbcResult | Refusal {
  void ani
  void children
  void config
  void policy
  throw new Error('hicbc: not implemented yet')
}

/* Take-home pay. */

function view(period: PeriodView['period'], label: string, annual: Omit<PeriodView, 'period' | 'label'>, divisor: number): PeriodView {
  const part = (amount: Money) => (divisor === 1 ? amount : mulRound(amount, ratio(1, divisor), 'nearest'))
  return {
    period,
    label,
    gross: part(annual.gross),
    incomeTax: part(annual.incomeTax),
    nationalInsurance: part(annual.nationalInsurance),
    studentLoan: part(annual.studentLoan),
    pension: part(annual.pension),
    hicbc: part(annual.hicbc),
    net: part(annual.net),
    childBenefit: part(annual.childBenefit),
    netIncludingChildBenefit: part(annual.netIncludingChildBenefit),
  }
}

function assumptions(inputs: TaxInputs, plans: StudentLoanPlanId[], policy: ModellingPolicy): string[] {
  return [
    'These are estimates for the tax year, not payroll or Self Assessment figures.',
    'Employment income only: no savings, dividends, property, self-employment or other income, no benefits in kind and no pension contributions.',
    'Annual model: National Insurance and student loan repayments are worked out on the year’s pay with the annual thresholds. Payroll works per pay period, so monthly payslips, and months with a large bonus, can differ.',
    inputs.region === 'scotland'
      ? 'Income tax uses the Scottish rates and bands, for a Scottish taxpayer.'
      : 'Income tax uses the rates and bands for England, Wales and Northern Ireland.',
    'Standard Personal Allowance only: no Marriage Allowance, Blind Person’s Allowance or tax code adjustments.',
    'The personal allowance taper is applied to gross pay: with no pension contributions, Gift Aid or other reliefs, gross pay is taken as adjusted net income.',
    policy.taperRounding === 'exact'
      ? 'Personal allowance taper: the reduction is exact, with nothing rounded until the result.'
      : 'Personal allowance taper: the reduction is rounded down to a whole pound.',
    'National Insurance: the employee’s contributions only, at the standard (category A) rates.',
    ...(plans.length > 0
      ? [
          'Student loans: worked out on National Insurance-able pay, here gross pay. With more than one plan, one repayment is taken at the lowest threshold; a postgraduate loan is repaid as well. Each repayment is rounded down to a whole pound.',
        ]
      : []),
    'Rounding: each band’s tax, each National Insurance rate’s contribution and the monthly and weekly figures are rounded to the nearest penny; nothing is rounded before that.',
    'Monthly and weekly figures are the annual ones divided evenly; they are not payslip figures.',
  ]
}

/**
 * Take-home pay for a year of employment income with no pension: gross, income
 * tax, employee NI, student loan and net, as annual, monthly and weekly views,
 * with the assumptions behind them. Refuses, listing every unverified value,
 * if the config lacks any value these need.
 */
export function takeHome(inputs: TaxInputs, config: TaxYearConfig, policy: ModellingPolicy): TakeHomeResult | Refusal {
  const grossPay = checkAmount(inputs.grossPay, 'gross pay')
  const region = checkRegion(inputs.region)
  const plans = checkPlans(inputs.studentLoans)
  checkPolicy(policy)
  const paths: LeafPath[] = [...ALLOWANCE_PATHS, BAND_PATHS[region], ...NI_PATHS, ...plans.flatMap(planPaths)]
  const granted = requireVerified(config, paths)
  if (!granted.ok) return granted
  const { values } = granted

  const tax = computeIncomeTax(grossPay, region, values, policy, config.id)
  const ni = computeNI(grossPay, values, config.id)
  // The student loan is worked out on NI-able pay; with employment income and no pension, that is gross pay.
  const loans = computeStudentLoan(plans, ni.niablePay, values, config.id)
  const annual = {
    gross: grossPay,
    incomeTax: tax.total,
    nationalInsurance: ni.total,
    studentLoan: loans.total,
    pension: ZERO,
    hicbc: ZERO,
    net: subtract(subtract(subtract(grossPay, tax.total), ni.total), loans.total),
    childBenefit: ZERO,
    netIncludingChildBenefit: subtract(subtract(subtract(grossPay, tax.total), ni.total), loans.total),
  }
  return {
    ok: true,
    taxYear: config.id,
    estimate: true,
    inputs: { grossPay, region, studentLoans: [...inputs.studentLoans] },
    policy: { taperRounding: policy.taperRounding, childBenefitWeeks: policy.childBenefitWeeks },
    incomeTax: tax,
    nationalInsurance: ni,
    studentLoan: loans,
    pension: null,
    adjustedNetIncome: {
      ok: true,
      taxYear: config.id,
      grossPay,
      method: null,
      netIncome: grossPay,
      reliefAtSourceDeduction: ZERO,
      adjustedNetIncome: grossPay,
    },
    hicbc: null,
    annual: view('annual', 'Annual: the tax year’s figures', annual, 1),
    monthly: view('monthly', 'Monthly: each annual figure divided by the months in a year, to the nearest penny', annual, MONTHS_PER_YEAR),
    weekly: view('weekly', 'Weekly: each annual figure divided by the weeks in a year, to the nearest penny', annual, WEEKS_PER_YEAR),
    assumptions: assumptions(inputs, plans, policy),
  }
}
