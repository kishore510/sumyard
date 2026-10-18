/*
 * FOR TESTS ONLY. An independent reference for the optimiser's engine tests:
 * the same published rules written a second way (plain BigInt fractions, no
 * money.ts exact helpers, no code shared with calc.ts), so a test can derive
 * its expected value from the config without calling the engine. Figures come
 * only from the config passed in.
 */

import type { TaxBand, TaxYearConfig } from '@/config/tax/schema'
import { requireVerified } from '@/config/tax/sourced'
import type { Money, Ratio } from '@/lib/money'
import type {
  ChildBenefitInput,
  ModellingPolicy,
  PensionInput,
  PensionSavingsInput,
  Region,
  StudentLoanPlanId,
  TaxInputs,
  ThresholdId,
} from '../types'

export const REFERENCE_PATHS = [
  'incomeTax.personalAllowance',
  'incomeTax.taperStart',
  'incomeTax.taperRate',
  'incomeTax.bands.rUK',
  'incomeTax.bands.scotland',
  'nationalInsurance.employee.primaryThreshold',
  'nationalInsurance.employee.upperEarningsLimit',
  'nationalInsurance.employee.mainRate',
  'nationalInsurance.employee.additionalRate',
  'studentLoans.plan1.threshold',
  'studentLoans.plan1.rate',
  'studentLoans.plan2.threshold',
  'studentLoans.plan2.rate',
  'studentLoans.plan4.threshold',
  'studentLoans.plan4.rate',
  'studentLoans.plan5.threshold',
  'studentLoans.plan5.rate',
  'studentLoans.postgraduate.threshold',
  'studentLoans.postgraduate.rate',
  'pension.reliefAtSourceRate',
  'childBenefit.weeklyRates.eldestOrOnly',
  'childBenefit.weeklyRates.additionalChild',
  'childBenefit.hicbc.threshold',
  'childBenefit.hicbc.fullChargeAt',
  'childBenefit.hicbc.incomePerPercent',
  'pension.annualAllowance',
  'pension.taper.thresholdIncome',
  'pension.taper.adjustedIncome',
  'pension.taper.minimumAllowance',
  'pension.taper.reductionRate',
  'pension.carryForward.yearsBack',
  'pension.moneyPurchaseAnnualAllowance',
  'childcare.taxFreeChildcare.incomeLimit',
  'childcare.thirtyHours.incomeLimit',
] as const

/** Every value the engine reads, straight from the config (throws if one is unverified). */
export function configValues(config: TaxYearConfig) {
  const granted = requireVerified(config, REFERENCE_PATHS)
  if (!granted.ok) throw new Error(`reference: ${config.id} has unverified values: ${granted.unverified.join(', ')}`)
  const v = granted.values
  const plan = (id: StudentLoanPlanId) => ({
    threshold: v[`studentLoans.${id}.threshold`] as Money,
    rate: v[`studentLoans.${id}.rate`] as Ratio,
  })
  return {
    personalAllowance: v['incomeTax.personalAllowance'],
    taperStart: v['incomeTax.taperStart'],
    taperRate: v['incomeTax.taperRate'],
    bands: { rUK: v['incomeTax.bands.rUK'], scotland: v['incomeTax.bands.scotland'] } as Record<Region, readonly TaxBand[]>,
    ni: {
      primaryThreshold: v['nationalInsurance.employee.primaryThreshold'],
      upperEarningsLimit: v['nationalInsurance.employee.upperEarningsLimit'],
      mainRate: v['nationalInsurance.employee.mainRate'],
      additionalRate: v['nationalInsurance.employee.additionalRate'],
    },
    plans: {
      plan1: plan('plan1'),
      plan2: plan('plan2'),
      plan4: plan('plan4'),
      plan5: plan('plan5'),
      postgraduate: plan('postgraduate'),
    } as Record<StudentLoanPlanId, { threshold: Money; rate: Ratio }>,
    reliefAtSourceRate: v['pension.reliefAtSourceRate'],
    childBenefit: {
      eldestOrOnly: v['childBenefit.weeklyRates.eldestOrOnly'],
      additionalChild: v['childBenefit.weeklyRates.additionalChild'],
      threshold: v['childBenefit.hicbc.threshold'],
      fullChargeAt: v['childBenefit.hicbc.fullChargeAt'],
      incomePerPercent: v['childBenefit.hicbc.incomePerPercent'],
    },
    annualAllowance: {
      standard: v['pension.annualAllowance'],
      thresholdIncomeLimit: v['pension.taper.thresholdIncome'],
      adjustedIncomeLimit: v['pension.taper.adjustedIncome'],
      minimum: v['pension.taper.minimumAllowance'],
      reductionRate: v['pension.taper.reductionRate'],
      yearsBack: v['pension.carryForward.yearsBack'],
      moneyPurchase: v['pension.moneyPurchaseAnnualAllowance'],
    },
    childcare: {
      taxFreeChildcare: v['childcare.taxFreeChildcare.incomeLimit'],
      thirtyHours: v['childcare.thirtyHours.incomeLimit'],
    },
  }
}

