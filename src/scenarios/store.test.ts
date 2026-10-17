import { describe, expect, it } from 'vitest'
import { echo, sampleScenario as sample, tally } from '@/calculators/fixtures/fakeCalculators'
import { createCalculatorRegistry } from '@/calculators/registry'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { SCENARIO_LIMITS } from './scenario'
import { createScenarioStore, parseStoredScenarios, SCENARIOS_KEY, scenariosFor } from './store'

const registry = createCalculatorRegistry([tally, echo])

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  let full = false
  return {
    data,
    fill: (value: boolean) => {
      full = value
    },
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException('quota', 'QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k: string) => void data.delete(k),
  }
}

const stored = (storage: ReturnType<typeof memory>) => JSON.parse(storage.data.get(SCENARIOS_KEY)!)

function setup(initial: Record<string, string> = {}) {
  const storage = memory(initial)
  let ids = 0
  let clock = 0
  const store = createScenarioStore({
    storage: () => storage,
    registry,
    newId: () => `id-${++ids}`,
    now: () => `2026-10-17T10:00:0${clock++ % 10}.000Z`,
  })
  return { storage, store }
}

const tallyDraft = (name = 'Plan A') => ({ calculatorId: 'tally', taxYear: '2026-27', name, inputs: { count: 2, label: '' } })

describe('the scenarios key', () => {
  it('is sumyard:v1:scenarios, schema 1, in the storage-key list', () => {
    expect(SCENARIOS_KEY).toBe('sumyard:v1:scenarios')
    expect(STORAGE_KEYS.scenarios).toMatchObject({ key: SCENARIOS_KEY, schemaVersion: 1 })
  })

  it('holds one versioned record of every scenario', () => {
    const { storage, store } = setup()
    store.create(tallyDraft())
    expect(stored(storage)).toEqual({ schemaVersion: 1, scenarios: [store.get().scenarios[0]] })
  })
})

describe('scenario operations', () => {
  it('save creates a scenario with an id, the inputs only, and timestamps', () => {
    const { store } = setup()
    const result = store.create(tallyDraft())
    expect(result).toMatchObject({ ok: true, saved: true })
    expect(store.get().scenarios).toEqual([
      {
        id: 'id-1',
        calculatorId: 'tally',
        taxYear: '2026-27',
        name: 'Plan A',
        inputs: { count: 2, label: '' },
        inputsVersion: 2,
        createdAt: '2026-10-17T10:00:00.000Z',
        updatedAt: '2026-10-17T10:00:00.000Z',
      },
    ])
  })

  it('save validates inputs through the registry and refuses unknown calculators', () => {
    const { store } = setup()
    expect(store.create({ ...tallyDraft(), inputs: { count: -5, label: '' } })).toMatchObject({ ok: false })
    expect(store.create({ ...tallyDraft(), calculatorId: 'nope' })).toMatchObject({ ok: false })
    expect(store.get().scenarios).toEqual([])
  })

  it('save cleans and checks the name', () => {
    const { store } = setup()
    expect(store.create(tallyDraft('  Plan\u0000 B '))).toMatchObject({ ok: true, scenario: { name: 'Plan B' } })
    expect(store.create(tallyDraft(''))).toEqual({ ok: false, error: 'Give the scenario a name.' })
  })

  it('update replaces inputs and tax year, keeping the id and createdAt', () => {
    const { store } = setup()
    const created = store.create(tallyDraft())
    if (!created.ok) throw new Error()
    const updated = store.update(created.scenario.id, { taxYear: '2027-28', inputs: { count: 9, label: 'y' } })
    expect(updated).toMatchObject({ ok: true, scenario: { id: 'id-1', taxYear: '2027-28', inputs: { count: 9, label: 'y' } } })
    const [scenario] = store.get().scenarios
    expect(scenario!.createdAt).toBe(created.scenario.createdAt)
    expect(scenario!.updatedAt).not.toBe(created.scenario.updatedAt)
    expect(store.update('missing', { taxYear: '2026-27', inputs: {} })).toMatchObject({ ok: false })
  })

  it('save as new leaves the original untouched', () => {
    const { store } = setup()
    store.create(tallyDraft())
    store.create({ ...tallyDraft('Plan A, bigger'), inputs: { count: 50, label: '' } })
    expect(store.get().scenarios.map((s) => [s.name, (s.inputs as { count: number }).count])).toEqual([
      ['Plan A', 2],
      ['Plan A, bigger', 50],
    ])
  })

  it('rename changes only the name', () => {
    const { store } = setup()
    store.create(tallyDraft())
    expect(store.rename('id-1', 'Renamed')).toMatchObject({ ok: true, scenario: { name: 'Renamed' } })
    expect(store.rename('id-1', ' ')).toMatchObject({ ok: false })
    expect(store.get().scenarios[0]!.name).toBe('Renamed')
  })

  it('duplicate copies with a new id and a "(copy)" name, placed after the original', () => {
    const { store } = setup()
    store.create(tallyDraft())
    store.create(tallyDraft('Other'))
    expect(store.duplicate('id-1')).toMatchObject({ ok: true, scenario: { id: 'id-3', name: 'Plan A (copy)' } })
    expect(store.get().scenarios.map((s) => s.id)).toEqual(['id-1', 'id-3', 'id-2'])
  })

  it('duplicate keeps the name within the limit', () => {
    const { store } = setup()
    store.create(tallyDraft('x'.repeat(SCENARIO_LIMITS.nameLength)))
    const copy = store.duplicate('id-1')
    expect(copy.ok && copy.scenario.name.length).toBeLessThanOrEqual(SCENARIO_LIMITS.nameLength)
    expect(copy.ok && copy.scenario.name.endsWith('(copy)')).toBe(true)
  })

  it('delete removes it, and undo puts it back in the same place', () => {
    const { storage, store } = setup()
    store.create(tallyDraft('One'))
    store.create(tallyDraft('Two'))
    store.create(tallyDraft('Three'))
    const removed = store.remove('id-2')
    expect(store.get().scenarios.map((s) => s.name)).toEqual(['One', 'Three'])
    expect(stored(storage).scenarios).toHaveLength(2)
    removed!.undo()
    expect(store.get().scenarios.map((s) => s.name)).toEqual(['One', 'Two', 'Three'])
    expect(stored(storage).scenarios).toHaveLength(3)
    expect(store.remove('missing')).toBeNull()
  })

  it('scenariosFor lists one calculator’s scenarios', () => {
    const { store } = setup()
    store.create(tallyDraft())
    store.create({ calculatorId: 'echo', taxYear: '2026-27', name: 'E', inputs: { text: 'a' } })
    expect(scenariosFor(store.get(), 'echo').map((s) => s.name)).toEqual(['E'])
  })
})

