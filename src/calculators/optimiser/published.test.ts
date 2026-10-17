import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves, type Refusal, type Sourced, type SourceUrl } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, mulRound, percent, ratio, subtract, subtractRatio } from '@/lib/money'
import { adjustedNetIncome, employeeNI, hicbc, incomeTax, pensionContribution, personalAllowance, studentLoan } from './calc'
import { DEFAULT_POLICY, type PensionInput, REGIONS, type StudentLoanPlanId, TAPER_ROUNDINGS } from './types'

/*
 * Published GOV.UK examples, mirrored as tests (docs/worked-examples.md). Each
 * test cites the page and copies the example's inputs and published result.
 * The examples marked "do not mirror" (SL-4, HICBC-1) are left out, as are
 * the odd-pay-period ones (SL-10, SL-11: not modelled), HICBC-2 (an older
 * rule, printed in whole pounds against decision G1's nearest penny), the
 * annual allowance ones and childcare (session G2). Session G1 adds the
 * pension relief and adjusted net income examples (PEN-1 to PEN-3, ANI-3,
 * PR-1) and the HICBC guide's stated rule (HICBC-3).
 *
 * The engine is annual, with annual thresholds from the config. Where an
 * example is for a week or a month, the test passes in that example's own
 * pay-period thresholds, quoted from the same page, in place of the annual
 * ones: the method is the same, only the period differs. Rates come from the
 * 2026-27 config unless the example states its own.
 */

const ok = <T extends { ok: true }>(result: T | Refusal): T => {
  if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
  return result
}

/** The 2026-27 config with some leaves replaced by an example's figures, sourced to the example's page. */
function withExampleFigures(sourceUrl: SourceUrl, figures: Record<string, unknown>): TaxYearConfig {
  return mapLeaves(
    taxYear,
    (path, current): Sourced<unknown> =>
      path in figures ? { status: 'verified', value: figures[path], sourceUrl, verifiedOn: '2026-10-17' } : current,
  )
}

const NI_RATES_LETTERS: SourceUrl = 'https://www.gov.uk/national-insurance-rates-letters'
const STUDENT_LOAN_GUIDE: SourceUrl = 'https://www.gov.uk/repaying-your-student-loan/what-you-pay'
const SL3_2026_27: SourceUrl =
  'https://www.gov.uk/government/publications/sl3-student-loan-deduction-tables/2026-to-2027-student-and-postgraduate-loan-deduction-tables'
const TAX_ON_DIVIDENDS: SourceUrl = 'https://www.gov.uk/tax-on-dividends'
const PENSION_TAX_RELIEF: SourceUrl = 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief'
const INCOME_TAX_RATES: SourceUrl = 'https://www.gov.uk/income-tax-rates'
const RELIEF_AT_SOURCE_MANUAL: SourceUrl = 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm044220'
const TAPERED_ALLOWANCE_EXAMPLES: SourceUrl = 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057200'
const ADJUSTED_NET_INCOME: SourceUrl = 'https://www.gov.uk/guidance/adjusted-net-income'
const HICBC_GUIDE: SourceUrl = 'https://www.gov.uk/child-benefit-tax-charge'
const ras = (contribution: ReturnType<typeof fromPounds>): PensionInput => ({ method: 'reliefAtSource', contribution })

describe(`NI-1: ${NI_RATES_LETTERS}`, () => {
  // "nothing on the first £242"; "8% (£58) on your earnings between £242.01 and £967"; "2% (£0.66) on the
  // remaining earnings above £967"; "your National Insurance payment will be £58.66 for the week" (category A, £1,000 a week).
  it('category A, £1,000 in a week: £58.66', () => {
    const weekly = withExampleFigures(NI_RATES_LETTERS, {
      'nationalInsurance.employee.primaryThreshold': fromPounds(242),
      'nationalInsurance.employee.upperEarningsLimit': fromPounds(967),
    })
    const result = ok(employeeNI(fromPounds(1000), weekly))
    expect(result.main.contribution).toBe(fromPounds(58))
    expect(result.additional.contribution).toBe(fromPounds('0.66'))
    expect(result.total).toBe(fromPounds('58.66'))
  })
})

