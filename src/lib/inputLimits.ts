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
