/*
 * A frozen copy of the car ownership engine as it stood before session 3e
 * (test-only). The 3e change adds finance still owed on a kept car; with
 * none, every result must be bit-identical to this copy (unchanged.test.ts).
 * Do not edit, except to follow a rename or a type change in the modules it imports.
 */
import {
  MAX_ANNUAL_MILEAGE,
  MAX_CAR_OPTIONS,
  MAX_HORIZON_MONTHS,
  MAX_HORIZON_VALUE_RATIO,
  MAX_INPUT_AMOUNT,
  MAX_MILES_PER_GALLON,
  MAX_MILES_PER_KWH,
  MAX_PENCE_PER_UNIT,
  MAX_SAVINGS_RETURN,
  PRICE_CHANGE_BOUND,
} from '@/lib/inputLimits'
import {
  add,
  compareExact,
  compareFine,
  compareRatio,
  divideRound,
  type ExactPence,
  exact,
  exactAdd,
  exactMul,
  FACTOR_ONE,
  type Factor,
  FINE_ZERO,
  type FinePence,
  FLIP_RATE_DENOMINATOR,
  FLIP_SCAN_STEPS,
  factor,
  factorAdd,
  factorMul,
  factorPow,
  factorRoot,
  factorSubtract,
  factorToRatio,
  fine,
  fineAdd,
  fineMul,
  fineSubtract,
  fromPence,
  type Money,
  MoneyError,
  type Ratio,
  ratio,
  roundExact,
  roundFine,
  subtract,
  toPence,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { LITRES_PER_GALLON } from '@/lib/units'
import { hirePurchase, loan, outstandingBalance, pcp } from '../../car-finance/calc'
import type { DatedPayment, FinanceOutcome, FinanceProblemReason, FinanceResult } from '../../car-finance/types'
import type {
  Breakdown,
  CarOption,
  CaseResult,
  Comparison,
  ComparisonOutcome,
  Flip,
  FlipOutcome,
  FuelCost,
  Lower,
  MonthPoint,
  OwnershipField,
  OwnershipOutcome,
  OwnershipProblem,
  OwnershipResult,
  RankEntry,
  Ranking,
  Shared,
  TimelineMonth,
  ValueCase,
  ValueCurve,
} from '../types'

/*
 * The car ownership-cost engine (slice 3b). Pure: inputs in, results out; no
 * UI, storage, clock or network. Decisions F16 to F31 in
 * docs/modelling-decisions-car.md:
 *
 * - F16, F24: an option is a car and an acquisition, on a monthly grid from
 *   month 0 to the horizon; finance through the 3a engine.
 * - F17: the value falls (or rises) by a constant yearly percentage between
 *   the starting and horizon values.
 * - F18: net cost = cash out − equity + opportunity cost (keep counts its
 *   value as a sale forgone at the start).
 * - F19, F20: coverage, equity and the end of a PCP.
 * - F21, F25: running costs and fuel, exact, rounded once a month.
 * - F26, F27: the breakdown and the comparison.
 * - F22, F29: flip points, closed form or a bounded search.
 * - F28: typed refusals, never a wrong number.
 *
 * The engine holds no figure: bounds come from lib/inputLimits.ts, the litres
 * in a gallon from lib/units.ts, the calendar from lib/periods.ts and search
 * precision from lib/money.ts (literals.test.ts).
 */

/** A pure helper was given inputs outside what the engine models. */
export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const CASES: readonly ValueCase[] = ['low', 'expected', 'high']
const NOTHING = ratio(0, 1)
const ALL = ratio(1, 1)
const PENNY = exact(fromPence(1))
const FACTOR_ZERO = factor(NOTHING)
const HALF = factor(ratio(1, 2))
const FUEL_KINDS: readonly FuelCost['kind'][] = ['fuel', 'electric', 'per-mile']
const ACQUISITIONS: readonly string[] = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp']
const ENDS: readonly string[] = ['buy', 'hand-back']

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const isRatio = (value: unknown): value is Ratio => {
  if (typeof value !== 'object' || value === null) return false
  const { numerator, denominator } = value as Ratio
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0
}
const negate = (r: Ratio) => ratio(-r.numerator, r.denominator)
const onePlus = (r: Ratio) => ratio(r.denominator + r.numerator, r.denominator)
const inverse = (r: Ratio) => ratio(r.denominator, r.numerator)

function refuseUnless(ok: boolean, what: string): void {
  if (!ok) throw new EngineInputError(what)
}

// Checks (F28) ----------------------------------------------------------------

type Reason = FinanceProblemReason | undefined
type Check = readonly [OwnershipField, Reason]

function moneyProblem(value: unknown, most: Money = MAX_INPUT_AMOUNT): Reason {
  if (!isWhole(value)) return 'not-money'
  if (value < 0) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

function wholeProblem(value: unknown, least: number, most: number): Reason {
  if (!isWhole(value)) return 'not-whole'
  if (value < least) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

/** A rate within [least, most]; with `above`, a rate of exactly `least` is refused too. */
function rateProblem(value: unknown, least: Ratio, most: Ratio, above = false): Reason {
  if (!isRatio(value)) return 'not-a-rate'
  const low = compareRatio(value, least)
  if (low < 0 || (above && low === 0)) return 'below-minimum'
  if (compareRatio(value, most) > 0) return 'above-maximum'
  return undefined
}

function fuelChecks(fuel: FuelCost): readonly Check[] {
  if (typeof fuel !== 'object' || fuel === null || !FUEL_KINDS.includes(fuel.kind)) return [['fuel', 'not-a-choice']]
  if (fuel.kind === 'fuel') {
    return [
      ['milesPerGallon', rateProblem(fuel.milesPerGallon, NOTHING, MAX_MILES_PER_GALLON, true)],
      ['pencePerLitre', rateProblem(fuel.pencePerLitre, NOTHING, MAX_PENCE_PER_UNIT)],
    ]
  }
  if (fuel.kind === 'electric') {
    return [
      ['milesPerKwh', rateProblem(fuel.milesPerKwh, NOTHING, MAX_MILES_PER_KWH, true)],
      ['homeShare', rateProblem(fuel.homeShare, NOTHING, ALL)],
      ['homePencePerKwh', rateProblem(fuel.homePencePerKwh, NOTHING, MAX_PENCE_PER_UNIT)],
      ['publicPencePerKwh', rateProblem(fuel.publicPencePerKwh, NOTHING, MAX_PENCE_PER_UNIT)],
    ]
  }
  return [['pencePerMile', rateProblem(fuel.pencePerMile, NOTHING, MAX_PENCE_PER_UNIT)]]
}

function horizonValueProblem(option: CarOption): Reason {
  const { value, horizonValue } = option.car
  if (typeof horizonValue !== 'object' || horizonValue === null) return 'not-money'
  for (const valueCase of CASES) {
    const problem = moneyProblem(horizonValue[valueCase])
    if (problem) return problem
    if (moneyProblem(value) === undefined) {
      const most = exactMul(exact(value), MAX_HORIZON_VALUE_RATIO)
      if (compareExact(exact(horizonValue[valueCase]), most) > 0) return 'above-maximum'
    }
  }
  return undefined
}

function carChecks(option: CarOption): readonly Check[] {
  const { car } = option
  const change = negate(PRICE_CHANGE_BOUND)
  return [
    ['value', moneyProblem(car.value)],
    ['horizonValue', horizonValueProblem(option)],
    ['annualMileage', wholeProblem(car.annualMileage, 0, MAX_ANNUAL_MILEAGE)],
    ...fuelChecks(car.fuel),
    ['fuelPriceChange', rateProblem(car.fuelPriceChange, change, PRICE_CHANGE_BOUND)],
    ['insurance', moneyProblem(car.running?.insurance)],
    ['maintenance', moneyProblem(car.running?.maintenance)],
    ['ved', moneyProblem(car.running?.ved)],
    ['other', moneyProblem(car.running?.other)],
    ['generalIncrease', rateProblem(car.generalIncrease, change, PRICE_CHANGE_BOUND)],
  ]
}

function sharedChecks(shared: Shared): readonly OwnershipProblem[] {
  return toProblems([
    ['horizonMonths', wholeProblem(shared.horizonMonths, 1, MAX_HORIZON_MONTHS)],
    ['savingsReturn', rateProblem(shared.savingsReturn, NOTHING, MAX_SAVINGS_RETURN)],
  ])
}

const toProblems = (checks: readonly Check[], option?: number): OwnershipProblem[] =>
  checks.flatMap(([field, reason]) => (reason ? [option === undefined ? { field, reason } : { field, reason, option }] : []))

// Pure helpers ------------------------------------------------------------------

/** Pence per mile, exactly (F21): (a) price per litre × litres per gallon ÷ miles per gallon; (b) the blended price per kWh ÷ miles per kWh; (c) as entered. */
export function costPerMile(fuel: FuelCost): ExactPence {
  refuseUnless(
    fuelChecks(fuel).every(([, reason]) => reason === undefined),
    'fuel inputs out of bounds',
  )
  if (fuel.kind === 'per-mile') return exactMul(PENNY, fuel.pencePerMile)
  if (fuel.kind === 'fuel') return exactMul(exactMul(exactMul(PENNY, fuel.pencePerLitre), LITRES_PER_GALLON), inverse(fuel.milesPerGallon))
  const away = ratio(fuel.homeShare.denominator - fuel.homeShare.numerator, fuel.homeShare.denominator)
  const blended = exactAdd(
    exactMul(exactMul(PENNY, fuel.homeShare), fuel.homePencePerKwh),
    exactMul(exactMul(PENNY, away), fuel.publicPencePerKwh),
  )
  return exactMul(blended, inverse(fuel.milesPerKwh))
}

/**
 * The value at each month from 0 to `horizonMonths` (F17): V0 q^m with
 * q = (VH / V0)^(1/H), the first and last exactly the two values, months
 * between to the nearest penny. q is found by bisection on the fine grid to
 * one unit (the largest q with V0 q^H at most VH).
 */
export function valueCurve(start: Money, end: Money, horizonMonths: number): ValueCurve {
  refuseUnless(moneyProblem(start, fromPence(Number.MAX_SAFE_INTEGER)) === undefined, 'the start value must be whole pence from nothing')
  refuseUnless(moneyProblem(end, fromPence(Number.MAX_SAFE_INTEGER)) === undefined, 'the end value must be whole pence from nothing')
  refuseUnless(isWhole(horizonMonths) && horizonMonths >= 1, 'the horizon must be a whole number of months from one')
  const last = horizonMonths
  if (start === 0 || end === 0) {
    const values = Array.from({ length: last + 1 }, (_, m) => (m === 0 ? start : m === last ? end : ZERO))
    return { values, yearlyChange: start === 0 ? null : negate(ALL) }
  }
  const from = fine(start)
  const to = fine(end)
  let low = FACTOR_ZERO
  let high = factor(ratio(end + start, start))
  while ((high as bigint) - (low as bigint) > 1n) {
    const middle = factorMul(factorAdd(low, high), HALF)
    if (compareFine(fineMul(from, factorPow(middle, last)), to) <= 0) low = middle
    else high = middle
  }
  const q = low
  const values: Money[] = [start]
  let power = FACTOR_ONE
  for (let m = 1; m <= last; m++) {
    power = factorMul(power, q)
    values.push(m === last ? end : roundFine(fineMul(from, power), 'nearest'))
  }
  return { values, yearlyChange: factorToRatio(factorSubtract(factorPow(q, MONTHS_PER_YEAR), FACTOR_ONE)) }
}

/** The monthly growth factor of an annual effective rate: (1 + s)^(1/12) (F18). */
const monthlyGrowth = (annualRate: Ratio): Factor => factorRoot(factorAdd(FACTOR_ONE, factor(annualRate)), MONTHS_PER_YEAR)

/** Σ amount_k × (1 + s)^((m − k) / 12) over the flows at months k ≤ m, in fine fixed point by Horner's rule (F18). */
export function futureValueOfFlows(flows: readonly DatedPayment[], annualRate: Ratio, atMonth: number): FinePence {
  refuseUnless(rateProblem(annualRate, NOTHING, ALL) === undefined, 'the rate must be from nothing to all')
  refuseUnless(isWhole(atMonth) && atMonth >= 0, 'the month must be a whole number from nothing')
  refuseUnless(
    flows.every(({ month, amount }) => isWhole(month) && month >= 0 && isWhole(amount)),
    'each flow needs a whole month from nothing and whole pence',
  )
  const byMonth: Money[] = Array.from({ length: atMonth + 1 }, () => ZERO)
  for (const { month, amount } of flows) if (month <= atMonth) byMonth[month] = add(byMonth[month]!, amount)
  return horner(byMonth, monthlyGrowth(annualRate))[atMonth]!
}

/** The future value at every month of flows indexed by month. */
function horner(flows: readonly Money[], growth: Factor): FinePence[] {
  const out: FinePence[] = []
  let total = FINE_ZERO
  flows.forEach((amount, m) => {
    total = fineAdd(m === 0 ? FINE_ZERO : fineMul(total, growth), fine(amount))
    out.push(total)
  })
  return out
}

// One option on the horizon -----------------------------------------------------

/** What does not depend on the value case or the savings return. */
interface Prepared {
  readonly option: CarOption
  readonly horizonMonths: number
  readonly finance: FinanceResult | null
  readonly term: number
  readonly handBack: boolean
  readonly coverage: number
  readonly forgone: Money
  readonly costPerMile: ExactPence
  readonly timeline: readonly TimelineMonth[]
  /** Outflows by month for the opportunity cost: cash out plus keep's forgone sale at month 0. */
  readonly flows: readonly Money[]
  /** Cumulative cash out by month. */
  readonly cashOut: readonly Money[]
  /** The finance balance by month while the car is held (nothing after a hand-back). */
  readonly balance: readonly Money[]
  /** The balance the breakdown uses at the end: at a hand-back, the final payment the car settles. */
  readonly endBalance: Money
}

type Prepare = { readonly ok: true; readonly prepared: Prepared } | { readonly ok: false; readonly problems: readonly OwnershipProblem[] }

/** The 3a agreement for a finance option, with the car's value as the cash price (F16, F24). */
function financeOf(option: CarOption): FinanceOutcome | null {
  const { car, acquisition } = option
  if (acquisition.kind === 'loan') return loan(acquisition.finance)
  if (acquisition.kind === 'hire-purchase') return hirePurchase({ ...acquisition.finance, cashPrice: car.value })
  if (acquisition.kind === 'pcp') {
    const { term } = acquisition.finance
    const expectedMileage =
      isWhole(term) && term >= 0 ? Number(divideRound(BigInt(car.annualMileage * term), BigInt(MONTHS_PER_YEAR), 'nearest')) : 0
    return pcp({ ...acquisition.finance, cashPrice: car.value, expectedMileage })
  }
  return null
}

function acquisitionChecks(option: CarOption): readonly Check[] {
  const { acquisition } = option
  if (typeof acquisition !== 'object' || acquisition === null || !ACQUISITIONS.includes(acquisition.kind))
    return [['acquisition', 'not-a-choice']]
  if (acquisition.kind === 'pcp' && !ENDS.includes(acquisition.end)) return [['end', 'not-a-choice']]
  return []
}

/** Each month's amount, months 1 to `months`: a twelfth of annual × (1 + change)^year, rounded once to the penny (F21, F25). */
function monthly(annual: ExactPence, change: Ratio, months: number): Money[] {
  const growth = onePlus(change)
  const twelfth = ratio(1, MONTHS_PER_YEAR)
  const out: Money[] = [ZERO]
  let year = annual
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % MONTHS_PER_YEAR === 0) year = exactMul(year, growth)
    out.push(roundExact(exactMul(year, twelfth), 'nearest'))
  }
  return out
}

function prepare(option: CarOption, horizonMonths: number, index: number): Prepare {
  const checks = acquisitionChecks(option)
  if (checks.length > 0) return { ok: false, problems: toProblems(checks, index) }
  const problems = toProblems(carChecks(option), index)
  const { car, acquisition } = option
  if (acquisition.kind === 'loan' && moneyProblem(car.value) === undefined && isWhole(acquisition.finance.amount)) {
    if (acquisition.finance.amount > car.value) problems.push({ field: 'amount', reason: 'above-maximum', option: index })
  }
  if (problems.length > 0) return { ok: false, problems }
  const financed = financeOf(option)
  if (financed && !financed.ok) return { ok: false, problems: financed.problems.map((problem) => ({ ...problem, option: index })) }
  const finance = financed ? financed.result : null

  const H = horizonMonths
  const term = finance ? finance.schedule.rows.length : 0
  const handBack = acquisition.kind === 'pcp' && acquisition.end === 'hand-back' && term <= H
  const coverage = handBack ? term : H
  const forgone = acquisition.kind === 'keep' ? car.value : ZERO

  // Acquisition (F24).
  const acq: Money[] = Array.from({ length: coverage + 1 }, () => ZERO)
  if (acquisition.kind === 'cash') acq[0] = car.value
  if (finance && (acquisition.kind === 'loan' || acquisition.kind === 'hire-purchase' || acquisition.kind === 'pcp')) {
    const fee = acquisition.finance.arrangementFeeTiming === 'start' ? acquisition.finance.arrangementFee : ZERO
    const down = acquisition.kind === 'loan' ? subtract(car.value, acquisition.finance.amount) : finance.deposit
    acq[0] = add(down, fee)
    for (let m = 1; m <= Math.min(term, coverage); m++) acq[m] = finance.schedule.rows[m - 1]!.payment
    if (term <= coverage) {
      const end = handBack ? finance.handBack!.excessMileageCharge : add(finance.own.finalPayment, finance.own.purchaseFee)
      acq[term] = add(acq[term]!, end)
    }
  }

  // Running costs and fuel (F21, F25).
  const perMile = costPerMile(car.fuel)
  const fuel = monthly(exactMul(perMile, ratio(car.annualMileage, 1)), car.fuelPriceChange, coverage)
  const run = (amount: Money) => monthly(exact(amount), car.generalIncrease, coverage)
  const insurance = run(car.running.insurance)
  const maintenance = run(car.running.maintenance)
  const ved = run(car.running.ved)
  const other = run(car.running.other)

  const timeline: TimelineMonth[] = []
  const flows: Money[] = []
  const cashOut: Money[] = []
  const balance: Money[] = []
  let paid = ZERO
  for (let m = 0; m <= coverage; m++) {
    const month = {
      month: m,
      acquisition: acq[m]!,
      fuel: fuel[m]!,
      insurance: insurance[m]!,
      maintenance: maintenance[m]!,
      ved: ved[m]!,
      other: other[m]!,
    }
    timeline.push(month)
    const out = [month.acquisition, month.fuel, month.insurance, month.maintenance, month.ved, month.other].reduce(add, ZERO)
    paid = add(paid, out)
    cashOut.push(paid)
    flows.push(m === 0 ? add(out, forgone) : out)
    const held = !(handBack && m >= term)
    balance.push(finance && held && m < term ? outstandingBalance(finance, m) : ZERO)
  }
  const endBalance = handBack && finance ? outstandingBalance(finance, term) : balance[coverage]!

  return {
    ok: true,
    prepared: {
      option,
      horizonMonths: H,
      finance,
      term,
      handBack,
      coverage,
      forgone,
      costPerMile: perMile,
      timeline,
      flows,
      cashOut,
      balance,
      endBalance,
    },
  }
}

/** The opportunity cost at each month to the end of coverage: future value less the outflows, rounded once (F18). */
function opportunity(prepared: Prepared, savingsReturn: Ratio): Money[] {
  const fv = horner(prepared.flows, monthlyGrowth(savingsReturn))
  let paid = FINE_ZERO
  return fv.map((value, m) => {
    paid = fineAdd(paid, fine(prepared.flows[m]!))
    return roundFine(fineSubtract(value, paid), 'nearest')
  })
}

const sum = (amounts: readonly Money[]) => amounts.reduce(add, ZERO)

function costCase(prepared: Prepared, opp: readonly Money[], valueCase: ValueCase): CaseResult {
  const { option, horizonMonths, handBack, term, coverage, forgone, cashOut, balance, endBalance, timeline } = prepared
  const v0 = option.car.value
  const horizonValue = option.car.horizonValue[valueCase]
  const curve = valueCurve(v0, horizonValue, horizonMonths)
  const months: MonthPoint[] = []
  for (let m = 0; m <= coverage; m++) {
    const held = !(handBack && m >= term)
    const value = held ? curve.values[m]! : ZERO
    const owed = balance[m]!
    const equity = subtract(value, owed)
    const netCost = add(subtract(add(cashOut[m]!, forgone), equity), opp[m]!)
    months.push({ month: m, cashOut: cashOut[m]!, value, balance: owed, equity, opportunityCost: opp[m]!, netCost })
  }
  const endValue = curve.values[coverage]!
  const outlay = sum(timeline.map((month) => month.acquisition))
  const breakdown: Breakdown = {
    depreciation: subtract(v0, endValue),
    interestAndFees: add(subtract(add(outlay, forgone), v0), endBalance),
    equityHandedBack: handBack ? subtract(endValue, endBalance) : ZERO,
    fuel: sum(timeline.map((month) => month.fuel)),
    insurance: sum(timeline.map((month) => month.insurance)),
    maintenance: sum(timeline.map((month) => month.maintenance)),
    ved: sum(timeline.map((month) => month.ved)),
    other: sum(timeline.map((month) => month.other)),
    opportunityCost: opp[coverage]!,
  }
  const netCost = months[coverage]!.netCost
  return {
    valueCase,
    horizonValue,
    curve,
    months,
    cashOut: cashOut[coverage]!,
    netCost,
    netCostPerCoverageMonth: roundExact(exactMul(exact(netCost), ratio(1, coverage)), 'nearest'),
    breakdown,
  }
}

const COMMON_ASSUMPTIONS: readonly string[] = [
  'Every option is costed over the same horizon. Net cost is the cash paid out, less what the car is worth then after anything still owed on it, plus what that cash could have earned at your savings return.',
  'The car’s value between now and the horizon follows a constant yearly percentage change fitted to the starting and horizon values: an illustrative shape, not a forecast.',
  'Running costs and fuel are paid monthly; each rises once a year by its own yearly change.',
  'The savings return is the after-tax yearly return you entered, applied monthly as its equivalent.',
  'Amounts are in pounds of the day, not adjusted for inflation.',
  'No tax rules, vehicle tax rules, benefit in kind, replacement car, early settlement or part exchange are modelled.',
]

const KIND_ASSUMPTIONS: Readonly<Record<string, readonly string[]>> = {
  keep: ['Keeping the car counts its current value as a sale given up at the start, so it compares like for like with buying it.'],
  cash: ['The price is paid in full at the start.'],
  finance: [
    'Finance follows the car finance engine. If the horizon ends before the agreement does, what is still owed is taken off the car’s value.',
  ],
  'hand-back': [
    'Handing the car back at the end of the term settles the final payment; any excess mileage charge is paid, and after that there is no car.',
    'Months after a car is handed back are not covered: the result is per month of coverage and is not ranked against options that cover the whole horizon.',
  ],
}

function assumptionsFor(prepared: Prepared): string[] {
  const { kind } = prepared.option.acquisition
  const key = kind === 'keep' || kind === 'cash' ? kind : 'finance'
  return [...COMMON_ASSUMPTIONS, ...KIND_ASSUMPTIONS[key]!, ...(prepared.handBack ? KIND_ASSUMPTIONS['hand-back']! : [])]
}

function result(prepared: Prepared, savingsReturn: Ratio): OwnershipResult {
  const opp = opportunity(prepared, savingsReturn)
  const cases = {
    low: costCase(prepared, opp, 'low'),
    expected: costCase(prepared, opp, 'expected'),
    high: costCase(prepared, opp, 'high'),
  }
  return {
    estimate: true,
    acquisition: prepared.option.acquisition.kind,
    horizonMonths: prepared.horizonMonths,
    coverageMonths: prepared.coverage,
    fullCoverage: prepared.coverage === prepared.horizonMonths,
    forgoneSale: prepared.forgone,
    finance: prepared.finance,
    costPerMile: prepared.costPerMile,
    timeline: prepared.timeline,
    cases,
    assumptions: assumptionsFor(prepared),
  }
}

/** Runs `work`, turning a sum past the safe range into the typed refusal (F28). */
function guarded<T extends { readonly ok: boolean }>(
  work: () => T,
): T | { readonly ok: false; readonly problems: readonly OwnershipProblem[] } {
  try {
    return work()
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, problems: [{ field: 'result', reason: 'too-large' }] }
    throw error
  }
}

