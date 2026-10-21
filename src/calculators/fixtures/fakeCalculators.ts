/*
 * FAKE CALCULATORS, FOR TESTS ONLY. They prove the registry, scenario
 * storage, migration and import without depending on a real calculator.
 * The app never imports this file.
 */

import type { TaxYearConfig } from '@/config/tax/schema'
import { isRecord } from '@/lib/validate'
import type { Scenario } from '@/scenarios/scenario'
import { type CalculatorDefinition, defineCalculator } from '../registry'

export interface TallyInputs {
  count: number
  label: string
}

/** A calculator at inputs version 2. Version 1 stored `{ n }`; version 2 renamed it and added a label. */
export const tally: CalculatorDefinition<TallyInputs> = defineCalculator<TallyInputs>({
  id: 'tally',
  name: 'Tally',
  summary: 'Counts things (test only).',
  inputsVersion: 2,
  defaultInputs: () => ({ count: 1, label: '' }),
  validateInputs(raw) {
    if (!isRecord(raw)) return { ok: false, errors: ['Inputs are not an object.'] }
    const errors: string[] = []
    if (typeof raw.count !== 'number' || !Number.isSafeInteger(raw.count) || raw.count < 0 || raw.count > 1000)
      errors.push('count must be a whole number from 0 to 1000.')
    if (typeof raw.label !== 'string' || raw.label.length > 20) errors.push('label must be text of at most 20 characters.')
    return errors.length > 0 ? { ok: false, errors } : { ok: true, inputs: { count: raw.count as number, label: raw.label as string } }
  },
  migrateInputs(from, old) {
    if (from === 1 && isRecord(old)) return { count: old.n, label: '' }
    throw new Error(`no migration from version ${from}`)
  },
  summarise: (inputs: TallyInputs, _config: TaxYearConfig) => ({
    inputs: [{ label: 'Count', value: { kind: 'count', count: inputs.count } }],
    results: { ok: true, rows: [{ label: 'Doubled', value: { kind: 'count', count: inputs.count * 2 } }] },
  }),
})

/** A second calculator at inputs version 1. */
export const echo: CalculatorDefinition<{ text: string }> = defineCalculator<{ text: string }>({
  id: 'echo',
  name: 'Echo',
  summary: 'Repeats text (test only).',
  inputsVersion: 1,
  defaultInputs: () => ({ text: 'hi' }),
  validateInputs: (raw) =>
    isRecord(raw) && typeof raw.text === 'string' && raw.text.length <= 50
      ? { ok: true, inputs: { text: raw.text } }
      : { ok: false, errors: ['text must be at most 50 characters.'] },
  migrateInputs: (from) => {
    throw new Error(`no migration from version ${from}`)
  },
  summarise: (inputs) => ({ inputs: [{ label: 'Text', value: { kind: 'text', text: inputs.text } }], results: { ok: true, rows: [] } }),
})

/** A calculator that uses no tax rules: its scenarios carry no tax year. */
export const plain: CalculatorDefinition<{ amount: number }> = defineCalculator<{ amount: number }>({
  id: 'plain',
  name: 'Plain',
  summary: 'Uses no tax rules (test only).',
  taxRules: 'none',
  inputsVersion: 1,
  defaultInputs: () => ({ amount: 0 }),
  validateInputs: (raw) =>
    isRecord(raw) && typeof raw.amount === 'number' && Number.isSafeInteger(raw.amount) && raw.amount >= 0
      ? { ok: true, inputs: { amount: raw.amount } }
      : { ok: false, errors: ['amount must be a whole number from 0.'] },
  migrateInputs: (from) => {
    throw new Error(`no migration from version ${from}`)
  },
  summarise: (inputs) => ({
    inputs: [{ label: 'Amount', value: { kind: 'count', count: inputs.amount } }],
    results: { ok: true, rows: [] },
  }),
})

/** A valid plain scenario (no tax year), with fields overridden by `patch`. */
export const plainScenario = (patch: Partial<Scenario> = {}): Scenario => ({
  id: 'p1',
  calculatorId: 'plain',
  name: 'My plain',
  inputs: { amount: 5 },
  inputsVersion: 1,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T11:00:00.000Z',
  ...patch,
})

/** A valid tally scenario (made-up values), with fields overridden by `patch`. */
export const sampleScenario = (patch: Partial<Scenario> = {}): Scenario => ({
  id: 'a1b2c3',
  calculatorId: 'tally',
  taxYear: '2026-27',
  name: 'My tally',
  inputs: { count: 3, label: 'x' },
  inputsVersion: 2,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T11:00:00.000Z',
  ...patch,
})
