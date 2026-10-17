import type { IsoDate } from '@/lib/isoDate'
import { fromPounds, percent, ratio, ZERO } from '@/lib/money'
import type { TaxBand, TaxYearConfig } from './schema'
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
const HMRC_INCOME_TAX_RATES: SourceUrl =
  'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past'
const EMPLOYER_RATES: SourceUrl = 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027'
const HMRC_NI_RATES: SourceUrl =
  'https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions'

export const taxYear: TaxYearConfig = {
  id: '2026-27',
  period: {
    start: read<IsoDate>('2026-04-06', INCOME_TAX_RATES),
    end: read<IsoDate>('2027-04-05', INCOME_TAX_RATES),
  },
  incomeTax: {
    personalAllowance: read(fromPounds(12_570), HMRC_INCOME_TAX_RATES),
    taperStart: read(fromPounds(100_000), HMRC_INCOME_TAX_RATES),
    taperRate: read(ratio(1, 2), HMRC_INCOME_TAX_RATES),
    bands: {
      rUK: read<readonly TaxBand[]>(
        [
          { name: 'Basic rate', from: ZERO, rate: percent('20') },
          { name: 'Higher rate', from: fromPounds(37_700), rate: percent('40') },
          { name: 'Additional rate', from: fromPounds(125_140), rate: percent('45') },
        ],
        HMRC_INCOME_TAX_RATES,
      ),
      scotland: read<readonly TaxBand[]>(
        [
          { name: 'Starter rate', from: ZERO, rate: percent('19') },
          { name: 'Basic rate', from: fromPounds(3_967), rate: percent('20') },
          { name: 'Intermediate rate', from: fromPounds(16_956), rate: percent('21') },
          { name: 'Higher rate', from: fromPounds(31_092), rate: percent('42') },
          { name: 'Advanced rate', from: fromPounds(62_430), rate: percent('45') },
          { name: 'Top rate', from: fromPounds(125_140), rate: percent('48') },
        ],
        HMRC_INCOME_TAX_RATES,
      ),
    },
  },
  nationalInsurance: {
    employee: {
      primaryThreshold: read(fromPounds(12_570), EMPLOYER_RATES),
      upperEarningsLimit: read(fromPounds(50_270), EMPLOYER_RATES),
      mainRate: read(percent('8'), HMRC_NI_RATES),
      additionalRate: read(percent('2'), HMRC_NI_RATES),
    },
    employer: {
      secondaryThreshold: read(fromPounds(5_000), EMPLOYER_RATES),
      rate: read(percent('15'), HMRC_NI_RATES),
    },
  },
  studentLoans: {
    plan1: { threshold: read(fromPounds(26_900), EMPLOYER_RATES), rate: read(percent('9'), EMPLOYER_RATES) },
    plan2: { threshold: read(fromPounds(29_385), EMPLOYER_RATES), rate: read(percent('9'), EMPLOYER_RATES) },
    plan4: { threshold: read(fromPounds(33_795), EMPLOYER_RATES), rate: read(percent('9'), EMPLOYER_RATES) },
    plan5: { threshold: read(fromPounds(25_000), EMPLOYER_RATES), rate: read(percent('9'), EMPLOYER_RATES) },
    postgraduate: { threshold: read(fromPounds(21_000), EMPLOYER_RATES), rate: read(percent('6'), EMPLOYER_RATES) },
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
