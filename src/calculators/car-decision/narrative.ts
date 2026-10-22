import { formatPercent } from '@/lib/format'
import {
  add,
  compare,
  compareRatio,
  exact,
  exactMul,
  type Money,
  type Ratio,
  ratio,
  roundExact,
  subtract,
  toPence,
  ZERO,
} from '@/lib/money'
import type { Breakdown, CarOption, Comparison, OwnershipResult, ValueCase } from '../car-ownership/types'
import { CASE_LABELS, type OptionStatus } from './definition'
import { breakdownParts, lowest, type Part } from './results'

/*
 * The car decision's results in words (session 3d-1): which option has the
 * lowest net cost, by how much and why, before any detail. Every sentence
 * is generated from the engine's comparison (compareOptions): its
 * full-coverage ranking, its net costs, breakdowns and cash flows. The only
 * arithmetic is on the engine's whole-penny amounts: differences of net
 * costs and sums of breakdown parts, and a total over the months owned,
 * rounded once to the nearest penny as the engine rounds its own figure
 * per month (F27). Options that don't cover the whole horizon are never
 * compared by total. No option is called anything stronger than "the
 * lowest net cost under these assumptions"; nothing tells anyone what to
 * do. No UI.
 */

type Gbp = (amount: Money) => string

const list = (names: readonly string[], joiner = 'and') =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${joiner} ${names.at(-1)}`

const abs = (amount: Money) => (compare(amount, ZERO) < 0 ? subtract(ZERO, amount) : amount)

/** A total over the months owned, to the nearest penny (as the engine's net cost per month of coverage). */
const perMonth = (total: Money, months: number) => roundExact(exactMul(exact(total), ratio(1, months)), 'nearest')

/** −1, 0 or 1 as a total over `monthsA` is below, equal to or above one over `monthsB`, per month, exactly. */
function comparePerMonth(a: Money, monthsA: number, b: Money, monthsB: number): -1 | 0 | 1 {
  const left = BigInt(toPence(a)) * BigInt(monthsB)
  const right = BigInt(toPence(b)) * BigInt(monthsA)
  return left < right ? -1 : left > right ? 1 : 0
}

/** Each option's name by its engine index, from the page's names by page index. */
export function engineNames(statuses: readonly OptionStatus[], names: readonly string[]): string[] {
  const out: string[] = []
  statuses.forEach((status, index) => {
    if (status.kind === 'ok') out[status.engineIndex] = names[index]!
  })
  return out
}

const net = (comparison: Comparison, option: number, valueCase: ValueCase) => comparison.options[option]!.cases[valueCase].netCost

/** The savings return used, and when it is nothing, what that means for the comparison. */
function savingsSentence(savingsReturn: Ratio): string {
  const shown = `It uses a savings return of ${formatPercent(savingsReturn)} a year`
  return compareRatio(savingsReturn, ratio(0, 1)) === 0
    ? `${shown}, so tying up cash costs nothing in this comparison.`
    : `${shown} after tax.`
}

// The verdict ---------------------------------------------------------------------

export type NoVerdict = 'one-option' | 'no-full' | 'partial-lower' | 'one-full'

export type Verdict =
  | {
      readonly kind: 'lowest'
      /** The engine indexes tied for the lowest net cost per month owned. */
      readonly lowest: readonly number[]
      /** The next option in the engine's order, not tied with the lowest. */
      readonly next: number
      readonly gapPerMonth: Money
      readonly gapTotal: Money
      readonly text: string
      /** For the phone bar. */
      readonly short: string
    }
  | { readonly kind: 'tie'; readonly lowest: readonly number[]; readonly text: string; readonly short: string }
  | { readonly kind: 'none'; readonly reason: NoVerdict; readonly text: string; readonly short: string }

const NO_VERDICT = 'No verdict'

/**
 * Which option has the lowest net cost per month owned, from the engine's full-coverage ordering, and by how much: per
 * month and over the horizon, to the next option. No verdict when there is one option, when fewer than two cover the
 * horizon, or when an option that covers less has a lower cost per month owned (it is never compared by total).
 */
export function verdict(comparison: Comparison, valueCase: ValueCase, names: readonly string[], savingsReturn: Ratio, gbp: Gbp): Verdict {
  const months = comparison.horizonMonths
  const { full, partial } = comparison.ranking[valueCase]
  const savings = savingsSentence(savingsReturn)
  const none = (reason: NoVerdict, why: string): Verdict => ({
    kind: 'none',
    reason,
    text: `${NO_VERDICT}: ${why} ${savings}`,
    short: NO_VERDICT,
  })
  if (comparison.options.length < 2) return none('one-option', 'there is only one option, so there is nothing to compare it with.')
  if (full.length === 0) return none('no-full', `no option covers all ${months} months, so none is compared by total.`)
  const first = full[0]!.option
  const below = partial.find(
    (entry) =>
      comparePerMonth(
        net(comparison, entry.option, valueCase),
        comparison.options[entry.option]!.coverageMonths,
        net(comparison, first, valueCase),
        months,
      ) < 0,
  )
  if (below) {
    const covered = comparison.options[below.option]!.coverageMonths
    return none(
      'partial-lower',
      `${names[below.option]} has a lower average cost per month owned than ${names[first]}, but covers only ${covered} of ${months} months; an option that doesn’t cover the whole horizon is never compared by total.`,
    )
  }
  if (full.length === 1) {
    const others = partial.map((entry) => names[entry.option]!)
    return none(
      'one-full',
      `only ${names[first]} covers all ${months} months; ${list(others)} ${others.length === 1 ? 'covers' : 'cover'} fewer and ${others.length === 1 ? 'is' : 'are'} not compared by total.`,
    )
  }
  const low = lowest(comparison, valueCase)!
  const lowNames = list(low.options.map((o) => names[o]!))
  const nextEntry = full.find((entry, k) => k > 0 && !entry.tiedWithPrevious && !low.options.includes(entry.option))
  if (!nextEntry) {
    return {
      kind: 'tie',
      lowest: low.options,
      text: `${lowNames} have the same net cost under these assumptions: ${gbp(low.perMonth)} a month on average, over ${months} months. ${savings}`,
      short: `${lowNames}, tied`,
    }
  }
  const next = nextEntry.option
  const gapTotal = subtract(net(comparison, next, valueCase), net(comparison, first, valueCase))
  const gapPerMonth = perMonth(gapTotal, months)
  const lead = low.options.length > 1 ? `${lowNames} have the same, lowest net cost` : `${lowNames} has the lowest net cost`
  return {
    kind: 'lowest',
    lowest: low.options,
    next,
    gapPerMonth,
    gapTotal,
    text: `${lead} under these assumptions: ${gbp(gapPerMonth)} a month less than ${names[next]}, ${gbp(gapTotal)} over ${months} months. ${savings}`,
    short: `${lowNames}, ${gbp(gapPerMonth)} a month less than ${names[next]}`,
  }
}

// Switch cost ---------------------------------------------------------------------

export interface SwitchCost {
  /** The option switched to (engine index). */
  readonly option: number
  /** The Keep option (engine index). */
  readonly keep: number
  readonly direction: 'more' | 'less' | 'same'
  readonly perMonth: Money
  readonly total: Money
  readonly text: string
}

/** For each other full-coverage option, what switching to it costs against keeping the current car; none without a Keep option. */
export function switchCosts(comparison: Comparison, valueCase: ValueCase, names: readonly string[], gbp: Gbp): SwitchCost[] {
  const keep = comparison.options.findIndex((result) => result.acquisition === 'keep')
  if (keep < 0) return []
  const months = comparison.horizonMonths
  return comparison.ranking[valueCase].full
    .filter((entry) => entry.option !== keep)
    .map(({ option }) => {
      const difference = subtract(net(comparison, option, valueCase), net(comparison, keep, valueCase))
      const total = abs(difference)
      const sign = compare(difference, ZERO)
      const direction = sign > 0 ? 'more' : sign < 0 ? 'less' : 'same'
      const each = perMonth(total, months)
      const text =
        direction === 'same'
          ? `Switching to ${names[option]} costs the same as keeping ${names[keep]} over ${months} months.`
          : `Switching to ${names[option]} costs ${gbp(each)} a month ${direction} than keeping ${names[keep]}: ${gbp(total)} ${direction} over ${months} months.`
      return { option, keep, direction, perMonth: each, total, text }
    })
}

// The largest part ----------------------------------------------------------------

export interface LargestCost {
  /** The parts with the largest amount (more than one when tied). */
  readonly parts: readonly Part[]
  readonly value: Money
  readonly netCost: Money
  readonly text: string
}

/** The largest part of the engine's breakdown (F26), in neutral words; null when no part is above nothing. */
export function largestCost(breakdown: Breakdown, netCost: Money, gbp: Gbp): LargestCost | null {
  const parts = breakdownParts(breakdown)
  const top = parts.reduce((most, part) => (compare(part.value, most) > 0 ? part.value : most), ZERO)
  if (compare(top, ZERO) <= 0) return null
  const largest = parts.filter((part) => compare(part.value, top) === 0)
  const text =
    largest.length === 1
      ? `Largest part of the cost: ${largest[0]!.label} (${gbp(top)} of ${gbp(netCost)})`
      : `Largest parts of the cost, tied: ${list(largest.map((p) => p.label))} (${gbp(top)} each, of ${gbp(netCost)})`
  return { parts: largest, value: top, netCost, text }
}

// The bottom line -----------------------------------------------------------------

export interface BottomLineRow {
  readonly id: 'net' | 'running' | 'depreciation' | 'alternative'
  readonly label: string
  /** The options the row names (engine indexes): the lowest, tied, or for the alternative the next option. */
  readonly options: readonly number[]
  readonly perMonth: Money | null
  readonly text: string
  /** What the row measures, in words. */
  readonly definition: string
}

const DEFINITIONS = {
  net: 'Average cost per month owned: everything paid out, less what the car is worth at the end after anything still owed, plus what the cash could have earned, divided by the months owned.',
  running: 'Fuel or energy, insurance, maintenance, VED and other costs, per month owned.',
  depreciation: 'What the car loses in value between today and the end, per month owned.',
  alternative: 'The difference in average cost per month owned between the lowest net cost and the next option.',
} as const

const RUNNING: readonly (keyof Breakdown)[] = ['fuel', 'insurance', 'maintenance', 'ved', 'other']

/** The full-coverage options with the lowest of a total per month owned (all tied), and that figure. */
function lowestBy(comparison: Comparison, full: readonly number[], total: (result: OwnershipResult) => Money) {
  let found: number[] = []
  for (const option of full) {
    const result = comparison.options[option]!
    if (found.length === 0) {
      found = [option]
      continue
    }
    const held = comparison.options[found[0]!]!
    const order = comparePerMonth(total(result), result.coverageMonths, total(held), held.coverageMonths)
    if (order < 0) found = [option]
    else if (order === 0) found.push(option)
  }
  const first = comparison.options[found[0]!]!
  return { options: found, perMonth: perMonth(total(first), first.coverageMonths) }
}

/**
 * The bottom line, full-coverage options only, ties stated: the lowest net cost, the lowest running cost and the lowest
 * depreciation, each per month owned, and what choosing the next option costs a month. Empty when none covers the horizon.
 */
export function bottomLine(comparison: Comparison, valueCase: ValueCase, names: readonly string[], gbp: Gbp): BottomLineRow[] {
  const ranking = comparison.ranking[valueCase].full
  if (ranking.length === 0) return []
  const months = comparison.horizonMonths
  const full = ranking.map((entry) => entry.option)
  const who = (options: readonly number[], amount: Money) =>
    options.length > 1
      ? `${list(options.map((o) => names[o]!))}, tied (${gbp(amount)} a month each)`
      : `${names[options[0]!]} (${gbp(amount)} a month)`
  const row = (id: 'net' | 'running' | 'depreciation', label: string, found: { options: number[]; perMonth: Money }): BottomLineRow => ({
    id,
    label,
    options: found.options,
    perMonth: found.perMonth,
    text: who(found.options, found.perMonth),
    definition: DEFINITIONS[id],
  })
  const low = lowest(comparison, valueCase)!
  const caseOf = (result: OwnershipResult) => result.cases[valueCase]
  const rows = [
    row('net', 'Lowest net cost', low),
    row(
      'running',
      'Lowest running cost',
      lowestBy(comparison, full, (r) => RUNNING.map((part) => caseOf(r).breakdown[part]).reduce(add, ZERO)),
    ),
    row(
      'depreciation',
      'Lowest depreciation',
      lowestBy(comparison, full, (r) => caseOf(r).breakdown.depreciation),
    ),
  ]
  const label = 'Cost of choosing the alternative'
  const nextEntry = ranking.find((entry) => !low.options.includes(entry.option))
  let alternative: BottomLineRow
  if (ranking.length < 2)
    alternative = {
      id: 'alternative',
      label,
      options: [],
      perMonth: null,
      text: 'Needs two options that cover the whole horizon.',
      definition: DEFINITIONS.alternative,
    }
  else if (!nextEntry)
    alternative = {
      id: 'alternative',
      label,
      options: [],
      perMonth: ZERO,
      text: `${list(low.options.map((o) => names[o]!))} have the same net cost: choosing one over another costs nothing a month.`,
      definition: DEFINITIONS.alternative,
    }
  else {
    const next = nextEntry.option
    const gap = subtract(net(comparison, next, valueCase), net(comparison, low.options[0]!, valueCase))
    const each = perMonth(gap, months)
    alternative = {
      id: 'alternative',
      label,
      options: [next],
      perMonth: each,
      text: `Choosing ${names[next]} instead of ${list(
        low.options.map((o) => names[o]!),
        'or',
      )} costs ${gbp(each)} a month more (${gbp(gap)} over ${months} months).`,
      definition: DEFINITIONS.alternative,
    }
  }
  return [...rows, alternative]
}

// Low, expected and high ----------------------------------------------------------

export interface ScenarioRow {
  /** The engine index. */
  readonly option: number
  readonly name: string
  /** The engine's net cost per month of coverage in each case. */
  readonly perMonth: Readonly<Record<ValueCase, Money>>
  readonly fullCoverage: boolean
  readonly coverageMonths: number
}

export interface Scenarios {
  readonly rows: readonly ScenarioRow[]
  /** The options with the lowest net cost in each case (tied), from the engine's ranking; empty when none covers the horizon. */
  readonly lowest: Readonly<Record<ValueCase, readonly number[]>>
  readonly changes: boolean
  readonly sentence: string
}

const CASES: readonly ValueCase[] = ['low', 'expected', 'high']

/** Each option's average cost per month owned in the low, expected and high cases, and whether the lowest changes between them. */
export function scenarioTable(comparison: Comparison, names: readonly string[]): Scenarios {
  const rows = comparison.options.map((result, option) => ({
    option,
    name: names[option]!,
    perMonth: {
      low: result.cases.low.netCostPerCoverageMonth,
      expected: result.cases.expected.netCostPerCoverageMonth,
      high: result.cases.high.netCostPerCoverageMonth,
    },
    fullCoverage: result.fullCoverage,
    coverageMonths: result.coverageMonths,
  }))
  const lowestIn = (valueCase: ValueCase) => lowest(comparison, valueCase)?.options ?? []
  const low = { low: lowestIn('low'), expected: lowestIn('expected'), high: lowestIn('high') }
  const key = (options: readonly number[]) => options.join()
  const changes = new Set(CASES.map((c) => key(low[c]))).size > 1
  const named = (options: readonly number[]) =>
    options.length === 0
      ? 'no option covers the whole horizon'
      : options.length > 1
        ? `${list(options.map((o) => names[o]!))} (tied)`
        : names[options[0]!]!
  let sentence: string
  if (!changes && low.expected.length === 0)
    sentence = `No option covers all ${comparison.horizonMonths} months, so none is compared by total.`
  else if (!changes)
    sentence =
      low.expected.length > 1
        ? `${list(low.expected.map((o) => names[o]!))} have the same, lowest net cost in all three end-value cases.`
        : `${names[low.expected[0]!]} has the lowest net cost in all three end-value cases.`
  else
    sentence = `The lowest net cost changes with the end value: ${CASES.map((c) => `${CASE_LABELS[c].toLowerCase()}, ${named(low[c])}`).join('; ')}.`
  if (rows.some((r) => !r.fullCoverage)) sentence += ' Options that don’t cover the whole horizon are not compared.'
  return { rows, lowest: low, changes, sentence }
}

// Money flows ---------------------------------------------------------------------

export interface MoneyFlows {
  /** Cash paid at the start (month 0 of the engine's timeline): the price, or the deposit and fees paid then. Never a kept car's forgone sale. */
  readonly upfront: Money
  /** Finance only: the regular monthly payment, the last (which takes the rounding) and how many. */
  readonly monthly: { readonly amount: Money; readonly last: Money; readonly payments: number } | null
  /** A PCP bought at the end or HP with a balloon or fee: what is due with the last payment, and in which month. */
  readonly final: { readonly amount: Money; readonly fee: Money; readonly month: number; readonly withinHorizon: boolean } | null
}

/**
 * The money that changes hands, apart from the economic cost: from the engine's timeline (month 0) and the finance
 * engine's schedule and end path, the same figures the timeline is built from. No arithmetic.
 */
export function moneyFlows(option: CarOption, result: OwnershipResult): MoneyFlows {
  const upfront = result.timeline[0]!.acquisition
  const finance = result.finance
  if (!finance) return { upfront, monthly: null, final: null }
  const { schedule, own } = finance
  const term = schedule.rows.length
  const monthly = { amount: schedule.regularPayment, last: schedule.lastPayment, payments: term }
  const { acquisition } = option
  const buys = acquisition.kind === 'hire-purchase' || (acquisition.kind === 'pcp' && acquisition.end === 'buy')
  const due = compare(own.finalPayment, ZERO) > 0 || compare(own.purchaseFee, ZERO) > 0
  const final =
    buys && due ? { amount: own.finalPayment, fee: own.purchaseFee, month: term, withinHorizon: term <= result.horizonMonths } : null
  return { upfront, monthly, final }
}
