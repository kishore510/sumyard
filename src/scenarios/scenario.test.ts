import { describe, expect, it } from 'vitest'
import { echo, sampleScenario as sample, tally } from '@/calculators/fixtures/fakeCalculators'
import { createCalculatorRegistry } from '@/calculators/registry'
import { cleanName, isScenarioId, isTaxYearText, isTimestamp, readScenario, SCENARIO_LIMITS, sameContent } from './scenario'

const registry = createCalculatorRegistry([tally, echo])

describe('field checks', () => {
  it('ids are short and plain', () => {
    expect(isScenarioId('a1b2c3')).toBe(true)
    expect(isScenarioId('0c6f0d8e-58a4-4c2d-9a51-2a3b0b6f1e10')).toBe(true)
    for (const id of ['', 'has space', 'x'.repeat(65), '<b>', 7, null]) expect(isScenarioId(id), String(id)).toBe(false)
  })

  it('tax years look like "2026-27" with consecutive years', () => {
    expect(isTaxYearText('2026-27')).toBe(true)
    expect(isTaxYearText('2099-00')).toBe(true)
    for (const year of ['2026-28', '2026/27', '26-27', '2026-2027', 2026]) expect(isTaxYearText(year), String(year)).toBe(false)
  })

  it('timestamps are UTC ISO date-times that exist', () => {
    expect(isTimestamp('2026-10-17T10:00:00.000Z')).toBe(true)
    expect(isTimestamp('2026-10-17T10:00:00Z')).toBe(true)
    for (const t of ['2026-10-17', '2026-02-30T10:00:00Z', '2026-10-17T25:00:00Z', 'yesterday', 0])
      expect(isTimestamp(t), String(t)).toBe(false)
  })

  it('cleanName trims, strips control characters and caps the length', () => {
    expect(cleanName('  Plan‮ A  ')).toEqual({ ok: true, value: 'Plan A' })
    expect(cleanName('   ')).toEqual({ ok: false, error: 'Give the scenario a name.' })
    expect(cleanName('x'.repeat(SCENARIO_LIMITS.nameLength + 1))).toEqual({
      ok: false,
      error: `Use at most ${SCENARIO_LIMITS.nameLength} characters.`,
    })
    expect(cleanName(42)).toMatchObject({ ok: false })
  })
})

describe('readScenario', () => {
  it('accepts a valid scenario and builds a fresh one', () => {
    const raw = { ...sample(), extra: 'dropped' }
    const result = readScenario(raw, registry)
    expect(result).toEqual({ ok: true, scenario: sample(), migrated: false })
    expect(result.ok && result.scenario).not.toBe(raw)
    expect(result.ok && result.scenario.inputs).not.toBe(raw.inputs)
  })

  it('migrates older inputs and stamps the current version', () => {
    const result = readScenario(sample({ inputs: { n: 5 }, inputsVersion: 1 }), registry)
    expect(result).toMatchObject({ ok: true, migrated: true, scenario: { inputs: { count: 5, label: '' }, inputsVersion: 2 } })
  })

  it('keeps a tax year this version doesn’t have (the page warns when it opens)', () => {
    expect(readScenario(sample({ taxYear: '2031-32' }), registry).ok).toBe(true)
  })

  it.each<[string, unknown, RegExp]>([
    ['not an object', 'scenario', /isn’t a scenario/],
    ['an array', [], /isn’t a scenario/],
    ['a bad id', sample({ id: 'no spaces allowed' }), /id/],
    ['an unknown calculator', sample({ calculatorId: 'mortgage' }), /calculator this version of Sumyard doesn’t have/],
    ['a missing calculator', { ...sample(), calculatorId: undefined }, /calculator/],
    ['a bad tax year', sample({ taxYear: '2026' }), /tax year/],
    ['an empty name', sample({ name: ' ' }), /name/],
    ['a long name', sample({ name: 'x'.repeat(81) }), /name/],
    ['a bad date', sample({ createdAt: 'last week' }), /date/],
    ['newer inputs', sample({ inputsVersion: 3 }), /newer version/],
    ['invalid inputs', sample({ inputs: { count: -1, label: '' } }), /count must be/],
    ['huge inputs', sample({ calculatorId: 'echo', inputsVersion: 1, inputs: { text: 'x'.repeat(30_000) } }), /too large/],
  ])('rejects %s with a message', (_label, raw, message) => {
    const result = readScenario(raw, registry)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(message)
  })

  it('reports the cleaned name of a rejected scenario, if it has one', () => {
    const result = readScenario(sample({ name: 'Old\u0000 plan', calculatorId: 'mortgage' }), registry)
    expect(!result.ok && result.name).toBe('Old plan')
  })
})

describe('sameContent', () => {
  it('ignores id and dates, and key order in inputs', () => {
    const a = sample()
    const b = sample({ id: 'other', createdAt: '2026-01-01T00:00:00.000Z', inputs: { label: 'x', count: 3 } })
    expect(sameContent(a, b)).toBe(true)
    expect(sameContent(a, sample({ name: 'Other' }))).toBe(false)
    expect(sameContent(a, sample({ taxYear: '2027-28' }))).toBe(false)
    expect(sameContent(a, sample({ inputs: { count: 4, label: 'x' } }))).toBe(false)
  })
})
