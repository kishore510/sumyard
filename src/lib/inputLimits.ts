import { fromPounds } from './money'

/*
 * Bounds on what a person can type into a calculator, so every sum stays a
 * safe whole number of pence. Not tax figures; kept outside the calculator
 * folders so their literal guard holds.
 */

/** The largest amount one money input accepts. */
export const MAX_INPUT_AMOUNT = fromPounds(10_000_000)

/** The most children a Child Benefit input accepts. */
export const MAX_CHILDREN = 20