/** A fraction of a penny: [numerator, denominator], denominator above zero. */
export type Frac = readonly [bigint, bigint]

const big = (pence: number) => BigInt(pence)
const sub = ([a, b]: Frac, [c, d]: Frac): Frac => [a * d - c * b, b * d]
const less = ([a, b]: Frac, [c, d]: Frac) => a * d < c * b
const clamp = (x: Frac, lo: Frac, hi: Frac | null): Frac => (less(x, lo) ? lo : hi && less(hi, x) ? hi : x)
const times = ([a, b]: Frac, r: Ratio): Frac => [a * big(r.numerator), b * big(r.denominator)]
const plus = ([a, b]: Frac, [c, d]: Frac): Frac => [a * d + c * b, b * d]
const whole = (pence: number): Frac => [big(pence), 1n]
const NONE: Frac = [0n, 1n]
const smaller = (x: Frac, y: Frac): Frac => (less(y, x) ? y : x)
const sameRate = (a: Ratio, b: Ratio) => big(a.numerator) * big(b.denominator) === big(b.numerator) * big(a.denominator)

/** Exact equality of two fractions. */
export const equalFrac = ([a, b]: Frac, [c, d]: Frac) => a * d === c * b

/** Nearest penny, an exact half away from zero (amounts here are never negative). */
const nearest = ([a, b]: Frac): number => {
  const q = a / b
  return Number(2n * (a - q * b) >= b ? q + 1n : q)
}

const floorPounds = ([a, b]: Frac): number => Number((a / (b * 100n)) * 100n)

/** The personal allowance as a fraction of a penny, under the policy, tapered on the income given (pence or an exact fraction). */
export function referenceAllowance(income: Money | Frac, config: TaxYearConfig, policy: ModellingPolicy): Frac {
  const { personalAllowance, taperStart, taperRate } = configValues(config)
  const full: Frac = [big(personalAllowance), 1n]
  const excess = sub(typeof income === 'number' ? whole(income) : income, whole(taperStart))
  if (!less(NONE, excess)) return full
  let reduction = times(excess, taperRate)
  if (policy.taperRounding === 'wholePoundsDown') reduction = [big(floorPounds(reduction)), 1n]
  const left = sub(full, reduction)
  return less(left, [0n, 1n]) ? [0n, 1n] : left
}

export interface ReferenceTax {
  readonly allowance: number
  readonly taxable: number
  readonly bandIncome: readonly number[]
  readonly bandTax: readonly number[]
  readonly total: number
}

