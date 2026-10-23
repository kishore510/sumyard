import type { IsoDate } from '@/lib/isoDate'
import { fromPounds, percent, ratio, ZERO } from '@/lib/money'
import type { TaxBand, TaxYearConfig } from './schema'
import type { SourceUrl, Verified } from './sourced'

/*
 * 2026-27, verified in slice 1a session E (the PAYE tax code unit in a later
 * session). Every verified value below was read on the GOV.UK page it cites, on the date given, and has a row in
 * docs/verification-log.md with the exact line it came from and a second
 * source where one exists. A value still TODO was not verified; calculators
 * that need it refuse to show results. Never fill or change a value from
 * memory: re-read the source, update the log, and keep each change of tax
 * values to its own PR. Amounts are integer pence, rates exact ratios
 * (docs/money.md); questions on how a value is applied are the log's OPEN
 * questions, not guesses here.
 */

const READ_ON: IsoDate = '2026-10-17'
const read = <T>(value: T, sourceUrl: SourceUrl, verifiedOn: IsoDate = READ_ON): Verified<T> => ({
  status: 'verified',
  value,
  sourceUrl,
  verifiedOn,
})
/** Read in the session that added PAYE tax codes. */
const READ_FOR_PAYE: IsoDate = '2026-10-18'
/** Read in the session that added the next pound decision's leaves. */
const READ_FOR_NEXT_POUND: IsoDate = '2026-10-23'

const INCOME_TAX_RATES: SourceUrl = 'https://www.gov.uk/income-tax-rates'
const HMRC_INCOME_TAX_RATES: SourceUrl =
  'https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past'
const EMPLOYER_RATES: SourceUrl = 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027'
const PENSION_RATES: SourceUrl = 'https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates'
const TAPERED_ALLOWANCE_MANUAL: SourceUrl = 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057100'
const CARRY_FORWARD: SourceUrl = 'https://www.gov.uk/guidance/pension-administrators-check-your-members-annual-allowance'
const PENSION_TAX_RELIEF: SourceUrl = 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief'
const TAX_ON_PENSION_TAX_FREE: SourceUrl = 'https://www.gov.uk/tax-on-pension/tax-free'
const NMPA_IMPACT_NOTE: SourceUrl =
  'https://www.gov.uk/government/publications/increasing-normal-minimum-pension-age/increasing-normal-minimum-pension-age'
const ISA_GUIDE: SourceUrl = 'https://www.gov.uk/individual-savings-accounts'
const CHILD_BENEFIT_RATES: SourceUrl =
  'https://www.gov.uk/government/publications/rates-and-allowances-tax-credits-child-benefit-and-guardians-allowance/tax-credits-child-benefit-and-guardians-allowance'
const CHILD_BENEFIT_TAX_CALCULATOR: SourceUrl = 'https://www.gov.uk/child-benefit-tax-calculator'
const HICBC_PAYE_MANUAL: SourceUrl = 'https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye14015'
const HICBC_GUIDE: SourceUrl = 'https://www.gov.uk/child-benefit-tax-charge'
const TAX_FREE_CHILDCARE: SourceUrl = 'https://www.gov.uk/tax-free-childcare/check-if-youre-eligible'
const FREE_CHILDCARE_FOR_WORKING_PARENTS: SourceUrl = 'https://www.gov.uk/free-childcare-if-working/check-youre-eligible'
const EMPLOYEE_TAX_CODES: SourceUrl = 'https://www.gov.uk/employee-tax-codes'
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
    annualAllowance: read(fromPounds(60_000), PENSION_RATES),
    taper: {
      thresholdIncome: read(fromPounds(200_000), PENSION_RATES),
      adjustedIncome: read(fromPounds(260_000), PENSION_RATES),
      minimumAllowance: read(fromPounds(10_000), PENSION_RATES),
      reductionRate: read(ratio(1, 2), TAPERED_ALLOWANCE_MANUAL),
    },
    carryForward: { yearsBack: read(3, CARRY_FORWARD) },
    moneyPurchaseAnnualAllowance: read(fromPounds(10_000), PENSION_RATES),
    reliefAtSourceRate: read(percent('20'), PENSION_TAX_RELIEF),
    minimumAge: {
      // A current guide naming no tax year, accepted by the owner when two pages agree (docs/verification-log.md).
      current: read(55, TAX_ON_PENSION_TAX_FREE, READ_FOR_NEXT_POUND),
      announced: read(57, NMPA_IMPACT_NOTE, READ_FOR_NEXT_POUND),
      announcedFrom: read<IsoDate>('2028-04-06', NMPA_IMPACT_NOTE, READ_FOR_NEXT_POUND),
    },
    lumpSum: {
      // As minimumAge.current: a current guide, two pages agreeing.
      taxFreeShare: read(percent('25'), TAX_ON_PENSION_TAX_FREE, READ_FOR_NEXT_POUND),
      allowance: read(fromPounds(268_275), PENSION_RATES, READ_FOR_NEXT_POUND),
    },
  },
  isa: { annualLimit: read(fromPounds(20_000), ISA_GUIDE, READ_FOR_NEXT_POUND) },
  childBenefit: {
    weeklyRates: {
      eldestOrOnly: read(fromPounds('27.05'), CHILD_BENEFIT_RATES),
      additionalChild: read(fromPounds('17.90'), CHILD_BENEFIT_RATES),
    },
    hicbc: {
      threshold: read(fromPounds(60_000), CHILD_BENEFIT_TAX_CALCULATOR),
      fullChargeAt: read(fromPounds(80_000), HICBC_PAYE_MANUAL),
      incomePerPercent: read(fromPounds(200), HICBC_GUIDE),
    },
  },
  childcare: {
    taxFreeChildcare: { incomeLimit: read(fromPounds(100_000), TAX_FREE_CHILDCARE) },
    thirtyHours: { incomeLimit: read(fromPounds(100_000), FREE_CHILDCARE_FOR_WORKING_PARENTS) },
  },
  paye: {
    // A standing rule, not tied to a tax year on the page (docs/verification-log.md).
    codeUnit: read(fromPounds(10), EMPLOYEE_TAX_CODES, READ_FOR_PAYE),
  },
  savingsAndDividends: { reserved: true },
}
