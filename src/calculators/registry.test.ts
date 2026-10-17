import { describe, expect, it } from 'vitest'
import { echo, tally } from './fixtures/fakeCalculators'
import { CALCULATORS } from './index'
import { createCalculatorRegistry, defineCalculator } from './registry'

const registry = createCalculatorRegistry([tally, echo])

describe('createCalculatorRegistry', () => {
  it('lists calculators in the order given and finds them by id', () => {
    expect(registry.list().map((c) => c.id)).toEqual(['tally', 'echo'])
    expect(registry.get('tally')).toBe(tally)
    expect(registry.get('nope')).toBeUndefined()
  })

  it('does not find inherited properties as calculators', () => {
    expect(registry.get('__proto__')).toBeUndefined()
    expect(registry.get('constructor')).toBeUndefined()
    expect(registry.get('toString')).toBeUndefined()
  })

  it('rejects duplicate ids, bad ids, bad versions and defaults that fail their own validation', () => {
    expect(() => createCalculatorRegistry([tally, tally])).toThrow(/twice/)
    expect(() => createCalculatorRegistry([{ ...echo, id: 'Bad Id' }])).toThrow(/id/)
    expect(() => createCalculatorRegistry([{ ...echo, inputsVersion: 0 }])).toThrow(/version/)
    expect(() => createCalculatorRegistry([{ ...echo, defaultInputs: () => ({ text: 5 }) as unknown as { text: string } }])).toThrow(
      /default/,
    )
  })

  it('defineCalculator returns the definition as given', () => {
    expect(defineCalculator(echo)).toBe(echo)
  })
})

describe('readInputs', () => {
  it('accepts current inputs, building a fresh object', () => {
    const raw = { count: 3, label: 'x', extra: 'ignored' }
    const result = registry.readInputs('tally', 2, raw)
    expect(result).toEqual({ ok: true, inputs: { count: 3, label: 'x' }, migrated: false })
    expect(result.ok && result.inputs).not.toBe(raw)
  })

  it('migrates older inputs, then validates them', () => {
    expect(registry.readInputs('tally', 1, { n: 4 })).toEqual({ ok: true, inputs: { count: 4, label: '' }, migrated: true })
  })

  it('rejects an unknown calculator with a clear message', () => {
    const result = registry.readInputs('mortgage', 1, {})
    expect(result).toMatchObject({ ok: false, reason: 'unknown-calculator' })
    expect(!result.ok && result.message).toMatch(/calculator this version of Sumyard doesn’t have/)
  })

  it('rejects inputs from a newer version of the calculator', () => {
    expect(registry.readInputs('tally', 3, { count: 1, label: '' })).toMatchObject({ ok: false, reason: 'newer-inputs' })
  })

  it('rejects a version that is not a positive whole number', () => {
    for (const version of [0, -1, 1.5, Number.NaN, '2' as unknown as number]) {
      expect(registry.readInputs('tally', version, { count: 1, label: '' })).toMatchObject({ ok: false, reason: 'invalid-inputs' })
    }
  })

  it('rejects a migration that throws, and migrated inputs that fail validation', () => {
    expect(registry.readInputs('echo', 0, {})).toMatchObject({ ok: false })
    expect(registry.readInputs('tally', 1, 'not an object')).toMatchObject({ ok: false, reason: 'migration-failed' })
    expect(registry.readInputs('tally', 1, { n: -1 })).toMatchObject({ ok: false, reason: 'invalid-inputs' })
  })

  it('rejects invalid current inputs with the calculator’s first error', () => {
    const result = registry.readInputs('tally', 2, { count: 'many', label: '' })
    expect(result).toMatchObject({ ok: false, reason: 'invalid-inputs' })
    expect(!result.ok && result.message).toMatch(/count must be/)
  })
})

describe('the app registry', () => {
  it('has the Hello placeholder, labelled as one', () => {
    const hello = CALCULATORS.get('hello')
    expect(hello?.name).toBe('Hello calculator')
    expect(hello?.placeholder).toBe('Placeholder: removed when the first real calculator ships')
  })

  it('every calculator’s defaults pass its own validation', () => {
    for (const calculator of CALCULATORS.list()) {
      expect(calculator.validateInputs(calculator.defaultInputs()).ok, calculator.id).toBe(true)
    }
  })
})
