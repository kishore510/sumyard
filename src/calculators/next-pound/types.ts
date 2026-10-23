import type { LeafPath, TaxYearId } from '@/config/tax/schema'
import type { IsoDate } from '@/lib/isoDate'
import type { Money, Ratio } from '@/lib/money'
import type { CompoundProblem } from '../compound-interest/types'
import type { MortgageInputs, MortgageProblem, MortgageWarning } from '../mortgage/types'
import type { EngineWarning, OptimiserInputs } from '../optimiser/types'

/*
 * Types for the next pound composer (C1): one lump sum X of take-home, now,
 * into a pension, a mortgage overpayment or an ISA, each shown as what it
 * adds to net worth at a horizon, in today's money and nominal, after tax on
 * withdrawal. The decisions are CP1 to CP11 in docs/modelling-decisions.md,
 * "Next pound decision (session C0)"; rounding in docs/money.md. Nothing here
 * is called best or recommended (G13).
 */

/** The three growth cases the ISA and the pension are grown at (CP6, CP4). */
export type GrowthCase = 'low' | 'mid' | 'high'

export const GROWTH_CASES = ['low', 'mid', 'high'] as const satisfies readonly GrowthCase[]

/** Nominal annual growth rates before the fee, compounded once a year; low at most mid, mid at most high. */
export type GrowthRates = { readonly [K in GrowthCase]: Ratio }

/** The pension leg's inputs (CP3, CP4). */
export interface PensionLegInputs {
  /** The person's pay, region, loans, Child Benefit, pension method, current contribution and savings, as the optimiser takes them. */
  readonly optimiser: OptimiserInputs
  /** What the employer adds because of the extra contribution (default nothing): into the pot and the annual allowance, not spendable. */
  readonly employerMatch: Money
  /** The person's age now, in whole years. */
  readonly ageNow: number
  /** A scheme's own later access age, in whole years; null for none (the normal minimum pension age applies). */
  readonly schemeAccessAge: number | null
  /** The one tax rate on the taxed part of the pot at the horizon; null for the default, the "Basic rate" band's rate (CP4). */
  readonly retirementTaxRate: Ratio | null
  /** Whether the person's other pensions will use the lump sum allowance (default no): then nothing here is tax-free. */
  readonly otherPensionsUseAllowance: boolean
}

/** The mortgage as the mortgage engine takes it; the composer sets the effect, no regular overpayment and the one lump sum (CP5). */
export type MortgageLegInputs = Omit<MortgageInputs, 'effect' | 'regular' | 'lumpSums'>

/** What the composer takes: the page's inputs (CP1). */
export interface NextPoundInputs {
  /** X: take-home pay to put in one place now, zero or more. */
  readonly lumpSum: Money
  /** Whole years to the horizon, from one to MAX_PROJECTION_YEARS. */
  readonly horizonYears: number
  /** The day the inputs describe, for the access age (the engine never reads the clock). */
  readonly asOf: IsoDate
  /** Annual inflation for today's money (CP2). */
  readonly inflationRate: Ratio
  readonly growth: GrowthRates
  /** The annual fee on the ISA and the pension, as a share of the balance (CP6, CP4). */
  readonly feeRate: Ratio
  readonly pension: PensionLegInputs
  /** Null with no mortgage: the leg is not shown. */
  readonly mortgage: MortgageLegInputs | null
  /** Paid into ISAs already this tax year, for the allowance warning (CP6). */
  readonly isa: { readonly paidThisYear: Money }
}

export type NextPoundField =
  | 'lumpSum'
  | 'horizonYears'
  | 'asOf'
  | 'inflationRate'
  | 'growth.low'
  | 'growth.mid'
  | 'growth.high'
  | 'feeRate'
  | 'pension.optimiser'
  | 'pension.employerMatch'
  | 'pension.ageNow'
  | 'pension.schemeAccessAge'
  | 'pension.retirementTaxRate'
  | 'pension.otherPensionsUseAllowance'
  | 'isa.paidThisYear'
  /** A figure past what the engines can hold. */
  | 'result'

