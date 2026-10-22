import { formatPercent } from '@/lib/format'
import { compare, type Money, type Ratio, ZERO } from '@/lib/money'
import { flipPoints } from '../car-ownership/calc'
import type { Breakdown, Comparison, Flip, FlipPoints, Lower, OwnershipResult, ValueCase } from '../car-ownership/types'
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
    `Ordered by net cost per month of coverage, lowest first, under these assumptions (the ${CASE_LABELS[valueCase].toLowerCase()} end value).`,
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
  return groups
    .filter((g) => g.length > 1)
    .map((g) => `${list(g.map((i) => names[i]!))} are tied: the same net cost per month of coverage.`)
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
  readonly id: 'value-0' | 'value-1' | 'savings' | 'mileage'
  readonly text: string
}

const NO_CROSSING = 'No crossing in range'
const HELD = 'everything else as entered'

/**
 * The flip points as plain threshold sentences, each saying what is held fixed (F22). `gbp` formats an amount; nothing
 * here is worked out, only put in words. Never a recommendation.
 */
export function flipSentences(flips: FlipPoints, names: readonly [string, string], gbp: (amount: Money) => string): FlipSentence[] {
  const who = (lower: Lower) => (lower === 'tie' ? 'the two are level' : `${names[lower]} has the lower net cost per month of coverage`)
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

function crossingText<T>(flip: Flip<T>, what: string, show: (value: T) => string, who: (lower: Lower) => string): string {
  if (flip.kind === 'no-crossing-in-range')
    return `${what}: ${NO_CROSSING.toLowerCase()} over the range Sumyard searches; ${who(flip.lowerThroughout)} throughout, with ${HELD}.`
  // Neighbours that show the same (a savings return to a few decimal places) read as one threshold.
  if (show(flip.below) === show(flip.above))
    return `${what}: below about ${show(flip.above)}, ${who(flip.lowerBelow)}; above it, ${who(flip.lowerAbove)}. With ${HELD}.`
  return `${what}: up to ${show(flip.below)}, ${who(flip.lowerBelow)}; from ${show(flip.above)}, ${who(flip.lowerAbove)}. With ${HELD}.`
}

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
const lowerFirst = (s: string) => s.replace(/^./, (c) => c.toLowerCase())

/** Names for the pair, as the cards show them. */
export const pairNames = (inputs: CarDecisionInputs, pair: readonly [number, number]): [string, string] => [
  optionName(inputs.options[pair[0]]!, pair[0]),
  optionName(inputs.options[pair[1]]!, pair[1]),
]
