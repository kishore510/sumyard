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

/**
 * Weeks of Child Benefit in a year, the default for the optimiser's
 * ModellingPolicy.childBenefitWeeks (decision G4 in
 * docs/modelling-decisions.md). No GOV.UK page read states the count for a
 * tax year, so the default is the same calendar divisor as the weekly view;
 * the owner can set another count in the policy.
 */
export const CHILD_BENEFIT_WEEKS_PER_YEAR = WEEKS_PER_YEAR

/** Quarters in a year: a calendar divisor for quarterly contributions or compounding (slice 2a, C7). */
export const QUARTERS_PER_YEAR = 4

/** Days in a year for daily compounding (slice 2a, C7): a calendar divisor, not a day count for any tax rule. */
export const DAYS_PER_YEAR = 365

/** How often something happens in a year: compounding may be any of these (decision C1 in docs/modelling-decisions-compound.md). */
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

/** How often a regular contribution is paid (C1): every frequency but daily. */
export type ContributionFrequency = Exclude<Frequency, 'daily'>

/**
 * Periods in a year for each frequency (C7). Calendar divisors, not tax
 * figures: a year is taken as exactly this many periods, so a weekly year is
 * 52 weeks.
 */
export const PERIODS_PER_YEAR: Readonly<Record<Frequency, number>> = {
  daily: DAYS_PER_YEAR,
  weekly: WEEKS_PER_YEAR,
  monthly: MONTHS_PER_YEAR,
  quarterly: QUARTERS_PER_YEAR,
  annual: 1,
}
