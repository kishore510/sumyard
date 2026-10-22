import { ratio } from './money'

/*
 * Unit conversions, each verified on an official page and logged in
 * docs/verification-log.md. Not tax figures; kept outside the calculator
 * folders so their literal guard holds.
 */

/**
 * Litres in an imperial gallon (CO-1): the Weights and Measures Act 1985,
 * Schedule 1, "GALLON = 4.54609 cubic decimetres" and "LITRE = a cubic
 * decimetre". For the car ownership cost per mile from miles per gallon (F21).
 */
export const LITRES_PER_GALLON = ratio(454_609, 100_000)