/** One option's cost over the horizon in each value case (F16 to F26), or a typed refusal (F28). */
export function ownershipCost(option: CarOption, shared: Shared): OwnershipOutcome {
  return guarded(() => {
    const problems = sharedChecks(shared)
    if (problems.length > 0) return { ok: false, problems }
    const prepared = prepare(option, shared.horizonMonths, 0)
    if (!prepared.ok) return prepared
    return { ok: true, result: result(prepared.prepared, shared.savingsReturn) }
  })
}

// Comparing options (F27) -------------------------------------------------------

/** −1, 0 or 1 as a's net cost per month of coverage is below, equal to or above b's, exactly. */
function comparePerMonth(netA: Money, coverageA: number, netB: Money, coverageB: number): -1 | 0 | 1 {
  const left = BigInt(toPence(netA)) * BigInt(coverageB)
  const right = BigInt(toPence(netB)) * BigInt(coverageA)
  return left < right ? -1 : left > right ? 1 : 0
}

function rank(results: readonly OwnershipResult[], valueCase: ValueCase): Ranking {
  const entry = (option: number, tiedWithPrevious: boolean): RankEntry => ({
    option,
    netCostPerCoverageMonth: results[option]!.cases[valueCase].netCostPerCoverageMonth,
    tiedWithPrevious,
  })
  const per = (i: number) => [results[i]!.cases[valueCase].netCost, results[i]!.coverageMonths] as const
  const full = results.map((_, i) => i).filter((i) => results[i]!.fullCoverage)
  full.sort((a, b) => comparePerMonth(...per(a), ...per(b)) || a - b)
  return {
    full: full.map((option, k) => entry(option, k > 0 && comparePerMonth(...per(full[k - 1]!), ...per(option)) === 0)),
    partial: results.flatMap((r, i) => (r.fullCoverage ? [] : [entry(i, false)])),
  }
}

