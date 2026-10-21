import type { CalculatorRegistry } from '@/calculators/registry'
import { appStorage, type KeyValueStore, type Migration, readKey, removeKey, upgradeRecord, writeKey } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createStore } from '@/lib/store'
import { checkUntrustedJson, isRecord, parseJsonText } from '@/lib/validate'
import { cleanName, isTaxYearText, readScenario, SCENARIO_LIMITS, type Scenario, type ScenarioLimits } from './scenario'

/*
 * Saved scenarios, in one localStorage key, `sumyard:v1:scenarios`, as
 * `{ schemaVersion: 1, scenarios: [...] }` (docs/privacy.md).
 *
 * - Every change is applied in memory first, then written. If the browser
 *   refuses (storage blocked or full) nothing is lost for this visit:
 *   `persist` becomes 'failed' and the page suggests exporting.
 * - A stored record this version can't read (not JSON, a newer schema) is
 *   never written over: `persist` is 'blocked' until a restore or "clear all
 *   data" replaces it on purpose.
 * - Stored scenarios this version can't use (a calculator it doesn't have,
 *   inputs from a newer version) are kept as they are and written back, so
 *   rolling back a version loses nothing. They are not shown.
 */

export const SCENARIOS_KEY = STORAGE_KEYS.scenarios.key
const SCHEMA_VERSION = STORAGE_KEYS.scenarios.schemaVersion

/** No older schema yet. A schema 2 would add `1: (record) => ...` here (see upgradeRecord). */
const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type PersistState = 'ok' | 'failed' | 'blocked'

export interface ScenarioState {
  readonly scenarios: readonly Scenario[]
  /** How many stored scenarios this version can't use; kept and written back untouched. */
  readonly preserved: number
  readonly persist: PersistState
  /** Why the stored record is blocked, if it is. */
  readonly problem: null | 'unreadable' | 'newer'
}

export interface StoredScenarios {
  scenarios: Scenario[]
  preserved: unknown[]
  problem: ScenarioState['problem']
}

export function parseStoredScenarios(
  text: string | null,
  registry: CalculatorRegistry,
  {
    schemaVersion = SCHEMA_VERSION,
    migrations = MIGRATIONS,
  }: { schemaVersion?: number; migrations?: Readonly<Record<number, Migration>> } = {},
): StoredScenarios {
  const empty = (problem: StoredScenarios['problem']): StoredScenarios => ({ scenarios: [], preserved: [], problem })
  if (text === null) return empty(null)
  const parsed = parseJsonText(text)
  if (!parsed.ok || !isRecord(parsed.value) || checkUntrustedJson(parsed.value)) return empty('unreadable')
  const version = parsed.value.schemaVersion
  if (typeof version === 'number' && version > schemaVersion) return empty('newer')
  const record = upgradeRecord(text, schemaVersion, migrations)
  if (!record || !Array.isArray(record.scenarios)) return empty('unreadable')
  const scenarios: Scenario[] = []
  const preserved: unknown[] = []
  const ids = new Set<string>()
  for (const raw of record.scenarios as unknown[]) {
    const read = readScenario(raw, registry)
    if (read.ok && !ids.has(read.scenario.id)) {
      ids.add(read.scenario.id)
      scenarios.push(read.scenario)
    } else preserved.push(raw)
  }
  return { scenarios, preserved, problem: null }
}

export function serializeScenarios(state: { scenarios: readonly Scenario[] }, preserved: readonly unknown[] = []): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, scenarios: [...state.scenarios, ...preserved] })
}

/** The taxYear field, or no key at all when there is no year (a calculator that uses no tax rules). */
const withTaxYear = (taxYear: string | undefined) => (taxYear === undefined ? {} : { taxYear })

export type ScenarioOp =
  | { readonly ok: true; readonly scenario: Scenario; readonly saved: boolean }
  | { readonly ok: false; readonly error: string }

export interface ScenarioDraft {
  calculatorId: string
  /** Left out, and only left out, for a calculator that uses no tax rules. */
  taxYear?: string
  name: string
  inputs: unknown
}

