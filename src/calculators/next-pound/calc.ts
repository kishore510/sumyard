import type { LeafPath, TaxBand, TaxYearConfig } from '@/config/tax/schema'
import { type Refusal, requireVerified } from '@/config/tax/sourced'
import { addMonths, daysBetween, LAST_ISO_YEAR } from '@/lib/calendar'
import {
  BREAK_EVEN_RATE_DENOMINATOR,
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_AGE_YEARS,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
} from '@/lib/inputLimits'
import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import {
  add,
  compare,
  compareRatio,
  FACTOR_ONE,
  factor,
  factorAdd,
  factorPow,
  fine,
  fineDivide,
  fromPence,
  type Money,
  MoneyError,
  min,
  mulRound,
  type Ratio,
  ratio,
  roundFine,
  subtract,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { NEXT_POUND_REFINE_STEP } from '@/lib/sweep'
import { project } from '../compound-interest/calc'
import type { CompoundInputs } from '../compound-interest/types'
import { overpay } from '../mortgage/calc'
import type { MortgageResult } from '../mortgage/types'
import { EngineInputError, evaluateContribution, optimise } from '../optimiser/calc'
import { type ContributionPoint, type ModellingPolicy, type OptimiserInputs, REGIONS, type Region } from '../optimiser/types'
import {
  type Amounts,
  type BreakEven,
  GROWTH_CASES,
  type GrowthCase,
  type IsaLeg,
  type LegRefusal,
  type MortgageLeg,
  type MortgageLegInputs,
  type NextPoundInputs,
  type NextPoundProblem,
  type NextPoundProblemReason,
  type NextPoundProblems,
  type NextPoundResult,
  type NextPoundWarning,
  type NextPoundWarningCode,
  type PensionAccess,
  type PensionAtRate,
  type PensionContribution,
  type PensionLeg,
  type PensionLegInputs,
} from './types'

/*
 * The next pound composer (C1). Pure: the page's inputs, a tax-year config
 * and the optimiser's policy in, three legs out; no clock, storage or
 * network. It adds no tax rule of its own: it runs the optimiser
 * (evaluateContribution() and optimise()), the mortgage engine (overpay())
 * and compound interest (project()), and reads the next pound config leaves through
 * requireVerified. The decisions are CP1 to CP11 in
 * docs/modelling-decisions.md, "Next pound decision (session C0)"; each
 * reading still proposed is named in the result's assumptions. Rounding is
 * docs/money.md's: each engine keeps its own, and the composer rounds only
 * the tax-free part (down), the tax on the rest (nearest) and today's money
 * (nearest, once). Nothing is called best or recommended (G13).
 * literals.test.ts fails if a number other than 0, 1, 2 or 100 appears here.
 */

/** The band whose rate is the retirement tax rate's default (CP4). A band's name in config, not a figure. */
const BASIC_RATE_BAND = 'Basic rate'

const OWN_PATHS = [
  'pension.minimumAge.current',
  'pension.minimumAge.announced',
  'pension.minimumAge.announcedFrom',
  'pension.lumpSum.taxFreeShare',
  'pension.lumpSum.allowance',
  'isa.annualLimit',
] as const satisfies readonly LeafPath[]

const BAND_PATHS = { rUK: 'incomeTax.bands.rUK', scotland: 'incomeTax.bands.scotland' } as const satisfies Record<Region, LeafPath>

const NOTHING_RATE = ratio(0, 1)
const HALF = ratio(1, 2)
const PENNY = fromPence(1)
const WHOLE_RATE = ratio(1, 1)
const negate = (r: Ratio): Ratio => ratio(-r.numerator, r.denominator)

/* Input checks (by field; nothing is changed, only refused). */

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

const isRatio = (value: unknown): value is Ratio => {
  if (typeof value !== 'object' || value === null) return false
  const { numerator, denominator } = value as Ratio
  return isWhole(numerator) && isWhole(denominator) && denominator > 0
}

function moneyProblem(value: unknown): NextPoundProblemReason | undefined {
  if (!isWhole(value)) return 'not-money'
  if (value < 0) return 'below-minimum'
  if (compare(value as Money, MAX_INPUT_AMOUNT) > 0) return 'above-maximum'
  return undefined
}

function wholeProblem(value: unknown, least: number, most: number): NextPoundProblemReason | undefined {
  if (!isWhole(value)) return 'not-whole'
  if (value < least) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

function rateProblem(value: unknown, least: Ratio, most: Ratio): NextPoundProblemReason | undefined {
  if (!isRatio(value)) return 'not-a-rate'
  if (compareRatio(value, least) < 0) return 'below-minimum'
  if (compareRatio(value, most) > 0) return 'above-maximum'
  return undefined
}

type Check = readonly [NextPoundProblem['field'], NextPoundProblemReason | undefined]

const problemsOf = (checks: readonly Check[]): NextPoundProblem[] =>
  checks.flatMap(([field, reason]) => (reason === undefined ? [] : [{ field, reason }]))

const yearOf = (date: IsoDate) => Number(date.slice(0, date.indexOf('-')))

function sharedProblems(inputs: NextPoundInputs): NextPoundProblem[] {
  const growth = inputs?.growth
  const growthChecks: Check[] = GROWTH_CASES.map((c) => [
    `growth.${c}` as const,
    rateProblem(growth?.[c], negate(GROWTH_RATE_BOUND), GROWTH_RATE_BOUND),
  ])
  const ordered = growthChecks.every(([, reason]) => reason === undefined)
  const asOfReason = !isIsoDate(inputs?.asOf)
    ? 'not-a-date'
    : isWhole(inputs.horizonYears) && yearOf(inputs.asOf) + inputs.horizonYears > LAST_ISO_YEAR
      ? 'above-maximum'
      : undefined
  return problemsOf([
    ['lumpSum', moneyProblem(inputs?.lumpSum)],
    ['horizonYears', wholeProblem(inputs?.horizonYears, 1, MAX_PROJECTION_YEARS)],
    ['asOf', asOfReason],
    ['inflationRate', rateProblem(inputs?.inflationRate, negate(INFLATION_RATE_BOUND), INFLATION_RATE_BOUND)],
    ...growthChecks,
    ['growth.mid', ordered && compareRatio(growth.low, growth.mid) > 0 ? 'out-of-order' : undefined],
    ['growth.high', ordered && compareRatio(growth.mid, growth.high) > 0 ? 'out-of-order' : undefined],
    ['feeRate', rateProblem(inputs?.feeRate, NOTHING_RATE, MAX_FEE_RATE)],
  ])
}

function pensionProblems(p: PensionLegInputs): NextPoundProblem[] {
  return problemsOf([
    ['pension.optimiser', typeof p?.optimiser === 'object' && p.optimiser !== null ? undefined : 'not-accepted'],
    ['pension.employerMatch', moneyProblem(p?.employerMatch)],
    ['pension.ageNow', p?.ageNow === null ? undefined : wholeProblem(p?.ageNow, 0, MAX_AGE_YEARS)],
    ['pension.schemeAccessAge', p?.schemeAccessAge === null ? undefined : wholeProblem(p?.schemeAccessAge, 0, MAX_AGE_YEARS)],
    ['pension.retirementTaxRate', p?.retirementTaxRate === null ? undefined : rateProblem(p?.retirementTaxRate, NOTHING_RATE, WHOLE_RATE)],
    ['pension.otherPensionsUseAllowance', typeof p?.otherPensionsUseAllowance === 'boolean' ? undefined : 'not-a-choice'],
  ])
}

const refusedBy = (problems: readonly NextPoundProblem[]): LegRefusal => ({ status: 'refused', engine: 'next-pound', problems })

const TOO_LARGE: LegRefusal = refusedBy([{ field: 'result', reason: 'too-large' }])

/** The region whose bands give the default retirement rate, if the person gave a known one. */
function defaultRateRegion(p: PensionLegInputs): Region | null {
  if (p?.retirementTaxRate !== null) return null
  const region = p?.optimiser?.region
  return REGIONS.includes(region) ? region : null
}

/* Shared arithmetic. */

/** Today's money (CP2): the amount divided by one plus inflation to the power of the years, in fixed point, to the nearest penny once. */
function deflate(amount: Money, inflation: Ratio, years: number): Money {
  return roundFine(fineDivide(fine(amount), factorPow(factorAdd(FACTOR_ONE, factor(inflation)), years)), 'nearest')
}

const amounts = (nominal: Money, inflation: Ratio, years: number): Amounts => ({
  nominal,
  todaysMoney: deflate(nominal, inflation, years),
})

/** A lump sum in compound interest's engine: no contributions, compounded once a year (CP4, CP6). */
const lumpSumInputs = (lumpSum: Money, growthRate: Ratio, feeRate: Ratio, years: number, inflationRate: Ratio): CompoundInputs => ({
  lumpSum,
  contribution: ZERO,
  contributionFrequency: 'annual',
  timing: 'start',
  years,
  contributionIncrease: NOTHING_RATE,
  growthRate,
  compounding: 'annual',
  feeRate,
  inflationRate,
})

const ownWarning = (leg: 'pension' | 'isa', code: NextPoundWarningCode): NextPoundWarning => ({
  source: 'next-pound',
  leg,
  code,
  message: WARNINGS[code],
})

const WARNINGS: Record<NextPoundWarningCode, string> = {
  pensionAtMaximum:
    'The pension contribution has reached the most the take-home model covers (the gross amount equals gross pay), so part of the lump sum is held as cash in this column.',
  transitionalAgeRules:
    'You may be close to the normal minimum pension age when it rises. Transitional rules for people at that age then are under consultation and are not modelled, so the pension may be accessible sooner than shown.',
  isaOverAllowance:
    'What you have paid into ISAs this tax year plus this lump sum is more than the ISA annual limit. The ISA column is not capped; only the limit can go in an ISA this tax year.',
}

/* The pension leg (CP3, CP4). */

/** The tax-free part (down to the penny, capped at the allowance available) and the tax on the rest at one rate (nearest), CP4. */
export function pensionAfterTax(
  pot: Money,
  taxFreeShare: Ratio,
  allowanceAvailable: Money,
  rate: Ratio,
): { readonly taxFree: Money; readonly tax: Money; readonly afterTax: Money } {
  const taxFree = min(mulRound(pot, taxFreeShare, 'down'), allowanceAvailable)
  const tax = mulRound(subtract(pot, taxFree), rate, 'nearest')
  return { taxFree, tax, afterTax: subtract(pot, tax) }
}

export interface MinimumAges {
  readonly current: number
  readonly announced: number
  readonly announcedFrom: IsoDate
}

/** CP4: accessible when the age now plus the horizon reaches the later of the scheme's age and the normal minimum pension age on the horizon date. */
export function accessAt(asOf: IsoDate, years: number, ageNow: number, schemeAge: number | null, ages: MinimumAges): PensionAccess {
  const horizonDate = addMonths(asOf, years * MONTHS_PER_YEAR)
  // NP-5: the announced age applies on and after its date.
  const minimumAge = daysBetween(ages.announcedFrom, horizonDate) >= 0 ? ages.announced : ages.current
  const accessAge = schemeAge === null ? minimumAge : Math.max(minimumAge, schemeAge)
  const ageAtHorizon = ageNow + years
  return { horizonDate, minimumAge, accessAge, ageAtHorizon, accessible: ageAtHorizon >= accessAge }
}

/** Whole years from one date to another, rounded down (negative if `to` is earlier). */
function wholeYears(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0)
}

/**
 * NP-1 (owner: not modelled, warn): the horizon is on or after the date the
 * age rises, the pension is not accessible only because of the normal
 * minimum pension age, and the person could be from the age now to below the
 * announced age on that date (an age in whole years can be up to one under).
 */
function transitionalMayMatter(asOf: IsoDate, ageNow: number, access: PensionAccess, ages: MinimumAges): boolean {
  if (access.accessible || access.accessAge > access.minimumAge) return false
  if (daysBetween(ages.announcedFrom, access.horizonDate) < 0) return false
  const ageAtChange = ageNow + wholeYears(asOf, ages.announcedFrom)
  return ageAtChange + 1 >= ages.current && ageAtChange < ages.announced
}

/** The optimiser's point at a contribution; it cannot refuse here, since the base point with the same paths did not. */
function pointAt(inputs: OptimiserInputs, config: TaxYearConfig, policy: ModellingPolicy, contribution: Money): ContributionPoint {
  const result = evaluateContribution(inputs, config, policy, contribution)
  if (!result.ok) throw new EngineInputError('the optimiser refused a point it had accepted')
  return result.point
}

/**
 * CP3: the extra contribution E whose cost in spendable income (spendable
 * at the current contribution less spendable with E) is the most within X.
 * The cost is not monotone (HICBC steps, the childcare cliff, the annual
 * allowance taper, penny effects), so: the last of the optimiser's sweep
 * points within X; then the last of a finer scan up to the next sweep point;
 * then whole pence between it and the next scan point. With the employer
 * match, every point above the current contribution carries it.
 */
function buyPension(
  lumpSum: Money,
  p: PensionLegInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): { contribution: PensionContribution; point: ContributionPoint } | Refusal {
  const inputs = p.optimiser
  const current = inputs.pension.contribution
  const base = evaluateContribution(inputs, config, policy, current)
  if (!base.ok) return base
  const maximum = base.maximumContribution
  const matched: OptimiserInputs =
    compare(p.employerMatch, ZERO) > 0
      ? { ...inputs, savings: { ...inputs.savings, employerContribution: add(inputs.savings.employerContribution, p.employerMatch) } }
      : inputs
  const cost = (point: ContributionPoint) => subtract(base.point.spendable, point.spendable)
  const within = (point: ContributionPoint) => compare(cost(point), lumpSum) <= 0

  let lo = base.point
  if (compare(current, maximum) < 0) {
    const sweep = optimise(matched, config, policy)
    if (!sweep.ok) return sweep
    const above = sweep.points.filter((point) => compare(point.contribution, current) > 0)
    const last = above.findLastIndex(within)
    if (last >= 0) lo = above[last]!
    let hi: ContributionPoint | null = above[last + 1] ?? null
    if (hi !== null) {
      // The finer scan between the two sweep points: its last point within X, and the one after.
      const scan: ContributionPoint[] = [lo]
      for (let c = add(lo.contribution, NEXT_POUND_REFINE_STEP); compare(c, hi.contribution) < 0; c = add(c, NEXT_POUND_REFINE_STEP))
        scan.push(pointAt(matched, config, policy, c))
      scan.push(hi)
      const j = scan.findLastIndex(within)
      lo = scan[j]!
      hi = scan[j + 1]!
      // Whole pence: cost at lo within X, at hi not.
      while (compare(subtract(hi.contribution, lo.contribution), PENNY) > 0) {
        const mid = pointAt(
          matched,
          config,
          policy,
          add(lo.contribution, mulRound(subtract(hi.contribution, lo.contribution), HALF, 'down')),
        )
        if (within(mid)) lo = mid
        else hi = mid
      }
    }
  }
  const extra = subtract(lo.contribution, current)
  const spent = cost(lo)
  return {
    point: lo,
    contribution: {
      before: current,
      after: lo.contribution,
      extra,
      employerMatch: compare(extra, ZERO) > 0 ? p.employerMatch : ZERO,
      pensionAdded: subtract(lo.pension.total, base.point.pension.total),
      cost: spent,
      leftoverCash: subtract(lumpSum, spent),
      atMaximum: compare(lo.contribution, maximum) === 0,
    },
  }
}

interface PensionValues {
  readonly ages: MinimumAges
  readonly taxFreeShare: Ratio
  readonly allowance: Money
  readonly bands: readonly TaxBand[] | null
}

function pensionLeg(inputs: NextPoundInputs, values: PensionValues, config: TaxYearConfig, policy: ModellingPolicy): PensionLeg {
  const p = inputs.pension
  const problems = pensionProblems(p)
  if (problems.length > 0) return refusedBy(problems)
  let rate: Ratio
  let rateFrom: 'config' | 'input'
  if (p.retirementTaxRate !== null) {
    rate = p.retirementTaxRate
    rateFrom = 'input'
  } else {
    const band = values.bands?.find((b) => b.name === BASIC_RATE_BAND)
    if (band === undefined) return refusedBy([{ field: 'pension.retirementTaxRate', reason: 'no-default' }])
    rate = band.rate
    rateFrom = 'config'
  }
  try {
    const bought = buyPension(inputs.lumpSum, p, config, policy)
    if ('unverified' in bought) return { status: 'refused', engine: 'optimiser', unverified: bought.unverified }
    const { contribution, point } = bought
    // No age given (the C2 page rebuild): the access test is not run, and the leg is shown with its numbers.
    const access = p.ageNow === null ? null : accessAt(inputs.asOf, inputs.horizonYears, p.ageNow, p.schemeAccessAge, values.ages)
    const warnings: NextPoundWarning[] = point.warnings.map((warning) => ({ source: 'optimiser', leg: 'pension', warning }))
    if (contribution.atMaximum && compare(contribution.leftoverCash, ZERO) > 0) warnings.push(ownWarning('pension', 'pensionAtMaximum'))
    if (access !== null && p.ageNow !== null && transitionalMayMatter(inputs.asOf, p.ageNow, access, values.ages))
      warnings.push(ownWarning('pension', 'transitionalAgeRules'))
    const shared = { guaranteed: false, contribution, access, warnings } as const
    if (access !== null && !access.accessible) return { ...shared, status: 'not-accessible' }

    const allowanceAvailable = p.otherPensionsUseAllowance ? ZERO : values.allowance
    const at = {} as Record<GrowthCase, PensionAtRate>
    for (const c of GROWTH_CASES) {
      const growthRate = inputs.growth[c]
      const run = project(lumpSumInputs(contribution.pensionAdded, growthRate, inputs.feeRate, inputs.horizonYears, inputs.inflationRate))
      if (!run.ok) return { status: 'refused', engine: 'compound-interest', problems: run.problems }
      const pot = { nominal: run.result.withFee.nominal.closing, todaysMoney: run.result.withFee.real.closing }
      const split = pensionAfterTax(pot.nominal, values.taxFreeShare, allowanceAvailable, rate)
      at[c] = {
        growthRate,
        pot,
        taxFree: split.taxFree,
        tax: split.tax,
        afterTax: amounts(split.afterTax, inputs.inflationRate, inputs.horizonYears),
        value: amounts(add(split.afterTax, contribution.leftoverCash), inputs.inflationRate, inputs.horizonYears),
      }
    }
    return { ...shared, status: 'accessible', retirementTaxRate: rate, retirementTaxRateFrom: rateFrom, allowanceAvailable, rates: at }
  } catch (error) {
    if (error instanceof EngineInputError) return refusedBy([{ field: 'pension.optimiser', reason: 'not-accepted' }])
    if (error instanceof MoneyError) return TOO_LARGE
    throw error
  }
}

/* The mortgage leg (CP5). */

/** The overpayment asked for and the charge it costs, from one run. */
const spentOn = (result: MortgageResult) =>
  add(result.overpaying.rows[0]!.overpayment, add(result.overpaying.rows[0]!.unused, result.overpaying.totalErc))

function mortgageLeg(inputs: NextPoundInputs): MortgageLeg {
  const m: MortgageLegInputs | null = inputs.mortgage
  if (m === null) return { status: 'none' }
  const X = inputs.lumpSum
  const run = (o: Money) =>
    overpay({ ...m, effect: 'reduce-term', regular: null, lumpSums: compare(o, ZERO) > 0 ? [{ month: 1, amount: o }] : [] })
  try {
    const all = run(X)
    if (!all.ok) return { status: 'refused', engine: 'mortgage', problems: all.problems }
    let chosen = all.result
    let overpayment = X
    if (compare(spentOn(all.result), X) > 0) {
      // MO7: the charge is paid in cash, so O plus its charge stays within X; O + charge rises with O.
      const none = run(ZERO)
      if (!none.ok) return { status: 'refused', engine: 'mortgage', problems: none.problems }
      let lo = ZERO
      let hi = X
      chosen = none.result
      while (compare(subtract(hi, lo), PENNY) > 0) {
        const mid = add(lo, mulRound(subtract(hi, lo), HALF, 'down'))
        const tried = run(mid)
        if (!tried.ok) return { status: 'refused', engine: 'mortgage', problems: tried.problems }
        if (compare(spentOn(tried.result), X) <= 0) {
          lo = mid
          chosen = tried.result
        } else hi = mid
      }
      overpayment = lo
    }
    const { baseline, overpaying, balances } = chosen
    // The overpayment goes in with the first payment and is then held whole years: read a year's payments later each year.
    const k = Math.min(inputs.horizonYears * MONTHS_PER_YEAR + 1, m.termMonths)
    const first = overpaying.rows[0]!
    const unused = first.unused
    const erc = overpaying.totalErc
    const leftoverCash = add(subtract(subtract(X, overpayment), erc), unused)
    let paymentsFreed = ZERO
    for (let month = 0; month < k; month++)
      paymentsFreed = add(paymentsFreed, subtract(baseline.rows[month]!.payment, overpaying.rows[month]!.payment))
    const at = balances[k]!
    const nominal = add(add(subtract(at.baseline, at.overpaying), paymentsFreed), leftoverCash)
    return {
      status: 'ok',
      guaranteed: true,
      overpayment,
      overpaymentUsed: first.overpayment,
      unused,
      erc,
      leftoverCash,
      horizonMonth: k,
      baselineBalance: at.baseline,
      overpayingBalance: at.overpaying,
      paymentsFreed,
      value: amounts(nominal, inputs.inflationRate, inputs.horizonYears),
      warnings: chosen.warnings.map((warning) => ({ source: 'mortgage', leg: 'mortgage', warning })),
    }
  } catch (error) {
    if (error instanceof MoneyError) return TOO_LARGE
    throw error
  }
}

/* The ISA leg (CP6). */

function isaLeg(inputs: NextPoundInputs, annualLimit: Money): IsaLeg {
  const paid = inputs.isa?.paidThisYear
  const reason = moneyProblem(paid)
  if (reason !== undefined) return refusedBy([{ field: 'isa.paidThisYear', reason }])
  try {
    const at = {} as Record<GrowthCase, { growthRate: Ratio; value: Amounts }>
    for (const c of GROWTH_CASES) {
      const growthRate = inputs.growth[c]
      const run = project(lumpSumInputs(inputs.lumpSum, growthRate, inputs.feeRate, inputs.horizonYears, inputs.inflationRate))
      if (!run.ok) return { status: 'refused', engine: 'compound-interest', problems: run.problems }
      at[c] = { growthRate, value: { nominal: run.result.withFee.nominal.closing, todaysMoney: run.result.withFee.real.closing } }
    }
    const over = compare(add(paid, inputs.lumpSum), annualLimit) > 0
    return { status: 'ok', guaranteed: false, rates: at, warnings: over ? [ownWarning('isa', 'isaOverAllowance')] : [] }
  } catch (error) {
    if (error instanceof MoneyError) return TOO_LARGE
    throw error
  }
}

/* The break-even ISA return (CP7). */

/**
 * The ISA growth rate before the fee at which X in the ISA reaches `target`
 * at the horizon: the highest rate on steps of one over
 * BREAK_EVEN_RATE_DENOMINATOR, within GROWTH_RATE_BOUND, whose closing is at
 * most the target, by bisection (the closing rises with the rate). Outside
 * the bound it says so, with no number.
 */
export function breakEvenRate(lumpSum: Money, feeRate: Ratio, years: number, inflationRate: Ratio, target: Money): BreakEven {
  const steps = BREAK_EVEN_RATE_DENOMINATOR
  const bound = Math.floor((GROWTH_RATE_BOUND.numerator * steps) / GROWTH_RATE_BOUND.denominator)
  /** The closing at k steps; null when too large to hold, so above any target. */
  const isa = (k: number): Money | null => {
    const run = project(lumpSumInputs(lumpSum, ratio(k, steps), feeRate, years, inflationRate))
    return run.ok ? run.result.withFee.nominal.closing : null
  }
  const atMost = (k: number) => {
    const closing = isa(k)
    return closing !== null && compare(closing, target) <= 0
  }
  if (atMost(bound)) {
    return compare(isa(bound)!, target) < 0
      ? { kind: 'above-highest' }
      : { kind: 'rate', rate: ratio(bound, steps), upTo: ratio(bound, steps) }
  }
  if (!atMost(-bound)) return { kind: 'below-lowest' }
  let lo = -bound
  let hi = bound
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (atMost(mid)) lo = mid
    else hi = mid
  }
  return { kind: 'rate', rate: ratio(lo, steps), upTo: ratio(hi, steps) }
}

