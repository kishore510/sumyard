import type { IsoDate } from '@/lib/isoDate'
import type { Money, Ratio } from '@/lib/money'
import type { Reserved, Sourced, Verified } from './sourced'

/*
 * The shape of one tax year's config (slice 0.5). Structure only: what Sumyard
 * will need to know, not what the values are. Every leaf is Sourced<T>, so it
 * is either unverified ({ status: 'todo' }) or carries its value, a GOV.UK
 * source and the date it was checked. Values arrive in slice 1a, from GOV.UK
 * and HMRC, never from memory; 1a may also reshape a group once the sources
 * show how a rule is really expressed (see docs/money.md and PLAN.md).
 *
 * Conventions:
 * - Amounts are Money (integer pence) and annual unless the name says
 *   otherwise (Child Benefit is weekly). Whether a calculator needs annual or
 *   per-period figures (NI, student loans) is checked in 1a.
 * - Rates are exact Ratios, never floats.
 * - Income tax bands are a list, so no number of bands is assumed. Each band
 *   starts at `from` (taxable income, after allowances) and runs to the next
 *   band's `from`; the last has no upper limit.
 */

/** A tax year's id, as its file name: "2026-27". */
export type TaxYearId = `${number}-${number}`

export interface TaxBand {
  /** The band's name as the source gives it. */
  readonly name: string
  /** Taxable income at which the band starts. */
  readonly from: Money
  readonly rate: Ratio
}

export interface StudentLoanPlan {
  /** Income above which repayments are due. */
  readonly threshold: Sourced<Money>
  /** Share of income above the threshold repaid. */
  readonly rate: Sourced<Ratio>
}

export interface TaxYearConfig {
  readonly id: TaxYearId
  readonly period: {
    readonly start: Sourced<IsoDate>
    readonly end: Sourced<IsoDate>
  }
  readonly incomeTax: {
    readonly personalAllowance: Sourced<Money>
    /** Adjusted net income above which the personal allowance is reduced. */
    readonly taperStart: Sourced<Money>
    /** Allowance lost per pound of income over the taper start. */
    readonly taperRate: Sourced<Ratio>
    readonly bands: {
      /** England, Wales and Northern Ireland. */
      readonly rUK: Sourced<readonly TaxBand[]>
      readonly scotland: Sourced<readonly TaxBand[]>
    }
  }
  readonly nationalInsurance: {
    readonly employee: {
      readonly primaryThreshold: Sourced<Money>
      readonly upperEarningsLimit: Sourced<Money>
      /** Between the primary threshold and the upper earnings limit. */
      readonly mainRate: Sourced<Ratio>
      /** Above the upper earnings limit. */
      readonly additionalRate: Sourced<Ratio>
    }
    readonly employer: {
      readonly secondaryThreshold: Sourced<Money>
      readonly rate: Sourced<Ratio>
    }
  }
  readonly studentLoans: {
    readonly plan1: StudentLoanPlan
    readonly plan2: StudentLoanPlan
    readonly plan4: StudentLoanPlan
    readonly plan5: StudentLoanPlan
    readonly postgraduate: StudentLoanPlan
  }
  readonly pension: {
    readonly annualAllowance: Sourced<Money>
    readonly taper: {
      /** Threshold income at or below which the allowance is not tapered. */
      readonly thresholdIncome: Sourced<Money>
      /** Adjusted income above which the allowance is tapered. */
      readonly adjustedIncome: Sourced<Money>
      /** The lowest the tapered allowance can go. */
      readonly minimumAllowance: Sourced<Money>
      /** Allowance lost per pound of adjusted income over the threshold. */
      readonly reductionRate: Sourced<Ratio>
    }
    readonly carryForward: {
      /** How many earlier tax years unused allowance can come from. */
      readonly yearsBack: Sourced<number>
    }
    readonly moneyPurchaseAnnualAllowance: Sourced<Money>
  }
  readonly childBenefit: {
    readonly weeklyRates: {
      readonly eldestOrOnly: Sourced<Money>
      readonly additionalChild: Sourced<Money>
    }
    /** High Income Child Benefit Charge. 1a checks whether the charge between the two follows from them or needs a step field. */
    readonly hicbc: {
      /** Adjusted net income at which the charge starts. */
      readonly threshold: Sourced<Money>
      /** Adjusted net income at which the charge equals the Child Benefit. */
      readonly fullChargeAt: Sourced<Money>
    }
  }
  readonly childcare: {
    readonly taxFreeChildcare: { readonly incomeLimit: Sourced<Money> }
    readonly thirtyHours: { readonly incomeLimit: Sourced<Money> }
  }
  /** Room for the dividend and savings allowances. Not modelled in Phase 1, so it holds no values. */
  readonly savingsAndDividends: Reserved
}

type Leaf = Sourced<unknown>

/** Every dotted path to a Sourced leaf: 'incomeTax.personalAllowance', 'studentLoans.plan1.rate', ... */
export type LeafPath<T = TaxYearConfig, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf
    ? `${Prefix}${K}`
    : T[K] extends Reserved
      ? never
      : T[K] extends object
        ? LeafPath<T[K], `${Prefix}${K}.`>
        : never
}[keyof T & string]

type At<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never

/** The value type of the leaf at a path: Money, Ratio, IsoDate, number or TaxBand[]. */
export type LeafValue<P extends LeafPath> = Extract<At<TaxYearConfig, P>, Verified<unknown>>['value']

/** How a leaf's value is checked and shown. */
export type FieldKind = 'money' | 'ratio' | 'count' | 'date' | 'bands'

