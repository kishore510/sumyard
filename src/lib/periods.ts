/*
 * Calendar divisors for showing an annual figure per month or per week. They
 * are not tax figures: a payslip's tax, National Insurance and student loan
 * come from per-period thresholds, which these views do not model (see
 * src/calculators/optimiser/README.md).
 */

/** An annual figure shown per month is divided by this. */
export const MONTHS_PER_YEAR = 12

/** An annual figure shown per week is divided by this. */
export const WEEKS_PER_YEAR = 52
