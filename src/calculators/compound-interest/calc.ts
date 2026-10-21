import {
  GROWTH_RATE_BOUND,
  INFLATION_RATE_BOUND,
  MAX_CONTRIBUTION_INCREASE,
  MAX_FEE_RATE,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
} from '@/lib/inputLimits'
import {
  add,
  compareFactor,
  compareRatio,
  FACTOR_ONE,
  type Factor,
  FINE_ZERO,
  type FinePence,
  factor,
  factorAdd,
  factorDivide,
  factorMul,
  factorPow,
  factorRoot,
  factorSubtract,
  factorToRatio,
  fine,
  fineAdd,
  fineDivide,
  fineMul,
  fineSubtract,
  type Money,
  MoneyError,
  type Ratio,
  ratio,
  roundFine,
  subtract,
  ZERO,
} from '@/lib/money'
import { type ContributionFrequency, type Frequency, PERIODS_PER_YEAR } from '@/lib/periods'
import type {
  CompoundField,
  CompoundInputs,
  CompoundOutcome,
  CompoundProblem,
  CompoundProblemReason,
  CompoundResult,
  FeeDrag,
  Projection,
  Views,
  YearRow,
} from './types'

/*
 * The compound interest engine (slice 2a). Pure: inputs in, results out; no
 * UI, storage, clock or network. The decisions it carries out are C1 to C9 in
 * docs/modelling-decisions-compound.md:
 *
 * - C2: a nominal annual rate r compounded m times a year grows by
 *   (1 + r/m)^(m/p) each contribution period, p periods a year.
 * - C3: a start-of-period contribution is added before the period's growth,
 *   an end-of-period one after it.
 * - C4: the fee, f/m each compounding period, is charged on the balance
 *   after that period's growth; every run is made with and without it.
 * - C5: real values divide each amount by inflation compounded to the moment
 *   it is paid or reached (the Fisher relation), never by a subtraction.
 * - C6: no rounding to the penny until output; yearly rows are rounded so
 *   they add up to the totals, and growth takes the penny.
 * - C9: arithmetic in fine fixed point (FinePence, Factor in money.ts).
 *
 * The engine holds no figure: calendar divisors come from lib/periods.ts and
 * input bounds from lib/inputLimits.ts (literals.test.ts).
 */

/** A pure helper was given inputs outside what the engine models (C8). */
export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const NOTHING = ratio(0, 1)

const negate = (r: Ratio): Ratio => ratio(-r.numerator, r.denominator)

const isRatio = (value: unknown): value is Ratio => {
  if (typeof value !== 'object' || value === null) return false
  const { numerator, denominator } = value as Ratio
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0
}

const isFrequency = (value: unknown): value is Frequency => typeof value === 'string' && Object.hasOwn(PERIODS_PER_YEAR, value)

const isContributionFrequency = (value: unknown): value is ContributionFrequency => isFrequency(value) && value !== 'daily'

function rateProblem(value: unknown, least: Ratio, most: Ratio): CompoundProblemReason | undefined {
  if (!isRatio(value)) return 'not-a-rate'
  if (compareRatio(value, least) < 0) return 'below-minimum'
  if (compareRatio(value, most) > 0) return 'above-maximum'
  return undefined
}

function moneyProblem(value: unknown): CompoundProblemReason | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 'not-money'
  if (value < 0) return 'below-minimum'
  if (value > MAX_INPUT_AMOUNT) return 'above-maximum'
  return undefined
}

function yearsProblem(value: unknown): CompoundProblemReason | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 'not-whole'
  if (value < 1) return 'below-minimum'
  if (value > MAX_PROJECTION_YEARS) return 'above-maximum'
  return undefined
}

