// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTaxYear } from '@/config/tax/index'
import { requireVerified } from '@/config/tax/sourced'
import { formatIsoDate } from '@/lib/format'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import { HELLO_TAX_PATHS } from './calc'
import { helloCalculator } from './definition'
import HelloPage from './HelloPage'

let view: ReturnType<typeof mount>

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  sessionFor(helloCalculator).startNew()
  view = mount(<HelloPage />)
})
afterEach(() => view.unmount())

const $ = (selector: string) => view.host.querySelector(selector)
const button = (text: string | RegExp) => byText(view.host, 'button', text) as HTMLButtonElement | undefined

function save(name: string) {
  click(button('Save'))
  const box = $('form input') as HTMLInputElement
  type(box, name)
  act(() => (box.form as HTMLFormElement).requestSubmit())
}

describe('Hello calculator page', () => {
  it('is labelled as a placeholder and shows its badge, results, chart and assumptions', () => {
    expect(view.host.textContent).toContain('Placeholder: removed when the first real calculator ships')
    expect($('a[href="#/tax-data"]')?.textContent).toMatch(/2026 to 2027 tax year/)
    expect(byText(view.host, 'h2', 'Results')).toBeDefined()
    expect($('[data-chart] svg[role="img"]')).not.toBeNull()
    expect($('details#assumptions')).not.toBeNull()
    expect(view.host.textContent).toMatch(/not financial advice/)
  })

  it('shows the tax year’s dates from the real config when they are verified (the refusal is in HelloPage.refusal.test.tsx)', () => {
    const year = getTaxYear('2026-27')!
    const dates = requireVerified(year, HELLO_TAX_PATHS)
    click($('#hello-dates'))
    if (!dates.ok) {
      expect($('[data-refusal]')).not.toBeNull()
      return
    }
    expect($('[data-refusal]')).toBeNull()
    expect(view.host.textContent).toContain(
      `${formatIsoDate(dates.values['period.start'])} to ${formatIsoDate(dates.values['period.end'])}`,
    )
  })

  it('shows no results while an input is invalid, and disables Save', () => {
    type($('#hello-amount') as HTMLInputElement, '1.234')
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    expect(byText(view.host, 'h2', 'Results')).toBeUndefined()
    expect(button('Save')!.disabled).toBe(true)
  })

  it('saves a scenario (inputs only), then marks unsaved changes and saves them', () => {
    save('First')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios).toHaveLength(1)
    expect(Object.keys(stored.scenarios[0].inputs).sort()).toEqual(
      ['amount', 'chart', 'percent', 'referenceLine', 'rounding', 'steps', 'useTaxYearDates'].sort(),
    )
    expect(JSON.stringify(stored)).not.toMatch(/product|series|total/)
    expect($('[data-unsaved]')!.textContent).toBe('Saved')

    type($('#hello-amount') as HTMLInputElement, '2,000')
    expect($('[data-unsaved]')!.textContent).toBe('Unsaved changes')
    click(button('Save changes'))
    expect($('[data-unsaved]')!.textContent).toBe('Saved')
    expect(scenarioStore.get().scenarios[0]!.inputs).toMatchObject({ amount: 200_000 })
  })

  it('loads, duplicates and deletes with undo', () => {
    save('First')
    type($('#hello-amount') as HTMLInputElement, '5')
    click(button('Save as new'))
    const box = $('form input') as HTMLInputElement
    type(box, 'Second')
    act(() => (box.form as HTMLFormElement).requestSubmit())
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['First', 'Second'])

    click(byText(view.host, 'button', 'Load') && $('button[aria-label="Load “First”"]'))
    expect(($('#hello-amount') as HTMLInputElement).value).toBe('1,000')

    click($('button[aria-label="Duplicate “First”"]'))
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['First', 'First (copy)', 'Second'])

    click($('button[aria-label="Delete “Second”"]'))
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['First', 'First (copy)'])
    expect(toasts.get().toast?.undo).toBeDefined()
    act(() => toasts.undo())
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['First', 'First (copy)', 'Second'])
  })
})
