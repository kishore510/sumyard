import { afterEach, describe, expect, it } from 'vitest'
import { settingsStore } from '@/settings/settings'
import { plain, plainScenario, sampleScenario, tally } from './fixtures/fakeCalculators'
import { hasUnsavedChanges, resetSessionsForTests, scenarioTaxYear, sessionFor } from './session'

/* Sessions for a calculator that uses no tax rules (taxRules: 'none'). Made-up values. */

afterEach(() => resetSessionsForTests())

describe('scenarioTaxYear', () => {
  it('is the session’s year for a tax calculator and nothing for one without tax rules', () => {
    expect(scenarioTaxYear(tally, { taxYear: '2026-27' })).toBe('2026-27')
    expect(scenarioTaxYear(plain, { taxYear: '2026-27' })).toBeUndefined()
  })
})

describe('hasUnsavedChanges', () => {
  it('compares inputs only when neither side has a tax year', () => {
    expect(hasUnsavedChanges({ inputs: { amount: 5 } }, plainScenario())).toBe(false)
    expect(hasUnsavedChanges({ inputs: { amount: 6 } }, plainScenario())).toBe(true)
  })

  it('still counts a tax year change for a tax calculator', () => {
    const loaded = sampleScenario()
    expect(hasUnsavedChanges({ taxYear: '2026-27', inputs: loaded.inputs }, loaded)).toBe(false)
    expect(hasUnsavedChanges({ taxYear: '2027-28', inputs: loaded.inputs }, loaded)).toBe(true)
  })
})

describe('loading a scenario with no tax year', () => {
  it('keeps the session’s year and gives no tax-year warning', () => {
    const session = sessionFor(plain)
    session.load(plainScenario())
    expect(session.get()).toMatchObject({
      inputs: { amount: 5 },
      loadedId: 'p1',
      taxYear: settingsStore.get().taxYear,
      taxYearWarning: null,
    })
  })

  it('linkSaved with no tax year keeps the session’s year', () => {
    const session = sessionFor(plain)
    const year = session.get().taxYear
    session.linkSaved('p9', undefined)
    expect(session.get()).toMatchObject({ loadedId: 'p9', taxYear: year })
  })
})