/** Income tax by the published rule: allowance, then each band's rate on the income above its start. */
export function referenceIncomeTax(income: Money, region: Region, config: TaxYearConfig, policy: ModellingPolicy): ReferenceTax {
  const bands = configValues(config).bands[region]
  const allowance = referenceAllowance(income, config, policy)
  const taxable = clamp(sub([big(income), 1n], allowance), [0n, 1n], null)
  const bandIncome: number[] = []
  const bandTax: number[] = []
  bands.forEach((band, i) => {
    const next = bands[i + 1]
    const from: Frac = [big(band.from), 1n]
    const width: Frac | null = next ? [big(next.from) - big(band.from), 1n] : null
    const inBand = clamp(sub(taxable, from), [0n, 1n], width)
    bandIncome.push(nearest(inBand))
    bandTax.push(nearest(times(inBand, band.rate)))
  })
  return {
    allowance: nearest(allowance),
    taxable: nearest(taxable),
    bandIncome,
    bandTax,
    total: bandTax.reduce((a, b) => a + b, 0),
  }
}

/** Employee NI on annual NI-able pay: the main rate between the thresholds, the additional rate above. */
export function referenceNI(pay: Money, config: TaxYearConfig): { main: number; additional: number; total: number } {
  const { primaryThreshold, upperEarningsLimit, mainRate, additionalRate } = configValues(config).ni
  const p: Frac = [big(pay), 1n]
  const mainSlice = clamp(sub(p, [big(primaryThreshold), 1n]), [0n, 1n], [big(upperEarningsLimit) - big(primaryThreshold), 1n])
  const addSlice = clamp(sub(p, [big(upperEarningsLimit), 1n]), [0n, 1n], null)
  const main = nearest(times(mainSlice, mainRate))
  const additional = nearest(times(addSlice, additionalRate))
  return { main, additional, total: main + additional }
}

/** One deduction: the rate on pay above the threshold, rounded down to a whole pound. */
export function referenceRepayment(pay: Money, threshold: Money, rate: Ratio): number {
  const excess = clamp(sub([big(pay), 1n], [big(threshold), 1n]), [0n, 1n], null)
  return floorPounds(times(excess, rate))
}

/* Session G1: pensions, adjusted net income, HICBC. The same published rules written a second way. */

/** A pension contribution's effects, by the GOV.UK rules logged in docs/verification-log.md ("Session G1 lookups"). */
export interface ReferencePension {
  readonly taxablePay: Frac
  readonly niablePay: Frac
  /** Adjusted net income. */
  readonly ani: Frac
  /** How far each band above the basic rate band moves up. */
  readonly extension: Frac
  /** What goes into the pension. */
  readonly pot: Frac
  /** What comes out of pay. */
  readonly cost: Frac
}

/** Net ÷ (1 − rate): what goes in for a relief at source payment ("for every £1 ... take £1.25" at the basic rate). */
export function referenceGrossUp(net: Money, config: TaxYearConfig): Frac {
  const rate = configValues(config).reliefAtSourceRate
  return [big(net) * big(rate.denominator), big(rate.denominator) - big(rate.numerator)]
}

/**
 * `benefits` (session 1b-i, decision B1): a taxable benefit in kind is taxable employment income and in net income (the ANI
 * guidance's step 1, PTM057100), but Class 1A rather than Class 1 (NIM13090), so it is not NI-able pay or the student loan base.
 */
export function referencePension(
  grossPay: Money,
  pension: PensionInput | undefined,
  config: TaxYearConfig,
  benefits: Money = 0 as Money,
): ReferencePension {
  const gross = whole(grossPay)
  const withBenefits = (pay: Frac) => plus(pay, whole(benefits))
  if (!pension)
    return { taxablePay: withBenefits(gross), niablePay: gross, ani: withBenefits(gross), extension: NONE, pot: NONE, cost: NONE }
  const c = whole(pension.contribution)
  switch (pension.method) {
    case 'salarySacrifice':
      return {
        taxablePay: withBenefits(sub(gross, c)),
        niablePay: sub(gross, c),
        ani: withBenefits(sub(gross, c)),
        extension: NONE,
        pot: c,
        cost: c,
      }
    case 'netPay':
      return {
        taxablePay: withBenefits(sub(gross, c)),
        niablePay: gross,
        ani: withBenefits(sub(gross, c)),
        extension: NONE,
        pot: c,
        cost: c,
      }
    case 'reliefAtSource': {
      const g = referenceGrossUp(pension.contribution, config)
      return { taxablePay: withBenefits(gross), niablePay: gross, ani: withBenefits(sub(gross, g)), extension: g, pot: g, cost: c }
    }
  }
}

