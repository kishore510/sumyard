import type { IsoDate } from '@/lib/isoDate'
import type { TaxYearConfig } from './schema'
import { type SourceUrl, TODO, type Verified } from './sourced'

/*
 * 2026-27, verified in slice 1a session E. Every verified value below was
 * read on the GOV.UK page it cites, on the date given, and has a row in
 * docs/verification-log.md with the exact line it came from and a second
 * source where one exists. A value still TODO was not verified; calculators
 * that need it refuse to show results. Never fill or change a value from
 * memory: re-read the source, update the log, and keep each change of tax
 * values to its own PR. Amounts are integer pence, rates exact ratios
 * (docs/money.md); questions on how a value is applied are the log's OPEN
 * questions, not guesses here.
 */

const READ_ON: IsoDate = '2026-10-17'
const read = <T>(value: T, sourceUrl: SourceUrl): Verified<T> => ({ status: 'verified', value, sourceUrl, verifiedOn: READ_ON })

const INCOME_TAX_RATES: SourceUrl = 'https://www.gov.uk/income-tax-rates'

export const taxYear: TaxYearConfig = {
  id: '2026-27',
  period: {
    start: read<IsoDate>('2026-04-06', INCOME_TAX_RATES),
    end: read<IsoDate>('2027-04-05', INCOME_TAX_RATES),
  },
  incomeTax: {
    personalAllowance: TODO,
    taperStart: TODO,
    taperRate: TODO,
    bands: { rUK: TODO, scotland: TODO },
  },
  nationalInsurance: {
    employee: { primaryThreshold: TODO, upperEarningsLimit: TODO, mainRate: TODO, additionalRate: TODO },
    employer: { secondaryThreshold: TODO, rate: TODO },
  },
  studentLoans: {
    plan1: { threshold: TODO, rate: TODO },
    plan2: { threshold: TODO, rate: TODO },
    plan4: { threshold: TODO, rate: TODO },
    plan5: { threshold: TODO, rate: TODO },
    postgraduate: { threshold: TODO, rate: TODO },
  },
  pension: {
    annualAllowance: TODO,
    taper: { thresholdIncome: TODO, adjustedIncome: TODO, minimumAllowance: TODO, reductionRate: TODO },
    carryForward: { yearsBack: TODO },
    moneyPurchaseAnnualAllowance: TODO,
    reliefAtSourceRate: TODO,
  },
  childBenefit: {
    weeklyRates: { eldestOrOnly: TODO, additionalChild: TODO },
    hicbc: { threshold: TODO, fullChargeAt: TODO, incomePerPercent: TODO },
  },
  childcare: {
    taxFreeChildcare: { incomeLimit: TODO },
    thirtyHours: { incomeLimit: TODO },
  },
  savingsAndDividends: { reserved: true },
}