const COMPARISON_ASSUMPTIONS: readonly string[] = [
  'Options are ordered by net cost per month of coverage, lowest first, under these assumptions. Options that do not cover the whole horizon are listed apart and not ordered against the others.',
  'Flip points are thresholds at which two options’ net costs per month of coverage are equal. They are found on a search grid, so a crossing that comes and goes within one step can be missed.',
]

function prepareAll(
  options: readonly CarOption[],
  shared: Shared,
): { ok: true; prepared: Prepared[] } | { ok: false; problems: OwnershipProblem[] } {
  const problems: OwnershipProblem[] = [...sharedChecks(shared)]
  if (problems.length > 0) return { ok: false, problems }
  const prepared: Prepared[] = []
  options.forEach((option, index) => {
    const one = prepare(option, shared.horizonMonths, index)
    if (one.ok) prepared.push(one.prepared)
    else problems.push(...one.problems)
  })
  return problems.length > 0 ? { ok: false, problems } : { ok: true, prepared }
}

/** Every option on one horizon, ranked in each value case (F19, F27), or a typed refusal (F28). */
export function compareOptions(options: readonly CarOption[], shared: Shared): ComparisonOutcome {
  return guarded(() => {
    const count = wholeProblem(Array.isArray(options) ? options.length : -1, 1, MAX_CAR_OPTIONS)
    if (count) return { ok: false, problems: [{ field: 'options', reason: count } satisfies OwnershipProblem] }
    const all = prepareAll(options, shared)
    if (!all.ok) return all
    const results = all.prepared.map((prepared) => result(prepared, shared.savingsReturn))
    const comparison: Comparison = {
      horizonMonths: shared.horizonMonths,
      options: results,
      ranking: { low: rank(results, 'low'), expected: rank(results, 'expected'), high: rank(results, 'high') },
      assumptions: COMPARISON_ASSUMPTIONS,
    }
    return { ok: true, result: comparison }
  })
}

