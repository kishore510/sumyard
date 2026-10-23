import { describe, expect, it } from 'vitest'
import { echo, sampleScenario as sample, tally } from '@/calculators/fixtures/fakeCalculators'
import { createCalculatorRegistry } from '@/calculators/registry'
import { buildScenarioExport, EXPORT_VERSION, exportFileName, planImport, readScenarioFile } from './exchange'
import { SCENARIO_LIMITS, type Scenario } from './scenario'

const registry = createCalculatorRegistry([tally, echo])
const meta = { appVersion: '0.4.0', exportedAt: '2026-10-17T12:00:00.000Z' }

const envelope = (scenarios: unknown[], patch: Record<string, unknown> = {}) =>
  JSON.stringify({ app: 'sumyard', kind: 'scenarios', exportVersion: EXPORT_VERSION, ...meta, scenarios, ...patch })

const read = (text: string) => readScenarioFile(text, registry)
const failure = (text: string) => {
  const result = read(text)
  expect(result.ok).toBe(false)
  return !result.ok ? result.error : ''
}

describe('export', () => {
  it('writes the envelope with every scenario', () => {
    const text = buildScenarioExport([sample()], meta)
    expect(JSON.parse(text)).toEqual({
      app: 'sumyard',
      kind: 'scenarios',
      exportVersion: 1,
      appVersion: '0.4.0',
      exportedAt: '2026-10-17T12:00:00.000Z',
      scenarios: [sample()],
    })
  })

  it('round-trips through import', () => {
    const result = read(buildScenarioExport([sample(), sample({ id: 'b2', name: 'Second' })], meta))
    expect(result.ok && result.file.scenarios.map((s) => s.name)).toEqual(['My tally', 'Second'])
  })

  it('names the file sumyard-<kind>-YYYY-MM-DD.json from the local date', () => {
    expect(exportFileName('scenarios', new Date(2026, 9, 7, 23, 30))).toBe('sumyard-scenarios-2026-10-07.json')
    expect(exportFileName('backup', new Date(2026, 0, 31))).toBe('sumyard-backup-2026-01-31.json')
  })
})