describe(`Student loans, per pay period: ${STUDENT_LOAN_GUIDE}`, () => {
  // The guide's monthly thresholds, in whole pounds as it prints them: Plan 1 £2,241, Plan 2 £2,448, Plan 4 £2,816,
  // Postgraduate Loan £1,750 (the latter from its examples).
  const monthly = withExampleFigures(STUDENT_LOAN_GUIDE, {
    'studentLoans.plan1.threshold': fromPounds(2241),
    'studentLoans.plan2.threshold': fromPounds(2448),
    'studentLoans.plan4.threshold': fromPounds(2816),
    'studentLoans.postgraduate.threshold': fromPounds(1750),
  })
  const monthlyRepayment = (plans: StudentLoanPlanId[], pay: number) => ok(studentLoan(plans, fromPounds(pay), monthly)).total

  it('SL-1: Plan 1, paid £2,750 a month: "9% of £509 = £45.81"; "the amount you’d repay each month would be £45"', () => {
    expect(monthlyRepayment(['plan1'], 2750)).toBe(fromPounds(45))
  })

  it('SL-2: Plan 4, paid £3,000 a month: "9% of £184 = £16.56"; "would be £16"', () => {
    expect(monthlyRepayment(['plan4'], 3000)).toBe(fromPounds(16))
  })

  it('SL-3: Plan 1 and Plan 2, paid £3,200 a month: 9% over the lowest threshold, "£959"; "9% of £959 = £86.31"; "would be £86"', () => {
    const result = ok(studentLoan(['plan1', 'plan2'], fromPounds(3200), monthly))
    expect(result.deductions).toHaveLength(1)
    expect(result.deductions[0]?.basis).toBe('plan1')
    expect(result.deductions[0]?.excess).toBe(fromPounds(959))
    expect(result.total).toBe(fromPounds(86))
  })

  it('SL-5: Postgraduate Loan and Plan 2, paid £2,500 a month: "6% of £750 = £45"; "9% of £52 = £4.68"; "would be £49"', () => {
    const result = ok(studentLoan(['postgraduate', 'plan2'], fromPounds(2500), monthly))
    expect(result.deductions.find((d) => d.kind === 'postgraduate')?.repayment).toBe(fromPounds(45))
    expect(result.deductions.find((d) => d.kind === 'plan')?.excess).toBe(fromPounds(52))
    expect(result.total).toBe(fromPounds(49))
  })

  it('SL-7: Plan 1, two jobs paying £1,000 and £800 a month: "neither salary is above the £2,241 a month threshold"', () => {
    expect(monthlyRepayment(['plan1'], 1000)).toBe(0)
    expect(monthlyRepayment(['plan1'], 800)).toBe(0)
  })
})

describe(`Student loans, Self Assessment (annual): ${STUDENT_LOAN_GUIDE}`, () => {
  // SL-6 uses the yearly Plan 1 threshold, which matches the 2026-27 config: no figure is replaced.
  it('SL-6: Plan 1, combined income £42,000: "£42,000 - £26,900 ... = £15,100"; "9% of £15,100 = £1,359"', () => {
    const result = ok(studentLoan(['plan1'], fromPounds(42_000), taxYear))
    expect(result.deductions[0]?.excess).toBe(fromPounds(15_100))
    expect(result.total).toBe(fromPounds(1359))
  })
})

describe(`Student loans, SL3 2026 to 2027: ${SL3_2026_27}`, () => {
  it('SL-8: Plan 1, weekly earnings £565, threshold £517.30: "Round down £4.29 to the nearest £"; "The £4.00 Student Loan deduction"', () => {
    const weekly = withExampleFigures(SL3_2026_27, { 'studentLoans.plan1.threshold': fromPounds('517.30') })
    const result = ok(studentLoan(['plan1'], fromPounds(565), weekly))
    expect(result.deductions[0]?.excess).toBe(fromPounds('47.70'))
    expect(result.total).toBe(fromPounds(4))
  })

  it('SL-9: Postgraduate Loan, monthly earnings £2,083, threshold £1,750: "Round down £19.98"; "The £19.00 PGL deduction"', () => {
    const monthly = withExampleFigures(SL3_2026_27, { 'studentLoans.postgraduate.threshold': fromPounds(1750) })
    const result = ok(studentLoan(['postgraduate'], fromPounds(2083), monthly))
    expect(result.deductions[0]?.excess).toBe(fromPounds(333))
    expect(result.total).toBe(fromPounds(19))
  })
})

