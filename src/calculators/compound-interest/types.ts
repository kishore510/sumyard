import type { Money, Ratio } from '@/lib/money'
import type { ContributionFrequency, Frequency } from '@/lib/periods'

/*
 * Types for the compound interest engine (slice 2a). The decisions behind
 * these shapes are in docs/modelling-decisions-compound.md (C1 to C9).
 */

/** When a regular contribution is paid in its period (C3). */
export type Timing = 'start' | 'end'

/** What the engine takes (C1). Amounts are whole pence; rates are exact Ratios (a fifth is ratio(1, 5)). */
export interface CompoundInputs {
  /** Paid at the start of year one. */
  readonly lumpSum: Money
  /** Each regular contribution in the first year. */
  readonly contribution: Money
  readonly contributionFrequency: ContributionFrequency
  readonly timing: Timing
  /** Whole years, from one to the horizon cap. */
  readonly years: number
  /** Each year's contributions are the previous year's times one plus this. */
  readonly contributionIncrease: Ratio
  /** The nominal annual growth rate, compounded at `compounding` (C2). May be negative. */
  readonly growthRate: Ratio
  readonly compounding: Frequency
  /** The annual fee as a share of the balance, charged each compounding period after growth (C4). */
  readonly feeRate: Ratio
  /** The annual inflation rate, for the real view (C5). */
  readonly inflationRate: Ratio
}

/** One year of a projection, each figure rounded to the penny (C6). */
export interface YearRow {
  readonly year: number
  readonly opening: Money
  readonly contributions: Money
  /** Takes the rounding penny, so opening + contributions + growth − fees = closing. In the real view it includes the loss to inflation. */
  readonly growth: Money
  readonly fees: Money
  readonly closing: Money
  readonly cumulativeContributions: Money
  readonly cumulativeGrowth: Money
  readonly cumulativeFees: Money
}

/** A projection in one view (nominal or real). The rows add up exactly to the totals. */
export interface Projection {
  readonly rows: readonly YearRow[]
  readonly lumpSum: Money
  readonly contributions: Money
  readonly growth: Money
  readonly fees: Money
  readonly closing: Money
}

/** The same run in nominal money and in today's money (C5). */
export interface Views {
  readonly nominal: Projection
  readonly real: Projection
}

export interface FeeDrag {
  /** Closing balance without the fee less closing balance with it. */
  readonly nominal: Money
  readonly real: Money
}

export interface CompoundResult {
  readonly estimate: true
  /** Growth before fees, as an effective annual rate (C2). */
  readonly effectiveAnnualRate: Ratio
  /** Growth after fees, as an effective annual rate. */
  readonly effectiveAnnualRateAfterFees: Ratio
  /** The equivalent growth rate per contribution period, before fees (C2). */
  readonly periodRate: Ratio
  /** The after-fee effective rate less inflation by the Fisher relation (C5). */
  readonly realAnnualRate: Ratio
  readonly withFee: Views
  readonly noFee: Views
  readonly feeDrag: FeeDrag
  /** Plain-language assumptions with no figures, for the page to show. */
  readonly assumptions: readonly string[]
}

export type CompoundField = keyof CompoundInputs

/** Why an input or the result is refused (C8). */
export type CompoundProblemReason =
  | 'not-money'
  | 'not-a-rate'
  | 'not-whole'
  | 'not-a-choice'
  | 'below-minimum'
  | 'above-maximum'
  | 'too-large'

export interface CompoundProblem {
  readonly field: CompoundField | 'result'
  readonly reason: CompoundProblemReason
}

/** A result, or a typed refusal that names each problem. Never a wrong number. */
export type CompoundOutcome =
  | { readonly ok: true; readonly result: CompoundResult }
  | { readonly ok: false; readonly problems: readonly CompoundProblem[] }
