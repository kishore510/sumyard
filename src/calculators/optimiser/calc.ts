import type { LeafPath, TaxBand, TaxYearConfig } from '@/config/tax/schema'
import { type Granted, type Refusal, requireVerified } from '@/config/tax/sourced'
import {
  add,
  compare,
  compareExact,
  compareRatio,
  type ExactPence,
  exact,
  exactAdd,
  exactMul,
  exactSubtract,
  type Money,
  max,
  min,
  mulRound,
  type Ratio,
  ratio,
  roundExact,
  roundToPounds,
  subtract,
  subtractRatio,
  toPence,
  wholeSteps,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR, WEEKS_PER_YEAR } from '@/lib/periods'
import {
  type AdjustedNetIncomeResult,
  type BandSlice,
  CHILD_BENEFIT_PAYMENTS,
  type ChildBenefitInput,
  type EmployeeNIResult,
  type HicbcResult,
  type IncomeTaxResult,
  type ModellingPolicy,
  type NiSlice,
  PENSION_METHODS,
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
 * The optimiser's core tax engine (slice 1a, sessions F and G1): take-home
 * pay on employment income, with an optional pension contribution (salary
 * sacrifice, net pay or relief at source) and optional Child Benefit with the
 * High Income Child Benefit Charge. Pure: inputs and a tax-year config in,
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
 * - the personal allowance taper follows the published rule on adjusted net
 *   income, with odd amounts settled by ModellingPolicy.taperRounding;
 * - pension methods as GOV.UK states them (decisions G2 and G6): salary
 *   sacrifice off taxable, NI-able and student loan pay; net pay off taxable
 *   pay only; relief at source grossed up, off adjusted net income, with every
 *   band above the basic rate band moved up by the gross amount;
 * - the High Income Child Benefit Charge in whole steps (G1), Child Benefit
 *   for the policy's weeks (G4).
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

const RAS_PATH = 'pension.reliefAtSourceRate' as const
const CHILD_BENEFIT_PATHS = [
  'childBenefit.weeklyRates.eldestOrOnly',
  'childBenefit.weeklyRates.additionalChild',
  'childBenefit.hicbc.threshold',
  'childBenefit.hicbc.fullChargeAt',
  'childBenefit.hicbc.incomePerPercent',
] as const

type PlanPath = `studentLoans.${StudentLoanPlanId}.${'threshold' | 'rate'}`
const planPaths = (plan: StudentLoanPlanId): PlanPath[] => [`studentLoans.${plan}.threshold`, `studentLoans.${plan}.rate`]

type Values<P extends LeafPath> = Granted<P>['values']
type AllowanceValues = Values<(typeof ALLOWANCE_PATHS)[number]>
type BandValues = Values<(typeof BAND_PATHS)[Region]>
type NiValues = Values<(typeof NI_PATHS)[number]>
type PlanValues = Values<PlanPath>
type ChildBenefitValues = Values<(typeof CHILD_BENEFIT_PATHS)[number]>

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
  const weeks = policy.childBenefitWeeks
  if (!Number.isSafeInteger(weeks) || weeks < 1) throw new EngineInputError(`Child Benefit weeks must be a whole number of one or more`)
  return policy
}

function checkPension(pension: PensionInput | undefined): PensionInput | undefined {
  if (pension === undefined) return undefined
  if (!PENSION_METHODS.includes(pension?.method)) throw new EngineInputError(`unknown pension method ${JSON.stringify(pension?.method)}`)
  checkAmount(pension.contribution, 'pension contribution')
  return pension
}

