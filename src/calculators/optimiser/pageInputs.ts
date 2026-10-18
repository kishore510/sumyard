import { add, compareRatio, type Money, mulRound, ratio, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import type { BenefitInput, BenefitPayment } from './types'

/*
 * How the take-home page's inputs become the single annual figures the
 * engine takes (part 1b-i.1, decisions B6 to B8 in
 * docs/modelling-decisions.md): a pension contribution entered as a
 * percentage of pensionable pay, and the itemised lists of benefits in kind
 * and post-tax deductions, each item per month or per year. Pure, and no
 * tax figure: a percentage is the person's own, and the months divisor is a
 * calendar one from src/lib/periods.ts.
 */

export const CONTRIBUTION_MODES = ['amount', 'percentOfPay'] as const
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number]

/** A pension contribution as entered. Both entries are kept, so switching mode loses nothing; `mode` says which counts. */
export interface ContributionEntry {
  readonly mode: ContributionMode
  /** The amount for the year, in amount mode. */
  readonly amount: Money
  /** The percentage of pensionable pay as canonical text (parsePercentText), in percentage mode. */
  readonly percentOfPay: string
}

/** Pensionable pay as entered: the salary unless `own` is set, plus the bonus only with `includeBonus`. */
export interface PensionablePayEntry {
  readonly own: boolean
  /** The person's own annual figure, used when `own` is set. */
  readonly amount: Money
  readonly includeBonus: boolean
}

export const ITEM_PERIODS = ['month', 'year'] as const
export type ItemPeriod = (typeof ITEM_PERIODS)[number]

/** One named item in the post-tax deductions list. The name is text only. */
export interface ListItem {
  readonly name: string
  readonly amount: Money
  readonly period: ItemPeriod
}

/**
 * One benefit in kind as entered (inputs version 3, decision B10): its value,
 * what is taken from pay for it and how, both per month or per year. Nothing
 * taken is an employer-paid benefit. The name is text only.
 */
export interface BenefitItem {
  readonly name: string
  readonly period: ItemPeriod
  /** The benefit's value, ignoring anything paid towards it. */
  readonly value: Money
  /** What is taken from pay for it: salary given up (before tax) or a contribution from net pay (after tax). */
  readonly taken: Money
  readonly payment: BenefitPayment
}

const MONTHS = ratio(MONTHS_PER_YEAR, 1)

/** The pensionable pay a percentage applies to, for the year (B6). */
export function pensionablePay(salary: Money, bonus: Money, entry: PensionablePayEntry): Money {
  const base = entry.own ? entry.amount : salary
  return entry.includeBonus ? add(base, bonus) : base
}

/** A contribution for the year: the amount, or the percentage of pensionable pay to the nearest penny (B6). */
export function resolveContribution(entry: ContributionEntry, pensionable: Money): Money {
  return entry.mode === 'amount' ? entry.amount : mulRound(pensionable, percentRatio(entry.percentOfPay), 'nearest')
}

/** True when a percentage contribution is more than all of pensionable pay. */
export function isAboveAllOfPay(entry: ContributionEntry): boolean {
  return entry.mode === 'percentOfPay' && compareRatio(percentRatio(entry.percentOfPay), ratio(1, 1)) > 0
}

/** An item's amount for the year: a monthly amount times the months in a year, exactly (B8). */
export function annualAmount(item: ListItem): Money {
  return item.period === 'month' ? mulRound(item.amount, MONTHS, 'nearest') : item.amount
}

/** A list's total for the year; nothing for an empty list (B7). */
export function listTotal(items: readonly ListItem[]): Money {
  return items.reduce((sum, item) => add(sum, annualAmount(item)), ZERO)
}

/** STUB (red commit): a benefit item's annual amounts for the engine. */
export function annualBenefit(item: BenefitItem): BenefitInput {
  return { value: item.value, taken: ZERO, payment: item.payment }
}
