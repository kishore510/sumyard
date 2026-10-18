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
import { DEFAULT_SWEEP_STEP, MAX_SWEEP_POINTS } from '@/lib/sweep'
import {
  type AdjustedNetIncomeResult,
  type AnnualAllowanceChargeResult,
  type AnnualAllowanceResult,
  type BandSlice,
  BENEFIT_PAYMENTS,
  type BenefitInput,
  type BenefitTotals,
  type CarryForwardUse,
  CHILD_BENEFIT_PAYMENTS,
  CHILDCARE_SCHEMES,
  type ChargeSlice,
  type ChildBenefitInput,
  type ChildcareResult,
  type ChildcareScheme,
  type Cliff,
  type CliffKind,
  type EmployeeNIResult,
  type EngineWarning,
  type HicbcResult,
  type IncomeTaxResult,
  type ModellingPolicy,
  type NiSlice,
  type OptimiseOptions,
  type OptimiseResult,
  type OptimiserInputs,
  type OptimiserPoint,
  PENSION_METHODS,
  type PensionInput,
  type PensionMethod,
  type PensionResult,
  type PensionSavingsInput,
  type PeriodView,
  type PersonalAllowanceResult,
  type PointReason,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanDeduction,
  type StudentLoanPlanId,
  type StudentLoanResult,
  TAPER_ROUNDINGS,
  type TakeHomeResult,
  type TaxInputs,
  type ThresholdContribution,
  type ThresholdContributionsResult,
  type ThresholdId,
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
 *   for the policy's weeks (G4);
 * - benefit items (B10): salary given up comes off pay before everything
 *   else, and each item is taxed on the greater of its value and the salary
 *   given up, or on its value less a contribution made after tax.
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
 * relief at source with no earnings) is not modelled. Taxable benefits in kind
 * (decision B1) are added to taxable pay and adjusted net income, never to
 * NI-able pay: they are Class 1A, not Class 1 earnings.
 */
function pensionEffect(grossPay: Money, pension: PensionInput | undefined, rate: Ratio | undefined, benefits: Money = ZERO): PensionEffect {
  const cash = cashEffect(grossPay, pension, rate)
  if (compare(benefits, ZERO) === 0) return cash
  return { ...cash, taxablePay: add(cash.taxablePay, benefits), ani: exactAdd(cash.ani, exact(benefits)) }
}