describe('limits', () => {
  it('caps the number of scenarios', () => {
    const { store } = setup()
    for (let i = 0; i < SCENARIO_LIMITS.count; i++) expect(store.create(tallyDraft(`S${i}`)).ok).toBe(true)
    expect(store.create(tallyDraft('One too many'))).toEqual({
      ok: false,
      error: `You can keep up to ${SCENARIO_LIMITS.count} scenarios. Delete some, or export them to a file first.`,
    })
    expect(store.duplicate('id-1')).toMatchObject({ ok: false })
  })

  it('refuses a change that would make the record larger than the size cap', () => {
    const storage = memory()
    const store = createScenarioStore({
      storage: () => storage,
      registry,
      newId: () => Math.random().toString(36).slice(2),
      now: () => '2026-10-17T10:00:00.000Z',
      limits: { ...SCENARIO_LIMITS, storedChars: 600 },
    })
    expect(store.create(tallyDraft()).ok).toBe(true)
    const result = store.create(tallyDraft('x'.repeat(80)))
    const third = result.ok ? store.create(tallyDraft('y'.repeat(80))) : result
    expect(third).toMatchObject({ ok: false, error: expect.stringMatching(/too much to keep/) })
  })
})

describe('storage unavailable or full', () => {
  it('keeps changes in memory and says so when storage is full', () => {
    const { storage, store } = setup()
    storage.fill(true)
    const result = store.create(tallyDraft())
    expect(result).toMatchObject({ ok: true, saved: false })
    expect(store.get().scenarios).toHaveLength(1)
    expect(store.get().persist).toBe('failed')
    storage.fill(false)
    store.rename('id-1', 'Now saved')
    expect(store.get().persist).toBe('ok')
    expect(stored(storage).scenarios[0].name).toBe('Now saved')
  })

  it('works in memory when storage is blocked entirely', () => {
    const store = createScenarioStore({ storage: () => undefined, registry, newId: () => 'x1', now: () => '2026-10-17T10:00:00.000Z' })
    expect(store.create(tallyDraft())).toMatchObject({ ok: true, saved: false })
    expect(store.get()).toMatchObject({ persist: 'failed' })
    expect(store.get().scenarios).toHaveLength(1)
  })

  it('does not reload over unsaved changes', () => {
    const { storage, store } = setup()
    store.create(tallyDraft())
    storage.fill(true)
    store.rename('id-1', 'Only in memory')
    store.reload()
    expect(store.get().scenarios[0]!.name).toBe('Only in memory')
  })
})

