import type { Money, Ratio } from '@/lib/money'
import type { FeeTiming, RateBasis } from '../car-finance/types'
import type { AcquisitionKind, CarOption, Comparison, OwnershipResult, ValueCase } from '../car-ownership/types'
import { type CalculatorDefinition, defineCalculator, type InputRefusal } from '../registry'

export type FuelMode = 'fuel' | 'electric' | 'per-mile'
export type PricingMode = 'rate' | 'payment'

export interface OptionInputs {
  readonly name: string
  readonly acquisition: AcquisitionKind
  readonly value: Money | null
  readonly endLow: Money | null
  readonly endExpected: Money | null
  readonly endHigh: Money | null
  readonly annualMileage: number | null
  readonly fuelMode: FuelMode
  readonly milesPerGallon: string | null
  readonly pencePerLitre: string | null
  readonly milesPerKwh: string | null
  readonly homeShare: string | null
  readonly homePencePerKwh: string | null
  readonly publicPencePerKwh: string | null
  readonly pencePerMile: string | null
  readonly fuelPriceChange: string | null
  readonly insurance: Money | null
  readonly maintenance: Money | null
  readonly ved: Money | null
  readonly other: Money | null
  readonly loanAmount: Money | null
  readonly deposit: Money | null
  readonly term: number | null
  readonly pricing: PricingMode
  readonly rate: string | null
  readonly basis: RateBasis
  readonly payment: Money | null
  readonly arrangementFee: Money | null
  readonly arrangementFeeTiming: FeeTiming
  readonly balloon: Money | null
  readonly optionFee: Money | null
  readonly finalPayment: Money | null
  readonly purchaseFee: Money | null
  readonly pcpEnd: 'buy' | 'hand-back'
  readonly mileageAllowance: number | null
  readonly excessPerMile: number | null
}

export type OptionField = keyof OptionInputs

export interface CarDecisionInputs {
  readonly horizonMonths: number
  readonly valueCase: ValueCase
  readonly savingsReturn: string | null
  readonly generalIncrease: string | null
  readonly options: readonly OptionInputs[]
}

export type SharedField = Exclude<keyof CarDecisionInputs, 'options'>

export type OptionStatus =
  | { readonly kind: 'missing'; readonly missing: readonly OptionField[] }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'ok'; readonly result: OwnershipResult; readonly engineIndex: number; readonly option: CarOption }

export type PageOutcome =
  | { readonly kind: 'missing-shared'; readonly missing: readonly SharedField[] }
  | { readonly kind: 'refused'; readonly refusal: InputRefusal }
  | { readonly kind: 'ok'; readonly statuses: readonly OptionStatus[]; readonly comparison: Comparison | null }

export const FIELD_LABELS = {} as Record<OptionField, string>
export const SHARED_LABELS = {} as Record<SharedField, string>
export const MONEY_FIELDS: readonly OptionField[] = []

export function missingFields(_option: OptionInputs): OptionField[] {
  throw new Error('not built')
}
export function toEngineOption(_option: OptionInputs, _generalIncrease: Ratio): CarOption {
  throw new Error('not built')
}
export function calculate(_inputs: CarDecisionInputs): PageOutcome {
  throw new Error('not built')
}
export function optionName(_option: OptionInputs, _index: number): string {
  throw new Error('not built')
}

export const carDecisionCalculator: CalculatorDefinition<CarDecisionInputs> = defineCalculator<CarDecisionInputs>({
  id: 'car-decision',
  name: 'Car decision',
  summary: 'not built',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({ horizonMonths: 1, valueCase: 'expected', savingsReturn: null, generalIncrease: null, options: [] }),
  validateInputs: (raw) => ({ ok: true, inputs: raw as CarDecisionInputs }),
  migrateInputs() {
    throw new Error('not built')
  },
  summarise: () => ({ inputs: [], results: { ok: true, rows: [] } }),
})
