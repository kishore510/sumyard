// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { sessionFor } from '../session'
import { optimiserCalculator } from './definition'
import OptimiserPage from './OptimiserPage'

/*
 * 1b-ii-a: optimise() needs values take-home does not (the childcare limits
 * when they are checked). Here the real 2026-27 config is served with the
 * childcare limits unverified: take-home shows, and the chart's place holds
 * the refusal naming them.
 */
vi.mock('@/config/tax/index', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/config/tax/index')>()
  const { taxYear } = await import('@/config/tax/2026-27')
  const todo = { status: 'todo' } as const
  const year = { ...taxYear, childcare: { taxFreeChildcare: { incomeLimit: todo }, thirtyHours: { incomeLimit: todo } } }
  return { ...original, ...original.createRegistry([year]) }
})

let view: ReturnType<typeof mount>
const $ = (selector: string) => view.host.querySelector(selector)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence', region: 'ruk' })
  sessionFor(optimiserCalculator).startNew()
  view = mount(<OptimiserPage />)
})
afterEach(() => view.unmount())

describe('Optimiser chart, values it needs not verified', () => {
  it('shows take-home and the chart; with the childcare check on, the refusal takes the chart’s place', () => {
    type($('#opt-salary') as HTMLInputElement, '120,000')
    expect(byText(view.host, 'h2', 'Take-home pay')).toBeDefined()
    expect($('[data-optimiser] [data-chart]')).not.toBeNull()
    click($('#opt-childcare'))
    expect(byText(view.host, 'h2', 'Take-home pay')).toBeDefined()
    expect($('[data-optimiser] [data-chart]')).toBeNull()
    expect($('[data-optimiser] [data-refusal]')!.textContent).toMatch(/childcare/i)
  })
})
