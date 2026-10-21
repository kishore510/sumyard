import type { InputRefusal } from '@/calculators/registry'
import type { Money } from '@/lib/money'
import type { ContributionFrequency, Frequency } from '@/lib/periods'
import { type CalculatorDefinition, defineCalculator } from '../registry'
import type { CompoundField, CompoundInputs, CompoundProblem, Timing } from './types'

/* Stub (slice 2b, red): the compound interest page's registry entry. */

export interface CompoundPageInputs {
  readonly lumpSum: Money
  readonly contribution: Money
  readonly contributionFrequency: ContributionFrequency
  readonly timing: Timing
  readonly years: number
  readonly growthRate: string
  readonly compounding: Frequency
  readonly feeRate: string
  readonly contributionIncrease: string
  readonly inflationRate: string
}

export const FIELD_LABELS = {} as Record<CompoundField, string>

export function toEngineInputs(_inputs: CompoundPageInputs): CompoundInputs {
  throw new Error('not built')
}

export function inputRefusal(_problems: readonly CompoundProblem[]): InputRefusal {
  throw new Error('not built')
}

export const compoundCalculator: CalculatorDefinition<CompoundPageInputs> = defineCalculator<CompoundPageInputs>({
  id: 'compound-interest',
  name: 'Compound interest',
  summary: '',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => {
    throw new Error('not built')
  },
  validateInputs: () => ({ ok: false, errors: ['not built'] }),
  migrateInputs: () => {
    throw new Error('not built')
  },
  summarise: () => ({ inputs: [], results: { ok: true, rows: [] } }),
})