describe('import: the file', () => {
  it('reads a valid file with its details', () => {
    const result = read(envelope([sample()]))
    expect(result).toMatchObject({ ok: true, file: { appVersion: '0.4.0', exportedAt: meta.exportedAt, skipped: [] } })
  })

  it.each([
    ['not JSON', '{nope', /isn’t valid JSON/],
    ['an array', '[]', /isn’t a Sumyard export/],
    ['from another app', envelope([], { app: 'chalkline' }), /isn’t a Sumyard export/],
    ['a backup', envelope([], { kind: 'backup' }), /full backup.*Settings/],
    ['another kind', envelope([], { kind: 'diagram' }), /isn’t a Sumyard export/],
    ['a newer export version', envelope([], { exportVersion: 2 }), /newer version of Sumyard/],
    ['a bad export version', envelope([], { exportVersion: '1' }), /export version/],
    ['no scenario list', envelope([], { scenarios: 'all of them' }), /no list of scenarios/],
  ])('rejects %s', (_label, text, message) => {
    expect(failure(text)).toMatch(message)
  })

  it('rejects an oversized file before parsing it', () => {
    const text = envelope([sample({ name: 'x'.repeat(10) })]).padEnd(SCENARIO_LIMITS.importChars + 1, ' ')
    expect(failure(text)).toMatch(/too large/)
  })

  it('rejects more scenarios than can be kept', () => {
    const many = Array.from({ length: SCENARIO_LIMITS.count + 1 }, (_, i) => sample({ id: `s${i}` }))
    expect(failure(envelope(many))).toMatch(new RegExp(`more than ${SCENARIO_LIMITS.count}`))
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects a hostile %s key anywhere in the file', (key) => {
    const text = envelope([sample()]).replace('"count":3', `"count":3,"${key}":{"polluted":true}`)
    expect(failure(text)).toMatch(new RegExp(key))
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('rejects absurd nesting', () => {
    const text = envelope([sample({ inputs: JSON.parse(`${'['.repeat(60)}${']'.repeat(60)}`) })])
    expect(failure(text)).toMatch(/nested too deeply/)
  })

  it('treats a missing app version or date as unknown, not as an error', () => {
    const result = read(envelope([sample()], { appVersion: 5, exportedAt: 'later' }))
    expect(result).toMatchObject({ ok: true, file: { appVersion: null, exportedAt: null } })
  })
})

describe('import: each scenario', () => {
  it('skips scenarios for unknown calculators, saying which and why', () => {
    const result = read(envelope([sample(), sample({ id: 'm1', calculatorId: 'pension-tracker', name: 'House' })]))
    expect(result.ok && result.file.scenarios).toHaveLength(1)
    expect(result.ok && result.file.skipped).toEqual([
      { name: 'House', message: expect.stringMatching(/calculator this version of Sumyard doesn’t have \("pension-tracker"\)/) },
    ])
  })

  it('skips malformed scenarios with a reason, keeping the rest', () => {
    const result = read(
      envelope([sample(), 'junk', sample({ id: 'x2', inputs: { count: 'lots' } }), sample({ id: 'x3', inputsVersion: 7 })]),
    )
    expect(result.ok && result.file.scenarios).toHaveLength(1)
    expect(result.ok && result.file.skipped.map((s) => s.message)).toEqual([
      expect.stringMatching(/isn’t a scenario/),
      expect.stringMatching(/count must be/),
      expect.stringMatching(/newer version/),
    ])
  })

  it('migrates older inputs', () => {
    const result = read(envelope([sample({ inputs: { n: 2 }, inputsVersion: 1 })]))
    expect(result.ok && result.file.scenarios[0]!.inputs).toEqual({ count: 2, label: '' })
  })

  it('drops exact duplicates inside the file', () => {
    const result = read(envelope([sample(), sample({ id: 'other-id' })]))
    expect(result.ok && result.file.scenarios).toHaveLength(1)
    expect(result.ok && result.file.duplicatesInFile).toBe(1)
  })

  it('cleans names and never trusts them as markup', () => {
    const result = read(envelope([sample({ name: '<img src=x onerror=alert(1)>‮' })]))
    expect(result.ok && result.file.scenarios[0]!.name).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('planImport', () => {
  const existing: Scenario[] = [
    sample({ id: 'e1', name: 'Kept' }),
    sample({ id: 'e2', name: 'Same name', inputs: { count: 1, label: '' } }),
  ]
  let n = 0
  const newId = () => `new-${++n}`

  it('Add gives every imported scenario a new id and skips exact duplicates', () => {
    n = 0
    const incoming = [sample({ id: 'e1', name: 'Kept' }), sample({ id: 'i2', name: 'Fresh' })]
    const plan = planImport(existing, incoming, 'add', newId)
    expect(plan.ok && plan.added.map((s) => [s.id, s.name])).toEqual([['new-1', 'Fresh']])
    expect(plan.ok && plan.duplicates.map((s) => s.name)).toEqual(['Kept'])
    expect(plan.ok && plan.result.map((s) => s.id)).toEqual(['e1', 'e2', 'new-1'])
    expect(plan.ok && plan.removed).toBe(0)
  })

  it('lists conflicts: the same id or the same name as a scenario already here', () => {
    const incoming = [sample({ id: 'e1', name: 'Different' }), sample({ id: 'z9', name: 'Same name' })]
    const plan = planImport(existing, incoming, 'add', newId)
    expect(plan.ok && plan.conflicts).toEqual([
      { name: 'Different', reason: 'same-id', existingName: 'Kept' },
      { name: 'Same name', reason: 'same-name', existingName: 'Same name' },
    ])
  })

  it('Replace swaps everything for the file, keeping valid ids', () => {
    const incoming = [sample({ id: 'i1', name: 'Only' })]
    const plan = planImport(existing, incoming, 'replace', newId)
    expect(plan.ok && plan.result.map((s) => [s.id, s.name])).toEqual([['i1', 'Only']])
    expect(plan.ok && plan.removed).toBe(2)
  })

  it('Add refuses to go over the scenario limit', () => {
    const full = Array.from({ length: SCENARIO_LIMITS.count }, (_, i) => sample({ id: `f${i}`, name: `F${i}` }))
    const plan = planImport(full, [sample({ id: 'x', name: 'One more' })], 'add', newId)
    expect(plan).toEqual({
      ok: false,
      error: `That would make more than ${SCENARIO_LIMITS.count} scenarios. Delete some first, or choose Replace.`,
    })
  })
})
