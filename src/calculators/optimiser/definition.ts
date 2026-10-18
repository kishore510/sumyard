import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { Money } from '@/lib/money'
import { type CalculatorDefinition, defineCalculator } from '../registry'
import type { ChildBenefitPayments, PensionMethod, Region, StudentLoanPlanId, TakeHomeResult, TaxInputs } from './types'

/* Red-commit stub: the optimiser page's registry entry (session 1b-i). */

export interface OptimiserPageInputs {
  readonly region: Region
  readonly salary: Money
  readonly bonus: Money
  readonly pensionMethod: PensionMethod
  readonly employeeContribution: Money
  readonly employerContribution: Money
  readonly taxableBenefits: Money
  readonly postTaxDeductions: Money
  readonly studentLoans: readonly StudentLoanPlanId[]
  readonly children: number
  readonly childBenefit: ChildBenefitPayments
}

export const INPUT_LIMITS = { maxAmount: 0 as Money, maxChildren: 0 }

export type PageResult = TakeHomeResult | Refusal | { readonly ok: false; readonly problem: string }

export function toTaxInputs(_inputs: OptimiserPageInputs): TaxInputs {
  throw new Error('not built')
}

export function calculateTakeHome(_inputs: OptimiserPageInputs, _config: TaxYearConfig): PageResult {
  throw new Error('not built')
}

export const optimiserCalculator: CalculatorDefinition<OptimiserPageInputs> = defineCalculator<OptimiserPageInputs>({
  id: 'optimiser',
  name: 'Take-home pay',
  summary: 'stub',
  inputsVersion: 1,
  defaultInputs: () => {
    throw new Error('not built')
  },
  validateInputs: () => ({ ok: false, errors: ['not built'] }),
  migrateInputs: () => {
    throw new Error('not built')
  },
  summarise: () => {
    throw new Error('not built')
  },
})