function cashEffect(grossPay: Money, pension: PensionInput | undefined, rate: Ratio | undefined): PensionEffect {
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

/** Where each band starts: relief at source moves every band above the basic rate band up by the gross amount. */
function bandStarts(bands: readonly TaxBand[], extension: ExactPence, basic: number): ExactPence[] {
  return bands.map((band, i) => (i > basic ? exactAdd(exact(band.from), extension) : exact(band.from)))
}

/** Taxable income after the allowance (tapered on adjusted net income), exactly: 'reduced net income' (PTM056120). */
function exactTaxable(effect: PensionEffect, values: AllowanceValues, policy: ModellingPolicy): ExactPence {
  return atLeastNothing(exactSubtract(exact(effect.taxablePay), allowanceLeft(effect.ani, values, policy)))
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
  const starts = bandStarts(bands, extension, basic)
  const taxable = exactTaxable(effect, values, policy)
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

/* Benefit items with what is taken from pay for them (decision B10). */

function checkBenefit(item: BenefitInput): BenefitInput {
  if (!BENEFIT_PAYMENTS.includes(item?.payment)) throw new EngineInputError(`unknown benefit payment ${JSON.stringify(item?.payment)}`)
  checkAmount(item.value, 'a benefit’s value')
  checkAmount(item.taken, 'the amount taken for a benefit')
  return item
}

/**
 * The taxable amount of one benefit item for the year. Before tax and NI (an
 * optional remuneration arrangement): the greater of its value and the salary
 * given up, the "relevant amount" (HMRC’s benefits guide, appendix on optional remuneration; EIM44120). After tax: its
 * value less the contribution, never below nothing (making good, EIM21119).
 * Nothing taken: its value. Exemptions are not modelled (B10).
 */
export function benefitTaxable(item: BenefitInput): Money {
  const { value, taken, payment } = checkBenefit(item)
  return payment === 'beforeTax' ? max(value, taken) : max(ZERO, subtract(value, taken))
}

/** Benefit items summed for the year: the taxable amount, the salary given up and the contributions after tax (B10). */
export function benefitTotals(items: readonly BenefitInput[]): BenefitTotals {
  let totals: BenefitTotals = { taxable: ZERO, salaryGivenUp: ZERO, paidAfterTax: ZERO }
  for (const item of items) {
    const taxable = benefitTaxable(item)
    const before = item.payment === 'beforeTax'
    totals = {
      taxable: add(totals.taxable, taxable),
      salaryGivenUp: before ? add(totals.salaryGivenUp, item.taken) : totals.salaryGivenUp,
      paidAfterTax: before ? totals.paidAfterTax : add(totals.paidAfterTax, item.taken),
    }
  }
  return totals
}

const givesUpSalary = (items: readonly BenefitInput[]) =>
  items.some((item) => item.payment === 'beforeTax' && compare(item.taken, ZERO) > 0)

/* Take-home pay. */

function view(period: PeriodView['period'], label: string, annual: Omit<PeriodView, 'period' | 'label'>, divisor: number): PeriodView {
  const part = (amount: Money) => (divisor === 1 ? amount : mulRound(amount, ratio(1, divisor), 'nearest'))
  return {
    period,
    label,
    gross: part(annual.gross),
    benefitSacrifice: part(annual.benefitSacrifice),
    incomeTax: part(annual.incomeTax),
    nationalInsurance: part(annual.nationalInsurance),
    studentLoan: part(annual.studentLoan),
    pension: part(annual.pension),
    hicbc: part(annual.hicbc),
    benefitPayments: part(annual.benefitPayments),
    postTaxDeductions: part(annual.postTaxDeductions),
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

function benefitAssumptions({ benefits, deductions, items, totals }: CheckedInputs): string[] {
  return [
    ...(givesUpSalary(items)
      ? [
          'Benefits taken through salary sacrifice: the salary given up comes off taxable pay, National Insurance-able pay, student loan pay and take-home, and the benefit is taxed on the higher of its value and the salary given up (the general rule for optional remuneration arrangements). Exemptions some benefits keep, and older arrangements’ protection, are not modelled. Nothing is added back to threshold income for the annual allowance.',
        ]
      : []),
    ...(compare(totals.paidAfterTax, ZERO) > 0
      ? [
          'Contributions to benefits paid after tax come off take-home and take the benefit’s taxable value down, not below nothing. They are assumed paid in time to count for the tax year.',
        ]
      : []),
    ...(compare(benefits, ZERO) > 0
      ? [
          'Taxable benefits in kind are taken as entered: their taxable value for the year, after anything paid towards them. They are added to taxable pay and adjusted net income, not to National Insurance-able pay or student loan pay, and are not paid in cash.',
          'The tax on benefits is worked out on the year’s figures, however it is collected (through the tax code, payrolled benefits or Self Assessment), so payslips can differ. The National Insurance the employer pays on benefits is the employer’s cost and is not taken from take-home.',
        ]
      : []),
    ...(compare(deductions, ZERO) > 0
      ? ['Post-tax deductions come off take-home pay only: they change no tax, National Insurance, student loan or adjusted net income.']
      : []),
  ]
}

function assumptions(inputs: TaxInputs, checked: CheckedInputs, policy: ModellingPolicy): string[] {
  const { plans } = checked
  return [
    'These are estimates for the tax year, not payroll or Self Assessment figures.',
    compare(checked.benefits, ZERO) > 0
      ? 'Employment income only, with any taxable benefits in kind: no savings, dividends, property, self-employment or other income.'
      : 'Employment income only: no savings, dividends, property, self-employment or other income, and no benefits in kind.',
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
    ...benefitAssumptions(checked),
    'Rounding: each band’s tax, each National Insurance rate’s contribution and the monthly and weekly figures are rounded to the nearest penny; nothing is rounded before that.',
    'Monthly and weekly figures are the annual ones divided evenly; they are not payslip figures.',
  ]
}

/**
 * Take-home pay for a year of employment income: gross, salary given up for
 * benefits, income tax, employee NI, student loan, the pension contribution
 * out of pay, the High Income Child Benefit Charge, benefit contributions
 * after tax and post-tax deductions, then net, as annual, monthly and weekly
 * views, with
 * the Child Benefit received beside them and the assumptions behind them.
 * Refuses, listing every unverified value, if the config lacks any value these
 * need (the relief-at-source rate only with relief at source, Child Benefit
 * values only with Child Benefit).
 */
export function takeHome(inputs: TaxInputs, config: TaxYearConfig, policy: ModellingPolicy): TakeHomeResult | Refusal {
  const checked = checkInputs(inputs)
  checkPolicy(policy)
  const paths = takeHomePaths(checked)
  const granted = requireVerified(config, paths)
  if (!granted.ok) return granted
  return computeTakeHome(checked, inputs, granted.values, policy, config.id)
}

/** Checked take-home inputs. */
interface CheckedInputs {
  readonly grossPay: Money
  /** Gross pay less salary given up for benefits: what the pension, tax, NI and student loan steps start from (B10). */
  readonly cashPay: Money
  readonly region: Region
  readonly plans: StudentLoanPlanId[]
  readonly pension: PensionInput | undefined
  readonly childBenefit: ChildBenefitInput | undefined
  /** Every taxable benefit: the single figure plus the items' taxable amounts. */
  readonly benefits: Money
  readonly deductions: Money
  readonly items: readonly BenefitInput[]
  readonly totals: BenefitTotals
}

function checkInputs(inputs: TaxInputs): CheckedInputs {
  const grossPay = checkAmount(inputs.grossPay, 'gross pay')
  const items = inputs.benefits ?? []
  if (!Array.isArray(items)) throw new EngineInputError('benefits must be a list')
  const totals = benefitTotals(items)
  if (compare(totals.salaryGivenUp, grossPay) > 0)
    throw new EngineInputError('the salary given up for benefits is more than gross pay; that is not modelled')
  return {
    grossPay,
    cashPay: subtract(grossPay, totals.salaryGivenUp),
    region: checkRegion(inputs.region),
    plans: checkPlans(inputs.studentLoans),
    pension: checkPension(inputs.pension),
    childBenefit: inputs.childBenefit === undefined ? undefined : checkChildBenefit(inputs.childBenefit),
    benefits: add(checkAmount(inputs.taxableBenefits ?? ZERO, 'taxable benefits'), totals.taxable),
    deductions: checkAmount(inputs.postTaxDeductions ?? ZERO, 'post-tax deductions'),
    items,
    totals,
  }
}

/** Every value take-home needs for these inputs. */
function takeHomePaths({ region, plans, pension, childBenefit }: CheckedInputs): LeafPath[] {
  return [
    ...ALLOWANCE_PATHS,
    BAND_PATHS[region],
    ...NI_PATHS,
    ...plans.flatMap(planPaths),
    ...pensionPaths(pension),
    ...(childBenefit ? CHILD_BENEFIT_PATHS : []),
  ]
}

function computeTakeHome(
  checked: CheckedInputs,
  inputs: TaxInputs,
  values: Values<LeafPath>,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): TakeHomeResult {
  const { grossPay, cashPay, region, plans, pension, childBenefit, benefits, deductions, items, totals } = checked
  // Salary given up for benefits is gone before any other step (B10): the pension, tax, NI and loan start from cash pay.
  const effect = pensionEffect(cashPay, pension, values[RAS_PATH], benefits)
  const tax = computeIncomeTax(grossPay, effect, region, values, policy, taxYear)
  const ni = computeNI(effect.niablePay, values, taxYear)
  // The student loan is worked out on NI-able pay: the employer's secondary NIC pay (decisions D5 and G6).
  const loans = computeStudentLoan(plans, ni.niablePay, values, taxYear)
  const charge = childBenefit ? computeHicbc(effect.ani, childBenefit, values, policy, taxYear) : null
  const contribution = pension?.contribution ?? ZERO
  const hicbcCharge = charge?.charge ?? ZERO
  const received = charge?.childBenefit ?? ZERO
  // Post-tax deductions come off take-home and nothing else (decision B2); so do contributions to benefits after tax (B10).
  const net = [totals.salaryGivenUp, tax.total, ni.total, loans.total, contribution, hicbcCharge, deductions, totals.paidAfterTax].reduce(
    (left, deduction) => subtract(left, deduction),
    grossPay,
  )
  const annual = {
    gross: grossPay,
    benefitSacrifice: totals.salaryGivenUp,
    incomeTax: tax.total,
    nationalInsurance: ni.total,
    studentLoan: loans.total,
    pension: contribution,
    hicbc: hicbcCharge,
    benefitPayments: totals.paidAfterTax,
    postTaxDeductions: deductions,
    net,
    childBenefit: received,
    netIncludingChildBenefit: add(net, received),
  }
  return {
    ok: true,
    taxYear,
    estimate: true,
    inputs: {
      grossPay,
      region,
      studentLoans: [...inputs.studentLoans],
      ...(pension ? { pension: { method: pension.method, contribution: pension.contribution } } : {}),
      ...(childBenefit ? { childBenefit: { children: childBenefit.children, payments: childBenefit.payments } } : {}),
      ...(inputs.taxableBenefits === undefined ? {} : { taxableBenefits: benefits }),
      ...(inputs.postTaxDeductions === undefined ? {} : { postTaxDeductions: deductions }),
      ...(inputs.benefits === undefined ? {} : { benefits: items.map(({ value, taken, payment }) => ({ value, taken, payment })) }),
    },
    policy: { taperRounding: policy.taperRounding, childBenefitWeeks: policy.childBenefitWeeks },
    incomeTax: tax,
    nationalInsurance: ni,
    studentLoan: loans,
    pension: pension ? pensionResult(grossPay, effect, pension, taxYear) : null,
    adjustedNetIncome: aniResult(grossPay, effect, taxYear),
    hicbc: charge,
    benefits: totals,
    // PAYE's pay (B17): the year's taxable pay, benefits in kind included, as if payrolled.
    payrollPay: effect.taxablePay,
    annual: view('annual', 'Annual: the tax year’s figures', annual, 1),
    monthly: view('monthly', 'Monthly: each annual figure divided by the months in a year, to the nearest penny', annual, MONTHS_PER_YEAR),
    weekly: view('weekly', 'Weekly: each annual figure divided by the weeks in a year, to the nearest penny', annual, WEEKS_PER_YEAR),
    warnings: [
      ...(compare(net, ZERO) < 0 ? [warn('takeHomeBelowNothing')] : []),
      ...(givesUpSalary(items) ? [warn('benefitSalarySacrifice')] : []),
    ],
    assumptions: assumptions(inputs, checked, policy),
  }
}

/* Session G2: the annual allowance, carry forward, the childcare check and optimise() (decisions G7 to G14). */

const AA_PATHS = [
  'pension.annualAllowance',
  'pension.taper.thresholdIncome',
  'pension.taper.adjustedIncome',
  'pension.taper.minimumAllowance',
  'pension.taper.reductionRate',
  'pension.carryForward.yearsBack',
] as const
const MPAA_PATH = 'pension.moneyPurchaseAnnualAllowance' as const
const CHILDCARE_PATHS = {
  taxFreeChildcare: 'childcare.taxFreeChildcare.incomeLimit',
  thirtyHours: 'childcare.thirtyHours.incomeLimit',
} as const satisfies Record<ChildcareScheme, LeafPath>

type AaValues = Values<(typeof AA_PATHS)[number]> & Partial<Values<typeof MPAA_PATH>>
type ChildcareValues = Values<(typeof CHILDCARE_PATHS)[ChildcareScheme]>

const exactMax = (a: ExactPence, b: ExactPence) => (compareExact(a, b) >= 0 ? a : b)
const exactMin = (a: ExactPence, b: ExactPence) => (compareExact(a, b) <= 0 ? a : b)

function checkSavings(savings: PensionSavingsInput): PensionSavingsInput {
  checkAmount(savings?.employerContribution, 'employer contribution')
  if (typeof savings.moneyPurchaseAnnualAllowance !== 'boolean')
    throw new EngineInputError('the money purchase annual allowance flag must be true or false')
  const seen = new Set<number>()
  for (const year of savings.carryForward ?? []) {
    if (!Number.isSafeInteger(year?.yearsAgo) || year.yearsAgo < 1)
      throw new EngineInputError('carry forward years must be whole numbers of one or more')
    if (seen.has(year.yearsAgo)) throw new EngineInputError('each earlier year may appear only once in carry forward')
    seen.add(year.yearsAgo)
    checkAmount(year.amount, 'unused annual allowance')
  }
  return savings
}

/* The charge (G11). */

function computeCharge(
  excess: Money,
  taxable: ExactPence,
  extension: ExactPence,
  region: Region,
  values: BandValues & Values<typeof RAS_PATH>,
  taxYear: TaxYearConfig['id'],
): AnnualAllowanceChargeResult {
  const bands = checkBands(values[BAND_PATHS[region]])
  const basic = basicRateBand(bands, values[RAS_PATH])
  const starts = bandStarts(bands, extension, basic)
  const top = exactAdd(taxable, exact(excess))
  const slices: ChargeSlice[] = bands.map((band, i) => {
    const next = starts[i + 1]
    const low = exactMax(starts[i]!, taxable)
    const high = next ? exactMin(next, top) : top
    const inBand = atLeastNothing(exactSubtract(high, low))
    // Nothing is charged below the basic rate (PTM056110: the Scottish starter rate does not apply).
    const rate = bands[Math.max(i, basic)]!.rate
    return { name: band.name, rate, excess: roundExact(inBand, 'nearest'), charge: roundExact(exactMul(inBand, rate), 'nearest') }
  })
  return {
    ok: true,
    taxYear,
    region,
    excess,
    reducedNetIncome: roundExact(taxable, 'nearest'),
    bands: slices,
    total: slices.reduce((sum, slice) => add(sum, slice.charge), ZERO),
  }
}

/**
 * The annual allowance charge on an excess (PTM056110): the excess is added
 * on top of reduced net income (taxable income after allowances) and taxed at
 * the rates of the bands it falls in, with every band above the basic rate
 * band moved up by any relief at source extension (PTM056120). A part below
 * the basic rate band is charged at the basic rate. Each band's charge to the
 * nearest penny.
 */
export function annualAllowanceCharge(
  excess: Money,
  reducedNetIncome: Money,
  region: Region,
  config: TaxYearConfig,
  basicRateBandExtension: Money = ZERO,
): AnnualAllowanceChargeResult | Refusal {
  checkAmount(excess, 'excess')
  checkAmount(reducedNetIncome, 'reduced net income')
  checkAmount(basicRateBandExtension, 'basic rate band extension')
  checkRegion(region)
  const granted = requireVerified(config, [BAND_PATHS[region], RAS_PATH])
  if (!granted.ok) return granted
  return computeCharge(excess, exact(reducedNetIncome), exact(basicRateBandExtension), region, granted.values, config.id)
}

/* The annual allowance (G7 to G10). */

/** Threshold income (PTM057100): net income, plus salary sacrificed (an arrangement made after the date PTM057100 gives is assumed), less the gross relief at source contribution. */
function thresholdIncome(effect: PensionEffect): ExactPence {
  const sacrificed = effect.pension?.method === 'salarySacrifice' ? exact(effect.pension.contribution) : NOTHING
  return exactSubtract(exactAdd(exact(effect.taxablePay), sacrificed), effect.reliefAtSource)
}

/** Pension savings counted (PTM053200): the gross employee contribution as it reaches the pot, and employer contributions with any salary sacrifice. */
function counted(effect: PensionEffect, savings: PensionSavingsInput) {
  const method = effect.pension?.method
  const employee = method && method !== 'salarySacrifice' ? roundExact(effect.gross, 'nearest') : ZERO
  const employer = add(savings.employerContribution, method === 'salarySacrifice' ? effect.pension!.contribution : ZERO)
  return { employee, employer, total: add(employee, employer) }
}

interface AllowancePosition {
  readonly thresholdIncome: ExactPence
  readonly adjustedIncome: Money
  readonly tapered: boolean
  readonly allowance: Money
  readonly carryForward: readonly CarryForwardUse[]
  readonly outOfTime: boolean
  readonly route: 'standard' | 'moneyPurchase'
  readonly available: Money
  readonly counted: { readonly employee: Money; readonly employer: Money; readonly total: Money }
}

function allowancePosition(effect: PensionEffect, savings: PensionSavingsInput, values: AaValues): AllowancePosition {
  const standard = values['pension.annualAllowance']
  const threshold = thresholdIncome(effect)
  const sums = counted(effect, savings)
  // Adjusted income (PTM057100): net income + net pay contributions + (total pension input − member contributions).
  const netPay = effect.pension?.method === 'netPay' ? effect.pension.contribution : ZERO
  const memberContributions = sums.employee
  const totalInput = sums.total
  const adjustedIncome = add(add(effect.taxablePay, netPay), subtract(totalInput, memberContributions))
  const adjustedLimit = values['pension.taper.adjustedIncome']
  const tapered = compareExact(threshold, exact(values['pension.taper.thresholdIncome'])) > 0 && compare(adjustedIncome, adjustedLimit) > 0
  let allowance = standard
  if (tapered) {
    // Rounded down to a whole pound (PTM057100), never below the minimum.
    const reduction = roundToPounds(
      mulRound(subtract(adjustedIncome, adjustedLimit), values['pension.taper.reductionRate'], 'down'),
      'down',
    )
    allowance = min(standard, max(values['pension.taper.minimumAllowance'], subtract(standard, reduction)))
  }
  const yearsBack = values['pension.carryForward.yearsBack']
  const years = [...savings.carryForward].filter((year) => year.yearsAgo <= yearsBack).sort((a, b) => b.yearsAgo - a.yearsAgo)
  const defaultAvailable = years.reduce((sum, year) => add(sum, year.amount), allowance)
  const mpaa = savings.moneyPurchaseAnnualAllowance ? values[MPAA_PATH] : undefined
  // Carry forward cannot be added to the MPAA; on a tie the default route's figure is used (the MPAA guidance).
  const route = mpaa !== undefined && compare(mpaa, defaultAvailable) < 0 ? 'moneyPurchase' : 'standard'
  // The current year's allowance first, then the earliest year first (PTM055100).
  let needed = route === 'standard' ? max(ZERO, subtract(sums.total, allowance)) : ZERO
  const carryForward = years.map((year) => {
    const used = min(year.amount, needed)
    needed = subtract(needed, used)
    return { yearsAgo: year.yearsAgo, available: year.amount, used, left: subtract(year.amount, used) }
  })
  return {
    thresholdIncome: threshold,
    adjustedIncome,
    tapered,
    allowance,
    carryForward,
    outOfTime: years.length < savings.carryForward.length,
    route,
    available: route === 'moneyPurchase' && mpaa !== undefined ? mpaa : defaultAvailable,
    counted: sums,
  }
}

const WARNINGS = {
  overAllowance:
    'Pension savings are over the available annual allowance: the excess is taxed through Self Assessment (the charge shown is an estimate).',
  overMoneyPurchaseAllowance:
    'Money purchase savings are over the money purchase annual allowance: the excess is taxed, and carry forward cannot reduce it.',
  tapered: 'The annual allowance is tapered: threshold income and adjusted income are both over their limits.',
  carryForwardUsed:
    'Unused allowance from earlier years is used, earliest year first; what is left of the earliest year is lost next year.',
  carryForwardOutOfTime: 'Unused allowance entered for a year beyond the carry forward period is ignored.',
  childcareOverLimit: 'Adjusted net income is over a childcare income limit: the support is lost entirely, not tapered.',
  takeHomeBelowNothing:
    'Take-home pay is below nothing: the deductions and the tax on benefits are more than the pay. It is shown as worked out, not capped.',
  benefitSalarySacrifice:
    'Some benefits taken through salary sacrifice keep a tax exemption or a different value (pension contributions, pensions advice, some childcare, cycle to work, low-emission cars). Each item here follows the general rule: taxed on the higher of its value and the salary given up.',
} as const satisfies Record<EngineWarning['code'], string>

const warn = (code: EngineWarning['code']): EngineWarning => ({ code, message: WARNINGS[code] })

const ALLOWANCE_ASSUMPTIONS = [
  'All pension savings are money purchase (defined contribution): the employee’s contribution grossed up for any relief at source, a salary sacrifice and other employer contributions. Defined benefit savings are not modelled.',
  'Threshold income is gross pay less net pay contributions and gross relief at source contributions; a salary sacrifice is added back, as for an arrangement made after the date the rules set. Adjusted income adds back net pay contributions and adds employer contributions, so no employee contribution lowers it.',
  'Employment income only: no other income, lump sum death benefits, Gift Aid or relief claimed through Self Assessment.',
  'Unused allowance from earlier years is as entered: each year’s own allowance and pension scheme membership are not checked.',
  'The money purchase annual allowance, if set, applies to the whole year (pension flexibly accessed in an earlier year); carry forward cannot be added to it.',
  'The charge on any excess is worked out as if the excess were added on top of taxable income, at the rates of the bands it falls in, nothing below the basic rate; each band’s part is rounded to the nearest penny. Who pays it (Scheme Pays) is not modelled.',
]

function computeAllowance(
  checked: CheckedInputs,
  savings: PensionSavingsInput,
  values: AllowanceValues & BandValues & Values<typeof RAS_PATH> & AaValues,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): AnnualAllowanceResult {
  const effect = pensionEffect(checked.cashPay, checked.pension, values[RAS_PATH], checked.benefits)
  const position = allowancePosition(effect, savings, values)
  const { available, counted: sums } = position
  const excess = max(ZERO, subtract(sums.total, available))
  const used = position.carryForward.reduce((sum, year) => add(sum, year.used), ZERO)
  const charge = computeCharge(excess, exactTaxable(effect, values, policy), effect.reliefAtSource, checked.region, values, taxYear)
  const warnings: EngineWarning[] = []
  if (compare(excess, ZERO) > 0) warnings.push(warn(position.route === 'moneyPurchase' ? 'overMoneyPurchaseAllowance' : 'overAllowance'))
  if (position.tapered) warnings.push(warn('tapered'))
  if (compare(used, ZERO) > 0) warnings.push(warn('carryForwardUsed'))
  if (position.outOfTime) warnings.push(warn('carryForwardOutOfTime'))
  const standard = values['pension.annualAllowance']
  return {
    ok: true,
    taxYear,
    thresholdIncome: roundExact(position.thresholdIncome, 'nearest'),
    adjustedIncome: position.adjustedIncome,
    tapered: position.tapered,
    standardAllowance: standard,
    taperReduction: subtract(standard, position.allowance),
    allowance: position.allowance,
    carryForward: position.carryForward,
    carryForwardUsed: used,
    moneyPurchaseAnnualAllowance: savings.moneyPurchaseAnnualAllowance ? (values[MPAA_PATH] ?? null) : null,
    route: position.route,
    allowanceAvailable: available,
    counted: sums,
    headroom: max(ZERO, subtract(available, sums.total)),
    excess,
    charge,
    warnings,
    assumptions: ALLOWANCE_ASSUMPTIONS,
  }
}

const allowancePaths = (savings: PensionSavingsInput): LeafPath[] => [
  ...AA_PATHS,
  ...(savings.moneyPurchaseAnnualAllowance ? [MPAA_PATH] : []),
]

/**
 * The annual allowance for the year, money purchase savings only: the taper
 * (threshold income and adjusted income both over their limits, the reduction
 * rounded down to a pound, never below the minimum), carry forward (the
 * current year first, then the earliest year), the MPAA if flagged, what is
 * counted, headroom, excess, the charge on the excess and warnings. A
 * contribution over the allowance is never capped.
 */
export function annualAllowanceCheck(
  inputs: TaxInputs,
  savings: PensionSavingsInput,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): AnnualAllowanceResult | Refusal {
  const checked = checkInputs(inputs)
  checkSavings(savings)
  checkPolicy(policy)
  const granted = requireVerified(config, [...allowancePaths(savings), ...ALLOWANCE_PATHS, BAND_PATHS[checked.region], RAS_PATH])
  if (!granted.ok) return granted
  return computeAllowance(checked, savings, granted.values, policy, config.id)
}

/* Childcare (G12). */

const CHILDCARE_ASSUMPTIONS = [
  'Childcare: eligibility is checked on this person’s adjusted net income against each scheme’s limit only; a partner’s income is not checked.',
  'The limit is a cliff: at the limit the support is kept, a penny over it the whole support is lost.',
  'Not checked: minimum expected earnings, the child’s age and circumstances, immigration status, Universal Credit or childcare vouchers, and for Free Childcare for Working Parents living in England.',
]

function computeChildcare(ani: ExactPence, values: ChildcareValues, taxYear: TaxYearConfig['id']): ChildcareResult {
  const schemes = CHILDCARE_SCHEMES.map((scheme) => {
    const incomeLimit = values[CHILDCARE_PATHS[scheme]]
    const gap = exactSubtract(exact(incomeLimit), ani)
    // "over" the limit is not eligible (G12).
    const eligibleOnIncome = compareExact(gap, NOTHING) >= 0
    return {
      scheme,
      incomeLimit,
      eligibleOnIncome,
      headroom: eligibleOnIncome ? roundExact(gap, 'down') : ZERO,
      over: eligibleOnIncome ? ZERO : roundExact(exactSubtract(NOTHING, gap), 'up'),
    }
  })
  return {
    ok: true,
    taxYear,
    adjustedNetIncome: roundExact(ani, 'nearest'),
    cliff: true,
    schemes,
    warnings: schemes.filter((s) => !s.eligibleOnIncome).map(() => warn('childcareOverLimit')),
    assumptions: CHILDCARE_ASSUMPTIONS,
  }
}

/** Eligibility on income for each childcare scheme in the config, on adjusted net income: a cliff at the limit (G12). */
export function childcareCheck(grossPay: Money, pension: PensionInput | undefined, config: TaxYearConfig): ChildcareResult | Refusal {
  checkAmount(grossPay, 'gross pay')
  const checked = checkPension(pension)
  const granted = requireVerified(config, [...Object.values(CHILDCARE_PATHS), ...pensionPaths(checked)])
  if (!granted.ok) return granted
  return computeChildcare(pensionEffect(grossPay, checked, granted.values[RAS_PATH]).ani, granted.values, config.id)
}

/* Threshold contributions (G14). */

interface Threshold {
  readonly id: ThresholdId
  readonly measure: ThresholdContribution['measure']
  readonly limit: ExactPence
}

const hicbcApplies = (childBenefit: ChildBenefitInput | undefined) =>
  childBenefit !== undefined && childBenefit.payments === 'claimed' && childBenefit.children > 0

function optimiserPaths(checked: CheckedInputs, inputs: OptimiserInputs): LeafPath[] {
  return [
    ...takeHomePaths(checked),
    ...allowancePaths(inputs.savings),
    RAS_PATH,
    ...(hicbcApplies(checked.childBenefit) ? CHILD_BENEFIT_PATHS : []),
    ...(inputs.checkChildcare ? Object.values(CHILDCARE_PATHS) : []),
  ]
}

function thresholdList(checked: CheckedInputs, inputs: OptimiserInputs, values: Values<LeafPath>): Threshold[] {
  const start = exact(values['incomeTax.taperStart'])
  const rate = values['incomeTax.taperRate']
  const list: Threshold[] = [{ id: 'personalAllowanceTaperStart', measure: 'adjustedNetIncome', limit: start }]
  // The zero point: the allowance divided by the taper rate, over the taper start.
  if (rate.numerator > 0) {
    const zero = exactAdd(start, exactMul(exact(values['incomeTax.personalAllowance']), ratio(rate.denominator, rate.numerator)))
    list.push({ id: 'personalAllowanceTaperEnd', measure: 'adjustedNetIncome', limit: zero })
  }
  if (hicbcApplies(checked.childBenefit)) {
    list.push({ id: 'hicbcThreshold', measure: 'adjustedNetIncome', limit: exact(values['childBenefit.hicbc.threshold']) })
    list.push({ id: 'hicbcFullCharge', measure: 'adjustedNetIncome', limit: exact(values['childBenefit.hicbc.fullChargeAt']) })
  }
  if (inputs.checkChildcare) {
    list.push({ id: 'taxFreeChildcareLimit', measure: 'adjustedNetIncome', limit: exact(values[CHILDCARE_PATHS.taxFreeChildcare]) })
    list.push({ id: 'thirtyHoursLimit', measure: 'adjustedNetIncome', limit: exact(values[CHILDCARE_PATHS.thirtyHours]) })
  }
  list.push({ id: 'annualAllowanceThresholdIncome', measure: 'thresholdIncome', limit: exact(values['pension.taper.thresholdIncome']) })
  return list
}

/** One less the relief-at-source rate: the payment per pound that goes in. */
const keptShare = (rate: Ratio) => subtractRatio(ratio(1, 1), rate)

/** The largest contribution the engine models: its gross amount equals gross pay at most. */
function maximumContribution(grossPay: Money, method: PensionMethod, rate: Ratio): Money {
  return method === 'reliefAtSource' ? mulRound(grossPay, keptShare(rate), 'down') : grossPay
}

/** The measure at a contribution, exactly, without the engine's check that the gross amount is within gross pay. */
function measureAt(
  measure: ThresholdContribution['measure'],
  grossPay: Money,
  method: PensionMethod,
  contribution: Money,
  rate: Ratio,
  benefits: Money,
): ExactPence {
  const gross =
    method === 'reliefAtSource'
      ? exactMul(exact(contribution), ratio(keptShare(rate).denominator, keptShare(rate).numerator))
      : exact(contribution)
  // Taxable benefits are in net income, so in both measures (decision B1).
  const income = exact(add(grossPay, benefits))
  // Salary sacrifice is added back to threshold income, so it does not lower it.
  if (measure === 'thresholdIncome' && method === 'salarySacrifice') return income
  return exactSubtract(income, gross)
}

function solveThreshold(
  threshold: Threshold,
  checked: CheckedInputs,
  inputs: OptimiserInputs,
  values: Values<LeafPath>,
): ThresholdContribution {
  // Salary given up for benefits is not pay any more: the solver starts from cash pay (B10).
  const { cashPay: grossPay } = checked
  const { method, contribution: current } = inputs.pension
  const rate = values[RAS_PATH]
  const base = { threshold: threshold.id, measure: threshold.measure, limit: roundExact(threshold.limit, 'nearest') }
  const { benefits } = checked
  const over = exactSubtract(measureAt(threshold.measure, grossPay, method, ZERO, rate, benefits), threshold.limit)
  if (threshold.measure === 'thresholdIncome' && method === 'salarySacrifice' && compareExact(over, NOTHING) > 0)
    return { ...base, status: 'unreachable', reason: 'notLoweredByMethod', contribution: null, extra: null, measureAt: null }
  // Closed form: salary sacrifice and net pay lower the measure penny for penny; relief at source by the grossed-up amount.
  const needed = compareExact(over, NOTHING) <= 0 ? NOTHING : method === 'reliefAtSource' ? exactMul(over, keptShare(rate)) : over
  const contribution = roundExact(needed, 'up')
  const at = roundExact(measureAt(threshold.measure, grossPay, method, contribution, rate, benefits), 'nearest')
  const result = { ...base, contribution, measureAt: at }
  if (compare(current, contribution) >= 0) return { ...result, status: 'alreadyMet', reason: null, extra: ZERO }
  const extra = subtract(contribution, current)
  if (compare(contribution, maximumContribution(grossPay, method, rate)) > 0)
    return { ...result, status: 'unreachable', reason: 'overGrossPay', extra }
  const effect = pensionEffect(grossPay, { method, contribution }, rate, benefits)
  const position = allowancePosition(effect, inputs.savings, values)
  if (compare(position.counted.total, position.available) > 0) return { ...result, status: 'unreachable', reason: 'overAllowance', extra }
  return { ...result, status: 'reachable', reason: null, extra }
}

function checkOptimiserInputs(inputs: OptimiserInputs): CheckedInputs {
  if (!inputs?.pension) throw new EngineInputError('the optimiser needs a pension method and the current contribution')
  const checked = checkInputs(inputs)
  checkSavings(inputs.savings)
  if (typeof inputs.checkChildcare !== 'boolean') throw new EngineInputError('checkChildcare must be true or false')
  return checked
}

function computeThresholds(checked: CheckedInputs, inputs: OptimiserInputs, values: Values<LeafPath>): ThresholdContribution[] {
  return thresholdList(checked, inputs, values).map((threshold) => solveThreshold(threshold, checked, inputs, values))
}

/**
 * For each threshold (the personal allowance taper start and zero point, the
 * HICBC threshold and full-charge point with Child Benefit claimed, the
 * childcare limits if asked, on adjusted net income; the threshold income
 * limit on threshold income), the smallest total contribution by the method
 * given that brings the measure to the limit or under, solved in exact pence,
 * and how much more that is than the current contribution.
 */
export function thresholdContributions(
  inputs: OptimiserInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): ThresholdContributionsResult | Refusal {
  const checked = checkOptimiserInputs(inputs)
  checkPolicy(policy)
  const granted = requireVerified(config, optimiserPaths(checked, inputs))
  if (!granted.ok) return granted
  return {
    ok: true,
    taxYear: config.id,
    method: inputs.pension.method,
    currentContribution: inputs.pension.contribution,
    thresholds: computeThresholds(checked, inputs, granted.values),
  }
}

/* optimise() (G13). */

const OPTIMISER_ASSUMPTIONS = [
  'Candidate contributions only: no point is called the best, and none is advice.',
  'The contribution is the only thing that changes: pay, other employer contributions, carry forward and Child Benefit stay as entered.',
  'Annual model: contribution timing within the year (before or after a bonus, say) is not modelled; only the year’s totals count.',
  'Spendable is take-home pay with Child Benefit, less any annual allowance charge. Childcare support is not valued: eligibility is shown, and its loss is a cliff.',
  'Net cost per pound of pension is the spendable income given up against no contribution, per pound more going into the pension (the employee’s contribution, the provider’s relief and other employer contributions).',
  'The marginal rate between two points is the share of each extra pound into the pension that did not come out of spendable income.',
]

interface Evaluated {
  readonly point: Omit<OptimiserPoint, 'reasons' | 'netCostPerPound' | 'marginalRate'>
  readonly percentCharged: number | null
  readonly studentLoan: Money
}

function evaluate(
  contribution: Money,
  checked: CheckedInputs,
  inputs: OptimiserInputs,
  values: Values<LeafPath>,
  policy: ModellingPolicy,
  taxYear: TaxYearConfig['id'],
): Evaluated {
  const pension: PensionInput = { method: inputs.pension.method, contribution }
  const at: CheckedInputs = { ...checked, pension }
  const home = computeTakeHome(at, { ...inputs, pension }, values, policy, taxYear)
  const allowance = computeAllowance(at, inputs.savings, values, policy, taxYear)
  const childcare = inputs.checkChildcare
    ? computeChildcare(pensionEffect(checked.cashPay, pension, values[RAS_PATH], checked.benefits).ani, values, taxYear)
    : null
  const relief = home.pension?.providerRelief ?? ZERO
  const employer = inputs.savings.employerContribution
  const into = { employee: contribution, employer, relief, total: add(add(contribution, employer), relief) }
  return {
    point: {
      contribution,
      extra: subtract(contribution, inputs.pension.contribution),
      takeHome: home.annual.net,
      childBenefit: home.annual.childBenefit,
      takeHomeIncludingChildBenefit: home.annual.netIncludingChildBenefit,
      annualAllowanceCharge: allowance.charge.total,
      spendable: subtract(home.annual.netIncludingChildBenefit, allowance.charge.total),
      pension: into,
      adjustedNetIncome: home.adjustedNetIncome.adjustedNetIncome,
      thresholdIncome: allowance.thresholdIncome,
      annualAllowance: {
        tapered: allowance.tapered,
        allowanceAvailable: allowance.allowanceAvailable,
        counted: allowance.counted.total,
        headroom: allowance.headroom,
        excess: allowance.excess,
      },
      childcare: childcare ? childcare.schemes.map((s) => ({ scheme: s.scheme, eligibleOnIncome: s.eligibleOnIncome })) : [],
      warnings: [...allowance.warnings, ...(childcare?.warnings ?? [])],
    },
    percentCharged: home.hicbc?.percentCharged ?? null,
    studentLoan: home.studentLoan.total,
  }
}

/** Spendable given up per pound more in the pension, as an exact ratio. */
const perPound = (given: Money, more: Money): Ratio => ratio(toPence(given), toPence(more))

function cliffsBetween(prev: Evaluated, next: Evaluated, method: PensionMethod): CliffKind[] {
  const kinds: CliffKind[] = []
  if (prev.percentCharged !== next.percentCharged) kinds.push('hicbcStep')
  if (prev.point.childcare.some((s, i) => s.eligibleOnIncome !== next.point.childcare[i]?.eligibleOnIncome)) kinds.push('childcareLimit')
  if (prev.point.annualAllowance.tapered !== next.point.annualAllowance.tapered) kinds.push('annualAllowanceTaper')
  // Only a salary sacrifice moves the student loan base (G6); repayments move in whole pounds.
  if (method === 'salarySacrifice' && compare(prev.studentLoan, next.studentLoan) !== 0) kinds.push('studentLoanWholePounds')
  return kinds
}

/**
 * Candidate contributions for the method given: a sweep from nothing to the
 * most the engine models, in steps from the options (DEFAULT_SWEEP_STEP from
 * src/lib/sweep.ts if none), plus the current contribution and the threshold
 * points. Each point carries take-home, the annual allowance charge, the
 * pension, the net cost per pound and the marginal rate, the annual allowance
 * position, childcare eligibility if asked, warnings and why it exists. The
 * cliffs between neighbouring points are listed. No point is called the best.
 */
export function optimise(
  inputs: OptimiserInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  options: OptimiseOptions = { step: DEFAULT_SWEEP_STEP, maxPoints: MAX_SWEEP_POINTS },
): OptimiseResult | Refusal {
  const checked = checkOptimiserInputs(inputs)
  checkPolicy(policy)
  const step = checkAmount(options?.step, 'sweep step')
  if (compare(step, ZERO) <= 0) throw new EngineInputError('the sweep step must be above nothing')
  if (!Number.isSafeInteger(options.maxPoints) || options.maxPoints < 1)
    throw new EngineInputError('the most sweep points must be a whole number of one or more')
  const granted = requireVerified(config, optimiserPaths(checked, inputs))
  if (!granted.ok) return granted
  const { values } = granted
  const { method, contribution: current } = inputs.pension
  const maximum = maximumContribution(checked.cashPay, method, values[RAS_PATH])
  const sweeps = wholeSteps(exact(maximum), step) + 1
  if (sweeps > options.maxPoints) throw new EngineInputError('the sweep step is too small for this range: too many points')
  const thresholds = computeThresholds(checked, inputs, values)

  const reasons = new Map<number, PointReason[]>()
  const mark = (contribution: Money, reason: PointReason) => {
    const list = reasons.get(toPence(contribution)) ?? []
    list.push(reason)
    reasons.set(toPence(contribution), list)
  }
  for (let k = 0; k < sweeps; k++) mark(mulRound(step, ratio(k, 1), 'nearest'), { kind: 'sweep' })
  mark(current, { kind: 'current' })
  mark(maximum, { kind: 'maximum' })
  for (const t of thresholds)
    if (t.contribution !== null && compare(t.contribution, maximum) <= 0)
      mark(t.contribution, { kind: 'threshold', threshold: t.threshold })

  const contributions = [...reasons.keys()].sort((a, b) => a - b).map((pence) => pence as Money)
  const evaluated = contributions.map((c) => evaluate(c, checked, inputs, values, policy, config.id))
  const first = evaluated[0]!.point
  const points: OptimiserPoint[] = evaluated.map(({ point }, k) => {
    const prev = k > 0 ? evaluated[k - 1]!.point : null
    return {
      ...point,
      reasons: reasons.get(toPence(point.contribution))!,
      netCostPerPound:
        k === 0 ? null : perPound(subtract(first.spendable, point.spendable), subtract(point.pension.total, first.pension.total)),
      marginalRate:
        prev === null
          ? null
          : (() => {
              const more = subtract(point.pension.total, prev.pension.total)
              return perPound(subtract(more, subtract(prev.spendable, point.spendable)), more)
            })(),
    }
  })
  const cliffs: Cliff[] = evaluated.slice(1).flatMap((next, k) => {
    const prev = evaluated[k]!
    return cliffsBetween(prev, next, method).map((kind) => ({ kind, from: prev.point.contribution, to: next.point.contribution }))
  })
  return {
    ok: true,
    taxYear: config.id,
    estimate: true,
    method,
    currentContribution: current,
    maximumContribution: maximum,
    step,
    points,
    thresholds,
    cliffs,
    assumptions: [...OPTIMISER_ASSUMPTIONS, ...ALLOWANCE_ASSUMPTIONS, ...(inputs.checkChildcare ? CHILDCARE_ASSUMPTIONS : [])],
  }
}
