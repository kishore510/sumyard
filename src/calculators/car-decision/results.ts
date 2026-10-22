import { formatPence, formatPercent } from '@/lib/format'
import { add, compare, type ExactPence, type Money, type Ratio, subtract, ZERO } from '@/lib/money'
import { costBridge, flipPoints, fuelPriceFlip, pencePerLitreFor } from '../car-ownership/calc'
import type { Breakdown, Bridge, Comparison, Flip, FlipPoints, FuelCost, Lower, OwnershipResult, ValueCase } from '../car-ownership/types'
import { CASE_LABELS, type CarDecisionInputs, type OptionStatus, optionName, type PageOutcome, toEngineShared } from './definition'

/*
 * What the car decision page shows from the engine's comparison (slice
 * 3c-1): the order of the cards (the engine's ranking, full coverage first,
 * partial apart), the ordering rule and ties in words, the breakdown's
 * parts, and the flip points between the two lowest options as plain
 * threshold sentences. Every figure is the engine's; nothing is added up
 * here. No UI.
 */

/** The order the cards go in: page option indexes, ranked full-coverage options first, then partial ones, then those without results. */
export function cardOrder(outcome: PageOutcome, valueCase: ValueCase, count: number): number[] {
  if (outcome.kind !== 'ok' || !outcome.comparison) return Array.from({ length: count }, (_, i) => i)
  const byEngine = pageIndexes(outcome.statuses)
  const ranking = outcome.comparison.ranking[valueCase]
  const ranked = [...ranking.full, ...ranking.partial].map((entry) => byEngine[entry.option]!)
  const rest = outcome.statuses.flatMap((status, index) => (status.kind === 'ok' ? [] : [index]))
  return [...ranked, ...rest]
}

/** The page index of each option in the comparison, by its engine index. */
export function pageIndexes(statuses: readonly OptionStatus[]): number[] {
  const out: number[] = []
  statuses.forEach((status, index) => {
    if (status.kind === 'ok') out[status.engineIndex] = index
  })
  return out
}

