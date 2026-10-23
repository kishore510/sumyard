import { formatGBP, formatIsoDate, formatPercent, formatPercentFixed } from '@/lib/format'
import { compare, fromPounds, type Money, mulRound, type Ratio, ratio, roundRatio, toPence, ZERO } from '@/lib/money'
import type { LegId, PageOutcome } from './definition'
import type { Amounts, BreakEven } from './types'

/*
 * The next pound screen's words and bar geometry (the C2 page rebuild), as
 * pure functions of the composer's output (through calculate): the
 * headline, the sticky lines, the three bars on one scale with their lines,
 * the "what only this page tells you" callout and the break-even box. Every
 * figure is a template on the composer's numbers; none is typed here (the
 * literal guard checks). Nothing is ranked, called best or recommended
 * (G13), and the wording guard below checks every string this builds.
 */

type Ok = Extract<PageOutcome, { kind: 'ok' }>
type Gbp = (amount: Money) => string

/** The legs, always in this order, whatever their values: nothing implies a ranking. */
export const LEG_ORDER = ['pension', 'mortgage', 'isa'] as const satisfies readonly LegId[]

const NO_RESULT = 'has no result for these inputs'
const ONE_POUND = fromPounds(1)

/* The headline. */

export type Clause =
  | { readonly leg: LegId; readonly kind: 'value'; readonly value: Money }
  | { readonly leg: LegId; readonly kind: 'state'; readonly text: string }

export interface HeadlineParts {
  readonly years: number
  readonly lumpSum: Money
  readonly clauses: readonly Clause[]
  /** The mid growth rate, when a growth leg (pension or ISA) has a number. */
  readonly midRate: Ratio | null
}

/** A leg's mid value in today's money and nominal, or null when it has no number. A leg of nothing is nothing. */
function midOf(out: Ok, leg: LegId): Amounts | null {
  const view = out[leg]
  if (view.kind === 'nothing') return { todaysMoney: ZERO, nominal: ZERO }
  if (view.kind !== 'shown') return null
  const l = view.leg
  if ('rates' in l) return l.rates.mid.value
  if (l.status === 'ok') return l.value
  return null
}

/** What a leg with no number is, as a clause of the headline. */
function stateClause(out: Ok, leg: LegId): string {
  const view = out[leg]
  switch (leg) {
    case 'pension':
      if (view.kind === 'shown') return 'a pension is not accessible at that horizon'
      return view.kind === 'needs' ? 'a pension needs your pay' : `a pension ${NO_RESULT}`
    case 'mortgage':
      return view.kind === 'none' ? 'no mortgage is set up' : `the mortgage ${NO_RESULT}`
    case 'isa':
      return `an ISA ${NO_RESULT}`
  }
}

const VALUE_WORDS: Record<LegId, string> = { pension: 'in a pension', mortgage: 'overpaying the mortgage', isa: 'in an ISA' }

const midRateOf = (out: Ok): Ratio | null => {
  for (const leg of ['pension', 'isa'] as const) {
    const view = out[leg]
    if (view.kind === 'shown' && 'rates' in view.leg) return view.leg.rates.mid.growthRate
  }
  return null
}

export function headlineParts(out: Ok): HeadlineParts {
  return {
    years: out.result.horizonYears,
    lumpSum: out.result.lumpSum,
    clauses: LEG_ORDER.map((leg): Clause => {
      const mid = midOf(out, leg)
      return mid === null ? { leg, kind: 'state', text: stateClause(out, leg) } : { leg, kind: 'value', value: mid.todaysMoney }
    }),
    midRate: midRateOf(out),
  }
}

const yearsText = (years: number) => `${years} year${years === 1 ? '' : 's'}`

/** "In N years, in today's money, £X of take-home is worth £A in a pension, £B overpaying the mortgage, or £C in an ISA, all at a M% mid rate. Not ranked, and not advice." */
export function headlineText(parts: HeadlineParts, gbp: Gbp): string {
  const [a, b, c] = parts.clauses.map((clause) =>
    clause.kind === 'value' ? `${gbp(clause.value)} ${VALUE_WORDS[clause.leg]}` : clause.text,
  )
  const rate = parts.midRate === null ? '' : `, all at a ${formatPercent(parts.midRate)} mid rate`
  return `In ${yearsText(parts.years)}, in today’s money, ${gbp(parts.lumpSum)} of take-home is worth ${a}, ${b}, or ${c}${rate}. Not ranked, and not advice.`
}

const SHORT_NAMES: Record<LegId, string> = { pension: 'Pension', mortgage: 'Mortgage', isa: 'ISA' }