/** Exact income tax on taxable pay, the allowance tapered on ANI, every band above the basic rate band moved up by the extension. */
export function referenceExactTax(
  taxablePay: Frac,
  ani: Frac,
  extension: Frac,
  region: Region,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): { taxable: Frac; bandIncome: Frac[]; bandTax: Frac[]; starts: Frac[] } {
  const values = configValues(config)
  const bands = values.bands[region]
  const basic = bands.findIndex((band) => sameRate(band.rate, values.reliefAtSourceRate))
  const starts = bands.map((band, i) => (i > basic && basic >= 0 ? plus(whole(band.from), extension) : whole(band.from)))
  const taxable = clamp(sub(taxablePay, referenceAllowance(ani, config, policy)), NONE, null)
  const bandIncome = starts.map((start, i) => {
    const next = starts[i + 1]
    return clamp(sub(taxable, start), NONE, next ? sub(next, start) : null)
  })
  const bandTax = bandIncome.map((income, i) => times(income, bands[i]!.rate))
  return { taxable, bandIncome, bandTax, starts }
}

/** Income tax with a pension, each band's tax to the nearest penny. */
export function referenceIncomeTaxWith(
  grossPay: Money,
  pension: PensionInput | undefined,
  region: Region,
  config: TaxYearConfig,
  policy: ModellingPolicy,
  benefits: Money = 0 as Money,
): ReferenceTax & { ani: number } {
  const p = referencePension(grossPay, pension, config, benefits)
  const { taxable, bandIncome, bandTax } = referenceExactTax(p.taxablePay, p.ani, p.extension, region, config, policy)
  const rounded = bandTax.map(nearest)
  return {
    allowance: nearest(referenceAllowance(p.ani, config, policy)),
    taxable: nearest(taxable),
    bandIncome: bandIncome.map(nearest),
    bandTax: rounded,
    total: rounded.reduce((a, b) => a + b, 0),
    ani: nearest(p.ani),
  }
}

/**
 * Higher-rate relief on a relief at source contribution the way the GOV.UK
 * guide states a claim: for each band above the basic rate band, highest
 * first, the band's rate less the relief-at-source rate on the income taxed
 * at that rate, up to the gross contribution in all. Exact.
 */
export function referenceClaimRelief(taxable: Frac, gross: Frac, region: Region, config: TaxYearConfig): Frac {
  const values = configValues(config)
  const bands = values.bands[region]
  const basic = bands.findIndex((band) => sameRate(band.rate, values.reliefAtSourceRate))
  let left = gross
  let relief = NONE
  for (let i = bands.length - 1; i > basic; i--) {
    const band = bands[i]!
    const next = bands[i + 1]
    const inBand = clamp(sub(taxable, whole(band.from)), NONE, next ? whole(next.from - band.from) : null)
    const used = smaller(inBand, left)
    const extra: Ratio = {
      numerator: band.rate.numerator * values.reliefAtSourceRate.denominator - values.reliefAtSourceRate.numerator * band.rate.denominator,
      denominator: band.rate.denominator * values.reliefAtSourceRate.denominator,
    }
    relief = plus(relief, times(used, extra))
    left = sub(left, used)
  }
  return relief
}