describe('reading the stored record', () => {
  const record = (scenarios: unknown[], schemaVersion = 1) => JSON.stringify({ schemaVersion, scenarios })

  it('reads nothing as an empty list', () => {
    expect(parseStoredScenarios(null, registry)).toEqual({ scenarios: [], preserved: [], problem: null })
  })

  it('reads valid scenarios and migrates older inputs', () => {
    const parsed = parseStoredScenarios(record([sample(), sample({ id: 'b2', inputs: { n: 7 }, inputsVersion: 1 })]), registry)
    expect(parsed.scenarios.map((s) => s.inputs)).toEqual([
      { count: 3, label: 'x' },
      { count: 7, label: '' },
    ])
    expect(parsed.preserved).toEqual([])
  })

  it('keeps scenarios it can’t read (another calculator, newer inputs) without showing them, and writes them back', () => {
    const unknown = sample({ id: 'u1', calculatorId: 'optimiser' })
    const newer = sample({ id: 'n1', inputsVersion: 9 })
    const { storage, store } = setup({ [SCENARIOS_KEY]: record([sample(), unknown, newer]) })
    expect(store.get().scenarios.map((s) => s.id)).toEqual(['a1b2c3'])
    expect(store.get().preserved).toBe(2)
    store.rename('a1b2c3', 'Renamed')
    expect(stored(storage).scenarios.map((s: { id: string }) => s.id)).toEqual(['a1b2c3', 'u1', 'n1'])
  })

  it('keeps only the first of two stored scenarios with the same id', () => {
    const parsed = parseStoredScenarios(record([sample(), sample({ name: 'Twin' })]), registry)
    expect(parsed.scenarios.map((s) => s.name)).toEqual(['My tally'])
    expect(parsed.preserved).toHaveLength(1)
  })

  it.each([
    ['not JSON', '{oops', 'unreadable'],
    ['not an object', '[]', 'unreadable'],
    ['no list', JSON.stringify({ schemaVersion: 1 }), 'unreadable'],
    ['hostile keys', '{"schemaVersion":1,"scenarios":[],"__proto__":{"x":1}}', 'unreadable'],
    ['a newer schema', JSON.stringify({ schemaVersion: 2, scenarios: [] }), 'newer'],
  ])('blocks writing over a record that is %s, so nothing is lost', (_label, text, problem) => {
    const { storage, store } = setup({ [SCENARIOS_KEY]: text })
    expect(store.get()).toMatchObject({ scenarios: [], persist: 'blocked', problem })
    expect(store.create(tallyDraft())).toMatchObject({ ok: true, saved: false })
    expect(storage.data.get(SCENARIOS_KEY)).toBe(text)
  })

  it('replacing everything (restore, clear) is a deliberate overwrite and unblocks', () => {
    const { storage, store } = setup({ [SCENARIOS_KEY]: '{oops' })
    store.replaceAll([sample()])
    expect(store.get()).toMatchObject({ persist: 'ok', problem: null })
    expect(stored(storage).scenarios).toHaveLength(1)
    store.clear()
    expect(storage.data.has(SCENARIOS_KEY)).toBe(false)
    expect(store.get()).toMatchObject({ scenarios: [], preserved: 0, persist: 'ok' })
  })

  it('upgrades an older record through the migration hook', () => {
    const migrations = { 1: (r: Record<string, unknown>) => ({ scenarios: (r.items as unknown[]) ?? [] }) }
    const old = JSON.stringify({ schemaVersion: 1, items: [sample()] })
    const parsed = parseStoredScenarios(old, registry, { schemaVersion: 2, migrations })
    expect(parsed.scenarios).toHaveLength(1)
    expect(parsed.problem).toBeNull()
  })

  it('reload picks up another tab’s changes', () => {
    const { storage, store } = setup()
    storage.data.set(SCENARIOS_KEY, record([sample()]))
    store.reload()
    expect(store.get().scenarios).toHaveLength(1)
  })
})
