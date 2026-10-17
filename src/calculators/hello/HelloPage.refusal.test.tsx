// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scenarioStore } from '@/scenarios/index'
import { byText, click, mount } from '@/test/dom'
import { sessionFor } from '../session'
import { helloCalculator } from './definition'
import HelloPage from './HelloPage'

/*
 * The refusal path on the real page. The real 2026-27 year now has verified
 * dates, so this file swaps the registry for one holding a fake year with the
 * same id and every leaf unverified (fixtures are for tests only).
 */
vi.mock('@/config/tax/index', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/config/tax/index')>()
  const { fakeYear } = await import('@/config/tax/fixtures/fakeTaxYears')
  const registry = original.createRegistry([fakeYear('2026-27', () => ({ status: 'todo' }))])
  return { ...original, ...registry }
})

let view: ReturnType<typeof mount>

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  sessionFor(helloCalculator).startNew()
  view = mount(<HelloPage />)
})
afterEach(() => view.unmount())

const $ = (selector: string) => view.host.querySelector(selector)

describe('Hello calculator page, unverified tax year', () => {
  it('shows the refusal (and no results) when tax data is needed and unverified', () => {
    click($('#hello-dates'))
    expect($('[data-refusal]')).not.toBeNull()
    expect($('[data-refusal]')!.textContent).toContain('Tax year dates')
    expect($('[data-refusal] a[href="#/tax-data"]')).not.toBeNull()
    expect(byText(view.host, 'h2', 'Results')).toBeUndefined()
    expect($('[data-chart]')).toBeNull()
    expect($('details#assumptions')).not.toBeNull()
  })
})
