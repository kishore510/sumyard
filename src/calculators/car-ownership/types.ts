import type { ExactPence, Money, Ratio } from '@/lib/money'
import type { FinanceField, FinanceProblemReason, FinanceResult, HirePurchaseInputs, LoanInputs, PcpInputs } from '../car-finance/types'

/*
 * Types for the car ownership-cost engine (slice 3b). The decisions behind
 * these shapes are F16 to F31 in docs/modelling-decisions-car.md.
 */

/** The three horizon values a person enters (F3, F17). */
export type ValueCase = 'low' | 'expected' | 'high'

/** How fuel or energy is costed per mile (F21). Prices are exact Ratios of pence. */
export type FuelCost =
  | { readonly kind: 'fuel'; readonly milesPerGallon: Ratio; readonly pencePerLitre: Ratio }
  | {
      readonly kind: 'electric'
      readonly milesPerKwh: Ratio
      /** The share of charging at home, from nothing to all; the rest is public. */
      readonly homeShare: Ratio
      readonly homePencePerKwh: Ratio
      readonly publicPencePerKwh: Ratio
    }
  | { readonly kind: 'per-mile'; readonly pencePerMile: Ratio }

/** Annual amounts for the first year, each rising by the general increase (F21). VED is an amount the person enters (F4). */
export interface RunningCosts {
  readonly insurance: Money
  readonly maintenance: Money
  readonly ved: Money
  readonly other: Money
}

/** The car in an option (F16). */
export interface Car {
  /** The price (cash, loan, HP, PCP) or the current value (keep), at month 0. */
  readonly value: Money
  /** The value at the horizon in each case (F17). */
  readonly horizonValue: Readonly<Record<ValueCase, Money>>
  /** Whole miles a year. */
  readonly annualMileage: number
  readonly fuel: FuelCost
  /** The yearly change in the fuel or energy price. */
  readonly fuelPriceChange: Ratio
  readonly running: RunningCosts
  /** The yearly change in the other running costs. */
  readonly generalIncrease: Ratio
}

/**
 * Finance still owed on a kept car (F43 to F50). The settlement is the lender's figure to clear it today; the implied
 * rate comes from these figures through the 3a solver. The first payment is a month from today; the final payment is
 * paid with the last monthly payment and the car is kept.
 */
export interface ExistingFinance {
  readonly settlement: Money
  readonly monthlyPayment: Money
  /** Whole months, from one to the finance term bound. */
  readonly paymentsLeft: number
  readonly finalPayment: Money
}

/** How the car is had (F16). Finance inputs go to the 3a engine with the car's value as the cash price. */
export type Acquisition =
  /** Without existing finance, exactly as before 3e. */
  | { readonly kind: 'keep'; readonly existingFinance?: ExistingFinance }
  | { readonly kind: 'cash' }
  /** The loan amount may be below the car's value: the rest is paid in cash at month 0 (F24). */
  | { readonly kind: 'loan'; readonly finance: LoanInputs }
  | { readonly kind: 'hire-purchase'; readonly finance: Omit<HirePurchaseInputs, 'cashPrice'> }
  | {
      readonly kind: 'pcp'
      /** The expected mileage comes from the car's annual mileage over the term (F24). */
      readonly finance: Omit<PcpInputs, 'cashPrice' | 'expectedMileage'>
      readonly end: 'buy' | 'hand-back'
    }

export type AcquisitionKind = Acquisition['kind']

export interface CarOption {
  readonly car: Car
  readonly acquisition: Acquisition
}

/** What every option shares (F16, F18). */
export interface Shared {
  /** Whole months, from one to the bound. */
  readonly horizonMonths: number
  /** The person's after-tax savings return, an annual effective rate. */
  readonly savingsReturn: Ratio
}

/** The value curve for one case (F17). */
export interface ValueCurve {
  /** The value at each month from 0 to the horizon, to the penny; the first and last exact. */
  readonly values: readonly Money[]
  /** The fitted yearly change (negative for a fall), to fifteen decimal places; null for a car worth nothing. */
  readonly yearlyChange: Ratio | null
}

/** One month of the timeline, each a whole-penny amount paid that month (F24, F25). */
export interface TimelineMonth {
  readonly month: number
  /** Price, deposit, fees, payments and end payments. */
  readonly acquisition: Money
  readonly fuel: Money
  readonly insurance: Money
  readonly maintenance: Money
  readonly ved: Money
  readonly other: Money
}

/** How the net cost at the end of coverage splits (F26). Adds up to the net cost exactly; some parts may be negative. */
export interface Breakdown {
  readonly depreciation: Money
  readonly interestAndFees: Money
  readonly equityHandedBack: Money
  readonly fuel: Money
  readonly insurance: Money
  readonly maintenance: Money
  readonly ved: Money
  readonly other: Money
  readonly opportunityCost: Money
}