const list = (names: readonly string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** The ordering rule in words, for the case shown (F19, F27). */
export function orderingRule(comparison: Comparison, valueCase: ValueCase): string {
  const months = comparison.horizonMonths
  const partial = comparison.ranking[valueCase].partial.length > 0
  return [
    `Ordered by average cost per month owned, lowest first, under these assumptions (the ${CASE_LABELS[valueCase].toLowerCase()} end value).`,
    partial
      ? `Options that don’t cover all ${months} months are listed after the others and not ordered against them.`
      : `Every option shown covers all ${months} months.`,
  ].join(' ')
}

/** Groups of tied options in words, from the engine's ties; empty when there are none. */
export function tiesText(comparison: Comparison, valueCase: ValueCase, names: readonly string[]): string[] {
  const groups: number[][] = []
  for (const entry of comparison.ranking[valueCase].full) {
    if (entry.tiedWithPrevious) groups.at(-1)!.push(entry.option)
    else groups.push([entry.option])
  }
  return groups.filter((g) => g.length > 1).map((g) => `${list(g.map((i) => names[i]!))} are tied: the same average cost per month owned.`)
}

/** The lowest full-coverage options (all tied for lowest) and their net cost per month of coverage; null when none covers the horizon. */
export function lowest(comparison: Comparison, valueCase: ValueCase): { options: number[]; perMonth: Money } | null {
  const full = comparison.ranking[valueCase].full
  if (full.length === 0) return null
  const options = [full[0]!.option]
  for (const entry of full.slice(1)) {
    if (!entry.tiedWithPrevious) break
    options.push(entry.option)
  }
  return { options, perMonth: full[0]!.netCostPerCoverageMonth }
}

export interface Part {
  readonly id: keyof Breakdown
  readonly label: string
  readonly value: Money
}

const PART_LABELS: readonly [keyof Breakdown, string][] = [
  ['interestAndFees', 'Interest and fees'],
  ['depreciation', 'Depreciation'],
  ['equityHandedBack', 'Equity handed back'],
  ['fuel', 'Fuel or energy'],
  ['insurance', 'Insurance'],
  ['maintenance', 'Maintenance'],
  ['ved', 'VED'],
  ['other', 'Other'],
  ['opportunityCost', 'Opportunity cost'],
]

/** The engine's breakdown (F26) as labelled parts, in the page's order; they add up to the net cost. */
export const breakdownParts = (breakdown: Breakdown): Part[] => PART_LABELS.map(([id, label]) => ({ id, label, value: breakdown[id] }))

/** Equity at the horizon: the last month's (F20); null for a car handed back before it (no car then). */
export const equityAtHorizon = (result: OwnershipResult, valueCase: ValueCase): Money | null =>
  result.fullCoverage ? result.cases[valueCase].months.at(-1)!.equity : null

export const isNegative = (amount: Money) => compare(amount, ZERO) < 0

// Flip points ------------------------------------------------------------------

/** The pair "what changes the answer" is about: the lowest full-coverage option and the next (page indexes), or null. */
export function flipPair(outcome: PageOutcome, valueCase: ValueCase): readonly [number, number] | null {
  if (outcome.kind !== 'ok' || !outcome.comparison) return null
  const full = outcome.comparison.ranking[valueCase].full
  if (full.length < 2) return null
  const byEngine = pageIndexes(outcome.statuses)
  return [byEngine[full[0]!.option]!, byEngine[full[1]!.option]!]
}

/** The options a flip pair can be chosen from: those covering the whole horizon with results, in the editor's order (page indexes). */
export function pairChoices(outcome: PageOutcome, valueCase: ValueCase): number[] {
  if (outcome.kind !== 'ok' || !outcome.comparison) return []
  const byEngine = pageIndexes(outcome.statuses)
  return outcome.comparison.ranking[valueCase].full.map((entry) => byEngine[entry.option]!).sort((a, b) => a - b)
}

/**
 * The engine's flip points for a pair (F22, F29): the one given, or by default the two lowest; null when there is no
 * pair or the engine refuses. Measured at the end of coverage, whatever month the chart shows (the engine's contract).
 */
export function flipsFor(
  outcome: PageOutcome,
  inputs: CarDecisionInputs,
  chosen: readonly [number, number] | null = null,
): { pair: readonly [number, number]; flips: FlipPoints } | null {
  const pair = chosen ?? flipPair(outcome, inputs.valueCase)
  if (!pair || outcome.kind !== 'ok') return null
  const option = (index: number) => {
    const status = outcome.statuses[index]!
    if (status.kind !== 'ok') throw new Error('A flip pair needs two costed options')
    return status.option
  }
  const result = flipPoints([option(pair[0]), option(pair[1])], toEngineShared(inputs), inputs.valueCase)
  return result.ok ? { pair, flips: result.result } : null
}

export interface FlipSentence {
  readonly id: 'value-0' | 'value-1' | 'savings' | 'mileage' | 'fuel'
  readonly text: string
}

const NO_CROSSING = 'No crossing in range'
const HELD = 'everything else as entered'

/**
 * The flip points as plain threshold sentences, each saying what is held fixed (F22). `gbp` formats an amount; nothing
 * here is worked out, only put in words. Never a recommendation.
 */
export function flipSentences(flips: FlipPoints, names: readonly [string, string], gbp: (amount: Money) => string): FlipSentence[] {
  const who = (lower: Lower) => (lower === 'tie' ? 'the two are level' : `${names[lower]} has the lower average cost per month owned`)
  const caseWord = CASE_LABELS[flips.valueCase].toLowerCase()
  const value = (which: 0 | 1): FlipSentence => {
    const flip = flips.horizonValue[which]
    const subject = `${names[which]}’s end value (${caseWord} case)`
    return {
      id: which === 0 ? 'value-0' : 'value-1',
      text:
        flip.kind === 'crossing'
          ? `${capital(subject)}: below ${gbp(flip.below)}, ${who(flip.lowerBelow)}; above it, ${who(flip.lowerAbove)}. With ${HELD}.`
          : `${capital(subject)}: ${NO_CROSSING.toLowerCase()} from nothing to the most Sumyard accepts; ${who(flip.lowerThroughout)} throughout, with ${HELD}.`,
    }
  }
  const pct = (r: Ratio) => formatPercent(r)
  const savings: FlipSentence = {
    id: 'savings',
    text: crossingText(flips.savingsReturn, 'Savings return', (r) => `${pct(r)} a year`, who),
  }
  const mileage: FlipSentence = {
    id: 'mileage',
    text: `If both cars are driven the same distance, as one driver: ${lowerFirst(
      crossingText(flips.annualMileage, 'Annual mileage', (miles) => `${new Intl.NumberFormat('en-GB').format(miles)} miles a year`, who),
    )}`,
  }
  return [value(0), value(1), savings, mileage]
}

function crossingText<T>(
  flip: Flip<T>,
  what: string,
  show: (value: T) => string,
  who: (lower: Lower) => string,
  held: string = HELD,
): string {
  if (flip.kind === 'no-crossing-in-range')
    return `${what}: ${NO_CROSSING.toLowerCase()} over the range Sumyard searches; ${who(flip.lowerThroughout)} throughout, with ${held}.`
  // Neighbours that show the same (a savings return to a few decimal places) read as one threshold.
  const same = show(flip.below) === show(flip.above)
  // Past a band where the two are level (F53): the option lower on each side, and the band, each value "about" (the
  // penny-rounded totals can flicker either way near it).
  if (flip.level) {
    const { from, to } = flip.level
    if (same)
      return `${what}: below about ${show(flip.below)}, ${who(flip.lowerBelow)}; at about ${show(from)}, the two are level or pennies apart; above it, ${who(flip.lowerAbove)}. With ${held}.`
    const band = show(from) === show(to) ? `at about ${show(from)}` : `from about ${show(from)} to about ${show(to)}`
    return `${what}: up to about ${show(flip.below)}, ${who(flip.lowerBelow)}; ${band}, the two are level or pennies apart; from about ${show(
      flip.above,
    )}, ${who(flip.lowerAbove)}. With ${held}.`
  }
  if (same) return `${what}: below about ${show(flip.above)}, ${who(flip.lowerBelow)}; above it, ${who(flip.lowerAbove)}. With ${held}.`
  return `${what}: up to ${show(flip.below)}, ${who(flip.lowerBelow)}; from ${show(flip.above)}, ${who(flip.lowerAbove)}. With ${held}.`
}

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
const lowerFirst = (s: string) => s.replace(/^./, (c) => c.toLowerCase())

/** Names for the pair, as the cards show them. */
export const pairNames = (inputs: CarDecisionInputs, pair: readonly [number, number]): [string, string] => [
  optionName(inputs.options[pair[0]]!, pair[0]),
  optionName(inputs.options[pair[1]]!, pair[1]),
]

// The fuel or energy price threshold (F54) -----------------------------------------

/** The engine's fuel or energy price threshold for a pair (page indexes): the first option's cost per mile; null without a pair or on a refusal. */
export function fuelFlipFor(outcome: PageOutcome, inputs: CarDecisionInputs, pair: readonly [number, number]): Flip<ExactPence> | null {
  if (outcome.kind !== 'ok') return null
  const [first, second] = pair.map((index) => outcome.statuses[index]!)
  if (first?.kind !== 'ok' || second?.kind !== 'ok') return null
  const result = fuelPriceFlip([first.option, second.option], toEngineShared(inputs), inputs.valueCase)
  return result.ok ? result.result : null
}

/** Places a price per litre is shown to, as the pump shows it; a cost per mile is shown as the editor shows it. */
const LITRE_PLACES = 1

/**
 * The fuel or energy price threshold in words (F54), for the first option: pence per mile always; for petrol or diesel
 * also the price per litre (F21's conversion turned round); for electric, that the home and public split is held.
 */
export function fuelSentence(flip: Flip<ExactPence>, fuel: FuelCost, names: readonly [string, string]): FlipSentence {
  const who = (lower: Lower) => (lower === 'tie' ? 'the two are level' : `${names[lower]} has the lower average cost per month owned`)
  const what =
    fuel.kind === 'fuel'
      ? `${names[0]}’s fuel cost per mile`
      : fuel.kind === 'electric'
        ? `${names[0]}’s energy cost per mile`
        : `${names[0]}’s cost per mile`
  const show = (perMile: ExactPence) =>
    fuel.kind === 'fuel'
      ? `${formatPence(perMile)} a mile (${formatPence(pencePerLitreFor(perMile, fuel.milesPerGallon), LITRE_PLACES)} a litre)`
      : `${formatPence(perMile)} a mile`
  const held = `${HELD}, including ${names[0]}’s mileage and yearly fuel price change`
  const text = crossingText(flip, what, show, who, held)
  return {
    id: 'fuel',
    text: fuel.kind === 'electric' ? `${text} This is home and public charging together, the split held as entered.` : text,
  }
}

// Where the difference comes from (F55) --------------------------------------------

/** The engine's cost bridge for a pair (page indexes), first less second; null unless both cover the whole horizon with results. */
export function bridgeFor(outcome: PageOutcome, inputs: CarDecisionInputs, pair: readonly [number, number]): Bridge | null {
  if (outcome.kind !== 'ok' || !outcome.comparison) return null
  const [first, second] = pair.map((index) => outcome.statuses[index]!)
  if (first?.kind !== 'ok' || second?.kind !== 'ok') return null
  const results = outcome.comparison.options
  return costBridge(results[first.engineIndex]!, results[second.engineIndex]!, inputs.valueCase)
}

/** The bridge's parts labelled as the cards label them, in the breakdown's order, with the shown figures. */
export const bridgeRows = (bridge: Bridge): Part[] =>
  bridge.parts.map((part) => ({ id: part.id, label: PART_LABELS.find(([id]) => id === part.id)![1], value: part.shown }))

const sizeOf = (amount: Money) => (compare(amount, ZERO) < 0 ? subtract(ZERO, amount) : amount)
const sign = (amount: Money) => compare(amount, ZERO)
/** A part's label inside a sentence: lower case, except an abbreviation. */
const inSentence = (label: string) => (label === label.toUpperCase() ? label : label.toLowerCase())

/**
 * The bridge in words (F55): the difference, then its largest part by shown size. "Most of the difference" only when
 * that part is on the side of the total and more than half of it. Described, never explained.
 */
export function bridgeSentences(
  bridge: Bridge,
  names: readonly [string, string],
  valueCase: ValueCase,
  gbp: (amount: Money) => string,
): { difference: string; largest: string } {
  const [a, b] = names
  const caseWord = CASE_LABELS[valueCase].toLowerCase()
  const total = bridge.total.shown
  const difference =
    sign(total) === 0
      ? `${a} and ${b} have the same average cost per month owned, in the ${caseWord} case.`
      : `${a}’s average cost per month owned is ${gbp(sizeOf(total))} a month ${sign(total) > 0 ? 'above' : 'below'} ${b}’s, in the ${caseWord} case.`
  const rows = bridgeRows(bridge)
  const top = rows.reduce((most, row) => (compare(sizeOf(row.value), most) > 0 ? sizeOf(row.value) : most), ZERO)
  if (sign(top) === 0) return { difference, largest: 'Every part is the same for both.' }
  const largest = rows.filter((row) => compare(sizeOf(row.value), top) === 0)
  const way = (amount: Money) => `${sign(amount) > 0 ? 'more' : 'less'} for ${a}`
  if (largest.length > 1) {
    const ways = new Set(largest.map((row) => sign(row.value)))
    const side =
      ways.size === 1
        ? way(largest[0]!.value)
        : largest.length === 2
          ? `one more and one less for ${a}`
          : `some more and some less for ${a}`
    return {
      difference,
      largest: `The largest parts, tied, are ${list(largest.map((row) => inSentence(row.label)))}: ${gbp(top)} a month each, ${side}.`,
    }
  }
  const row = largest[0]!
  const label = inSentence(row.label)
  if (sign(total) !== 0 && sign(row.value) === sign(total)) {
    // More than half of the total: twice the part above the total, compared in whole pence.
    if (compare(add(top, top), sizeOf(total)) > 0)
      return { difference, largest: `Most of the difference is ${label}: ${gbp(top)} a month.` }
    return { difference, largest: `The largest part is ${label}: ${gbp(top)} a month ${way(row.value)}, less than half of the difference.` }
  }
  if (sign(total) !== 0)
    return { difference, largest: `The largest part is ${label}: ${gbp(top)} a month ${way(row.value)}, on the other side from the total.` }
  return { difference, largest: `The largest part is ${label}: ${gbp(top)} a month ${way(row.value)}; the other parts balance it.` }
}

/**
 * Why there is no bridge (F55): fewer than two options cover the whole horizon with results. Names the options handed
 * back before the horizon and those without results yet.
 */
export function bridgeUnavailable(outcome: PageOutcome, names: readonly string[]): string {
  const statuses = outcome.kind === 'ok' ? outcome.statuses : []
  const partial = statuses.flatMap((status, index) => (status.kind === 'ok' && !status.result.fullCoverage ? [names[index]!] : []))
  const none = statuses.flatMap((status, index) => (status.kind === 'ok' ? [] : [names[index]!]))
  return [
    'This needs two options that cover the whole horizon with results.',
    partial.length > 0 ? `${list(partial)} ${partial.length === 1 ? 'covers' : 'cover'} less than the horizon.` : '',
    none.length > 0 ? `${list(none)} ${none.length === 1 ? 'has' : 'have'} no results yet.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