// Flip points (F22, F29) --------------------------------------------------------

/** The net cost at the end of coverage, without building the months: what the searches compare. */
function endNet(prepared: Prepared, savingsReturn: Ratio, valueCase: ValueCase): Money {
  const { coverage, handBack, cashOut, forgone, balance } = prepared
  const opp = opportunity(prepared, savingsReturn)[coverage]!
  // Held to the end of coverage means held at the horizon, where the value is the horizon value exactly (F17).
  const equity = handBack ? ZERO : subtract(prepared.option.car.horizonValue[valueCase], balance[coverage]!)
  return add(subtract(add(cashOut[coverage]!, forgone), equity), opp)
}

const lowerOf = (order: -1 | 0 | 1): Lower => (order < 0 ? 0 : order > 0 ? 1 : 'tie')

function order(a: Prepared, b: Prepared, savingsReturn: Ratio, valueCase: ValueCase): Lower {
  return lowerOf(comparePerMonth(endNet(a, savingsReturn, valueCase), a.coverage, endNet(b, savingsReturn, valueCase), b.coverage))
}

/** The horizon value of `subject` at which it equals `other` per month of coverage: closed form (F29). */
function valueFlip(subject: Prepared, other: Prepared, savingsReturn: Ratio, valueCase: ValueCase, which: 0 | 1): Flip<Money> {
  const current = order(subject, other, savingsReturn, valueCase)
  const asWhich = (lower: Lower): Lower => (lower === 'tie' ? 'tie' : which === 0 ? lower : lower === 0 ? 1 : 0)
  if (subject.handBack) return { kind: 'no-crossing-in-range', lowerThroughout: asWhich(current) }
  // net(X) = k − X with k the net at a horizon value of nothing; equal when (k − X) × C_other = net_other × C_subject.
  const at = subject.option.car.horizonValue[valueCase]
  const k = add(endNet(subject, savingsReturn, valueCase), at)
  const otherNet = endNet(other, savingsReturn, valueCase)
  const crossing = exactAdd(exact(k), exactMul(exact(otherNet), ratio(-subject.coverage, other.coverage)))
  const most = exactMul(exact(subject.option.car.value), MAX_HORIZON_VALUE_RATIO)
  const lowerAtValue = (x: ExactPence): Lower => {
    const left = exactMul(exactAdd(exact(k), exactMul(x, negate(ALL))), ratio(other.coverage, 1))
    const right = exactMul(exact(otherNet), ratio(subject.coverage, 1))
    return asWhich(lowerOf(compareExact(left, right)))
  }
  if (compareExact(crossing, exact(ZERO)) < 0 || compareExact(crossing, most) > 0) {
    return { kind: 'no-crossing-in-range', lowerThroughout: lowerAtValue(exact(ZERO)) }
  }
  const x = roundExact(crossing, 'nearest')
  // Net cost falls as the subject's horizon value rises: the other is lower below the crossing, the subject above.
  const subjectLower: Lower = which === 0 ? 0 : 1
  const otherLower: Lower = which === 0 ? 1 : 0
  return { kind: 'crossing', below: x, above: x, lowerBelow: otherLower, lowerAbove: subjectLower }
}