export interface ScenarioStoreOptions {
  storage?: () => KeyValueStore | undefined
  registry: CalculatorRegistry
  newId: () => string
  /** UTC ISO date-time. */
  now: () => string
  limits?: ScenarioLimits
}

export function createScenarioStore({ storage = appStorage, registry, newId, now, limits = SCENARIO_LIMITS }: ScenarioStoreOptions) {
  const initial = parseStoredScenarios(readKey(SCENARIOS_KEY, storage()), registry)
  let preserved = initial.preserved
  const store = createStore<ScenarioState>({
    scenarios: initial.scenarios,
    preserved: preserved.length,
    persist: initial.problem ? 'blocked' : 'ok',
    problem: initial.problem,
  })

  const tooMuch = 'That’s too much to keep in this browser. Delete some scenarios, or export them to a file first.'
  const tooMany = `You can keep up to ${limits.count} scenarios. Delete some, or export them to a file first.`

  /** Applies a new list in memory and writes it (unless blocked). Refuses, changing nothing, past the size cap. */
  function commit(scenarios: readonly Scenario[]): { ok: true; saved: boolean } | { ok: false; error: string } {
    const text = serializeScenarios({ scenarios }, preserved)
    if (text.length > limits.storedChars) return { ok: false, error: tooMuch }
    const current = store.get()
    if (current.persist === 'blocked') {
      store.set({ ...current, scenarios })
      return { ok: true, saved: false }
    }
    const saved = writeKey(SCENARIOS_KEY, text, storage())
    store.set({ ...current, scenarios, persist: saved ? 'ok' : 'failed' })
    return { ok: true, saved }
  }

  function checkDraft(
    draft: ScenarioDraft,
  ): { ok: true; name: string; inputs: unknown; inputsVersion: number } | { ok: false; error: string } {
    const definition = registry.get(draft.calculatorId)
    if (!definition) return { ok: false, error: 'This calculator isn’t in this version of Sumyard.' }
    if (definition.taxRules === 'none') {
      if (draft.taxYear !== undefined) return { ok: false, error: 'This calculator uses no tax rules, so it takes no tax year.' }
    } else if (!isTaxYearText(draft.taxYear)) return { ok: false, error: 'Choose a tax year.' }
    const name = cleanName(draft.name)
    if (!name.ok) return name
    const inputs = registry.readInputs(draft.calculatorId, definition.inputsVersion, draft.inputs)
    if (!inputs.ok) return { ok: false, error: 'Some inputs aren’t valid. Fix the highlighted ones first.' }
    if (JSON.stringify(inputs.inputs).length > limits.inputsChars) return { ok: false, error: tooMuch }
    return { ok: true, name: name.value, inputs: inputs.inputs, inputsVersion: definition.inputsVersion }
  }

  const find = (id: string) => store.get().scenarios.find((s) => s.id === id)

  function replaceOne(id: string, change: (s: Scenario) => Scenario): ScenarioOp {
    const existing = find(id)
    if (!existing) return { ok: false, error: 'That scenario is no longer saved.' }
    const next = change(existing)
    const result = commit(store.get().scenarios.map((s) => (s.id === id ? next : s)))
    return result.ok ? { ok: true, scenario: next, saved: result.saved } : result
  }

  return {
    get: store.get,
    subscribe: store.subscribe,

    /** Save (or save as new): a new scenario at the end of the list. */
    create(draft: ScenarioDraft): ScenarioOp {
      const checked = checkDraft(draft)
      if (!checked.ok) return checked
      if (store.get().scenarios.length >= limits.count) return { ok: false, error: tooMany }
      const time = now()
      const scenario: Scenario = {
        id: newId(),
        calculatorId: draft.calculatorId,
        ...withTaxYear(draft.taxYear),
        name: checked.name,
        inputs: checked.inputs,
        inputsVersion: checked.inputsVersion,
        createdAt: time,
        updatedAt: time,
      }
      const result = commit([...store.get().scenarios, scenario])
      return result.ok ? { ok: true, scenario, saved: result.saved } : result
    },

    /** Save changes to a loaded scenario: new inputs and tax year, same id, name and createdAt. */
    update(id: string, change: { taxYear?: string; inputs: unknown }): ScenarioOp {
      const existing = find(id)
      if (!existing) return { ok: false, error: 'That scenario is no longer saved.' }
      const checked = checkDraft({ ...change, calculatorId: existing.calculatorId, name: existing.name })
      if (!checked.ok) return checked
      return replaceOne(id, ({ taxYear: _old, ...s }) => ({
        ...s,
        ...withTaxYear(change.taxYear),
        inputs: checked.inputs,
        inputsVersion: checked.inputsVersion,
        updatedAt: now(),
      }))
    },

    rename(id: string, name: string): ScenarioOp {
      const checked = cleanName(name)
      if (!checked.ok) return checked
      return replaceOne(id, (s) => ({ ...s, name: checked.value, updatedAt: now() }))
    },

    /** A copy with a new id, named "<name> (copy)", placed right after the original. */
    duplicate(id: string): ScenarioOp {
      const existing = find(id)
      if (!existing) return { ok: false, error: 'That scenario is no longer saved.' }
      if (store.get().scenarios.length >= limits.count) return { ok: false, error: tooMany }
      const suffix = ' (copy)'
      const base = Array.from(existing.name)
        .slice(0, limits.nameLength - suffix.length)
        .join('')
        .trim()
      const time = now()
      const copy: Scenario = { ...existing, id: newId(), name: `${base}${suffix}`, createdAt: time, updatedAt: time }
      const list = [...store.get().scenarios]
      list.splice(list.indexOf(existing) + 1, 0, copy)
      const result = commit(list)
      return result.ok ? { ok: true, scenario: copy, saved: result.saved } : result
    },

    /** Deletes a scenario. Returns an undo that puts it back where it was, or null if it wasn't there. */
    remove(id: string): { undo: () => void; saved: boolean } | null {
      const list = store.get().scenarios
      const index = list.findIndex((s) => s.id === id)
      if (index < 0) return null
      const removed = list[index]!
      const result = commit(list.filter((s) => s.id !== id))
      return {
        saved: result.ok && result.saved,
        undo: () => {
          const now = store.get().scenarios
          if (now.some((s) => s.id === id)) return
          const next = [...now]
          next.splice(Math.min(index, next.length), 0, removed)
          commit(next)
        },
      }
    },

    /** Import: the new visible list (already validated and planned). Scenarios kept for other versions stay. */
    importAll(scenarios: readonly Scenario[]) {
      if (scenarios.length > limits.count) return { ok: false as const, error: tooMany }
      return commit(scenarios)
    },

    /** Restore: replaces everything on purpose, including a blocked record and kept scenarios. */
    replaceAll(scenarios: readonly Scenario[]): { saved: boolean } {
      const text = serializeScenarios({ scenarios })
      preserved = []
      const saved = text.length <= limits.storedChars && writeKey(SCENARIOS_KEY, text, storage())
      store.set({ scenarios: [...scenarios], preserved: 0, persist: saved ? 'ok' : 'failed', problem: null })
      return { saved }
    },

    /** Clear all data: removes the key and everything in memory. */
    clear(): boolean {
      preserved = []
      const removed = removeKey(SCENARIOS_KEY, storage())
      store.set({ scenarios: [], preserved: 0, persist: removed ? 'ok' : 'failed', problem: null })
      return removed
    },

    /** Re-reads storage (another tab changed it), unless this tab holds changes the browser wouldn't save. */
    reload() {
      if (store.get().persist === 'failed') return
      const next = parseStoredScenarios(readKey(SCENARIOS_KEY, storage()), registry)
      preserved = next.preserved
      store.set({
        scenarios: next.scenarios,
        preserved: preserved.length,
        persist: next.problem ? 'blocked' : 'ok',
        problem: next.problem,
      })
    },
  }
}

export type ScenarioStore = ReturnType<typeof createScenarioStore>

/** One calculator's scenarios, in the order saved. */
export const scenariosFor = (state: Pick<ScenarioState, 'scenarios'>, calculatorId: string): Scenario[] =>
  state.scenarios.filter((s) => s.calculatorId === calculatorId)
