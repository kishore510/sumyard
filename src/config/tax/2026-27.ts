import type { TaxYearConfig } from './schema'
import { TODO } from './sourced'

/*
 * 2026-27: SKELETON. Structure only; every value is unverified. Slice 1a
 * looks each one up on GOV.UK or HMRC and replaces TODO with a verified leaf
 * ({ status: 'verified', value, sourceUrl, verifiedOn }), logging it in
 * docs/verification-log.md. Never fill a value from memory. Until then every
 * calculator that needs a value here refuses to show results.
 */
export const taxYear: TaxYearConfig = {
  id: '2026-27',
  period: { start: TODO, end: TODO },
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
