import type { Money, Ratio } from '@/lib/money'
import type { ContributionFrequency } from '@/lib/periods'

/*
 * Types for the household budget engine. The decisions behind these shapes
 * are BD1 to BD9 in docs/modelling-decisions.md.
 */

/** What an outgoing is (BD1): a fixed list. */
export type BudgetKind = 'spending' | 'joint' | 'debt' | 'savings'

export const BUDGET_KINDS: readonly BudgetKind[] = ['spending', 'joint', 'debt', 'savings']

/** How often a line's amount is paid (BD2): weekly, monthly, quarterly or yearly. */
export type BudgetPeriod = ContributionFrequency

/** A line of income (BD3): its amount is after tax. */
export interface IncomeLine {
  readonly name: string
  readonly amount: Money
  readonly period: BudgetPeriod
}

/** A line of outgoings (BD2). */
export interface OutgoingLine extends IncomeLine {
  readonly kind: BudgetKind
}

/** What the engine takes: income lines (your pay among them) and outgoing lines. Amounts are whole pence; a blank is nothing (BD4). */
export interface BudgetInputs {
  readonly income: readonly IncomeLine[]
  readonly outgoings: readonly OutgoingLine[]
}

/** A yearly figure and its month figure: the year divided by the months, to the nearest penny (BD2). */
export interface YearAndMonth {
  readonly year: Money
  readonly month: Money
}

/** A line as entered, with its yearly and month figures. */
export interface ResolvedLine<L extends IncomeLine = IncomeLine> extends YearAndMonth {
  readonly line: L
}

/** A kind's total and its share of income; the share is null with no income (BD5). */
export interface KindTotal extends YearAndMonth {
  readonly kind: BudgetKind
  readonly share: Ratio | null
}

/**
 * What the month rows, each rounded on its own, add up to less the month figure they sit beside (BD2): nothing when they
 * agree. Positive when the rows add up to more.
 */
export interface PennyDrift {
  /** The income lines' month figures less income's. */
  readonly income: Money
  /** The kinds' month totals less outgoings'. */
  readonly kinds: Money
  /** Each kind's lines' month figures less the kind's month total. */
  readonly lines: Readonly<Record<BudgetKind, Money>>
  /** Income less outgoings, each a month, less what is left a month. */
  readonly leftover: Money
}

export type BudgetWarning =
  /** Outgoings are more than income (BD5). */
  | 'negative-leftover'
  /** There is no income, so no share can be worked out (BD5). */
  | 'no-income'

export interface BudgetResult {
  readonly income: YearAndMonth
  readonly outgoings: YearAndMonth & { readonly share: Ratio | null }
  /** Income less outgoings; may be below nothing (BD5). */
  readonly leftover: YearAndMonth & { readonly share: Ratio | null }
  /** Every kind, in BUDGET_KINDS order, including those with nothing. */
  readonly perKind: readonly KindTotal[]
  /** The savings kind's share of income (BD8); null with no income. */
  readonly savingsRate: Ratio | null
  readonly incomeLines: readonly ResolvedLine[]
  readonly outgoingLines: readonly ResolvedLine<OutgoingLine>[]
  readonly pennyDrift: PennyDrift
  readonly warnings: readonly BudgetWarning[]
  /** Plain-language assumptions with no figures, for the page to show. */
  readonly assumptions: readonly string[]
}

/** Why an input or the result is refused (BD9). */
export type BudgetProblemReason =
  | 'not-a-list'
  | 'too-many-lines'
  | 'not-money'
  | 'below-minimum'
  | 'above-maximum'
  | 'not-a-choice'
  | 'too-large'

export interface BudgetProblem {
  readonly field: 'income' | 'outgoings' | 'result'
  /** The line, from nothing, when the problem is in one. */
  readonly index?: number
  readonly reason: BudgetProblemReason
}

/** A result, or a typed refusal that names each problem. Never a wrong number. */
export type BudgetOutcome =
  | { readonly ok: true; readonly result: BudgetResult }
  | { readonly ok: false; readonly problems: readonly BudgetProblem[] }