/** Every problem with the inputs, in the order of the fields (C8). Empty when the engine can run. */
export function checkInputs(inputs: CompoundInputs): readonly CompoundProblem[] {
  const checks: readonly [CompoundField, CompoundProblemReason | undefined][] = [
    ['lumpSum', moneyProblem(inputs.lumpSum)],
    ['contribution', moneyProblem(inputs.contribution)],
    ['contributionFrequency', isContributionFrequency(inputs.contributionFrequency) ? undefined : 'not-a-choice'],
    ['timing', inputs.timing === 'start' || inputs.timing === 'end' ? undefined : 'not-a-choice'],
    ['years', yearsProblem(inputs.years)],
    ['contributionIncrease', rateProblem(inputs.contributionIncrease, NOTHING, MAX_CONTRIBUTION_INCREASE)],
    ['growthRate', rateProblem(inputs.growthRate, negate(GROWTH_RATE_BOUND), GROWTH_RATE_BOUND)],
    ['compounding', isFrequency(inputs.compounding) ? undefined : 'not-a-choice'],
    ['feeRate', rateProblem(inputs.feeRate, NOTHING, MAX_FEE_RATE)],
    ['inflationRate', rateProblem(inputs.inflationRate, negate(INFLATION_RATE_BOUND), INFLATION_RATE_BOUND)],
  ]
  return checks.flatMap(([field, reason]) => (reason ? [{ field, reason }] : []))
}

function refuseUnless(ok: boolean, what: string): void {
  if (!ok) throw new EngineInputError(what)
}

/**
 * The factor a nominal annual rate gives over one of p equal periods of a
 * year when compounded m times a year: (1 + rate/m)^(m/p) (C2). A whole power
 * when m is a multiple of p, otherwise a root of the year's factor.
 */
function periodFactor(rate: Ratio, m: number, p: number): Factor {
  const step = factorAdd(FACTOR_ONE, factorDivide(factor(rate), factor(ratio(m, 1))))
  if (m % p === 0) return factorPow(step, m / p)
  return factorRoot(factorPow(step, m), p)
}

const asRate = (f: Factor): Ratio => factorToRatio(factorSubtract(f, FACTOR_ONE))

/** The Fisher relation: (1 + nominal) / (1 + inflation), as factors (C5). */
const fisher = (nominal: Factor, inflation: Factor): Factor => factorDivide(nominal, inflation)

/** The effective annual rate of a nominal annual rate compounded at `compounding` (C2), to fifteen decimal places. */
export function effectiveAnnualRate(growthRate: Ratio, compounding: Frequency): Ratio {
  refuseUnless(rateProblem(growthRate, negate(GROWTH_RATE_BOUND), GROWTH_RATE_BOUND) === undefined, 'growth rate out of bounds')
  refuseUnless(isFrequency(compounding), 'unknown compounding frequency')
  return asRate(periodFactor(growthRate, PERIODS_PER_YEAR[compounding], 1))
}

/** The equivalent effective rate per contribution period (C2), to fifteen decimal places. */
export function periodRate(growthRate: Ratio, compounding: Frequency, contributionFrequency: ContributionFrequency): Ratio {
  refuseUnless(rateProblem(growthRate, negate(GROWTH_RATE_BOUND), GROWTH_RATE_BOUND) === undefined, 'growth rate out of bounds')
  refuseUnless(isFrequency(compounding), 'unknown compounding frequency')
  refuseUnless(isContributionFrequency(contributionFrequency), 'unknown contribution frequency')
  return asRate(periodFactor(growthRate, PERIODS_PER_YEAR[compounding], PERIODS_PER_YEAR[contributionFrequency]))
}

/** The real rate from an effective nominal rate and inflation by the Fisher relation (C5), to fifteen decimal places. */
export function realRate(nominalEffective: Ratio, inflationRate: Ratio): Ratio {
  refuseUnless(isRatio(nominalEffective), 'the nominal rate is not a Ratio')
  refuseUnless(rateProblem(inflationRate, negate(INFLATION_RATE_BOUND), INFLATION_RATE_BOUND) === undefined, 'inflation out of bounds')
  const nominal = factorAdd(FACTOR_ONE, factor(nominalEffective))
  refuseUnless(compareFactor(nominal, factor(NOTHING)) > 0, 'the nominal rate must be above minus one')
  return asRate(fisher(nominal, factorAdd(FACTOR_ONE, factor(inflationRate))))
}