describe('Income tax bands are marginal (decision 2)', () => {
  it(`IT-1, ${TAX_ON_DIVIDENDS}: wages £29,570 in 2026 to 2027, allowance £12,570: "20% tax on £17,000 of wages"`, () => {
    // The example's dividends are out of scope; its wages are taxed in the basic rate band alone.
    const result = ok(incomeTax(fromPounds(29_570), 'rUK', taxYear, DEFAULT_POLICY))
    expect(result.personalAllowance.allowance).toBe(fromPounds(12_570))
    expect(result.taxableIncome).toBe(fromPounds(17_000))
    expect(result.bands[0]?.income).toBe(fromPounds(17_000))
    expect(result.bands[0]?.rate).toEqual(percent('20'))
    expect(result.bands.slice(1).every((b) => b.income === 0)).toBe(true)
    expect(result.total).toBe(mulRound(fromPounds(17_000), percent('20'), 'nearest'))
  })

  it(`IT-2, ${PENSION_TAX_RELIEF}: earnings £60,270 in 2024 to 2025: "the same amount you paid 40% tax on" is £10,000`, () => {
    // HMRC's "Income Tax rates and allowances for current and previous tax years" (read 17 October 2026) shows the
    // same Personal Allowance and England, Wales and Northern Ireland bands for 2024 to 2025 as for 2026 to 2027, so
    // the 2026-27 config stands in for that year. Only the income above the higher rate's start is taxed at it.
    const result = ok(incomeTax(fromPounds(60_270), 'rUK', taxYear, DEFAULT_POLICY))
    const higher = result.bands.find((b) => b.name === 'Higher rate')
    expect(higher?.rate).toEqual(percent('40'))
    expect(higher?.income).toBe(fromPounds(10_000))
  })
})

describe(`Personal allowance zero point: ${INCOME_TAX_RATES}`, () => {
  // "Your personal allowance goes down by £1 for every £2 that your adjusted net income is above £100,000. This means
  // your allowance is zero if your income is £125,140 or above." The engine takes the income figure as given.
  it('is zero at £125,140 and above, and not zero just below, under each policy and in each region', () => {
    for (const taperRounding of TAPER_ROUNDINGS) {
      const policy = { ...DEFAULT_POLICY, taperRounding }
      expect(ok(personalAllowance(fromPounds(125_140), taxYear, policy)).allowance).toBe(0)
      expect(ok(personalAllowance(fromPounds(200_000), taxYear, policy)).allowance).toBe(0)
      expect(ok(personalAllowance(fromPounds('125139.99'), taxYear, policy)).allowance).toBeGreaterThan(0)
      for (const region of REGIONS)
        expect(ok(incomeTax(fromPounds(125_140), region, taxYear, policy)).taxableIncome).toBe(fromPounds(125_140))
    }
  })
})

