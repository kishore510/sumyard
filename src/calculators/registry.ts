import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { Money, Ratio } from '@/lib/money'

/*
 * The calculator registry: every calculator registers what scenarios, import
 * and compare need to know about it, and nothing about its page. Pure (no UI
 * or storage), so the scenario store and import validation can use it in
 * tests. The app's list is in ./index.ts; pages are in ./pages.tsx.
 *
 * Inputs are versioned. A scenario stores the inputs and their version; on
 * load or import, older inputs are migrated one call to migrateInputs(from,
 * old) and then validated, and inputs from a newer version are refused.
 */

export type InputsCheck<I> = { readonly ok: true; readonly inputs: I } | { readonly ok: false; readonly errors: readonly string[] }

/** One value in a summary row, typed so compare can format it and work out a delta. */
export type RowValue =
  | { readonly kind: 'money'; readonly amount: Money }
  | { readonly kind: 'ratio'; readonly ratio: Ratio }
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'text'; readonly text: string }

export interface SummaryRow {
  readonly label: string
  readonly value: RowValue
}

/** A scenario's inputs and results as rows, for compare. Results are a refusal while tax values they need are unverified. */
export interface Summary {
  readonly inputs: readonly SummaryRow[]
  readonly results: { readonly ok: true; readonly rows: readonly SummaryRow[] } | Refusal
}

export interface CalculatorDefinition<I = unknown> {
  /** Lower-case kebab-case; the page is #/c/<id>. */
  readonly id: string
  readonly name: string
  /** One line for the home page. */
  readonly summary: string
  /**
   * 'none' for a calculator that reads no tax config: its scenarios carry no
   * tax year, its page shows "Uses no tax rules" in place of the verified
   * badge, and `summarise` ignores the config it is given. Omitted for a tax calculator.
   */
  readonly taxRules?: 'none'
  /** Set on a placeholder, with what to tell people about it. */
  readonly placeholder?: string
  /** Version of the inputs shape. Bump it, and handle the old one in migrateInputs, when the shape changes. */
  readonly inputsVersion: number
  defaultInputs(): I
  /** Checks untrusted inputs and builds a fresh object from the known fields. */
  validateInputs(raw: unknown): InputsCheck<I>
  /** Upgrades inputs saved at version `from` (below inputsVersion) to the current shape, or throws. Validated after. */
  migrateInputs(from: number, old: unknown): unknown
  summarise(inputs: I, config: TaxYearConfig): Summary
  /** Applies the Settings defaults (region) to fresh inputs. Optional; the tax year comes from Settings for every calculator. */
  applySettings?(inputs: I, settings: { readonly region: 'ruk' | 'scotland' }): I
}

/** Typed helper for writing a definition. */
export const defineCalculator = <I>(definition: CalculatorDefinition<I>): CalculatorDefinition<I> => definition

export type InputsProblem = 'unknown-calculator' | 'newer-inputs' | 'migration-failed' | 'invalid-inputs'

export type ReadInputs =
  | { readonly ok: true; readonly inputs: unknown; readonly migrated: boolean }
  | { readonly ok: false; readonly reason: InputsProblem; readonly message: string }

const CALCULATOR_ID = /^[a-z][a-z0-9-]{0,63}$/

export const isCalculatorId = (value: unknown): value is string => typeof value === 'string' && CALCULATOR_ID.test(value)

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1

export function createCalculatorRegistry(definitions: readonly CalculatorDefinition[]) {
  const byId = new Map<string, CalculatorDefinition>()
  for (const definition of definitions) {
    if (!isCalculatorId(definition.id)) throw new Error(`Calculator id ${JSON.stringify(definition.id)} must be lower-case kebab-case`)
    if (byId.has(definition.id)) throw new Error(`Calculator ${definition.id} is registered twice`)
    if (!isVersion(definition.inputsVersion))
      throw new Error(`Calculator ${definition.id}: its inputs version must be a whole number from 1`)
    if (!definition.validateInputs(definition.defaultInputs()).ok)
      throw new Error(`Calculator ${definition.id}: its default inputs fail validation`)
    byId.set(definition.id, definition)
  }
  const list = [...definitions]

  return {
    list: (): readonly CalculatorDefinition[] => list,
    get: (id: string): CalculatorDefinition | undefined => byId.get(id),
    /** Inputs saved for a calculator at a version, migrated and validated. */
    readInputs(calculatorId: string, version: number, raw: unknown): ReadInputs {
      const definition = byId.get(calculatorId)
      if (!definition) {
        return {
          ok: false,
          reason: 'unknown-calculator',
          message: `is for a calculator this version of Sumyard doesn’t have (${JSON.stringify(String(calculatorId).slice(0, 64))})`,
        }
      }
      if (!isVersion(version)) return { ok: false, reason: 'invalid-inputs', message: 'has no valid inputs version' }
      if (version > definition.inputsVersion) {
        return {
          ok: false,
          reason: 'newer-inputs',
          message: `was saved by a newer version of the ${definition.name} (inputs version ${version})`,
        }
      }
      let inputs = raw
      if (version < definition.inputsVersion) {
        try {
          inputs = definition.migrateInputs(version, raw)
        } catch {
          return { ok: false, reason: 'migration-failed', message: `has inputs from version ${version} that couldn’t be updated` }
        }
      }
      const checked = definition.validateInputs(inputs)
      if (!checked.ok)
        return {
          ok: false,
          reason: 'invalid-inputs',
          message: `has inputs that don’t check out: ${checked.errors[0] ?? 'unknown problem'}`,
        }
      return { ok: true, inputs: checked.inputs, migrated: version < definition.inputsVersion }
    },
  }
}

export type CalculatorRegistry = ReturnType<typeof createCalculatorRegistry>