/** The sticky result: one line a leg, in the fixed order, the mid figure in today's money or the state in a few words. */
export function stickyLines(out: Ok, gbp: Gbp): string[] {
  return LEG_ORDER.map((leg) => {
    const mid = midOf(out, leg)
    const name = SHORT_NAMES[leg]
    if (mid !== null) return `${name} ${gbp(mid.todaysMoney)}`
    const view = out[leg]
    if (view.kind === 'none') return `${name}: not set up`
    if (view.kind === 'needs' && leg === 'pension') return `${name}: needs your pay`
    if (view.kind === 'shown') return `${name}: not accessible`
    return `${name}: no result`
  })
}

/* The bars. */

export interface BarRow {
  readonly leg: LegId
  readonly label: string
  /** The mortgage alone: it rests on its rates, not on growth. */
  readonly badge: 'guaranteed' | null
  readonly mid: Amounts | null
  /** The low and high cases; the mortgage has no range (high is its one value, so the scale fits it). */
  readonly low: Amounts | null
  readonly high: Amounts | null
  /** Why there is no bar, in a few words; null when there is one (or the lump sum is nothing). */
  readonly state: string | null
  /** Shares of the shared scale, nothing to one: for drawing only. */
  readonly midShare: number
  readonly lowShare: number | null
  readonly highShare: number | null
}

export const BAR_LABELS: Record<LegId, string> = { pension: 'Pension', mortgage: 'Mortgage', isa: 'ISA' }

function barState(out: Ok, leg: LegId): string | null {
  const view = out[leg]
  if (view.kind === 'none') return 'No mortgage is set up'
  if (view.kind === 'needs')
    return leg === 'pension' ? 'Needs your pay: enter it on the take-home page first' : 'Needs more of the mortgage'
  if (view.kind === 'refused') return 'No result for these inputs'
  if (view.kind === 'shown' && view.leg.status === 'not-accessible') {
    const a = view.leg.access
    return a === null
      ? 'Not accessible at that horizon'
      : `Not accessible at that horizon: you’d be ${a.ageAtHorizon} on ${formatIsoDate(a.horizonDate)}, and the access age is ${a.accessAge}`
  }
  return null
}

function range(out: Ok, leg: LegId): { low: Amounts; high: Amounts } | null {
  const view = out[leg]
  if (view.kind === 'shown' && 'rates' in view.leg) return { low: view.leg.rates.low.value, high: view.leg.rates.high.value }
  return null
}

/** A share of the scale for drawing: from nothing to one, nothing when the scale is nothing. */
const share = (amount: Money, scale: Money) => (compare(scale, ZERO) > 0 ? Math.min(1, Math.max(0, toPence(amount) / toPence(scale))) : 0)

/**
 * The three bars on one scale: the largest high case (the mortgage's one
 * value) among the legs with a number, so the bars compare and every range
 * fits. Today's money.
 */
export function barRows(out: Ok): { readonly rows: readonly BarRow[]; readonly scale: Money } {
  const parts = LEG_ORDER.map((leg) => {
    const mid = midOf(out, leg)
    const r = range(out, leg)
    return { leg, mid, low: r?.low ?? null, high: r?.high ?? mid }
  })
  const scale = parts.reduce((most, p) => (p.high && compare(p.high.todaysMoney, most) > 0 ? p.high.todaysMoney : most), ZERO)
  return {
    scale,
    rows: parts.map((p) => ({
      leg: p.leg,
      label: BAR_LABELS[p.leg],
      badge: p.leg === 'mortgage' && p.mid !== null ? 'guaranteed' : null,
      mid: p.mid,
      low: p.low,
      high: p.high,
      state: barState(out, p.leg),
      midShare: p.mid ? share(p.mid.todaysMoney, scale) : 0,
      lowShare: p.low ? share(p.low.todaysMoney, scale) : null,
      highShare: p.high ? share(p.high.todaysMoney, scale) : null,
    })),
  }
}

/** The line under a bar: the range and its rates, or the mortgage's balances and freed payments; null with no number. */
export function legLine(out: Ok, leg: LegId, gbp: Gbp): string | null {
  const view = out[leg]
  if (view.kind !== 'shown') return null
  const l = view.leg
  if ('rates' in l) {
    const { low, high } = l.rates
    const span = `${gbp(low.value.todaysMoney)} to ${gbp(high.value.todaysMoney)} at ${formatPercent(low.growthRate)} to ${formatPercent(high.growthRate)}`
    if (leg === 'isa') return `${span}, tax-free`
    const unchecked = 'access' in l && l.access === null ? '. Access age not checked: add your age' : ''
    return `${span}, after tax${unchecked}`
  }
  if (l.status !== 'ok') return null
  const charge = compare(l.erc, ZERO) > 0 ? `; an early repayment charge of ${gbp(l.erc)} is paid from the lump sum` : ''
  const cash = compare(l.leftoverCash, ZERO) > 0 ? `; ${gbp(l.leftoverCash)} is held as cash` : ''
  return `Balance ${gbp(l.overpayingBalance)} instead of ${gbp(l.baselineBalance)}, plus ${gbp(l.paymentsFreed)} of payments freed${charge}${cash}`
}

/* What only this page tells you. */