type KindOf<V> = V extends readonly TaxBand[]
  ? 'bands'
  : V extends Money
    ? 'money'
    : V extends Ratio
      ? 'ratio'
      : V extends IsoDate
        ? 'date'
        : V extends number
          ? 'count'
          : never

export type TaxField = { [P in LeafPath]: { readonly path: P; readonly label: string; readonly kind: KindOf<LeafValue<P>> } }[LeafPath]

export interface TaxGroup {
  readonly id: string
  readonly title: string
  readonly fields: readonly TaxField[]
}

const plan = (key: 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgraduate', name: string): TaxField[] => [
  { path: `studentLoans.${key}.threshold`, label: `${name}: repayment threshold`, kind: 'money' },
  { path: `studentLoans.${key}.rate`, label: `${name}: repayment rate`, kind: 'ratio' },
]

/**
 * The value groups the Tax data screen shows, in order, with a label for each
 * leaf. configs.test.ts checks these cover every leaf exactly once.
 */
export const TAX_GROUPS: readonly TaxGroup[] = [
  {
    id: 'period',
    title: 'Tax year dates',
    fields: [
      { path: 'period.start', label: 'First day', kind: 'date' },
      { path: 'period.end', label: 'Last day', kind: 'date' },
    ],
  },
  {
    id: 'personal-allowance',
    title: 'Personal allowance and taper',
    fields: [
      { path: 'incomeTax.personalAllowance', label: 'Personal allowance', kind: 'money' },
      { path: 'incomeTax.taperStart', label: 'Taper starts at adjusted net income of', kind: 'money' },
      { path: 'incomeTax.taperRate', label: 'Allowance lost per pound over the taper start', kind: 'ratio' },
    ],
  },
  {
    id: 'income-tax-ruk',
    title: 'Income tax: England, Wales and Northern Ireland',
    fields: [{ path: 'incomeTax.bands.rUK', label: 'Bands and rates', kind: 'bands' }],
  },
  {
    id: 'income-tax-scotland',
    title: 'Income tax: Scotland',
    fields: [{ path: 'incomeTax.bands.scotland', label: 'Bands and rates', kind: 'bands' }],
  },
  {
    id: 'ni-employee',
    title: 'National Insurance: employee',
    fields: [
      { path: 'nationalInsurance.employee.primaryThreshold', label: 'Primary threshold', kind: 'money' },
      { path: 'nationalInsurance.employee.upperEarningsLimit', label: 'Upper earnings limit', kind: 'money' },
      { path: 'nationalInsurance.employee.mainRate', label: 'Main rate', kind: 'ratio' },
      { path: 'nationalInsurance.employee.additionalRate', label: 'Rate above the upper earnings limit', kind: 'ratio' },
    ],
  },
  {
    id: 'ni-employer',
    title: 'National Insurance: employer',
    fields: [
      { path: 'nationalInsurance.employer.secondaryThreshold', label: 'Secondary threshold', kind: 'money' },
      { path: 'nationalInsurance.employer.rate', label: 'Rate', kind: 'ratio' },
    ],
  },
  {
    id: 'student-loans',
    title: 'Student loans',
    fields: [
      ...plan('plan1', 'Plan 1'),
      ...plan('plan2', 'Plan 2'),
      ...plan('plan4', 'Plan 4'),
      ...plan('plan5', 'Plan 5'),
      ...plan('postgraduate', 'Postgraduate loan'),
    ],
  },
  {
    id: 'pension',
    title: 'Pensions',
    fields: [
      { path: 'pension.annualAllowance', label: 'Annual allowance', kind: 'money' },
      { path: 'pension.taper.thresholdIncome', label: 'Taper: threshold income', kind: 'money' },
      { path: 'pension.taper.adjustedIncome', label: 'Taper: adjusted income', kind: 'money' },
      { path: 'pension.taper.minimumAllowance', label: 'Taper: lowest tapered allowance', kind: 'money' },
      { path: 'pension.taper.reductionRate', label: 'Taper: allowance lost per pound over', kind: 'ratio' },
      { path: 'pension.carryForward.yearsBack', label: 'Carry forward: earlier tax years', kind: 'count' },
      { path: 'pension.moneyPurchaseAnnualAllowance', label: 'Money purchase annual allowance (MPAA)', kind: 'money' },
    ],
  },
  {
    id: 'child-benefit',
    title: 'Child Benefit and the High Income Child Benefit Charge',
    fields: [
      { path: 'childBenefit.weeklyRates.eldestOrOnly', label: 'Weekly rate: eldest or only child', kind: 'money' },
      { path: 'childBenefit.weeklyRates.additionalChild', label: 'Weekly rate: each additional child', kind: 'money' },
      { path: 'childBenefit.hicbc.threshold', label: 'Charge starts at adjusted net income of', kind: 'money' },
      { path: 'childBenefit.hicbc.fullChargeAt', label: 'Charge equals the benefit at adjusted net income of', kind: 'money' },
    ],
  },
  {
    id: 'childcare',
    title: 'Childcare support',
    fields: [
      { path: 'childcare.taxFreeChildcare.incomeLimit', label: 'Tax-Free Childcare: income limit', kind: 'money' },
      { path: 'childcare.thirtyHours.incomeLimit', label: '30 hours free childcare: income limit', kind: 'money' },
    ],
  },
]

export const TAX_FIELDS: readonly TaxField[] = TAX_GROUPS.flatMap((g) => g.fields)