/* Assumptions: plain words, no figures; each proposed reading named for the owner. */

const ASSUMPTIONS: readonly string[] = [
  'One lump sum of take-home pay, put in one place now and held to the horizon in whole years. Monthly amounts are not modelled (CP1).',
  'Each column is what the lump sum adds to net worth at the horizon, after tax on withdrawal, in today’s money first and nominal beside it. Today’s money divides by one plus inflation to the power of the years, the same for every column (CP2).',
  'Proposed reading, for the owner (CP2): every column spends the whole lump sum now. What a leg cannot use is held in that column as cash at face value, with no growth, and is shown.',
  'Proposed reading, for the owner (CP3): the optimiser’s net cost per pound is measured from no contribution, so it is not used here. The pension leg finds the largest extra contribution whose cost in spendable income (take-home with Child Benefit, less any annual allowance charge) stays within the lump sum: the optimiser’s own points, a finer scan between two of them, then a search in whole pence. The cost is not always rising with the contribution; a dip narrower than the finer scan between two of the optimiser’s points can be passed over.',
  'Proposed reading, for the owner (CP3): an employer match is what the employer adds because of the extra contribution. It goes into the pot and counts towards the annual allowance, never towards spendable income. Employer National Insurance savings are not modelled.',
  'Proposed reading, for the owner (CP3): with salary sacrifice or net pay, the lump sum is take-home pay given up this tax year rather than cash in hand; each column still leaves you that much poorer now.',
  'Proposed reading, for the owner (CP4): the pension grows at the same growth rates and fee as the ISA, through the compound interest engine, compounded once a year: the same investments in a different wrapper.',
  'Proposed reading, for the owner (CP4): the tax-free part is the tax-free share of the pot, rounded down to the penny, capped at the lump sum allowance still available (none when your other pensions use it). The rest is taxed at the one retirement tax rate, to the nearest penny. GOV.UK states neither rounding.',
  'Proposed reading, for the owner (CP4): the default retirement tax rate is the rate of the band named Basic rate in this tax year’s bands for your region, applied to a withdrawal years away. One rate stands in for the personal allowance, the bands and any other income in retirement.',
  'Proposed reading, for the owner (CP4): the pension is accessible when your age now plus the horizon reaches the access age: the normal minimum pension age on the horizon date (the announced age from the date it applies), or your scheme’s later age. A protected pension age and benefits already taken are not modelled, nor are the transitional rules for people close to the age when it rises (a warning says when they may matter).',
  'Proposed reading, for the owner (CP5): an early repayment charge is paid in cash, so the overpayment is the most whose overpayment plus charge stays within the lump sum. The overpayment is made with the first payment; the payment is kept and the term shortens. Any part not needed to clear the balance is cash.',
  'Proposed reading, for the owner (CP5): the mortgage column is the balance without the overpayment less the balance with it at the horizon, plus the payments no longer needed up to the horizon at face value (after an early payoff, an interest-only mortgage’s lower interest, a different payment after the fixed rate). Overpayments and charges are not payments here. The overpayment goes in with the first payment, a month after the mortgage’s start date, and the balances are read whole years after that payment, so the overpayment is held as long as the ISA. (CP1’s proposed reading counted the years from the start date, which holds it a month less; for the owner to confirm.)',
  'The mortgage column is the only guaranteed one: it rests on the mortgage’s own rates, not on growth. The reversion rate is still a guess at a rate no one knows yet.',
  'Proposed reading, for the owner (CP6): the ISA is invested, not cash, so its growth and withdrawals are free of tax. Cash held in a stocks and shares ISA may be charged under rules announced to start from the next tax year; that is not modelled.',
  'Proposed reading, for the owner (CP6): the low, mid and high growth rates are illustrative starting values, not market figures, forecasts or advice.',
  'Proposed reading, for the owner (CP6): the ISA allowance warning compares what is already paid into ISAs this tax year plus the lump sum with the annual limit. It warns and does not cap.',
  'Proposed reading, for the owner (CP7): the break-even ISA return is the growth rate before the fee at which the ISA column equals another column, searched in steps of a hundredth of a percent within the growth rates the compound interest engine accepts; against the pension, it matches the pension at the mid rate. Outside those rates no number is given, and none is shown against a pension not accessible at the horizon.',
  'Tax rules are this tax year’s, from verified config, applied to the years ahead as they stand. Nothing here is advice, and no column is ranked above another.',
]