/** The position at a month, cumulative from month 0 (F18, F20). */
export interface MonthPoint {
  readonly month: number
  readonly cashOut: Money
  readonly value: Money
  readonly balance: Money
  /** Value less balance: negative equity shows. Nothing once a PCP car is handed back. */
  readonly equity: Money
  readonly opportunityCost: Money
  /** Cash out + keep's forgone sale − equity + opportunity cost. */
  readonly netCost: Money
}

/** One value case of one option (F18, F19, F26). */
export interface CaseResult {
  readonly valueCase: ValueCase
  readonly horizonValue: Money
  readonly curve: ValueCurve
  /** Months 0 to the end of coverage. */
  readonly months: readonly MonthPoint[]
  readonly cashOut: Money
  readonly netCost: Money
  /** Net cost ÷ coverage months, to the nearest penny. Ranking uses the exact quotient (F27). */
  readonly netCostPerCoverageMonth: Money
  readonly breakdown: Breakdown
}

export interface OwnershipResult {
  readonly estimate: true
  readonly acquisition: AcquisitionKind
  readonly horizonMonths: number
  readonly coverageMonths: number
  readonly fullCoverage: boolean
  /** Keep only: the sale given up at month 0 (F18): the current value, less the settlement with finance still owed (F44, negative when the settlement is above the value). Nothing otherwise. */
  readonly forgoneSale: Money
  /** The 3a result for loan, HP and PCP, and for keep with finance still owed (its implied rate and schedule, F45); null for cash and keep without finance. */
  readonly finance: FinanceResult | null
  /** Pence per mile, exactly (F21). */
  readonly costPerMile: ExactPence
  readonly timeline: readonly TimelineMonth[]
  readonly cases: Readonly<Record<ValueCase, CaseResult>>
  /** Plain-language assumptions with no figures. */
  readonly assumptions: readonly string[]
}

export type OwnershipField =
  | 'horizonMonths'
  | 'savingsReturn'
  | 'options'
  | 'value'
  | 'horizonValue'
  | 'annualMileage'
  | 'fuel'
  | 'milesPerGallon'
  | 'pencePerLitre'
  | 'milesPerKwh'
  | 'homeShare'
  | 'homePencePerKwh'
  | 'publicPencePerKwh'
  | 'pencePerMile'
  | 'fuelPriceChange'
  | 'insurance'
  | 'maintenance'
  | 'ved'
  | 'other'
  | 'generalIncrease'
  | 'acquisition'
  | 'end'
  | 'existingFinance'
  | 'settlement'
  | 'monthlyPayment'
  | 'paymentsLeft'

export interface OwnershipProblem {
  readonly field: OwnershipField | FinanceField | 'result'
  readonly reason: FinanceProblemReason
  /** The option's index, for a problem in one option. */
  readonly option?: number
}

export type OwnershipOutcome =
  | { readonly ok: true; readonly result: OwnershipResult }
  | { readonly ok: false; readonly problems: readonly OwnershipProblem[] }

/** One option's place in a ranking (F27). */
export interface RankEntry {
  readonly option: number
  readonly netCostPerCoverageMonth: Money
  /** Its net cost per month of coverage equals the previous entry's exactly. */
  readonly tiedWithPrevious: boolean
}

/** Full-coverage options in order of net cost per month of coverage; partial ones apart, in option order, unranked (F19, F27). */
export interface Ranking {
  readonly full: readonly RankEntry[]
  readonly partial: readonly RankEntry[]
}

export interface Comparison {
  readonly horizonMonths: number
  readonly options: readonly OwnershipResult[]
  readonly ranking: Readonly<Record<ValueCase, Ranking>>
  readonly assumptions: readonly string[]
}

export type ComparisonOutcome =
  | { readonly ok: true; readonly result: Comparison }
  | { readonly ok: false; readonly problems: readonly OwnershipProblem[] }

/** Which of the two options is lower at a point, or a tie (F22). */
export type Lower = 0 | 1 | 'tie'

/** A flip point (F22, F29): a threshold between two neighbouring values, never a recommendation. */
export type Flip<T> =
  | {
      readonly kind: 'crossing'
      /** The last value searched with the first order. For the horizon value, the crossing to the nearest penny. */
      readonly below: T
      /** The first value with the other order (the same as `below` for the horizon value). */
      readonly above: T
      readonly lowerBelow: Lower
      readonly lowerAbove: Lower
    }
  | { readonly kind: 'no-crossing-in-range'; readonly lowerThroughout: Lower }

export interface FlipPoints {
  readonly valueCase: ValueCase
  /** The horizon value of option 0, then of option 1, at which the two are equal. */
  readonly horizonValue: readonly [Flip<Money>, Flip<Money>]
  readonly savingsReturn: Flip<Ratio>
  /** The annual mileage of both options together. */
  readonly annualMileage: Flip<number>
}

export type FlipOutcome =
  | { readonly ok: true; readonly result: FlipPoints }
  | { readonly ok: false; readonly problems: readonly OwnershipProblem[] }
