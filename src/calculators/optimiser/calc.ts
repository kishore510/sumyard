import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { Money } from '@/lib/money'
import type {
  EmployeeNIResult,
  IncomeTaxResult,
  ModellingPolicy,
  PersonalAllowanceResult,
  Region,
  StudentLoanPlanId,
  StudentLoanResult,
  TakeHomeResult,
  TaxInputs,
} from './types'

/* Stubs for the red commit; the engine arrives in the green commit. */

export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

export function personalAllowance(_income: Money, _config: TaxYearConfig, _policy: ModellingPolicy): PersonalAllowanceResult | Refusal {
  throw new Error('personalAllowance: not implemented')
}

export function incomeTax(_income: Money, _region: Region, _config: TaxYearConfig, _policy: ModellingPolicy): IncomeTaxResult | Refusal {
  throw new Error('incomeTax: not implemented')
}

export function employeeNI(_niablePay: Money, _config: TaxYearConfig): EmployeeNIResult | Refusal {
  throw new Error('employeeNI: not implemented')
}

export function studentLoan(_plans: readonly StudentLoanPlanId[], _pay: Money, _config: TaxYearConfig): StudentLoanResult | Refusal {
  throw new Error('studentLoan: not implemented')
}

export function takeHome(_inputs: TaxInputs, _config: TaxYearConfig, _policy: ModellingPolicy): TakeHomeResult | Refusal {
  throw new Error('takeHome: not implemented')
}