export type NextPoundProblemReason =
  | 'not-money'
  | 'not-whole'
  | 'not-a-rate'
  | 'not-a-date'
  | 'not-a-choice'
  | 'below-minimum'
  | 'above-maximum'
  | 'out-of-order'
  /** No band named "Basic rate" in the region's bands: the person must enter a rate (CP4). */
  | 'no-default'
  /** The engine behind the leg did not accept these inputs. */
  | 'not-accepted'
  | 'too-large'

/** Why one of the composer's own inputs was refused, by field. */
export interface NextPoundProblem {
  readonly field: NextPoundField
  readonly reason: NextPoundProblemReason
}

/** A leg refused by the engine it rests on, or by the composer's own checks on that leg's inputs; the other legs still show. */
export type LegRefusal =
  | { readonly status: 'refused'; readonly engine: 'optimiser'; readonly unverified: readonly LeafPath[] }
  | { readonly status: 'refused'; readonly engine: 'mortgage'; readonly problems: readonly MortgageProblem[] }
  | { readonly status: 'refused'; readonly engine: 'compound-interest'; readonly problems: readonly CompoundProblem[] }
  | { readonly status: 'refused'; readonly engine: 'next-pound'; readonly problems: readonly NextPoundProblem[] }

/** X of nothing: the leg is nothing, with no warnings (not a refusal). */
export interface LegNothing {
  readonly status: 'nothing'
}

/** An amount at the horizon, in today's money and nominal (CP2). */
export interface Amounts {
  readonly todaysMoney: Money
  readonly nominal: Money
}

export type NextPoundWarningCode = 'pensionAtMaximum' | 'transitionalAgeRules' | 'isaOverAllowance'

/** A warning on a leg: passed through from its engine (CP8), or the composer's own, in words with no figures. */
export type NextPoundWarning =
  | { readonly source: 'optimiser'; readonly leg: 'pension'; readonly warning: EngineWarning }
  | { readonly source: 'mortgage'; readonly leg: 'mortgage'; readonly warning: MortgageWarning }
  | {
      readonly source: 'next-pound'
      readonly leg: 'pension' | 'isa'
      readonly code: NextPoundWarningCode
      readonly message: string
    }

/** What X buys in the pension (CP3). */
export interface PensionContribution {
  /** The contribution now (as entered) and with the extra. */
  readonly before: Money
  readonly after: Money
  /** E: the extra contribution out of pay. */
  readonly extra: Money
  /** The employer match added because of it (nothing when E is nothing). */
  readonly employerMatch: Money
  /** Into the pension: the optimiser's pension total with E less without. */
  readonly pensionAdded: Money
  /** Spendable income given up: the optimiser's spendable without E less with it; may be below nothing near a HICBC step. */
  readonly cost: Money
  /** X less the cost, held as cash in this column (CP2). */
  readonly leftoverCash: Money
  /** The contribution is the most the optimiser models (gross equal to gross pay). */
  readonly atMaximum: boolean
}

/** The access age test at the horizon (CP4). */
export interface PensionAccess {
  /** asOf plus the horizon. */
  readonly horizonDate: IsoDate
  /** The normal minimum pension age on the horizon date: the age now, or the announced age from its date (NP-3, NP-5). */
  readonly minimumAge: number
  /** The later of that and the scheme's own age. */
  readonly accessAge: number
  readonly ageAtHorizon: number
  /** The age at the horizon reaches the access age. */
  readonly accessible: boolean
}

/** The pension at the horizon at one growth case (CP4). */
export interface PensionAtRate {
  readonly growthRate: Ratio
  /** The pot from compound interest's project(), with the fee. */
  readonly pot: Amounts
  /** The tax-free part: the share of the pot, down to the penny, capped at the allowance available. Nominal. */
  readonly taxFree: Money
  /** Tax on the rest at the retirement rate, to the nearest penny. Nominal. */
  readonly tax: Money
  /** The pot less the tax. */
  readonly afterTax: Amounts
  /** The column: after tax plus the leftover cash. */
  readonly value: Amounts
}