/** Child Benefit for the year and the charge: one percentage point per whole step over the threshold, all of it above the full-charge point. */
export function referenceHicbc(ani: Money | Frac, children: ChildBenefitInput, config: TaxYearConfig, policy: ModellingPolicy) {
  const cb = configValues(config).childBenefit
  const income = typeof ani === 'number' ? whole(ani) : ani
  const weekly = children.children === 0 ? 0n : big(cb.eldestOrOnly) + big(cb.additionalChild) * BigInt(children.children - 1)
  const entitlement = Number(weekly * BigInt(policy.childBenefitWeeks))
  const received = children.payments === 'claimed' ? entitlement : 0
  const over = sub(income, whole(cb.threshold))
  const steps = less(NONE, over) ? Number(over[0] / (over[1] * big(cb.incomePerPercent))) : 0
  const percent = less(whole(cb.fullChargeAt), income) ? 100 : Math.min(100, steps)
  const charge = nearest([BigInt(received) * BigInt(percent), 100n])
  return { entitlement, received, steps, percent, charge }
}

/** Annual take-home with a pension, Child Benefit, taxable benefits and post-tax deductions, from the rules above. */
export function referenceTakeHome(inputs: TaxInputs, config: TaxYearConfig, policy: ModellingPolicy) {
  const benefits = inputs.taxableBenefits ?? (0 as Money)
  const p = referencePension(inputs.grossPay, inputs.pension, config, benefits)
  const tax = referenceIncomeTaxWith(inputs.grossPay, inputs.pension, inputs.region, config, policy, benefits).total
  const niablePay = nearest(p.niablePay) as Money
  const ni = referenceNI(niablePay, config).total
  const values = configValues(config)
  const plans = [...new Set(inputs.studentLoans)]
  const undergraduate = plans.filter((plan) => plan !== 'postgraduate')
  let loan = 0
  if (undergraduate.length > 0) {
    const lowest = undergraduate.reduce((a, b) => (values.plans[b].threshold < values.plans[a].threshold ? b : a))
    loan += referenceRepayment(niablePay, values.plans[lowest].threshold, values.plans[lowest].rate)
  }
  if (plans.includes('postgraduate'))
    loan += referenceRepayment(niablePay, values.plans.postgraduate.threshold, values.plans.postgraduate.rate)
  const child = inputs.childBenefit ? referenceHicbc(p.ani, inputs.childBenefit, config, policy) : null
  const pension = nearest(p.cost)
  const charge = child?.charge ?? 0
  // Post-tax deductions (decision B2) come off net pay and nothing else.
  const deductions = inputs.postTaxDeductions ?? 0
  const net = inputs.grossPay - tax - ni - loan - pension - charge - deductions
  return {
    tax,
    ni,
    loan,
    pension,
    charge,
    deductions,
    net,
    childBenefit: child?.received ?? 0,
    ani: nearest(p.ani),
    pot: nearest(p.pot),
  }
}

/** For tests: a fraction rounded to the nearest penny, and pence as a fraction. */
export const nearestPence = (x: Frac): Money => nearest(x) as Money
export const fracOf = (pence: number): Frac => whole(pence)

/* Session G2: the annual allowance, carry forward, MPAA, the charge, childcare and threshold contributions, written a second way. */

/** Threshold income (PTM057100): net income (taxable pay), plus salary sacrificed, less the gross relief at source contribution. */
export function referenceThresholdIncome(
  grossPay: Money,
  pension: PensionInput | undefined,
  config: TaxYearConfig,
  benefits: Money = 0 as Money,
): Frac {
  const p = referencePension(grossPay, pension, config, benefits)
  if (pension?.method === 'salarySacrifice') return plus(p.taxablePay, whole(pension.contribution))
  if (pension?.method === 'reliefAtSource') return sub(p.taxablePay, p.pot)
  return p.taxablePay
}

/** What the pot gets from the employee, in whole pence (the gross amount to the nearest penny). */
const potPence = (grossPay: Money, pension: PensionInput | undefined, config: TaxYearConfig) =>
  nearest(referencePension(grossPay, pension, config).pot)

