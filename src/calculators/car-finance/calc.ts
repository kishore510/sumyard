import { MAX_EXCESS_PER_MILE, MAX_FINANCE_RATE, MAX_FINANCE_TERM_MONTHS, MAX_INPUT_AMOUNT, MAX_MILEAGE } from '@/lib/inputLimits'
import {
  add,
  compare,
  compareFactor,
  compareFine,
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
  mulRound,
  RATE_SOLVE_MAX_STEPS,
  RATE_SOLVE_TOLERANCE,
  type Ratio,
  ratio,
  roundFine,
  subtract,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import type {
  CashFlows,
  EndPath,
  FeeTiming,
  FinanceField,
  FinanceOutcome,
  FinanceProblem,
  FinanceProblemReason,
  FinanceResult,
  HirePurchaseInputs,
  LoanInputs,
  PcpInputs,
  Pricing,
  Product,
  RateBasis,
  Schedule,
  ScheduleRow,
  SolveFailure,
} from './types'

/*
 * The car finance engine (slice 3a). Pure: inputs in, results out; no UI,
 * storage, clock or network. The decisions it carries out are F5 to F14 in
 * docs/modelling-decisions-car.md:
 *
 * - F5: monthly periods; payments in arrears; a final payment and a purchase
 *   fee with the last monthly payment.
 * - F6: an annual rate on a 'monthly' basis (a twelfth each month) or an
 *   'annual' basis (the twelfth root), or the payment, which F9 turns into a
 *   rate.
 * - F7: the amortising payment, rounded once to the penny; interest on each
 *   month's opening balance, to the nearest penny; the last month takes the
 *   rounding, so the schedule adds up.
 * - F8, F9: an effective rate solved by bisection from the cash flows, fees
 *   included. It is not the statutory APR, which could not be verified.
 * - F10 to F12: fees, the end of the term, the outstanding balance.
 * - F13: typed refusals, never a wrong number.
 *
 * The engine holds no figure: the calendar divisor comes from lib/periods.ts,
 * input bounds from lib/inputLimits.ts and the solver's precision from
 * lib/money.ts (literals.test.ts).
 */

/** A pure helper was given inputs outside what the engine models (F13). */
export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const NOTHING = ratio(0, 1)
const FACTOR_ZERO = factor(NOTHING)
const HALF = factor(ratio(1, 2))
const BASES: readonly RateBasis[] = ['monthly', 'annual']
const TIMINGS: readonly FeeTiming[] = ['start', 'added']

const isRatio = (value: unknown): value is Ratio => {
  if (typeof value !== 'object' || value === null) return false
  const { numerator, denominator } = value as Ratio
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0
}

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

function refuseUnless(ok: boolean, what: string): void {
  if (!ok) throw new EngineInputError(what)
}

function moneyProblem(value: unknown, most: Money = MAX_INPUT_AMOUNT): FinanceProblemReason | undefined {
  if (!isWhole(value)) return 'not-money'
  if (value < 0) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

function wholeProblem(value: unknown, least: number, most: number): FinanceProblemReason | undefined {
  if (!isWhole(value)) return 'not-whole'
  if (value < least) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

function rateProblem(value: unknown): FinanceProblemReason | undefined {
  if (!isRatio(value)) return 'not-a-rate'
  if (compareRatio(value, NOTHING) < 0) return 'below-minimum'
  if (compareRatio(value, MAX_FINANCE_RATE) > 0) return 'above-maximum'
  return undefined
}

type Check = readonly [FinanceField, FinanceProblemReason | undefined]

function pricingChecks(pricing: Pricing): readonly Check[] {
  if (typeof pricing !== 'object' || pricing === null) return [['pricing', 'not-a-choice']]
  if (pricing.kind === 'rate') {
    return [
      ['rate', rateProblem(pricing.rate)],
      ['basis', BASES.includes(pricing.basis) ? undefined : 'not-a-choice'],
    ]
  }
  if (pricing.kind === 'payment') return [['payment', moneyProblem(pricing.payment)]]
  return [['pricing', 'not-a-choice']]
}

const commonChecks = (inputs: LoanInputs | HirePurchaseInputs | PcpInputs): readonly Check[] => [
  ['term', wholeProblem(inputs.term, 1, MAX_FINANCE_TERM_MONTHS)],
  ...pricingChecks(inputs.pricing),
  ['arrangementFee', moneyProblem(inputs.arrangementFee)],
  ['arrangementFeeTiming', TIMINGS.includes(inputs.arrangementFeeTiming) ? undefined : 'not-a-choice'],
]

/** The price, and the deposit within it: a deposit at or above the price leaves nothing to finance (F13). */
function priceChecks(cashPrice: Money, deposit: Money): readonly Check[] {
  const price = moneyProblem(cashPrice) ?? (cashPrice === 0 ? 'below-minimum' : undefined)
  const down = moneyProblem(deposit) ?? (price === undefined && compare(deposit, cashPrice) >= 0 ? 'above-maximum' : undefined)
  return [
    ['cashPrice', price],
    ['deposit', down],
  ]
}

/** A final payment or balloon may not be more than the amount financed (F13). */
function finalCheck(field: FinanceField, value: Money, cashPrice: Money, deposit: Money): Check {
  const problem = moneyProblem(value)
  if (problem) return [field, problem]
  if (moneyProblem(cashPrice) || moneyProblem(deposit) || compare(deposit, cashPrice) >= 0) return [field, undefined]
  return [field, compare(value, subtract(cashPrice, deposit)) > 0 ? 'above-maximum' : undefined]
}

const toProblems = (checks: readonly Check[]): readonly FinanceProblem[] =>
  checks.flatMap(([field, reason]) => (reason ? [{ field, reason }] : []))

function checkLoan(inputs: LoanInputs): readonly FinanceProblem[] {
  const amount = moneyProblem(inputs.amount) ?? (inputs.amount === 0 ? 'below-minimum' : undefined)
  return toProblems([['amount', amount], ...commonChecks(inputs)])
}

function checkHirePurchase(inputs: HirePurchaseInputs): readonly FinanceProblem[] {
  return toProblems([
    ...priceChecks(inputs.cashPrice, inputs.deposit),
    ...commonChecks(inputs),
    finalCheck('balloon', inputs.balloon, inputs.cashPrice, inputs.deposit),
    ['optionFee', moneyProblem(inputs.optionFee)],
  ])
}

function checkPcp(inputs: PcpInputs): readonly FinanceProblem[] {
  return toProblems([
    ...priceChecks(inputs.cashPrice, inputs.deposit),
    ...commonChecks(inputs),
    finalCheck('finalPayment', inputs.finalPayment, inputs.cashPrice, inputs.deposit),
    ['purchaseFee', moneyProblem(inputs.purchaseFee)],
    ['mileageAllowance', wholeProblem(inputs.mileageAllowance, 0, MAX_MILEAGE)],
    ['expectedMileage', wholeProblem(inputs.expectedMileage, 0, MAX_MILEAGE)],
    ['excessPerMile', moneyProblem(inputs.excessPerMile, MAX_EXCESS_PER_MILE)],
  ])
}

/** A monthly rate: always as a Factor; also as an exact Ratio when it is rational (the 'monthly' basis), so interest rounds exactly. */
export interface MonthlyRate {
  readonly factor: Factor
  readonly exact: Ratio | null
}

/** The monthly rate an annual rate gives on its basis (F6), as a Factor. */
export function monthlyFactor(rate: Ratio, basis: RateBasis): Factor {
  refuseUnless(rateProblem(rate) === undefined, 'rate out of bounds')
  refuseUnless(BASES.includes(basis), 'unknown rate basis')
  if (basis === 'monthly') return factorDivide(factor(rate), factor(ratio(MONTHS_PER_YEAR, 1)))
  return factorSubtract(factorRoot(factorAdd(FACTOR_ONE, factor(rate)), MONTHS_PER_YEAR), FACTOR_ONE)
}

function monthlyRate(rate: Ratio, basis: RateBasis): MonthlyRate {
  const denominator = rate.denominator * MONTHS_PER_YEAR
  const exact = basis === 'monthly' && Number.isSafeInteger(denominator) ? ratio(rate.numerator, denominator) : null
  return { factor: monthlyFactor(rate, basis), exact }
}

/** The annual effective rate of a monthly one: twelve months compounded (F8), to fifteen decimal places. */
export function annualRate(monthly: Factor): Ratio {
  return factorToRatio(factorSubtract(factorPow(factorAdd(FACTOR_ONE, monthly), MONTHS_PER_YEAR), FACTOR_ONE))
}

/**
 * The amortising payment (F7): (A − B v^n) i / (1 − v^n), v = 1 / (1 + i), or
 * (A − B) / n with no interest; worked in fine fixed point and rounded once
 * to the nearest penny.
 */
export function regularPayment(balance: Money, monthly: Factor, term: number, finalPayment: Money): Money {
  refuseUnless(isWhole(term) && term >= 1, 'the term must be a whole number of months from one')
  const owed = fine(balance)
  if (compareFactor(monthly, FACTOR_ZERO) === 0) {
    return roundFine(fineDivide(fineSubtract(owed, fine(finalPayment)), factor(ratio(term, 1))), 'nearest')
  }
  const discount = factorDivide(FACTOR_ONE, factorPow(factorAdd(FACTOR_ONE, monthly), term))
  const numerator = fineMul(fineSubtract(owed, fineMul(fine(finalPayment), discount)), monthly)
  return roundFine(fineDivide(numerator, factorSubtract(FACTOR_ONE, discount)), 'nearest')
}

/** Which figure takes the rounding in the last month (F7): the payment when the rate is given, the interest when the payment is. */
export type LastMonth = 'last-payment' | 'last-interest'

const interestOn = (opening: Money, rate: MonthlyRate): Money =>
  rate.exact ? mulRound(opening, rate.exact, 'nearest') : roundFine(fineMul(fine(opening), rate.factor), 'nearest')

/**
 * The schedule (F7): interest on each month's opening balance to the nearest
 * penny; closing = opening + interest − payment; the last month brings the
 * balance to exactly the final payment. Null when the rounded payment would
 * leave a last payment below nothing.
 */
export function buildSchedule(
  balance: Money,
  monthly: MonthlyRate,
  term: number,
  payment: Money,
  finalPayment: Money,
  last: LastMonth,
): Schedule | null {
  refuseUnless(isWhole(term) && term >= 1, 'the term must be a whole number of months from one')
  const rows: ScheduleRow[] = []
  let opening = balance
  let totalInterest = ZERO
  let totalPayments = ZERO
  for (let month = 1; month <= term; month++) {
    let interest = interestOn(opening, monthly)
    let paid = payment
    if (month === term && last === 'last-payment') paid = subtract(add(opening, interest), finalPayment)
    if (month === term && last === 'last-interest') interest = subtract(add(finalPayment, payment), opening)
    const closing = subtract(add(opening, interest), paid)
    rows.push({ month, opening, interest, payment: paid, closing })
    totalInterest = add(totalInterest, interest)
    totalPayments = add(totalPayments, paid)
    opening = closing
  }
  const lastPayment = rows[rows.length - 1]!.payment
  if (compare(lastPayment, ZERO) < 0) return null
  return { rows, regularPayment: payment, lastPayment, finalPayment, totalInterest, totalPayments }
}

/** Σ payment_t (1 + rate)^−t, t from one, by Horner's rule in fine fixed point. */
function presentValue(payments: readonly Money[], rate: Factor): FinePence {
  const discount = factorDivide(FACTOR_ONE, factorAdd(FACTOR_ONE, rate))
  let total = FINE_ZERO
  for (let t = payments.length - 1; t >= 0; t--) total = fineMul(fineAdd(fine(payments[t]!), total), discount)
  return total
}

/**
 * The rate per period at which the payments discount to the credit (F8), by
 * bisection (F9): the root lies in [0, 1]; each step halves the bracket until
 * it is no wider than RATE_SOLVE_TOLERANCE, and the midpoint is returned. A
 * refusal when there is no rate in that range, or the step bound is reached.
 */
export function solveRate(
  flows: CashFlows,
): { readonly ok: true; readonly rate: Factor } | { readonly ok: false; readonly reason: SolveFailure } {
  refuseUnless(
    flows.payments.every((payment) => compare(payment, ZERO) >= 0),
    'payments must be zero or more',
  )
  if (compare(flows.credit, ZERO) <= 0) return { ok: false, reason: 'no-solution' }
  const credit = fine(flows.credit)
  const excess = (rate: Factor) => compareFine(presentValue(flows.payments, rate), credit)
  const atZero = excess(FACTOR_ZERO)
  if (atZero === 0) return { ok: true, rate: FACTOR_ZERO }
  if (atZero < 0 || excess(FACTOR_ONE) > 0) return { ok: false, reason: 'no-solution' }
  let low = FACTOR_ZERO
  let high = FACTOR_ONE
  for (let step = 0; compareFactor(factorSubtract(high, low), RATE_SOLVE_TOLERANCE) > 0; step++) {
    if (step >= RATE_SOLVE_MAX_STEPS) return { ok: false, reason: 'no-convergence' }
    const middle = factorMul(factorAdd(low, high), HALF)
    if (excess(middle) > 0) low = middle
    else high = middle
  }
  return { ok: true, rate: factorMul(factorAdd(low, high), HALF) }
}

const COMMON_ASSUMPTIONS: readonly string[] = [
  'Payments are monthly and in arrears: the first a month after the start, the last at the end of the term. A month is a twelfth of a year; days are not counted.',
  'Interest is charged each month on the balance at the start of the month and rounded to the penny. When the rate is given, the last monthly payment takes the rounding; when the payment is given, the last month’s interest does.',
  'An arrangement fee is either paid at the start or added to the balance, where it earns interest.',
  'The effective rate is the monthly rate at which every payment, fees included, discounts back to the credit received, compounded over a year for the annual figure. It is not the statutory APR: the APR rules could not be verified here, and the two can differ.',
  'The outstanding balance is the schedule’s balance after each payment, not a settlement figure: early settlement and voluntary termination are not modelled.',
  'No tax, insurance, running costs or depreciation are included.',
]

const PRODUCT_ASSUMPTIONS: Readonly<Record<Product, readonly string[]>> = {
  loan: ['The loan pays for the car, so it is yours from the start.'],
  'hire-purchase': [
    'Any balloon and the option to purchase fee are paid with the last monthly payment; the car is yours once they are paid.',
  ],
  pcp: [
    'At the end you either buy the car, paying the optional final payment and the purchase fee with the last monthly payment, or hand it back and pay only the excess mileage charge on the miles over the allowance.',
    'Condition and damage charges on handing the car back are not modelled.',
    'The effective rate assumes you buy the car at the end.',
  ],
}

/** The three agreements, brought to one shape. */
interface Agreement {
  readonly product: Product
  readonly price: Money
  readonly deposit: Money
  readonly term: number
  readonly pricing: Pricing
  readonly arrangementFee: Money
  readonly timing: FeeTiming
  readonly finalPayment: Money
  readonly purchaseFee: Money
  readonly mileage: { readonly allowance: number; readonly expected: number; readonly perMile: Money } | null
}

type Priced =
  | { readonly ok: true; readonly rate: MonthlyRate; readonly schedule: Schedule }
  | { readonly ok: false; readonly problem: FinanceProblem }

/** The schedule from a rate, or from a payment by solving for the rate (F6, F7, F9). */
function price(agreement: Agreement, balance: Money): Priced {
  const { pricing, term, finalPayment } = agreement
  if (pricing.kind === 'rate') {
    const rate = monthlyRate(pricing.rate, pricing.basis)
    const schedule = buildSchedule(
      balance,
      rate,
      term,
      regularPayment(balance, rate.factor, term, finalPayment),
      finalPayment,
      'last-payment',
    )
    return schedule ? { ok: true, rate, schedule } : { ok: false, problem: { field: 'result', reason: 'not-payable' } }
  }
  const payments = Array.from({ length: term }, (_, index) => (index === term - 1 ? add(pricing.payment, finalPayment) : pricing.payment))
  if (compare(add(mulRound(pricing.payment, ratio(term, 1), 'nearest'), finalPayment), balance) < 0) {
    return { ok: false, problem: { field: 'payment', reason: 'below-minimum' } }
  }
  const solved = solveRate({ credit: balance, payments })
  if (!solved.ok)
    return { ok: false, problem: { field: 'payment', reason: solved.reason === 'no-solution' ? 'above-maximum' : 'not-payable' } }
  const rate = { factor: solved.rate, exact: null }
  const schedule = buildSchedule(balance, rate, term, pricing.payment, finalPayment, 'last-interest')
  return schedule ? { ok: true, rate, schedule } : { ok: false, problem: { field: 'result', reason: 'not-payable' } }
}

function compute(agreement: Agreement): FinanceOutcome {
  const { deposit, arrangementFee, timing, finalPayment, purchaseFee, mileage } = agreement
  const amountFinanced = subtract(agreement.price, deposit)
  const balanceFinanced = timing === 'added' ? add(amountFinanced, arrangementFee) : amountFinanced
  const priced = price(agreement, balanceFinanced)
  if (!priced.ok) return { ok: false, problems: [priced.problem] }
  const { schedule } = priced

  const credit = timing === 'start' ? subtract(amountFinanced, arrangementFee) : amountFinanced
  const flows = schedule.rows.map((row) => row.payment)
  flows[flows.length - 1] = add(add(flows[flows.length - 1]!, finalPayment), purchaseFee)
  const solved = solveRate({ credit, payments: flows })

  const paidAlong = add(add(deposit, timing === 'start' ? arrangementFee : ZERO), schedule.totalPayments)
  const own: EndPath = {
    ownsCar: true,
    finalPayment,
    purchaseFee,
    excessMiles: 0,
    excessMileageCharge: ZERO,
    totalCost: add(add(paidAlong, finalPayment), purchaseFee),
  }
  let handBack: EndPath | null = null
  if (mileage) {
    const excessMiles = Math.max(0, mileage.expected - mileage.allowance)
    const excessMileageCharge = mulRound(mileage.perMile, ratio(excessMiles, 1), 'nearest')
    handBack = {
      ownsCar: false,
      finalPayment: ZERO,
      purchaseFee: ZERO,
      excessMiles,
      excessMileageCharge,
      totalCost: add(paidAlong, excessMileageCharge),
    }
  }

  return {
    ok: true,
    result: {
      estimate: true,
      product: agreement.product,
      amountFinanced,
      deposit,
      balanceFinanced,
      monthlyRate: factorToRatio(priced.rate.factor),
      schedule,
      arrangementFee,
      costOfCredit: add(add(schedule.totalInterest, arrangementFee), purchaseFee),
      effectiveRate: solved.ok
        ? { ok: true, monthly: factorToRatio(solved.rate), annual: annualRate(solved.rate) }
        : { ok: false, reason: solved.reason },
      own,
      handBack,
      assumptions: [...COMMON_ASSUMPTIONS, ...PRODUCT_ASSUMPTIONS[agreement.product]],
    },
  }
}

function run(problems: readonly FinanceProblem[], agreement: () => Agreement): FinanceOutcome {
  if (problems.length > 0) return { ok: false, problems }
  try {
    return compute(agreement())
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, problems: [{ field: 'result', reason: 'too-large' }] }
    throw error
  }
}

const common = (inputs: LoanInputs | HirePurchaseInputs | PcpInputs) => ({
  term: inputs.term,
  pricing: inputs.pricing,
  arrangementFee: inputs.arrangementFee,
  timing: inputs.arrangementFeeTiming,
})

/** A personal loan (F11), or a typed refusal (F13). */
export function loan(inputs: LoanInputs): FinanceOutcome {
  return run(checkLoan(inputs), () => ({
    product: 'loan',
    price: inputs.amount,
    deposit: ZERO,
    ...common(inputs),
    finalPayment: ZERO,
    purchaseFee: ZERO,
    mileage: null,
  }))
}

/** Hire purchase (F11), or a typed refusal (F13). */
export function hirePurchase(inputs: HirePurchaseInputs): FinanceOutcome {
  return run(checkHirePurchase(inputs), () => ({
    product: 'hire-purchase',
    price: inputs.cashPrice,
    deposit: inputs.deposit,
    ...common(inputs),
    finalPayment: inputs.balloon,
    purchaseFee: inputs.optionFee,
    mileage: null,
  }))
}

/** PCP with both end paths (F11), or a typed refusal (F13). */
export function pcp(inputs: PcpInputs): FinanceOutcome {
  return run(checkPcp(inputs), () => ({
    product: 'pcp',
    price: inputs.cashPrice,
    deposit: inputs.deposit,
    ...common(inputs),
    finalPayment: inputs.finalPayment,
    purchaseFee: inputs.purchaseFee,
    mileage: { allowance: inputs.mileageAllowance, expected: inputs.expectedMileage, perMile: inputs.excessPerMile },
  }))
}

/**
 * The balance still owed after `month` payments (F12): the balance financed
 * at month 0, the schedule's closing balance through the term (the final
 * payment at the end), nothing after. Not a settlement figure.
 */
export function outstandingBalance(result: FinanceResult, month: number): Money {
  refuseUnless(isWhole(month) && month >= 0, 'the month must be a whole number from nothing')
  if (month === 0) return result.balanceFinanced
  const row = result.schedule.rows[month - 1]
  return row ? row.closing : ZERO
}