/** The first change of order on a grid of FLIP_SCAN_STEPS steps over [0, top], narrowed by bisection to neighbours (F29). */
function search(top: number, lowerAt: (k: number) => Lower): Flip<number> {
  const gridPoint = (j: number) => Number(divideRound(BigInt(top) * BigInt(j), BigInt(FLIP_SCAN_STEPS), 'down'))
  let previous = 0
  let previousOrder = lowerAt(0)
  for (let j = 1; j <= FLIP_SCAN_STEPS; j++) {
    const k = gridPoint(j)
    if (k === previous) continue
    const now = lowerAt(k)
    if (now !== previousOrder) {
      let low = previous
      let high = k
      while (high - low > 1) {
        const middle = low + Math.floor((high - low) / 2)
        if (lowerAt(middle) === previousOrder) low = middle
        else high = middle
      }
      return { kind: 'crossing', below: low, above: high, lowerBelow: previousOrder, lowerAbove: lowerAt(high) }
    }
    previous = k
    previousOrder = now
  }
  return { kind: 'no-crossing-in-range', lowerThroughout: previousOrder }
}

/** Two options' flip points in one value case (F22, F29): thresholds, never a recommendation. */
export function flipPoints(options: readonly [CarOption, CarOption], shared: Shared, valueCase: ValueCase): FlipOutcome {
  return guarded(() => {
    const all = prepareAll(options, shared)
    if (!all.ok) return all
    const [a, b] = all.prepared as [Prepared, Prepared]
    const horizonValue = [valueFlip(a, b, shared.savingsReturn, valueCase, 0), valueFlip(b, a, shared.savingsReturn, valueCase, 1)] as const

    const denominator = FLIP_RATE_DENOMINATOR
    const top = Number(
      divideRound(BigInt(MAX_SAVINGS_RETURN.numerator) * BigInt(denominator), BigInt(MAX_SAVINGS_RETURN.denominator), 'down'),
    )
    const rateAt = (k: number) => ratio(k, denominator)
    const rates = search(top, (k) => order(a, b, rateAt(k), valueCase))
    const savingsReturn: Flip<Ratio> =
      // 3d-2: written out field by field to follow `Flip`'s new optional `level` (F53); the same object as before.
      rates.kind === 'crossing'
        ? {
            kind: 'crossing',
            below: rateAt(rates.below),
            above: rateAt(rates.above),
            lowerBelow: rates.lowerBelow,
            lowerAbove: rates.lowerAbove,
          }
        : rates

    const withMileage = (prepared: Prepared, miles: number, index: number): Prepared => {
      const again = prepare({ ...prepared.option, car: { ...prepared.option.car, annualMileage: miles } }, shared.horizonMonths, index)
      if (!again.ok) throw new EngineInputError('the mileage search left the bounds')
      return again.prepared
    }
    const annualMileage = search(MAX_ANNUAL_MILEAGE, (miles) =>
      order(withMileage(a, miles, 0), withMileage(b, miles, 1), shared.savingsReturn, valueCase),
    )

    return { ok: true, result: { valueCase, horizonValue, savingsReturn, annualMileage } }
  })
}
