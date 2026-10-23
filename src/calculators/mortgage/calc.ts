import {
  annualRate,
  EngineInputError,
  interestOn,
  isRateInBounds,
  type MonthlyRate,
  monthlyFactor,
  monthlyRate,
  regularPayment,
} from '@/lib/amortising'
import { addMonths, DAYS_IN_COMMON_YEAR, daysByYear, daysInYear, LAST_ISO_YEAR } from '@/lib/calendar'
import { MAX_FINANCE_RATE, MAX_INPUT_AMOUNT, MAX_LIST_ITEMS, MAX_MORTGAGE_TERM_MONTHS } from '@/lib/inputLimits'
import { type IsoDate, isIsoDate } from '@/lib/isoDate'
import {
  add,
  compare,
  compareRatio,
  type ExactPence,
  exact,
  exactAdd,
  exactMul,
  FACTOR_ONE,
  type Factor,
  factor,
  factorAdd,
  factorMul,
  factorSubtract,
  factorToRatio,
  type Money,
  MoneyError,
  min,
  mulRound,
  type Ratio,
  ratio,
  roundExact,
  subtract,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import type {
  AllowanceYear,
  BalancePoint,
  ChargeOutcome,
  DayCount,
  InterestMethod,
  MonthRow,
  MortgageField,
  MortgageInputs,
  MortgageOutcome,
  MortgagePolicy,
  MortgageProblem,
  MortgageProblemReason,
  MortgageResult,
  MortgageWarning,
  OverpaymentEffect,
  PeriodReturn,
  RatePeriod,
  RepaymentType,
  Schedule,
  YearRow,
} from './types'

/*
 * The mortgage overpayment engine (M1). Pure: inputs in, results out; no UI,
 * storage, clock or network, and no import of another calculator (MO15): the
 * schedule helpers are src/lib/amortising.ts, the calendar src/lib/calendar.ts.
 * It carries out decisions MO1 to MO13 in docs/modelling-decisions.md, with
 * the rounding per step in docs/money.md:
 *
 * - MO1, MO2: monthly payments in arrears on the start date's day; repayment
 *   (a level payment, the last taking the rounding) or interest-only.
 * - MO3: 'monthly' interest (a twelfth of the rate, to the nearest penny) or
 *   'daily' (each day exact, rounded once when charged), on a common year or
 *   each day's own year.
 * - MO4, MO5: at the fixed-rate end, and after an overpayment with
 *   'reduce-payment', the payment is worked out again over the months left
 *   (the shortened schedule's with 'reduce-term').
 * - MO6, MO8: overpayments on payment dates only, after the payment, never
 *   below nothing; in the schedule's last month the overpayment goes first
 *   and the payment is what remains.
 * - MO7, MO10: the charge on the excess over each allowance year's
 *   allowance (rounded down), to the nearest penny, paid in cash.
 * - MO9: interest saved, the net saving and break-even with a charge, and
 *   the effective return per rate period.
 * - MO12: typed refusals by field, never a clamp; warnings for what is not
 *   used or is charged.
 */

/** The policy a fresh mortgage starts with (MO3, MR-10): monthly interest; a common year if daily is chosen. */
export const DEFAULT_MORTGAGE_POLICY: MortgagePolicy = { interestMethod: 'monthly', dayCount: 'actual/365' }

const TYPES: readonly RepaymentType[] = ['repayment', 'interest-only']
const EFFECTS: readonly OverpaymentEffect[] = ['reduce-term', 'reduce-payment']
const METHODS: readonly InterestMethod[] = ['daily', 'monthly']
const DAY_COUNTS: readonly DayCount[] = ['actual/365', 'actual/actual']

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

type Check = readonly [MortgageField, MortgageProblemReason | undefined, number?]

function moneyProblem(value: unknown, least: number): MortgageProblemReason | undefined {
  if (!isWhole(value)) return 'not-money'
  if (value < least) return 'below-minimum'
  if (value > MAX_INPUT_AMOUNT) return 'above-maximum'
  return undefined
}

function wholeProblem(value: unknown, least: number, most: number): MortgageProblemReason | undefined {
  if (!isWhole(value)) return 'not-whole'
  if (value < least) return 'below-minimum'
  if (value > most) return 'above-maximum'
  return undefined
}

function rateProblem(value: unknown): MortgageProblemReason | undefined {
  if (isRateInBounds(value)) return undefined
  if (!isObject(value)) return 'not-a-rate'
  const { numerator, denominator } = value as unknown as Ratio
  if (!isWhole(numerator) || !isWhole(denominator) || denominator <= 0) return 'not-a-rate'
  return compareRatio(value as unknown as Ratio, MAX_FINANCE_RATE) > 0 ? 'above-maximum' : 'below-minimum'
}

const choice = <T>(value: unknown, options: readonly T[]) => (options.includes(value as T) ? undefined : 'not-a-choice')

function regularChecks(regular: unknown, term: number): readonly Check[] {
  if (regular === null) return []
  if (!isObject(regular)) return [['regular', 'not-a-choice']]
  const from = wholeProblem(regular.fromMonth, 1, term)
  const to =
    wholeProblem(regular.toMonth, 1, term) ??
    (from === undefined && (regular.toMonth as number) < (regular.fromMonth as number) ? 'out-of-order' : undefined)
  return [
    ['regularAmount', moneyProblem(regular.amount, 0)],
    ['regularFromMonth', from],
    ['regularToMonth', to],
  ]
}

function lumpChecks(lumps: unknown, term: number): readonly Check[] {
  if (!Array.isArray(lumps)) return [['lumpSums', 'not-a-choice']]
  if (lumps.length > MAX_LIST_ITEMS) return [['lumpSums', 'too-many']]
  return lumps.flatMap((lump: unknown, index): Check[] => {
    if (!isObject(lump)) return [['lumpSums', 'not-a-choice', index]]
    return [
      ['lumpSumMonth', wholeProblem(lump.month, 1, term), index],
      ['lumpSumAmount', moneyProblem(lump.amount, 0), index],
    ]
  })
}

function chargeChecks(erc: unknown, term: number): readonly Check[] {
  if (erc === null) return []
  if (!isObject(erc)) return [['erc', 'not-a-choice']]
  const allowance = erc.allowance
  const allowanceCheck: Check = !isObject(allowance)
    ? ['allowance', 'not-a-choice']
    : allowance.kind === 'rate'
      ? ['allowanceRate', rateProblem(allowance.rate)]
      : allowance.kind === 'amount'
        ? ['allowanceAmount', moneyProblem(allowance.amount, 0)]
        : ['allowance', 'not-a-choice']
  return [['ercRate', rateProblem(erc.rate)], ['ercEndMonth', wholeProblem(erc.endMonth, 0, term)], allowanceCheck]
}

/** Every problem with the inputs, by field (MO12); empty when the engine can run. Never throws on untrusted shapes. */
export function checkInputs(inputs: MortgageInputs): readonly MortgageProblem[] {
  const i = (isObject(inputs) ? inputs : {}) as Record<string, unknown>
  const termProblem = wholeProblem(i.termMonths, 1, MAX_MORTGAGE_TERM_MONTHS)
  const term = termProblem ? MAX_MORTGAGE_TERM_MONTHS : (i.termMonths as number)
  const dateProblem = !isIsoDate(i.startDate)
    ? 'not-a-date'
    : !termProblem && Number(addMonths(i.startDate, term).split('-')[0]) > LAST_ISO_YEAR
      ? 'above-maximum'
      : undefined
  const policy = isObject(i.policy) ? i.policy : {}
  const checks: Check[] = [
    ['startDate', dateProblem],
    ['balance', moneyProblem(i.balance, 1)],
    ['termMonths', termProblem],
    ['repaymentType', choice(i.repaymentType, TYPES)],
    ['fixedRate', rateProblem(i.fixedRate)],
    ['fixedEndMonth', wholeProblem(i.fixedEndMonth, 0, term)],
    ['reversionRate', rateProblem(i.reversionRate)],
    ['effect', choice(i.effect, EFFECTS)],
    ...regularChecks(i.regular, term),
    ...lumpChecks(i.lumpSums, term),
    ...chargeChecks(i.erc, term),
    ['interestMethod', choice(policy.interestMethod, METHODS)],
    ['dayCount', choice(policy.dayCount, DAY_COUNTS)],
  ]
  return checks.flatMap(([field, reason, index]) => (reason ? [index === undefined ? { field, reason } : { field, reason, index }] : []))
}

/** What the schedule needs, worked out once per run. */
interface Plan {
  readonly inputs: MortgageInputs
  readonly rates: Readonly<Record<RatePeriod, Ratio>>
  readonly monthly: Readonly<Record<RatePeriod, MonthlyRate>>
}

const periodOf = (month: number, fixedEnd: number): RatePeriod => (month <= fixedEnd ? 'fixed' : 'reversion')

/** A month's interest (MO3, MO10): a twelfth to the nearest penny, or day by day exact and rounded once. */
function interestFor(plan: Plan, month: number, balance: Money, period: RatePeriod): Money {
  const { startDate, policy } = plan.inputs
  if (policy.interestMethod === 'monthly') return interestOn(balance, plan.monthly[period])
  const rate = plan.rates[period]
  let accrued: ExactPence = exact(ZERO)
  for (const { year, days } of daysByYear(addMonths(startDate, month - 1), addMonths(startDate, month))) {
    const basis = policy.dayCount === 'actual/365' ? DAYS_IN_COMMON_YEAR : daysInYear(year)
    accrued = exactAdd(accrued, exactMul(exactMul(exact(balance), rate), ratio(days, basis)))
  }
  return roundExact(accrued, 'nearest')
}

/** Months a payment takes to clear a balance at a monthly rate, with no more overpayments, up to `most` (MO5's shortened schedule). */
function monthsToClear(balance: Money, payment: Money, rate: MonthlyRate, most: number): number {
  let owed = balance
  let months = 0
  while (compare(owed, ZERO) > 0 && months < most) {
    owed = subtract(add(owed, interestOn(owed, rate)), payment)
    months++
  }
  return Math.max(months, 1)
}

/** Each month's overpayment asked for: the regular amount in its months and the lump sums (MO6). */
function askedByMonth(inputs: MortgageInputs): Map<number, Money> {
  const asked = new Map<number, Money>()
  const put = (month: number, amount: Money) => asked.set(month, add(asked.get(month) ?? ZERO, amount))
  if (inputs.regular) for (let m = inputs.regular.fromMonth; m <= inputs.regular.toMonth; m++) put(m, inputs.regular.amount)
  for (const lump of inputs.lumpSums) put(lump.month, lump.amount)
  return asked
}

interface Run {
  readonly schedule: Schedule
  readonly allowances: readonly AllowanceYear[]
}

const yearOf = (month: number) => Math.floor((month - 1) / MONTHS_PER_YEAR) + 1

/** One schedule to the end of the term, with the overpayments asked for (none for the baseline). */
function schedule(plan: Plan, asked: ReadonlyMap<number, Money>): Run {
  const { inputs } = plan
  const { termMonths: term, fixedEndMonth: fixedEnd, repaymentType, effect, erc } = inputs
  const repayment = repaymentType === 'repayment'
  const rows: MonthRow[] = []
  const allowances: { year: number; allowance: Money; overpaid: Money; charged: Money }[] = []
  let balance = inputs.balance
  let payment = repayment ? regularPayment(balance, monthlyFactor(plan.rates[periodOf(1, fixedEnd)], 'monthly'), term, ZERO) : ZERO
  let lastMonth = term
  let overpaidBefore = false
  let overpaidLastMonth = false
  let paymentAfterFixedEnd: Money | null = null
  let payoffMonth: number | null = null

  for (let month = 1; month <= term; month++) {
    const period = periodOf(month, fixedEnd)
    const opening = balance
    const want = asked.get(month) ?? ZERO
    const charged = erc !== null && month <= erc.endMonth
    if (charged && (month - 1) % MONTHS_PER_YEAR === 0) {
      const allowance = erc.allowance.kind === 'rate' ? mulRound(opening, erc.allowance.rate, 'down') : erc.allowance.amount
      allowances.push({ year: yearOf(month), allowance, overpaid: ZERO, charged: ZERO })
    }
    if (compare(opening, ZERO) === 0) {
      rows.push({
        month,
        date: addMonths(inputs.startDate, month),
        period,
        opening,
        interest: ZERO,
        payment: ZERO,
        overpayment: ZERO,
        unused: want,
        erc: ZERO,
        closing: ZERO,
      })
      continue
    }

    const fixedEndsNow = month === fixedEnd + 1 && fixedEnd > 0
    if (repayment && (fixedEndsNow || (effect === 'reduce-payment' && overpaidLastMonth))) {
      const contractLeft = term - month + 1
      const left =
        effect === 'reduce-term' && overpaidBefore
          ? Math.min(contractLeft, monthsToClear(opening, payment, plan.monthly[periodOf(month - 1, fixedEnd)], contractLeft))
          : contractLeft
      payment = regularPayment(opening, monthlyFactor(plan.rates[period], 'monthly'), left, ZERO)
      lastMonth = month - 1 + left
    }

    const interest = interestFor(plan, month, opening, period)
    const due = add(opening, interest)
    let paid: Money
    let used: Money
    if (repayment && month === lastMonth) {
      used = min(want, due)
      paid = subtract(due, used)
    } else {
      paid = repayment ? min(payment, due) : interest
      used = min(want, subtract(due, paid))
    }
    if (fixedEndsNow) paymentAfterFixedEnd = repayment ? payment : paid

    let charge = ZERO
    const year = allowances.at(-1)
    if (charged && year && compare(used, ZERO) > 0) {
      const excess = (overpaid: Money) => (compare(overpaid, year.allowance) > 0 ? subtract(overpaid, year.allowance) : ZERO)
      const before = excess(year.overpaid)
      year.overpaid = add(year.overpaid, used)
      charge = mulRound(subtract(excess(year.overpaid), before), erc.rate, 'nearest')
      year.charged = add(year.charged, charge)
    }

    balance = subtract(subtract(due, paid), used)
    if (compare(balance, ZERO) === 0 && payoffMonth === null) payoffMonth = month
    overpaidLastMonth = compare(used, ZERO) > 0
    overpaidBefore ||= overpaidLastMonth
    rows.push({
      month,
      date: addMonths(inputs.startDate, month),
      period,
      opening,
      interest,
      payment: paid,
      overpayment: used,
      unused: subtract(want, used),
      erc: charge,
      closing: balance,
    })
  }

  const sum = (pick: (row: MonthRow) => Money, upTo = term) => rows.slice(0, upTo).reduce((total, row) => add(total, pick(row)), ZERO)
  const totalPayments = sum((row) => row.payment)
  const totalOverpaid = sum((row) => row.overpayment)
  const totalErc = sum((row) => row.erc)
  return {
    schedule: {
      rows,
      paymentNow: rows[0]!.payment,
      paymentAfterFixedEnd,
      balanceAtFixedEnd: fixedEnd > 0 ? rows[fixedEnd - 1]!.closing : null,
      totalInterest: sum((row) => row.interest),
      interestToFixedEnd: sum((row) => row.interest, fixedEnd),
      totalPayments,
      totalOverpaid,
      totalErc,
      totalPaid: add(add(totalPayments, totalOverpaid), totalErc),
      payoffMonth,
      payoffDate: payoffMonth === null ? null : addMonths(inputs.startDate, payoffMonth),
      owedAtEnd: balance,
    },
    allowances,
  }
}

/** The effective guaranteed return of one rate period (MO9): a twelfth compounded, or twelve months of daily interest from the period start. */
function periodReturn(plan: Plan, period: RatePeriod, from: IsoDate): Ratio {
  const rate = plan.rates[period]
  const { interestMethod, dayCount } = plan.inputs.policy
  if (interestMethod === 'monthly') return annualRate(monthlyFactor(rate, 'monthly'))
  let growth: Factor = FACTOR_ONE
  for (let month = 1; month <= MONTHS_PER_YEAR; month++) {
    let share: Factor = factor(ratio(0, 1))
    for (const { year, days } of daysByYear(addMonths(from, month - 1), addMonths(from, month))) {
      const basis = dayCount === 'actual/365' ? DAYS_IN_COMMON_YEAR : daysInYear(year)
      share = factorAdd(share, factor(ratio(rate.numerator * days, rate.denominator * basis)))
    }
    growth = factorMul(growth, factorAdd(FACTOR_ONE, share))
  }
  return factorToRatio(factorSubtract(growth, FACTOR_ONE))
}

/** The first month from which interest saved so far stays at least the charge paid so far; null if not by the end (MO9). */
function breakEven(baseline: Schedule, overpaying: Schedule): number | null {
  let saved = ZERO
  let charged = ZERO
  let from: number | null = null
  baseline.rows.forEach((row, index) => {
    const other = overpaying.rows[index]!
    saved = add(saved, subtract(row.interest, other.interest))
    charged = add(charged, other.erc)
    if (compare(saved, charged) < 0) from = null
    else from ??= row.month
  })
  return from
}

function yearRows(baseline: Schedule, overpaying: Schedule, term: number): YearRow[] {
  const years: YearRow[] = []
  for (let fromMonth = 1; fromMonth <= term; fromMonth += MONTHS_PER_YEAR) {
    const toMonth = Math.min(fromMonth + MONTHS_PER_YEAR - 1, term)
    const total = (s: Schedule, pick: (row: MonthRow) => Money) =>
      s.rows.slice(fromMonth - 1, toMonth).reduce((t, row) => add(t, pick(row)), ZERO)
    years.push({
      year: yearOf(fromMonth),
      fromMonth,
      toMonth,
      baselineInterest: total(baseline, (row) => row.interest),
      overpayingInterest: total(overpaying, (row) => row.interest),
      overpaid: total(overpaying, (row) => row.overpayment),
      erc: total(overpaying, (row) => row.erc),
      baselineClosing: baseline.rows[toMonth - 1]!.closing,
      overpayingClosing: overpaying.rows[toMonth - 1]!.closing,
    })
  }
  return years
}

/** Plain words, no figures (MO3 to MO12): what the result rests on, for the page's assumptions panel. */
function assumptionsFor(inputs: MortgageInputs): string[] {
  const { interestMethod, dayCount } = inputs.policy
  const out = [
    'Payments are monthly, at the end of each month, on the start date’s day or a shorter month’s last day. Each payment is rounded to the nearest penny and the last payment takes the rounding.',
  ]
  if (interestMethod === 'monthly') {
    out.push(
      'Interest is worked out monthly: each month’s interest is the balance after the last payment times a twelfth of the annual rate, rounded to the nearest penny. Lenders differ; a statement can show which way yours works.',
    )
  } else {
    out.push(
      'Interest is worked out daily: each day’s interest is that day’s balance times the annual rate over the days in a year, kept exact through the month and rounded to the nearest penny when it is charged on the payment date.',
      dayCount === 'actual/365'
        ? 'Every day counts as a share of a common year of three hundred and sixty-five days, a leap year’s days included.'
        : 'Each day counts as a share of its own year, so a leap year’s days are each a slightly smaller share.',
    )
  }
  out.push(
    'Overpayments are taken on payment dates only, with that month’s payment, so daily and monthly interest differ only slightly, by their day counts, not by when an overpayment counts.',
    'When the fixed rate ends, the payment is worked out again at the reversion rate on the balance then. The reversion rate is a guess at a rate no one can know yet, assumed to the end of the term.',
  )
  if (inputs.repaymentType === 'interest-only') {
    out.push(
      'On an interest-only mortgage the payment is the month’s interest and the amount borrowed is owed at the end. An overpayment lowers what is owed, so the interest and the amount owed at the end fall; a shorter term or a lower payment does not apply.',
    )
  } else if (inputs.effect === 'reduce-term') {
    out.push(
      'An overpayment keeps the payment as it is and leads to a shorter term. When the fixed rate ends, the new payment is worked out over the months the shortened schedule had left, so the time saved is kept.',
    )
  } else {
    out.push(
      'An overpayment leads to a lower payment from the next payment date, worked out again on the lower balance over the months left in the contract.',
    )
  }
  out.push(
    'An overpayment never takes the balance below nothing: only what clears it is used, and the rest is shown as not used. In the last month an overpayment goes first and the payment is what remains.',
    'An early repayment charge, when entered, is a share of what is overpaid above the penalty-free allowance in each allowance year of twelve payments from the start date, up to the charge’s end month. A percentage allowance is a share of the balance at the start of each allowance year, rounded down to the penny; unused allowance does not carry over. The charge is rounded to the nearest penny and paid from your pocket on the day, not added to the balance.',
    'Interest saved is shown over the whole term, with the reversion rate assumed to the end, and up to the fixed-rate end. The guaranteed return is what a pound overpaid saves in interest, as an effective annual rate for each rate period. With a charge, the net saving is the interest saved less the charge, and break-even is the first month from which the interest saved so far stays at least the charge paid so far.',
    'A balance up to the largest amount the app accepts, a term in whole months up to the longest it accepts, and rates up to the largest it accepts; anything outside is refused, never changed.',
    'Not modelled: product or exit fees, offset, payment holidays, more than one product after the fixed rate, and tax.',
  )
  return out
}

function warningsFor(inputs: MortgageInputs, overpaying: Schedule, allowances: readonly AllowanceYear[]): MortgageWarning[] {
  const warnings: MortgageWarning[] = []
  for (const row of overpaying.rows)
    if (compare(row.unused, ZERO) > 0) warnings.push({ kind: 'unused-overpayment', month: row.month, amount: row.unused })
  for (const year of allowances)
    if (compare(year.charged, ZERO) > 0) warnings.push({ kind: 'over-allowance', year: year.year, charge: year.charged })
  const asksAny =
    (inputs.regular !== null && compare(inputs.regular.amount, ZERO) > 0) || inputs.lumpSums.some((l) => compare(l.amount, ZERO) > 0)
  if (inputs.repaymentType === 'interest-only' && asksAny) warnings.push({ kind: 'effect-not-applicable' })
  return warnings
}

function compute(inputs: MortgageInputs): MortgageResult {
  const rates = { fixed: inputs.fixedRate, reversion: inputs.reversionRate }
  const plan: Plan = {
    inputs,
    rates,
    monthly: { fixed: monthlyRate(rates.fixed, 'monthly'), reversion: monthlyRate(rates.reversion, 'monthly') },
  }
  const { termMonths: term, fixedEndMonth: fixedEnd } = inputs
  const baseline = schedule(plan, new Map()).schedule
  const run = schedule(plan, askedByMonth(inputs))
  const overpaying = run.schedule
  const interestSaved = subtract(baseline.totalInterest, overpaying.totalInterest)
  const charge: ChargeOutcome | null =
    compare(overpaying.totalErc, ZERO) > 0
      ? {
          paid: overpaying.totalErc,
          netSaving: subtract(interestSaved, overpaying.totalErc),
          breakEvenMonth: breakEven(baseline, overpaying),
        }
      : null
  const balances: BalancePoint[] = [{ month: 0, baseline: inputs.balance, overpaying: inputs.balance }]
  for (let m = 1; m <= term; m++)
    balances.push({ month: m, baseline: baseline.rows[m - 1]!.closing, overpaying: overpaying.rows[m - 1]!.closing })
  const returns: PeriodReturn[] = []
  if (fixedEnd > 0) returns.push({ period: 'fixed', rate: rates.fixed, effective: periodReturn(plan, 'fixed', inputs.startDate) })
  if (fixedEnd < term)
    returns.push({
      period: 'reversion',
      rate: rates.reversion,
      effective: periodReturn(plan, 'reversion', addMonths(inputs.startDate, fixedEnd)),
    })
  return {
    baseline,
    overpaying,
    monthsSaved: (baseline.payoffMonth ?? term) - (overpaying.payoffMonth ?? term),
    interestSaved,
    interestSavedToFixedEnd: fixedEnd > 0 ? subtract(baseline.interestToFixedEnd, overpaying.interestToFixedEnd) : null,
    charge,
    allowances: run.allowances,
    years: yearRows(baseline, overpaying, term),
    balances,
    returns,
    warnings: warningsFor(inputs, overpaying, run.allowances),
    assumptions: assumptionsFor(inputs),
  }
}

/**
 * A mortgage without and with overpayments (MO1 to MO13). Refuses by field,
 * never throws: inputs outside the bounds are named (MO12), and a result past
 * the safe range is refused as too large.
 */
export function overpay(inputs: MortgageInputs): MortgageOutcome {
  const problems = checkInputs(inputs)
  if (problems.length > 0) return { ok: false, problems }
  try {
    return { ok: true, result: compute(inputs) }
  } catch (error) {
    if (error instanceof MoneyError || error instanceof EngineInputError)
      return { ok: false, problems: [{ field: 'result', reason: 'too-large' }] }
    throw error
  }
}