/**
 * Where does the next £X go? (C1). Each leg is worked out by its own engine;
 * a refusal from one engine refuses that leg only, by field. The composer's
 * own shared inputs refused by field give no legs; an unverified config leaf
 * the composer reads gives the typed Refusal. X of nothing is every leg
 * nothing, with no warnings and no break-even.
 */
export function nextPound(
  inputs: NextPoundInputs,
  config: TaxYearConfig,
  policy: ModellingPolicy,
): NextPoundResult | NextPoundProblems | Refusal {
  const problems = sharedProblems(inputs)
  if (problems.length > 0) return { ok: false, problems }
  const own = requireVerified(config, OWN_PATHS)
  const region = defaultRateRegion(inputs.pension)
  const bandPath = region === null ? null : BAND_PATHS[region]
  const bands = bandPath === null ? null : requireVerified(config, [bandPath])
  const unverified = [...(own.ok ? [] : own.unverified), ...(bands === null || bands.ok ? [] : bands.unverified)]
  if (!own.ok || unverified.length > 0) return { ok: false, taxYear: config.id, unverified }

  const base = {
    ok: true,
    taxYear: config.id,
    estimate: true,
    lumpSum: inputs.lumpSum,
    horizonYears: inputs.horizonYears,
    assumptions: ASSUMPTIONS,
  } as const
  if (compare(inputs.lumpSum, ZERO) === 0) {
    const nothing = { status: 'nothing' } as const
    return {
      ...base,
      legs: { pension: nothing, mortgage: nothing, isa: nothing },
      breakEven: { mortgage: null, pension: null },
      warnings: [],
    }
  }

  const v = own.values
  const pension = pensionLeg(
    inputs,
    {
      ages: {
        current: v['pension.minimumAge.current'],
        announced: v['pension.minimumAge.announced'],
        announcedFrom: v['pension.minimumAge.announcedFrom'],
      },
      taxFreeShare: v['pension.lumpSum.taxFreeShare'],
      allowance: v['pension.lumpSum.allowance'],
      bands: bandPath !== null && bands?.ok ? (bands.values[bandPath] as readonly TaxBand[]) : null,
    },
    config,
    policy,
  )
  const mortgage = mortgageLeg(inputs)
  const isa = isaLeg(inputs, v['isa.annualLimit'])
  const against = (target: Money) => breakEvenRate(inputs.lumpSum, inputs.feeRate, inputs.horizonYears, inputs.inflationRate, target)
  const legWarnings = (leg: PensionLeg | MortgageLeg | IsaLeg): readonly NextPoundWarning[] => ('warnings' in leg ? leg.warnings : [])
  return {
    ...base,
    legs: { pension, mortgage, isa },
    breakEven: {
      mortgage: mortgage.status === 'ok' ? against(mortgage.value.nominal) : null,
      pension: pension.status === 'accessible' ? against(pension.rates.mid.value.nominal) : null,
    },
    warnings: [...legWarnings(pension), ...legWarnings(mortgage), ...legWarnings(isa)],
  }
}
