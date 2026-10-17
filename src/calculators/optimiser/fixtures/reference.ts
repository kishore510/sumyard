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
import type { ModellingPolicy, Region, StudentLoanPlanId } from '../types'

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
  }
}

/** A fraction of a penny: [numerator, denominator], denominator above zero. */
type Frac = readonly [bigint, bigint]

const big = (pence: number) => BigInt(pence)
const sub = ([a, b]: Frac, [c, d]: Frac): Frac => [a * d - c * b, b * d]
const less = ([a, b]: Frac, [c, d]: Frac) => a * d < c * b
const clamp = (x: Frac, lo: Frac, hi: Frac | null): Frac => (less(x, lo) ? lo : hi && less(hi, x) ? hi : x)
const times = ([a, b]: Frac, r: Ratio): Frac => [a * big(r.numerator), b * big(r.denominator)]

/** Nearest penny, an exact half away from zero (amounts here are never negative). */
const nearest = ([a, b]: Frac): number => {
  const q = a / b
  return Number(2n * (a - q * b) >= b ? q + 1n : q)
}

const floorPounds = ([a, b]: Frac): number => Number((a / (b * 100n)) * 100n)

/** The personal allowance as a fraction of a penny, under the policy. */
export function referenceAllowance(income: Money, config: TaxYearConfig, policy: ModellingPolicy): Frac {
  const { personalAllowance, taperStart, taperRate } = configValues(config)
  const full: Frac = [big(personalAllowance), 1n]
  const excess = big(income) - big(taperStart)
  if (excess <= 0n) return full
  let reduction: Frac = [excess * big(taperRate.numerator), big(taperRate.denominator)]
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