/** The cause, said only when the personal allowance taper is in play (the optimiser's own data, through calculate). */
export const CAUSE_CLAUSE = 'because the extra contribution wins back the personal allowance'

export type CalloutFacts =
  | { readonly kind: 'multiple'; readonly cost: Money; readonly pensionAdded: Money; readonly perPound: Money; readonly cause: boolean }
  | { readonly kind: 'cost'; readonly cost: Money; readonly pensionAdded: Money }

/**
 * The pension multiple, when more goes in than comes out of take-home:
 * pension added over cost, as pence per pound to the nearest penny. Else
 * what it costs in spendable income. None without the pension's figures.
 */
export function calloutFacts(out: Ok): CalloutFacts | null {
  const view = out.pension
  if (view.kind !== 'shown') return null
  const { cost, pensionAdded } = view.leg.contribution
  if (compare(cost, ZERO) > 0 && compare(pensionAdded, cost) > 0)
    return {
      kind: 'multiple',
      cost,
      pensionAdded,
      perPound: mulRound(ONE_POUND, ratio(toPence(pensionAdded), toPence(cost)), 'nearest'),
      cause: out.taperInPlay,
    }
  return { kind: 'cost', cost, pensionAdded }
}

export function calloutText(facts: CalloutFacts, gbp: Gbp): string {
  if (facts.kind === 'cost') return `Putting ${gbp(facts.pensionAdded)} into a pension costs ${gbp(facts.cost)} of spendable income now`
  const cause = facts.cause ? `, ${CAUSE_CLAUSE}` : ''
  // The multiple is always to the penny, whatever Settings shows, so rounding to whole pounds can't hide it.
  return `At your pay, ${gbp(facts.cost)} of take-home buys ${gbp(facts.pensionAdded)} of pension: ${formatGBP(facts.perPound, 'pence')} in for every ${formatGBP(ONE_POUND, 'pounds')} out${cause}`
}

/* The break-even box. */

/** Places the "about" figure shows: the bracket's lower bound, rounded down. */
const ABOUT_DECIMALS = 1

/** A break-even rate as the box says it: "about" (in the heading) its lower bound to one place, or past the rates modelled. */
export function aboutRate(b: BreakEven): string {
  if (b.kind === 'above-highest') return 'above the highest rate modelled'
  if (b.kind === 'below-lowest') return 'below the lowest rate modelled'
  return `${formatPercentFixed(roundRatio(b.rate, ABOUT_DECIMALS + 2, 'down'), ABOUT_DECIMALS)} a year`
}

type Against = 'mortgage' | 'pension'

function omittedReason(out: Ok, against: Against): string {
  const view = out[against]
  const lead = `None against the ${against}`
  if (out.isa.kind === 'refused') return `${lead}: the ISA ${NO_RESULT}`
  if (view.kind === 'none') return `${lead}: no mortgage is set up`
  if (view.kind === 'nothing') return `${lead}: the lump sum is nothing`
  if (view.kind === 'needs' && against === 'pension') return `${lead}: it needs your pay`
  if (view.kind === 'shown' && view.leg.status === 'not-accessible') return `${lead}: it is not accessible at that horizon`
  return `${lead}: it ${NO_RESULT}`
}

export const BREAK_EVEN_HEADING = 'The ISA would need to return about'
export const REVERSION_NOTE = 'This depends on the mortgage rate after the fixed period; change it on the mortgage page'

export function breakEvenBox(out: Ok) {
  const midRate = out.pension.kind === 'shown' && 'rates' in out.pension.leg ? out.pension.leg.rates.mid.growthRate : null
  const against: Record<Against, string> = {
    mortgage: 'the mortgage overpayment',
    pension: `the pension at ${midRate === null ? 'the mid rate' : formatPercent(midRate)}`,
  }
  const lines: { against: Against; text: string }[] = []
  const omitted: { against: Against; reason: string }[] = []
  for (const leg of ['mortgage', 'pension'] as const) {
    const b = out.breakEven[leg]
    if (b === null) omitted.push({ against: leg, reason: omittedReason(out, leg) })
    else lines.push({ against: leg, text: `${aboutRate(b)} to match ${against[leg]}` })
  }
  return { lines, omitted, reversionNote: out.reversionInHorizon && out.breakEven.mortgage !== null ? REVERSION_NOTE : null }
}

/* The wording guard (G13 and the style rules): run on every string the screen builds. */

export const BANNED_WORDS = ['best', 'better', 'should', 'recommend', 'worth it', 'wins', 'please', 'successfully'] as const

const BANNED = new RegExp(`\\b(${BANNED_WORDS.map((w) => w.replace(' ', '\\s+')).join('|')})\\w*`, 'gi')

/** Banned words in a string; "wins back" is allowed only as the cause clause itself. */
export function wordingProblems(text: string): string[] {
  return [...text.replaceAll(CAUSE_CLAUSE, '').matchAll(BANNED)].map((m) => m[0])
}
