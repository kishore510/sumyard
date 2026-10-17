// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { DEFAULT_SETTINGS, settingsStore } from '@/settings/settings'
import { SettingsPage } from './SettingsPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  localStorage.clear()
  settingsStore.replace({ ...DEFAULT_SETTINGS })
  history.replaceState(null, '', '/')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<SettingsPage />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const taxYear = () => host.querySelector<HTMLFieldSetElement>('fieldset[aria-describedby="settings-tax-year-hint"]')

describe('Settings: default tax year', () => {
  it('replaces the stub with a real choice from the registry', () => {
    expect(host.querySelector('[data-stub="tax-year"]')).toBeNull()
    const group = taxYear()!
    expect(group.querySelector('legend')!.textContent).toBe('Tax year')
    const options = [...group.querySelectorAll('button')]
    expect(options.map((b) => b.textContent)).toEqual(['2026 to 2027 (not yet verified)'])
    expect(options[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('explains that an unverified year shows no results, and links to Tax data', () => {
    expect(taxYear()!.textContent).toMatch(/no results/i)
    const link = [...host.querySelectorAll('a')].find((a) => a.getAttribute('href') === '#/tax-data')
    expect(link).toBeDefined()
  })

  it('saves the choice in the settings record (schema 2)', () => {
    const option = taxYear()!.querySelector('button')!
    act(() => option.click())
    settingsStore.update({ region: 'scotland' })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings.key)!)).toEqual({
      schemaVersion: 2,
      region: 'scotland',
      amounts: 'pounds',
      taxYear: '2026-27',
    })
  })
})
