import { getTaxYear, latestTaxYear, taxYearLabel } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
import { createStore, type Store } from '@/lib/store'
import { canonicalJson } from '@/lib/validate'
import type { Scenario } from '@/scenarios/scenario'
import { settingsStore } from '@/settings/settings'
import type { CalculatorDefinition } from './registry'

/*
 * What a calculator page is showing: its tax year and inputs, and which saved
 * scenario (if any) they came from, so the page can say "Unsaved changes".
 * One store per calculator, kept for the visit, so opening a sheet or the
 * compare view and coming back keeps the inputs. Not saved anywhere: only
 * scenarios are (src/scenarios). Inputs that fail validation on the page
 * are tracked by field, and results wait until they are fixed.
 */

export interface SessionState<I = unknown> {
  readonly taxYear: string
  readonly inputs: I
  /** The scenario these inputs were loaded from or saved as. */
  readonly loadedId: string | null
  /** Bumped on load or start-new, so input boxes show the new values. */
  readonly revision: number
  /** Set when a loaded scenario's tax year isn't in this version. */
  readonly taxYearWarning: string | null
  /** Fields whose typed text isn't valid yet. */
  readonly invalid: readonly string[]
}

const sessions = new Map<string, ReturnType<typeof createSession>>()

function createSession<I>(definition: CalculatorDefinition<I>) {
  const fresh = (revision: number): SessionState<I> => ({
    taxYear: settingsStore.get().taxYear,
    inputs: definition.defaultInputs(),
    loadedId: null,
    revision,
    taxYearWarning: null,
    invalid: [],
  })
  const store: Store<SessionState<I>> = createStore(fresh(0))
  const update = (patch: Partial<SessionState<I>>) => store.set({ ...store.get(), ...patch })

  return {
    get: store.get,
    subscribe: store.subscribe,
    setInputs: (patch: Partial<I>) => update({ inputs: { ...store.get().inputs, ...patch } }),
    setTaxYear: (taxYear: string) => update({ taxYear, taxYearWarning: null }),
    setFieldValid(field: string, valid: boolean) {
      const { invalid } = store.get()
      if (valid === !invalid.includes(field)) return
      update({ invalid: valid ? invalid.filter((f) => f !== field) : [...invalid, field] })
    },
    /** Shows a saved scenario. A tax year this version lacks becomes the default one, with a warning. */
    load(scenario: Scenario) {
      if (scenario.calculatorId !== definition.id) return
      const checked = definition.validateInputs(scenario.inputs)
      if (!checked.ok) return
      const known = getTaxYear(scenario.taxYear)
      const taxYear = known ? scenario.taxYear : settingsStore.get().taxYear
      store.set({
        taxYear,
        inputs: checked.inputs,
        loadedId: scenario.id,
        revision: store.get().revision + 1,
        invalid: [],
        taxYearWarning: known
          ? null
          : `“${scenario.name}” was saved for the ${taxYearLabel(scenario.taxYear)} tax year, which this version of Sumyard doesn’t have. It is shown with ${taxYearLabel(taxYear)} instead; save it to keep that.`,
      })
    },
    /** Back to the defaults, linked to no scenario. */
    startNew: () => store.set(fresh(store.get().revision + 1)),
    /** The inputs were just saved as (or into) this scenario. */
    linkSaved: (id: string, taxYear: string) => update({ loadedId: id, taxYear, taxYearWarning: null }),
  }
}

export type CalculatorSession<I = unknown> = ReturnType<typeof createSession<I>>

export function sessionFor<I>(definition: CalculatorDefinition<I>): CalculatorSession<I> {
  let session = sessions.get(definition.id)
  if (!session) {
    session = createSession(definition as CalculatorDefinition<unknown>)
    sessions.set(definition.id, session)
  }
  return session as unknown as CalculatorSession<I>
}

/** The config to calculate with: the session's year, or the latest if this version lacks it. */
export const configFor = (taxYear: string): TaxYearConfig => getTaxYear(taxYear) ?? latestTaxYear()

/** True when the inputs or tax year differ from the loaded scenario (or nothing is loaded). */
export function hasUnsavedChanges(session: Pick<SessionState, 'taxYear' | 'inputs'>, loaded: Scenario | undefined): boolean {
  if (!loaded) return true
  return loaded.taxYear !== session.taxYear || canonicalJson(loaded.inputs) !== canonicalJson(session.inputs)
}

/** Tests only. */
export function resetSessionsForTests() {
  sessions.clear()
}