/** Adjusted income (PTM057100): net income + net pay contributions + total pension input − member contributions. */
export function referenceAdjustedIncome(
  grossPay: Money,
  pension: PensionInput | undefined,
  employer: Money,
  config: TaxYearConfig,
  benefits: Money = 0 as Money,
): number {
  const p = referencePension(grossPay, pension, config, benefits)
  const netIncome = nearest(p.taxablePay)
  const netPay = pension?.method === 'netPay' ? pension.contribution : 0
  const member = pension && pension.method !== 'salarySacrifice' ? potPence(grossPay, pension, config) : 0
  const employerAll = employer + (pension?.method === 'salarySacrifice' ? pension.contribution : 0)
  const totalInput = member + employerAll
  return netIncome + netPay + (totalInput - member)
}

export interface ReferenceAllowance {
  readonly thresholdIncome: Frac
  readonly adjustedIncome: number
  readonly tapered: boolean
  readonly allowance: number
  readonly carryForward: readonly { yearsAgo: number; available: number; used: number; left: number }[]
  readonly route: 'standard' | 'moneyPurchase'
  readonly available: number
  readonly employee: number
  readonly employer: number
  readonly counted: number
  readonly headroom: number
  readonly excess: number
}

/** The annual allowance position by PTM057100, PTM055100 and the MPAA guidance, money purchase savings only. */
export function referenceAnnualAllowance(inputs: TaxInputs, savings: PensionSavingsInput, config: TaxYearConfig): ReferenceAllowance {
  const aa = configValues(config).annualAllowance
  const benefits = inputs.taxableBenefits ?? (0 as Money)
  const thresholdIncome = referenceThresholdIncome(inputs.grossPay, inputs.pension, config, benefits)
  const adjustedIncome = referenceAdjustedIncome(inputs.grossPay, inputs.pension, savings.employerContribution, config, benefits)
  const tapered = less(whole(aa.thresholdIncomeLimit), thresholdIncome) && adjustedIncome > aa.adjustedIncomeLimit
  let allowance: number = aa.standard
  if (tapered) {
    const reduction = floorPounds(times(whole(adjustedIncome - aa.adjustedIncomeLimit), aa.reductionRate))
    allowance = Math.max(aa.minimum, aa.standard - reduction)
  }
  const sacrificed = inputs.pension?.method === 'salarySacrifice' ? inputs.pension.contribution : 0
  const employee = inputs.pension && inputs.pension.method !== 'salarySacrifice' ? potPence(inputs.grossPay, inputs.pension, config) : 0
  const employer = savings.employerContribution + sacrificed
  const counted = employee + employer
  const years = savings.carryForward.filter((y) => y.yearsAgo <= aa.yearsBack).sort((a, b) => b.yearsAgo - a.yearsAgo)
  const defaultAvailable = allowance + years.reduce((sum, y) => sum + y.amount, 0)
  const route = savings.moneyPurchaseAnnualAllowance && aa.moneyPurchase < defaultAvailable ? 'moneyPurchase' : 'standard'
  let needed = route === 'standard' ? Math.max(0, counted - allowance) : 0
  const carryForward = years.map((y) => {
    const used = Math.min(y.amount, needed)
    needed -= used
    return { yearsAgo: y.yearsAgo, available: y.amount as number, used, left: y.amount - used }
  })
  const available = route === 'moneyPurchase' ? aa.moneyPurchase : defaultAvailable
  return {
    thresholdIncome,
    adjustedIncome,
    tapered,
    allowance,
    carryForward,
    route,
    available,
    employee,
    employer,
    counted,
    headroom: Math.max(0, available - counted),
    excess: Math.max(0, counted - available),
  }
}

/** The charge (PTM056110): the excess stacked on taxable income through the bands, nothing below the basic rate. Each slice to the nearest penny. */
export function referenceAllowanceCharge(
  excess: number,
  taxable: Frac,
  extension: Frac,
  region: Region,
  config: TaxYearConfig,
): { slices: number[]; total: number } {
  const values = configValues(config)
  const bands = values.bands[region]
  const basic = bands.findIndex((band) => sameRate(band.rate, values.reliefAtSourceRate))
  const starts = bands.map((band, i) => (i > basic ? plus(whole(band.from), extension) : whole(band.from)))
  const top = plus(taxable, whole(excess))
  const slices = bands.map((_band, i) => {
    const lo = less(starts[i]!, taxable) ? taxable : starts[i]!
    const next = starts[i + 1]
    const hi = next && less(next, top) ? next : top
    const inBand = less(lo, hi) ? sub(hi, lo) : NONE
    const rate = bands[Math.max(i, basic)]!.rate
    return nearest(times(inBand, rate))
  })
  return { slices, total: slices.reduce((a, b) => a + b, 0) }
}