function checkChildBenefit(childBenefit: ChildBenefitInput): ChildBenefitInput {
  const children = childBenefit?.children
  if (!Number.isSafeInteger(children) || children < 0) throw new EngineInputError('children must be a whole number, zero or more')
  if (!CHILD_BENEFIT_PAYMENTS.includes(childBenefit.payments))
    throw new EngineInputError(`unknown Child Benefit payments ${JSON.stringify(childBenefit.payments)}`)
  return childBenefit
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

/** The allowance left after the taper on an exact income (adjusted net income), exactly (parts of a penny kept under the 'exact' policy). */
function allowanceLeft(income: ExactPence, values: AllowanceValues, policy: ModellingPolicy): ExactPence {
  const full = exact(values['incomeTax.personalAllowance'])
  const start = exact(values['incomeTax.taperStart'])
  if (compareExact(income, start) <= 0) return full
  let reduction = exactMul(exactSubtract(income, start), values['incomeTax.taperRate'])
  if (policy.taperRounding === 'wholePoundsDown') reduction = exact(roundToPounds(roundExact(reduction, 'down'), 'down'))
  return atLeastNothing(exactSubtract(full, reduction))
}

function allowanceResult(income: ExactPence, values: AllowanceValues, policy: ModellingPolicy, taxYear: TaxYearConfig['id']) {
  const fullAllowance = values['incomeTax.personalAllowance']
  const allowance = roundExact(allowanceLeft(income, values, policy), 'nearest')
  const result: PersonalAllowanceResult = {
    ok: true,
    taxYear,
    income: roundExact(income, 'nearest'),
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
 * income over the taper start, never below nothing. The income passed in is
 * adjusted net income (see adjustedNetIncome).
 */
export function personalAllowance(income: Money, config: TaxYearConfig, policy: ModellingPolicy): PersonalAllowanceResult | Refusal {
  checkAmount(income, 'income')
  checkPolicy(policy)
  const granted = requireVerified(config, ALLOWANCE_PATHS)
  if (!granted.ok) return granted
  return allowanceResult(exact(income), granted.values, policy, config.id)
}

/* Pension contributions (session G1, decisions G2 and G6). */

/** A pension contribution's effect, exactly: what the income tax, NI, student loan and ANI steps use. */
interface PensionEffect {
  readonly pension: PensionInput | undefined
  /** Into the pension: the contribution, or for relief at source the contribution grossed up. */
  readonly gross: ExactPence
  readonly taxablePay: Money
  readonly niablePay: Money
  /** Adjusted net income: taxable pay less the step 3 deduction. */
  readonly ani: ExactPence
  /** The step 3 deduction and the basic rate band extension: the grossed-up relief at source amount, or nothing. */
  readonly reliefAtSource: ExactPence
}

const pensionPaths = (pension: PensionInput | undefined): LeafPath[] => (pension?.method === 'reliefAtSource' ? [RAS_PATH] : [])

/** What goes in for a relief at source payment: the payment divided by one less the relief-at-source rate. */
function grossUp(net: Money, rate: Ratio): ExactPence {
  const kept = subtractRatio(ratio(1, 1), rate)
  if (kept.numerator <= 0) throw new Error('the relief-at-source rate must be below one')
  return exactMul(exact(net), ratio(kept.denominator, kept.numerator))
}

/**
 * The effect on pay, adjusted net income and the bands. `rate` is the
 * relief-at-source rate, needed only for relief at source. A gross amount
 * above gross pay is refused: relief on contributions above earnings (and
 * relief at source with no earnings) is not modelled.
 */
function pensionEffect(grossPay: Money, pension: PensionInput | undefined, rate: Ratio | undefined): PensionEffect {
  const pay = exact(grossPay)
  if (!pension) return { pension, gross: NOTHING, taxablePay: grossPay, niablePay: grossPay, ani: pay, reliefAtSource: NOTHING }
  const { method, contribution } = pension
  if (method === 'reliefAtSource') {
    if (!rate) throw new Error('relief at source needs the relief-at-source rate')
    const gross = grossUp(contribution, rate)
    if (compareExact(gross, pay) > 0)
      throw new EngineInputError('the gross pension contribution is more than gross pay; relief above earnings is not modelled')
    return { pension, gross, taxablePay: grossPay, niablePay: grossPay, ani: exactSubtract(pay, gross), reliefAtSource: gross }
  }
  if (compare(contribution, grossPay) > 0)
    throw new EngineInputError('the pension contribution is more than gross pay; relief above earnings is not modelled')
  const after = subtract(grossPay, contribution)
  return {
    pension,
    gross: exact(contribution),
    taxablePay: after,
    // Net pay: "National Insurance contributions purposes do not deduct the pension contributions" (CWG2).
    niablePay: method === 'salarySacrifice' ? after : grossPay,
    ani: exact(after),
    reliefAtSource: NOTHING,
  }
}

function pensionResult(grossPay: Money, effect: PensionEffect, pension: PensionInput, taxYear: TaxYearConfig['id']): PensionResult {
  const grossContribution = roundExact(effect.gross, 'nearest')
  const reliefAtSource = roundExact(effect.reliefAtSource, 'nearest')
  return {
    ok: true,
    taxYear,
    method: pension.method,
    grossPay,
    contribution: pension.contribution,
    providerRelief: pension.method === 'reliefAtSource' ? subtract(grossContribution, pension.contribution) : ZERO,
    grossContribution,
    taxablePay: effect.taxablePay,
    niablePay: effect.niablePay,
    // The student loan base is the employer's secondary NIC pay, which here is the NI-able pay (decision G6).
    studentLoanPay: effect.niablePay,
    reliefAtSourceDeduction: reliefAtSource,
    basicRateBandExtension: reliefAtSource,
  }
}

/**
 * A pension contribution's effect on taxable pay, NI-able pay, the student
 * loan base, adjusted net income and the bands, by method (decision G2):
 * salary sacrifice comes off taxable and NI-able pay; net pay off taxable pay
 * only; relief at source is grossed up at the relief-at-source rate, comes off
 * adjusted net income and extends the basic rate band. Throws if the gross
 * amount is more than gross pay.
 */
export function pensionContribution(pension: PensionInput, grossPay: Money, config: TaxYearConfig): PensionResult | Refusal {
  checkAmount(grossPay, 'gross pay')
  const checked = checkPension(pension)
  if (!checked) throw new EngineInputError('a pension contribution is needed')
  const granted = requireVerified(config, pensionPaths(checked))
  if (!granted.ok) return granted
  const effect = pensionEffect(grossPay, checked, granted.values[RAS_PATH])
  return pensionResult(grossPay, effect, checked, config.id)
}

/* Adjusted net income. */

function aniResult(grossPay: Money, effect: PensionEffect, taxYear: TaxYearConfig['id']): AdjustedNetIncomeResult {
  return {
    ok: true,
    taxYear,
    grossPay,
    method: effect.pension?.method ?? null,
    netIncome: effect.taxablePay,
    reliefAtSourceDeduction: roundExact(effect.reliefAtSource, 'nearest'),
    adjustedNetIncome: roundExact(effect.ani, 'nearest'),
  }
}

/**
 * Adjusted net income for employment income, as the GOV.UK guidance's steps:
 * net income is taxable pay (salary sacrifice and net pay contributions are
 * not taxable pay), less the grossed-up relief at source contribution (step
 * 3). No Gift Aid or other reliefs. Shared by the personal allowance taper,
 * the High Income Child Benefit Charge and, later, the childcare check.
 */
export function adjustedNetIncome(
  grossPay: Money,
  pension: PensionInput | undefined,
  config: TaxYearConfig,
): AdjustedNetIncomeResult | Refusal {
  checkAmount(grossPay, 'gross pay')
  const checked = checkPension(pension)
  const granted = requireVerified(config, pensionPaths(checked))
  if (!granted.ok) return granted
  return aniResult(grossPay, pensionEffect(grossPay, checked, granted.values[RAS_PATH]), config.id)
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

/**
 * The basic rate band: the one band taxed at the relief-at-source rate (PTM044220's "relevant rate", the basic or
 * Scottish basic rate). Throws if there is not exactly one, rather than guess which band to extend.
 */
function basicRateBand(bands: readonly TaxBand[], rate: Ratio): number {
  const matches = bands.flatMap((band, i) => (compareRatio(band.rate, rate) === 0 ? [i] : []))
  if (matches.length !== 1) throw new Error('relief at source: no single basic rate band is taxed at the relief-at-source rate')
  return matches[0]!
}

function computeIncomeTax(
  income: Money,
  effect: PensionEffect,
  region: Region,
  values: AllowanceValues & BandValues & Partial<Values<typeof RAS_PATH>>,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): IncomeTaxResult {
  const bands = checkBands(values[BAND_PATHS[region]])
  const extension = effect.reliefAtSource
  const rate = values[RAS_PATH]
  const basic = compareExact(extension, NOTHING) > 0 && rate ? basicRateBand(bands, rate) : bands.length
  // Relief at source: every band above the basic rate band starts later by the gross amount.
  const starts = bands.map((band, i) => (i > basic ? exactAdd(exact(band.from), extension) : exact(band.from)))
  const taxable = atLeastNothing(exactSubtract(exact(effect.taxablePay), allowanceLeft(effect.ani, values, policy)))
  const slices: BandSlice[] = bands.map((band, i) => {
    const start = starts[i]!
    const next = starts[i + 1]
    let inBand = atLeastNothing(exactSubtract(taxable, start))
    if (next) {
      const width = exactSubtract(next, start)
      if (compareExact(inBand, width) > 0) inBand = width
    }
    return {
      name: band.name,
      rate: band.rate,
      from: roundExact(start, 'nearest'),
      to: next ? roundExact(next, 'nearest') : null,
      income: roundExact(inBand, 'nearest'),
      tax: roundExact(exactMul(inBand, band.rate), 'nearest'),
    }
  })
  return {
    ok: true,
    taxYear,
    region,
    income,
    pensionMethod: effect.pension?.method ?? null,
    taxablePay: effect.taxablePay,
    adjustedNetIncome: roundExact(effect.ani, 'nearest'),
    basicRateBandExtension: roundExact(extension, 'nearest'),
    personalAllowance: allowanceResult(effect.ani, values, policy, taxYear),
    taxableIncome: roundExact(taxable, 'nearest'),
    bands: slices,
    total: slices.reduce((sum, slice) => add(sum, slice.tax), ZERO),
  }
}

/**
 * Income tax on gross employment income for rUK or Scotland, with an optional
 * pension contribution: the personal allowance, tapered on adjusted net
 * income, comes off taxable pay first, then each band's rate applies to the
 * taxable income above that band's start, up to the next band's start. With
 * relief at source every band above the basic rate band starts later by the
 * gross amount. Without a pension the income is both taxable pay and adjusted
 * net income.
 */
export function incomeTax(
  income: Money,
  region: Region,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  pension?: PensionInput,
): IncomeTaxResult | Refusal {
  checkAmount(income, 'income')
  checkRegion(region)
  checkPolicy(policy)
  const checked = checkPension(pension)
  const granted = requireVerified(config, [...ALLOWANCE_PATHS, BAND_PATHS[region], ...pensionPaths(checked)])
  if (!granted.ok) return granted
  const effect = pensionEffect(income, checked, granted.values[RAS_PATH])
  return computeIncomeTax(income, effect, region, granted.values, policy, config.id)
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

/* The High Income Child Benefit Charge (session G1, decisions G1 and G4). */

function computeHicbc(
  ani: ExactPence,
  childBenefit: ChildBenefitInput,
  values: ChildBenefitValues,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): HicbcResult {
  const { children, payments } = childBenefit
  const weeks = policy.childBenefitWeeks
  const weekly =
    children === 0
      ? ZERO
      : add(
          values['childBenefit.weeklyRates.eldestOrOnly'],
          mulRound(values['childBenefit.weeklyRates.additionalChild'], ratio(children - 1, 1), 'nearest'),
        )
  const entitlement = mulRound(weekly, ratio(weeks, 1), 'nearest')
  const received = payments === 'claimed' ? entitlement : ZERO
  const over = exactSubtract(ani, exact(values['childBenefit.hicbc.threshold']))
  // Whole steps only (G1): a part step adds nothing.
  const steps = compareExact(over, NOTHING) > 0 ? wholeSteps(over, values['childBenefit.hicbc.incomePerPercent']) : 0
  const percentCharged = compareExact(ani, exact(values['childBenefit.hicbc.fullChargeAt'])) > 0 ? 100 : Math.min(100, steps)
  const charge = mulRound(received, ratio(percentCharged, 100), 'nearest')
  return {
    ok: true,
    taxYear,
    adjustedNetIncome: roundExact(ani, 'nearest'),
    children,
    payments,
    weeks,
    entitlement,
    childBenefit: received,
    steps,
    percentCharged,
    charge,
    net: subtract(received, charge),
  }
}

/**
 * The High Income Child Benefit Charge on one person's adjusted net income:
 * one percentage point of the Child Benefit received for each whole step of
 * income over the threshold, all of it above the full-charge point, the charge
 * to the nearest penny. Child Benefit is the eldest or only child's weekly
 * rate and each other child's, for the policy's weeks. Opted out of payments:
 * no Child Benefit and no charge.
 */
export function hicbc(ani: Money, children: ChildBenefitInput, config: TaxYearConfig, policy: ModellingPolicy): HicbcResult | Refusal {
  checkAmount(ani, 'adjusted net income')
  const childBenefit = checkChildBenefit(children)
  checkPolicy(policy)
  const granted = requireVerified(config, CHILD_BENEFIT_PATHS)
  if (!granted.ok) return granted
  return computeHicbc(exact(ani), childBenefit, granted.values, policy, config.id)
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

function pensionAssumptions(pension: PensionInput | undefined): string[] {
  switch (pension?.method) {
    case undefined:
      return []
    case 'salarySacrifice':
      return [
        'Pension by salary sacrifice: the salary given up comes off taxable pay, National Insurance-able pay and adjusted net income, and goes into the pension as an employer contribution of the same amount. Any extra the employer adds, and the National Minimum Wage floor on a sacrifice, are not modelled.',
      ]
    case 'netPay':
      return [
        'Pension by net pay arrangement: the contribution comes off pay before income tax and off adjusted net income, but not off National Insurance-able pay. Pay under the Personal Allowance gets no tax relief this way; the low earner’s pension payment is not modelled.',
      ]
    case 'reliefAtSource':
      return [
        'Pension by relief at source: the contribution is paid from take-home pay and the provider adds relief at the relief-at-source rate, even for a non-taxpayer. The gross contribution is the payment grossed up at that rate, kept exact until the result.',
        'Relief at source above the basic rate is shown as if claimed in full: the basic rate band is extended by the gross contribution and adjusted net income reduced by it. In practice the extra relief is claimed through Self Assessment or from HMRC.',
      ]
  }
}

function childBenefitAssumptions(childBenefit: ChildBenefitInput | undefined): string[] {
  if (!childBenefit) return ['No Child Benefit, so no High Income Child Benefit Charge.']
  if (childBenefit.payments === 'optedOut')
    return ['Child Benefit payments opted out: no Child Benefit is received and no High Income Child Benefit Charge is due.']
  return [
    'Child Benefit: the weekly rates for the eldest or only child and each other child, for the whole year, for the number of weeks set in the modelling policy.',
    'High Income Child Benefit Charge: one percentage point of the Child Benefit for each whole step of adjusted net income over the threshold (part of a step adds nothing), and all of it above the full-charge point; the charge is rounded to the nearest penny.',
    'The charge is worked out on this income alone: if a partner has a higher adjusted net income, the partner pays it instead.',
  ]
}

function assumptions(inputs: TaxInputs, plans: StudentLoanPlanId[], policy: ModellingPolicy): string[] {
  return [
    'These are estimates for the tax year, not payroll or Self Assessment figures.',
    'Employment income only: no savings, dividends, property, self-employment or other income, and no benefits in kind.',
    'Annual model: National Insurance and student loan repayments are worked out on the year’s pay with the annual thresholds. Payroll works per pay period, so monthly payslips, and months with a large bonus, can differ.',
    inputs.region === 'scotland'
      ? 'Income tax uses the Scottish rates and bands, for a Scottish taxpayer.'
      : 'Income tax uses the rates and bands for England, Wales and Northern Ireland.',
    'Standard Personal Allowance only: no Marriage Allowance, Blind Person’s Allowance or tax code adjustments.',
    inputs.pension
      ? 'Adjusted net income, which drives the personal allowance taper and the High Income Child Benefit Charge, is gross pay less any salary sacrificed or net pay contribution, less any grossed-up relief at source contribution. No Gift Aid or other reliefs.'
      : 'Adjusted net income, which drives the personal allowance taper and the High Income Child Benefit Charge, is gross pay: no pension contribution, Gift Aid or other reliefs.',
    ...pensionAssumptions(inputs.pension),
    ...(inputs.pension ? ['Pension contributions above gross pay, and relief at source with no earnings, are not modelled.'] : []),
    policy.taperRounding === 'exact'
      ? 'Personal allowance taper: the reduction is exact, with nothing rounded until the result.'
      : 'Personal allowance taper: the reduction is rounded down to a whole pound.',
    'National Insurance: the employee’s contributions only, at the standard (category A) rates.',
    ...(plans.length > 0
      ? [
          'Student loans: worked out on National Insurance-able pay, which salary sacrifice lowers and net pay and relief at source contributions do not. With more than one plan, one repayment is taken at the lowest threshold; a postgraduate loan is repaid as well. Each repayment is rounded down to a whole pound.',
        ]
      : []),
    ...childBenefitAssumptions(inputs.childBenefit),
    'Rounding: each band’s tax, each National Insurance rate’s contribution and the monthly and weekly figures are rounded to the nearest penny; nothing is rounded before that.',
    'Monthly and weekly figures are the annual ones divided evenly; they are not payslip figures.',
  ]
}

/**
 * Take-home pay for a year of employment income: gross, income tax, employee
 * NI, student loan, the pension contribution out of pay and the High Income
 * Child Benefit Charge, then net, as annual, monthly and weekly views, with
 * the Child Benefit received beside them and the assumptions behind them.
 * Refuses, listing every unverified value, if the config lacks any value these
 * need (the relief-at-source rate only with relief at source, Child Benefit
 * values only with Child Benefit).
 */
export function takeHome(inputs: TaxInputs, config: TaxYearConfig, policy: ModellingPolicy): TakeHomeResult | Refusal {
  const grossPay = checkAmount(inputs.grossPay, 'gross pay')
  const region = checkRegion(inputs.region)
  const plans = checkPlans(inputs.studentLoans)
  const pension = checkPension(inputs.pension)
  const childBenefit = inputs.childBenefit === undefined ? undefined : checkChildBenefit(inputs.childBenefit)
  checkPolicy(policy)
  const paths: LeafPath[] = [
    ...ALLOWANCE_PATHS,
    BAND_PATHS[region],
    ...NI_PATHS,
    ...plans.flatMap(planPaths),
    ...pensionPaths(pension),
    ...(childBenefit ? CHILD_BENEFIT_PATHS : []),
  ]
  const granted = requireVerified(config, paths)
  if (!granted.ok) return granted
  const { values } = granted

  const effect = pensionEffect(grossPay, pension, values[RAS_PATH])
  const tax = computeIncomeTax(grossPay, effect, region, values, policy, config.id)
  const ni = computeNI(effect.niablePay, values, config.id)
  // The student loan is worked out on NI-able pay: the employer's secondary NIC pay (decisions D5 and G6).
  const loans = computeStudentLoan(plans, ni.niablePay, values, config.id)
  const charge = childBenefit ? computeHicbc(effect.ani, childBenefit, values, policy, config.id) : null
  const contribution = pension?.contribution ?? ZERO
  const hicbcCharge = charge?.charge ?? ZERO
  const received = charge?.childBenefit ?? ZERO
  const net = [tax.total, ni.total, loans.total, contribution, hicbcCharge].reduce((left, deduction) => subtract(left, deduction), grossPay)
  const annual = {
    gross: grossPay,
    incomeTax: tax.total,
    nationalInsurance: ni.total,
    studentLoan: loans.total,
    pension: contribution,
    hicbc: hicbcCharge,
    net,
    childBenefit: received,
    netIncludingChildBenefit: add(net, received),
  }
  return {
    ok: true,
    taxYear: config.id,
    estimate: true,
    inputs: {
      grossPay,
      region,
      studentLoans: [...inputs.studentLoans],
      ...(pension ? { pension: { method: pension.method, contribution: pension.contribution } } : {}),
      ...(childBenefit ? { childBenefit: { children: childBenefit.children, payments: childBenefit.payments } } : {}),
    },
    policy: { taperRounding: policy.taperRounding, childBenefitWeeks: policy.childBenefitWeeks },
    incomeTax: tax,
    nationalInsurance: ni,
    studentLoan: loans,
    pension: pension ? pensionResult(grossPay, effect, pension, config.id) : null,
    adjustedNetIncome: aniResult(grossPay, effect, config.id),
    hicbc: charge,
    annual: view('annual', 'Annual: the tax year’s figures', annual, 1),
    monthly: view('monthly', 'Monthly: each annual figure divided by the months in a year, to the nearest penny', annual, MONTHS_PER_YEAR),
    weekly: view('weekly', 'Weekly: each annual figure divided by the weeks in a year, to the nearest penny', annual, WEEKS_PER_YEAR),
    assumptions: assumptions(inputs, plans, policy),
  }
}
