import { formatPercent } from '@/lib/format'
import { add, compare, type Money, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { canonicalJson } from '@/lib/validate'
import {
  type ContributionField,
  METHOD_LABELS,
  type OptimiserPageInputs,
  optimiserCalculator,
  PAYMENT_LABELS,
  PLAN_LABELS,
  type ResolvedInputs,
} from './definition'

/*
 * The take-home page's input sections (the page redesign, decisions U1 to U3 in
 * docs/ui-patterns.md): which inputs each holds, whether they differ from
 * the defaults (a section with non-default values opens on load), which
 * section a field the session marks invalid belongs to, and each section's
 * one-line summary. Summaries are built from the resolved amounts the engine
 * receives and formatted by the caller's `gbp` (src/lib/format.ts). No tax
 * figure here.
 */

export const SECTION_IDS = ['pension', 'allowances', 'benefits', 'studentLoans', 'childBenefit', 'taxCode'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export const SECTION_TITLES: Record<SectionId, string> = {
  pension: 'Pension',
  allowances: 'Pension allowances',
  benefits: 'Benefits and deductions',
  studentLoans: 'Student loans',
  childBenefit: 'Child Benefit',
  taxCode: 'Tax code',
}

/** The summary of a section whose inputs are all at their defaults. */
export const NOT_SET = 'Not set'

/** The summary of a section holding an input that isn't valid yet. */
export const NEEDS_FIXING = 'An input here needs fixing'

/** The stored inputs each section holds. Salary, bonus and region are in "Your pay", always visible. */
const SECTION_FIELDS: Record<SectionId, readonly (keyof OptimiserPageInputs)[]> = {
  pension: ['pensionMethod', 'employeeContribution', 'employerContribution', 'pensionablePay'],
  allowances: ['carryForward', 'moneyPurchaseAnnualAllowance', 'checkChildcare'],
  benefits: ['taxableBenefits', 'postTaxDeductions'],
  studentLoans: ['studentLoans'],
  childBenefit: ['children', 'childBenefit'],
  taxCode: ['taxCode'],
}

/** The page's names for fields it tracks as invalid (session.setFieldValid), by section. */
const INVALID_FIELDS: Record<SectionId, RegExp> = {
  pension: /^(?:(?:employee|employer)Contribution(?:-pct)?|pensionablePay)$/,
  allowances: /^carryForward-\d+$/,
  benefits: /^(?:taxableBenefits|postTaxDeductions)-/,
  studentLoans: /^$/,
  childBenefit: /^children$/,
  taxCode: /^taxCode$/,
}

const DEFAULTS = optimiserCalculator.defaultInputs()

/** True when any of the section's inputs differs from the calculator's defaults (U3). */
export function isSectionSet(id: SectionId, inputs: OptimiserPageInputs): boolean {
  return SECTION_FIELDS[id].some((field) => canonicalJson(inputs[field]) !== canonicalJson(DEFAULTS[field]))
}

/** The sections the inputs set, in page order: the ones that open on load. */
export function sectionsSet(inputs: OptimiserPageInputs): ReadonlySet<SectionId> {
  return new Set(SECTION_IDS.filter((id) => isSectionSet(id, inputs)))
}

/** The section a field the page marks invalid belongs to; undefined for "Your pay". */
export function sectionForField(field: string): SectionId | undefined {
  return SECTION_IDS.find((id) => INVALID_FIELDS[id].test(field))
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function contribution(
  inputs: OptimiserPageInputs,
  resolved: ResolvedInputs,
  field: ContributionField,
  who: string,
  gbp: (amount: Money) => string,
) {
  const entry = inputs[field]
  const amount = `${who}: ${gbp(resolved[field])} a year`
  return entry.mode === 'percentOfPay' ? `${amount} (${formatPercent(percentRatio(entry.percentOfPay))})` : amount
}

/** A section's one-line summary (U2), or NOT_SET when its inputs are all at their defaults. */
export function sectionSummary(
  id: SectionId,
  inputs: OptimiserPageInputs,
  resolved: ResolvedInputs,
  gbp: (amount: Money) => string,
): string {
  if (!isSectionSet(id, inputs)) return NOT_SET
  switch (id) {
    case 'pension': {
      const parts = [METHOD_LABELS[inputs.pensionMethod]]
      const employee = inputs.employeeContribution.mode === 'percentOfPay' || compare(resolved.employeeContribution, ZERO) > 0
      const employer = inputs.employerContribution.mode === 'percentOfPay' || compare(resolved.employerContribution, ZERO) > 0
      if (employee) parts.push(contribution(inputs, resolved, 'employeeContribution', 'You', gbp))
      if (employer) parts.push(contribution(inputs, resolved, 'employerContribution', 'Employer', gbp))
      if (!employee && !employer) parts.push('No contribution')
      return parts.join(' · ')
    }
    case 'allowances': {
      const parts: string[] = []
      const years = inputs.carryForward.filter((year) => compare(year.amount, ZERO) > 0)
      if (years.length > 0)
        parts.push(
          `Carry forward ${gbp(years.reduce((sum, year) => add(sum, year.amount), ZERO))} from ${count(years.length, 'year', 'years')}`,
        )
      if (inputs.moneyPurchaseAnnualAllowance) parts.push('Money purchase annual allowance')
      if (inputs.checkChildcare) parts.push('Childcare limits checked')
      return parts.join(' · ') || 'Carry forward: nothing entered'
    }
    case 'benefits': {
      const parts: string[] = []
      const benefits = inputs.taxableBenefits.length
      const deductions = inputs.postTaxDeductions.length
      if (benefits > 0) parts.push(`${count(benefits, 'benefit', 'benefits')}, taxable ${gbp(resolved.taxableBenefits)} a year`)
      if (deductions > 0) parts.push(`${count(deductions, 'deduction', 'deductions')}, ${gbp(resolved.postTaxDeductions)} a year`)
      return parts.join(' · ')
    }
    case 'studentLoans':
      return inputs.studentLoans.map((plan) => PLAN_LABELS[plan]).join(', ')
    case 'childBenefit':
      return `${inputs.children === 0 ? 'No children' : count(inputs.children, 'child', 'children')} · ${PAYMENT_LABELS[inputs.childBenefit]}`
    case 'taxCode':
      return inputs.taxCode
  }
}