/** Exact taxable income and the band extension for take-home inputs, for the charge. */
export function referenceTaxable(inputs: TaxInputs, config: TaxYearConfig, policy: ModellingPolicy): { taxable: Frac; extension: Frac } {
  const p = referencePension(inputs.grossPay, inputs.pension, config, inputs.taxableBenefits)
  return { taxable: referenceExactTax(p.taxablePay, p.ani, p.extension, inputs.region, config, policy).taxable, extension: p.extension }
}

/** Eligible on income: adjusted net income not over the limit. */
export const referenceChildcareEligible = (ani: Frac, limit: Money) => !less(whole(limit), ani)

/** Each threshold's exact value and the measure it applies to, from the config. */
export function referenceThresholds(config: TaxYearConfig): Record<ThresholdId, { limit: Frac; measure: 'ani' | 'threshold' }> {
  const v = configValues(config)
  const zero: Frac = plus(whole(v.taperStart), [big(v.personalAllowance) * big(v.taperRate.denominator), big(v.taperRate.numerator)])
  return {
    personalAllowanceTaperStart: { limit: whole(v.taperStart), measure: 'ani' },
    personalAllowanceTaperEnd: { limit: zero, measure: 'ani' },
    hicbcThreshold: { limit: whole(v.childBenefit.threshold), measure: 'ani' },
    hicbcFullCharge: { limit: whole(v.childBenefit.fullChargeAt), measure: 'ani' },
    taxFreeChildcareLimit: { limit: whole(v.childcare.taxFreeChildcare), measure: 'ani' },
    thirtyHoursLimit: { limit: whole(v.childcare.thirtyHours), measure: 'ani' },
    annualAllowanceThresholdIncome: { limit: whole(v.annualAllowance.thresholdIncomeLimit), measure: 'threshold' },
  }
}

/** The largest contribution whose gross amount is not over gross pay, found by searching whole pence. */
export function referenceMaximumContribution(grossPay: Money, method: PensionInput['method'], config: TaxYearConfig): number {
  let lo = 0
  let hi = grossPay as number
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const pot = referencePension(grossPay, { method, contribution: mid as Money }, config).pot
    if (less(whole(grossPay), pot)) hi = mid - 1
    else lo = mid
  }
  return lo
}

/**
 * The smallest contribution (whole pence) at which the measure is at or under
 * the limit, by searching whole pence over the reference's own measure: an
 * independent check on the engine's closed form. Null if even the largest
 * contribution leaves it over.
 */
export function referenceThresholdContribution(
  grossPay: Money,
  method: PensionInput['method'],
  limit: Frac,
  measure: 'ani' | 'threshold',
  config: TaxYearConfig,
  benefits: Money = 0 as Money,
): number | null {
  const at = (c: number): Frac => {
    const pension = { method, contribution: c as Money }
    return measure === 'ani'
      ? referencePension(grossPay, pension, config, benefits).ani
      : referenceThresholdIncome(grossPay, pension, config, benefits)
  }
  const max = referenceMaximumContribution(grossPay, method, config)
  if (less(limit, at(max))) return null
  let lo = 0
  let hi = max
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (less(limit, at(mid))) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The measure at a contribution, as a fraction, for tests. */
export function referenceMeasure(grossPay: Money, pension: PensionInput, measure: 'ani' | 'threshold', config: TaxYearConfig): Frac {
  return measure === 'ani' ? referencePension(grossPay, pension, config).ani : referenceThresholdIncome(grossPay, pension, config)
}

/** True if a is under b. */
export const lessFrac = less
