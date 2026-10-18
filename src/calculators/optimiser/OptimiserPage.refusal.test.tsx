// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scenarioStore } from '@/scenarios/index'
import { byText, mount } from '@/test/dom'
import { sessionFor } from '../session'
import { optimiserCalculator } from './definition'
import OptimiserPage from './OptimiserPage'

/*
 * The refusal path on the real page: the registry is swapped for one holding
 * a fake year with the real id and every leaf unverified (fixtures are for
 * tests only).
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
  sessionFor(optimiserCalculator).startNew()
  view = mount(<OptimiserPage />)
})
afterEach(() => view.unmount())

const $ = (selector: string) => view.host.querySelector(selector)

describe('Optimiser page, unverified tax year', () => {
  it('shows the refusal, naming the unverified groups, and no results', () => {
    expect($('[data-refusal]')).not.toBeNull()
    expect($('[data-refusal]')!.textContent).toMatch(/Income Tax/i)
    expect($('[data-refusal] a[href="#/tax-data"]')).not.toBeNull()
    expect(byText(view.host, 'h2', 'Take-home pay')).toBeUndefined()
    expect(byText(view.host, 'h2', 'Breakdown')).toBeUndefined()
    expect($('details#assumptions')).not.toBeNull()
    expect(view.host.textContent).toMatch(/Not yet verified/)
  })
})
