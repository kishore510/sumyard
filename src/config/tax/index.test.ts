import { describe, expect, it } from 'vitest'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR } from './fixtures/fakeTaxYears'
import { createRegistry, getTaxYear, latestTaxYear, listTaxYears, taxYearLabel } from './index'

describe('createRegistry (fake years)', () => {
  const registry = createRegistry([FAKE_PARTIAL_YEAR, FAKE_VERIFIED_YEAR, FAKE_TODO_YEAR])

  it('lists every year, newest first', () => {
    expect(registry.listTaxYears().map((y) => y.id)).toEqual(['2098-99', '2097-98', '2096-97'])
  })

  it('finds a year by id, and nothing for an unknown id', () => {
    expect(registry.getTaxYear('2097-98')).toBe(FAKE_PARTIAL_YEAR)
    expect(registry.getTaxYear('2095-96')).toBeUndefined()
    expect(registry.getTaxYear('')).toBeUndefined()
    expect(registry.getTaxYear('__proto__')).toBeUndefined()
  })

  it('takes the latest year from the ids, not from today’s date', () => {
    expect(registry.latestTaxYear()).toBe(FAKE_VERIFIED_YEAR)
    expect(createRegistry([FAKE_TODO_YEAR]).latestTaxYear()).toBe(FAKE_TODO_YEAR)
  })

  it('refuses an empty list, a duplicate id or a malformed id', () => {
    expect(() => createRegistry([])).toThrow(/at least one/)
    expect(() => createRegistry([FAKE_TODO_YEAR, FAKE_TODO_YEAR])).toThrow(/2096-97/)
    for (const id of ['2096-2097', '2096-96', '2096-98', '96-97', '2096_97', '2099-01']) {
      expect(() => createRegistry([{ ...FAKE_TODO_YEAR, id } as never]), id).toThrow(/id/)
    }
    expect(() => createRegistry([{ ...FAKE_TODO_YEAR, id: '2099-00' }])).not.toThrow()
  })
})

describe('taxYearLabel', () => {
  it('names a year as GOV.UK does, "<start> to <end>"', () => {
    expect(taxYearLabel('2098-99')).toBe('2098 to 2099')
    expect(taxYearLabel('2099-00')).toBe('2099 to 2100')
  })
})

describe('the app’s registry', () => {
  it('holds the 2026-27 skeleton, which is the latest year', () => {
    expect(listTaxYears().map((y) => y.id)).toEqual(['2026-27'])
    expect(latestTaxYear().id).toBe('2026-27')
    expect(getTaxYear('2026-27')).toBe(latestTaxYear())
  })

  it('holds no fake year', () => {
    for (const fake of ['2096-97', '2097-98', '2098-99']) expect(getTaxYear(fake)).toBeUndefined()
  })
})