export interface PensionLegShared {
  /** Never guaranteed: it rests on growth. */
  readonly guaranteed: false
  readonly contribution: PensionContribution
  readonly access: PensionAccess
  readonly warnings: readonly NextPoundWarning[]
}

export type PensionLeg =
  | (PensionLegShared & {
      readonly status: 'accessible'
      readonly retirementTaxRate: Ratio
      /** Where the rate came from: the "Basic rate" band in config, or the person's input. */
      readonly retirementTaxRateFrom: 'config' | 'input'
      /** The lump sum allowance available to this pot: nothing when other pensions use it. */
      readonly allowanceAvailable: Money
      readonly rates: { readonly [K in GrowthCase]: PensionAtRate }
    })
  /** The horizon is before the access age: no number and no break-even (CP4). */
  | (PensionLegShared & { readonly status: 'not-accessible' })
  | LegRefusal
  | LegNothing

/** The mortgage leg (CP5). The only guaranteed leg. */
export interface MortgageLegResult {
  readonly status: 'ok'
  readonly guaranteed: true
  /** O: the overpayment asked for, with the first payment: the most whose O plus its charge does not pass X. */
  readonly overpayment: Money
  /** The part of O used (never more than clears the balance) and the part not needed (MO8). */
  readonly overpaymentUsed: Money
  readonly unused: Money
  /** The early repayment charge, paid in cash (MO7). */
  readonly erc: Money
  /** X less O less the charge, plus the part not needed: cash in this column (CP2). */
  readonly leftoverCash: Money
  /** The month read: the first payment's month (when O goes in) plus twelve times the horizon years, or the term's last month if sooner. */
  readonly horizonMonth: number
  readonly baselineBalance: Money
  readonly overpayingBalance: Money
  /** Each month to the horizon, the payment without the overpayment less with it, summed at face value. */
  readonly paymentsFreed: Money
  /** The column: the balance difference, the payments freed and the leftover cash. */
  readonly value: Amounts
  readonly warnings: readonly NextPoundWarning[]
}

export type MortgageLeg = MortgageLegResult | { readonly status: 'none' } | LegRefusal | LegNothing

export interface IsaAtRate {
  readonly growthRate: Ratio
  /** The ISA at the horizon from project(), with the fee: the column. */
  readonly value: Amounts
}

export type IsaLeg =
  | {
      readonly status: 'ok'
      readonly guaranteed: false
      readonly rates: { readonly [K in GrowthCase]: IsaAtRate }
      readonly warnings: readonly NextPoundWarning[]
    }
  | LegRefusal
  | LegNothing

/**
 * The ISA growth rate before the fee at which the ISA leg equals another leg
 * (CP7), found by bisection on rates in steps of one over
 * BREAK_EVEN_RATE_DENOMINATOR within GROWTH_RATE_BOUND: `rate` is the
 * highest step whose ISA is at most the other leg, `upTo` the next (equal
 * at the bound). Outside the bound, no number.
 */
export type BreakEven =
  | { readonly kind: 'rate'; readonly rate: Ratio; readonly upTo: Ratio }
  | { readonly kind: 'above-highest' }
  | { readonly kind: 'below-lowest' }

export interface NextPoundResult {
  readonly ok: true
  readonly taxYear: TaxYearId
  readonly estimate: true
  readonly lumpSum: Money
  readonly horizonYears: number
  readonly legs: { readonly pension: PensionLeg; readonly mortgage: MortgageLeg; readonly isa: IsaLeg }
  /** Against the mortgage leg, and against the pension at the mid case; null where that leg has no number, or X is nothing. */
  readonly breakEven: { readonly mortgage: BreakEven | null; readonly pension: BreakEven | null }
  /** Every leg's warnings, pension, mortgage, ISA. */
  readonly warnings: readonly NextPoundWarning[]
  /** Plain words with no figures: what the result rests on, the proposed readings named. */
  readonly assumptions: readonly string[]
}

/** The composer's shared inputs were refused, by field: no leg is shown. */
export interface NextPoundProblems {
  readonly ok: false
  readonly problems: readonly NextPoundProblem[]
}