/** Exact cumulative figures at a year end, before any rounding. */
interface YearEnd {
  readonly closing: FinePence
  readonly contributions: FinePence
  readonly fees: FinePence
  readonly realClosing: FinePence
  readonly realContributions: FinePence
  readonly realFees: FinePence
}

/** Steps the balance through every contribution period (C2 to C5), keeping exact cumulative figures at each year end. */
function simulate(inputs: CompoundInputs, feeRate: Ratio): readonly YearEnd[] {
  const m = PERIODS_PER_YEAR[inputs.compounding]
  const p = PERIODS_PER_YEAR[inputs.contributionFrequency]
  const growth = periodFactor(inputs.growthRate, m, p)
  const keep = periodFactor(negate(feeRate), m, p)
  const inflationYear = factorAdd(FACTOR_ONE, factor(inputs.inflationRate))
  const inflationStep = periodFactor(inputs.inflationRate, 1, p)
  const increase = factorAdd(FACTOR_ONE, factor(inputs.contributionIncrease))
  const first = fine(inputs.contribution)

  let balance = fine(inputs.lumpSum)
  let contributions = FINE_ZERO
  let fees = FINE_ZERO
  let realContributions = FINE_ZERO
  let realFees = FINE_ZERO
  /** Prices now against the start of year one. */
  let index = FACTOR_ONE
  const ends: YearEnd[] = []

  const pay = (payment: FinePence) => {
    balance = fineAdd(balance, payment)
    contributions = fineAdd(contributions, payment)
    realContributions = fineAdd(realContributions, fineDivide(payment, index))
  }

  for (let year = 1; year <= inputs.years; year++) {
    const payment = fineMul(first, factorPow(increase, year - 1))
    for (let period = 1; period <= p; period++) {
      if (inputs.timing === 'start') pay(payment)
      const grown = fineMul(balance, growth)
      const kept = fineMul(grown, keep)
      const fee = fineSubtract(grown, kept)
      balance = kept
      index = factorMul(index, inflationStep)
      fees = fineAdd(fees, fee)
      realFees = fineAdd(realFees, fineDivide(fee, index))
      if (inputs.timing === 'end') pay(payment)
    }
    // Re-anchor the index on the year's exact power, so the steps never drift.
    index = factorPow(inflationYear, year)
    ends.push({ closing: balance, contributions, fees, realClosing: fineDivide(balance, index), realContributions, realFees })
  }
  return ends
}

/** Rounds a run's year ends into rows that add up (C6): cumulative figures once each; growth takes the penny. */
function toProjection(lumpSum: Money, ends: readonly YearEnd[], view: 'nominal' | 'real'): Projection {
  const rows: YearRow[] = []
  let opening = lumpSum
  let previousContributions = ZERO
  let previousFees = ZERO
  let cumulativeGrowth = ZERO
  ends.forEach((end, index) => {
    const closing = roundFine(view === 'nominal' ? end.closing : end.realClosing, 'nearest')
    const cumulativeContributions = roundFine(view === 'nominal' ? end.contributions : end.realContributions, 'nearest')
    const cumulativeFees = roundFine(view === 'nominal' ? end.fees : end.realFees, 'nearest')
    const contributions = subtract(cumulativeContributions, previousContributions)
    const fees = subtract(cumulativeFees, previousFees)
    const growth = add(subtract(subtract(closing, opening), contributions), fees)
    cumulativeGrowth = add(cumulativeGrowth, growth)
    rows.push({
      year: index + 1,
      opening,
      contributions,
      growth,
      fees,
      closing,
      cumulativeContributions,
      cumulativeGrowth,
      cumulativeFees,
    })
    opening = closing
    previousContributions = cumulativeContributions
    previousFees = cumulativeFees
  })
  return { rows, lumpSum, contributions: previousContributions, growth: cumulativeGrowth, fees: previousFees, closing: opening }
}