describe('Relief at source (session G1, decision G2)', () => {
  // A higher rate taxpayer whose contribution sits inside the higher rate band and below the taper: a test input.
  const higherRatePay = fromPounds(70_000)
  const extraRelief = (net: ReturnType<typeof fromPounds>) =>
    subtract(
      ok(incomeTax(higherRatePay, 'rUK', taxYear, DEFAULT_POLICY)).total,
      ok(incomeTax(higherRatePay, 'rUK', taxYear, DEFAULT_POLICY, ras(net))).total,
    )

  it(`PEN-1, ${RELIEF_AT_SOURCE_MANUAL}: "pays £800 ... The pension scheme claims £200 ... The total contribution is £1,000"; a 40% taxpayer "claims the extra £200"`, () => {
    const result = ok(pensionContribution(ras(fromPounds(800)), higherRatePay, taxYear))
    expect(result.grossContribution).toBe(fromPounds(1_000))
    expect(result.providerRelief).toBe(fromPounds(200))
    expect(extraRelief(fromPounds(800))).toBe(fromPounds(200))
  })

  it(`PEN-2, ${RELIEF_AT_SOURCE_MANUAL}: "paid net contributions of £80" for "£100 to go into" the scheme; "the extra tax relief due to them will be £20 (40% less 20%)"`, () => {
    expect(ok(pensionContribution(ras(fromPounds(80)), higherRatePay, taxYear)).grossContribution).toBe(fromPounds(100))
    expect(extraRelief(fromPounds(80))).toBe(fromPounds(20))
  })

  it(`PEN-3, ${TAPERED_ALLOWANCE_EXAMPLES}: "£360 a month" relief at source is "£450 per month", "£5,400" a year`, () => {
    expect(ok(pensionContribution(ras(fromPounds(360)), higherRatePay, taxYear)).grossContribution).toBe(fromPounds(450))
    expect(ok(pensionContribution(ras(fromPounds(4_320)), higherRatePay, taxYear)).grossContribution).toBe(fromPounds(5_400))
  })

  it(`ANI-3, ${ADJUSTED_NET_INCOME}: "for every £1 of pension contribution you made, take £1.25 from your ‘net income’"`, () => {
    const pay = fromPounds(110_000)
    const result = ok(adjustedNetIncome(pay, ras(fromPounds(1)), taxYear))
    expect(result.reliefAtSourceDeduction).toBe(fromPounds('1.25'))
    expect(result.adjustedNetIncome).toBe(subtract(pay, fromPounds('1.25')))
  })

  it(`PR-1, ${PENSION_TAX_RELIEF}: earnings £60,270 (2024 to 2025), £12,000 paid in: "an extra 20% tax relief on £10,000", none on "the remaining £2,000"`, () => {
    // As IT-2, the 2026-27 config stands in for 2024 to 2025. The £12,000 is read as the total going in (the page's
    // "remaining £2,000" is £12,000 less £10,000), so the payment is that total less the provider's relief.
    const pay = fromPounds(60_270)
    const paidIn = (gross: ReturnType<typeof fromPounds>) => mulRound(gross, subtractRatio(ratio(1, 1), percent('20')), 'nearest')
    const saving = (gross: ReturnType<typeof fromPounds>) =>
      subtract(
        ok(incomeTax(pay, 'rUK', taxYear, DEFAULT_POLICY)).total,
        ok(incomeTax(pay, 'rUK', taxYear, DEFAULT_POLICY, ras(paidIn(gross)))).total,
      )
    expect(ok(pensionContribution(ras(paidIn(fromPounds(12_000))), pay, taxYear)).grossContribution).toBe(fromPounds(12_000))
    expect(saving(fromPounds(12_000))).toBe(mulRound(fromPounds(10_000), percent('20'), 'nearest'))
    expect(saving(fromPounds(12_000))).toBe(saving(fromPounds(10_000)))
    const higher = ok(incomeTax(pay, 'rUK', taxYear, DEFAULT_POLICY, ras(paidIn(fromPounds(12_000))))).bands.find(
      (b) => b.name === 'Higher rate',
    )
    expect(higher?.income).toBe(0)
  })
})

describe(`HICBC-3, the High Income Child Benefit Charge guide: ${HICBC_GUIDE}`, () => {
  // "You’ll pay back 1% of your Child Benefit for every £200 you earn over £60,000." "If you earn over £80,000 you’ll
  // pay it all back." Stated rules for 2024 to 2025 onwards, like PA-1; whole steps per decision G1.
  const one = { children: 1, payments: 'claimed' } as const
  it('1% for each whole £200 over £60,000; all of it over £80,000', () => {
    expect(ok(hicbc(fromPounds(60_000), one, taxYear, DEFAULT_POLICY)).percentCharged).toBe(0)
    expect(ok(hicbc(fromPounds('60199.99'), one, taxYear, DEFAULT_POLICY)).percentCharged).toBe(0)
    expect(ok(hicbc(fromPounds(60_200), one, taxYear, DEFAULT_POLICY)).percentCharged).toBe(1)
    expect(ok(hicbc(fromPounds(70_000), one, taxYear, DEFAULT_POLICY)).percentCharged).toBe(50)
    const all = ok(hicbc(add(fromPounds(80_000), fromPence(1)), one, taxYear, DEFAULT_POLICY))
    expect(all.percentCharged).toBe(100)
    expect(all.charge).toBe(all.childBenefit)
  })
})
