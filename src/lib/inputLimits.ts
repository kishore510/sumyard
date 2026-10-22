import { fromPounds, ratio } from './money'

/*
 * Bounds on what a person can type into a calculator, so every sum stays a
 * safe whole number of pence. Not tax figures; kept outside the calculator
 * folders so their literal guard holds.
 */

/** The largest amount one money input accepts. */
export const MAX_INPUT_AMOUNT = fromPounds(10_000_000)

/** The most children a Child Benefit input accepts. */
export const MAX_CHILDREN = 20

/** The most items one list (benefits in kind, post-tax deductions) holds. */
export const MAX_LIST_ITEMS = 10

/** The longest name an item can have, in characters. */
export const MAX_ITEM_NAME_LENGTH = 80

/** The largest percentage a percentage input accepts (as an exact Ratio): ten times the base. */
export const MAX_PERCENT_INPUT = ratio(10, 1)

/** The longest tax code text accepted, in characters (an S or C prefix, a long number, a suffix and an emergency marker fit). */
export const MAX_TAX_CODE_LENGTH = 16

/** The largest number a tax code may carry, so its allowance stays a safe amount. Not a tax figure. */
export const MAX_TAX_CODE_NUMBER = 999_999

/** The most earlier tax years a carry forward entry can name. An input bound, not the carry forward period (that is config). */
export const MAX_CARRY_FORWARD_YEARS = 10

/** The longest compound interest projection, in whole years (decision C8 in docs/modelling-decisions-compound.md). */
export const MAX_PROJECTION_YEARS = 100

/** Compound interest: the nominal growth rate lies within plus or minus this (C8). Negative rates are allowed. */
export const GROWTH_RATE_BOUND = ratio(1, 2)

/** Compound interest: the inflation rate lies within plus or minus this (C8). */
export const INFLATION_RATE_BOUND = ratio(1, 2)

/** Compound interest: the largest annual fee, as a share of the balance (C8). */
export const MAX_FEE_RATE = ratio(1, 10)

/** Compound interest: the largest annual increase in contributions (C8). */
export const MAX_CONTRIBUTION_INCREASE = ratio(1, 2)

/** Compound interest: the years a fresh page starts with. A starting value, not a bound and not advice. */
export const DEFAULT_PROJECTION_YEARS = 10

/** Car finance: the longest agreement, in whole months (decision F13 in docs/modelling-decisions-car.md). */
export const MAX_FINANCE_TERM_MONTHS = 120

/** Car finance: the largest annual interest rate an agreement accepts (F13). An input bound, not a market figure. */
export const MAX_FINANCE_RATE = ratio(1, 1)

/** Car finance: the most miles a PCP mileage input accepts, over the whole agreement (F13). */
export const MAX_MILEAGE = 1_000_000

/** Car finance: the largest excess mileage charge per mile (F13). */
export const MAX_EXCESS_PER_MILE = fromPounds(10)

/** Car ownership: the most options compared at once (decision F16 in docs/modelling-decisions-car.md). */
export const MAX_CAR_OPTIONS = 4

/** Car ownership: the longest horizon, in whole months (F30). */
export const MAX_HORIZON_MONTHS = 240

/** Car decision page: the horizon a fresh page starts with, in months (slice 3c-1). A starting value, not a bound and not advice. */
export const DEFAULT_HORIZON_MONTHS = 48

/**
 * Car decision page: the percentage changes the sensitivity view applies to one input at a time (slice 3c-2). A display
 * convention, not a forecast or a market figure.
 */
export const SENSITIVITY_SHIFTS: readonly number[] = [-20, -10, 10, 20]

/** Car ownership: a horizon value may be at most this times the starting value (F17, F30): zero depreciation and a modest rise are allowed. */
export const MAX_HORIZON_VALUE_RATIO = ratio(3, 2)

/** Car ownership: the most miles a year (F30). */
export const MAX_ANNUAL_MILEAGE = 100_000

/** Car ownership: the largest after-tax savings return a year, for the opportunity cost (F18, F30). Not a market figure. */
export const MAX_SAVINGS_RETURN = ratio(1, 5)

/** Car ownership: a yearly increase in running costs or the fuel price lies within plus or minus this (F21, F30). */
export const PRICE_CHANGE_BOUND = ratio(1, 2)

/** Car ownership: the most miles per gallon accepted (F30). */
export const MAX_MILES_PER_GALLON = ratio(1_000, 1)

/** Car ownership: the most miles per kWh accepted (F30). */
export const MAX_MILES_PER_KWH = ratio(20, 1)

/** Car ownership: the largest price per litre, per kWh or per mile, in pence (F30). */
export const MAX_PENCE_PER_UNIT = ratio(1_000, 1)