function views(inputs: CompoundInputs, feeRate: Ratio): Views {
  const ends = simulate(inputs, feeRate)
  return { nominal: toProjection(inputs.lumpSum, ends, 'nominal'), real: toProjection(inputs.lumpSum, ends, 'real') }
}

/** Closing balance without the fee less closing balance with it, nominal and real (C4). */
export function feeDrag(withFee: Views, noFee: Views): FeeDrag {
  return {
    nominal: subtract(noFee.nominal.closing, withFee.nominal.closing),
    real: subtract(noFee.real.closing, withFee.real.closing),
  }
}

const ASSUMPTIONS: readonly string[] = [
  'Growth is a steady nominal annual rate, compounded at the chosen frequency. Real returns vary from year to year and can be negative.',
  'Where contributions and compounding differ in frequency, growth uses the equivalent effective rate for each contribution period, so a year compounds to the effective annual rate.',
  'A contribution at the start of a period earns that period’s growth; one at the end does not.',
  'The fee is a percentage of the balance, charged each compounding period on the balance after that period’s growth. Fee drag is the closing balance without the fee less the one with it, so it includes the growth the fees would have earned.',
  'Contributions rise once a year, at the start of each year after the first, by the chosen increase.',
  'Real values are in today’s money: each amount is divided by inflation compounded to the moment it is paid or reached (the Fisher relation), not by subtracting the inflation rate.',
  'A year is a whole number of weeks, months, quarters or days, so a weekly year is slightly shorter than a calendar year.',
  'No tax, tax wrapper, flat fee or charge on contributions is modelled.',
  'Figures are worked out without rounding and shown to the penny; each year’s figures are rounded so they add up to the totals.',
]

function compute(inputs: CompoundInputs): CompoundResult {
  const m = PERIODS_PER_YEAR[inputs.compounding]
  const p = PERIODS_PER_YEAR[inputs.contributionFrequency]
  const yearGrowth = periodFactor(inputs.growthRate, m, 1)
  const yearAfterFees = factorMul(yearGrowth, periodFactor(negate(inputs.feeRate), m, 1))
  const withFee = views(inputs, inputs.feeRate)
  const noFee = views(inputs, NOTHING)
  return {
    estimate: true,
    effectiveAnnualRate: asRate(yearGrowth),
    effectiveAnnualRateAfterFees: asRate(yearAfterFees),
    periodRate: asRate(periodFactor(inputs.growthRate, m, p)),
    realAnnualRate: asRate(fisher(yearAfterFees, factorAdd(FACTOR_ONE, factor(inputs.inflationRate)))),
    withFee,
    noFee,
    feeDrag: feeDrag(withFee, noFee),
    assumptions: ASSUMPTIONS,
  }
}

/** The projection with and without the fee, nominal and real, or a typed refusal (C8). Never a wrong number. */
export function project(inputs: CompoundInputs): CompoundOutcome {
  const problems = checkInputs(inputs)
  if (problems.length > 0) return { ok: false, problems }
  try {
    return { ok: true, result: compute(inputs) }
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, problems: [{ field: 'result', reason: 'too-large' }] }
    throw error
  }
}

/** The nominal closing balance with the fee. Throws EngineInputError where project would refuse. */
export function futureValue(inputs: CompoundInputs): Money {
  const outcome = project(inputs)
  if (!outcome.ok) throw new EngineInputError(outcome.problems.map((problem) => `${problem.field}: ${problem.reason}`).join('; '))
  return outcome.result.withFee.nominal.closing
}
