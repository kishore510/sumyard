// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CALCULATORS } from '@/calculators/index'
import { optimiserCalculator } from '@/calculators/optimiser/definition'
import { pendingImport } from '@/scenarios/actions'
import { readScenarioFile } from '@/scenarios/exchange'
import { scenarioStore } from '@/scenarios/index'
import { byText, click, mount } from '@/test/dom'
import { ImportPage } from './ImportPage'

let view: ReturnType<typeof mount>

const scenario = (id: string, name: string, calculatorId = 'optimiser') => ({
  id,
  calculatorId,
  taxYear: '2026-27',
  name,
  inputs: optimiserCalculator.defaultInputs(),
  inputsVersion: 1,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z',
})

function load(scenarios: unknown[]) {
  const text = JSON.stringify({
    app: 'sumyard',
    kind: 'scenarios',
    exportVersion: 1,
    appVersion: '0.4.0',
    exportedAt: '2026-10-17T12:00:00.000Z',
    scenarios,
  })
  const result = readScenarioFile(text, CALCULATORS)
  if (!result.ok) throw new Error(result.error)
  act(() => pendingImport.set({ kind: 'scenarios', fileName: 'sumyard-scenarios-2026-10-17.json', file: result.file }))
}

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  history.replaceState(null, '', '/')
  act(() => pendingImport.set(null))
  view = mount(<ImportPage kind="scenarios" />)
})
afterEach(() => view.unmount())

describe('Import preview', () => {
  it('asks for a file when there is none', () => {
    expect(view.host.textContent).toMatch(/No file chosen/)
  })

  it('shows counts, names as plain text, and what will be skipped, before writing anything', () => {
    load([scenario('a1', '<img src=x onerror=alert(1)>'), scenario('m1', 'House', 'mortgage')])
    expect(view.host.textContent).toMatch(/1 scenario ready to import/)
    expect(view.host.querySelector('img')).toBeNull()
    expect(view.host.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(view.host.textContent).toMatch(/“House” is for a calculator this version of Sumyard doesn’t have \("mortgage"\)/)
    expect(scenarioStore.get().scenarios).toHaveLength(0)
  })

  it('lists conflicts, and Add keeps both', () => {
    scenarioStore.create({
      calculatorId: 'optimiser',
      taxYear: '2026-27',
      name: 'Mine',
      inputs: { ...optimiserCalculator.defaultInputs(), children: 3 },
    })
    load([scenario('b1', 'Mine')])
    expect(view.host.textContent).toMatch(/“Mine” has the same name as one already here. Both will be kept./)
    click(byText(view.host, 'button', 'Import 1 scenario'))
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['Mine', 'Mine'])
    expect(pendingImport.get()).toBeNull()
  })

  it('Replace warns, offers an export first, and replaces', () => {
    scenarioStore.create({ calculatorId: 'optimiser', taxYear: '2026-27', name: 'Old', inputs: optimiserCalculator.defaultInputs() })
    load([scenario('c1', 'New')])
    const replace = view.host.querySelector<HTMLInputElement>('input[type="radio"][value="replace"]')!
    click(replace)
    expect(view.host.textContent).toMatch(/Replace removes 1 scenario from this browser/)
    expect(byText(view.host, 'button', /Export current scenarios first/)).toBeDefined()
    click(byText(view.host, 'button', 'Replace with 1 scenario'))
    expect(scenarioStore.get().scenarios.map((s) => s.name)).toEqual(['New'])
  })

  it('shows a file-level error plainly', () => {
    act(() => pendingImport.set({ kind: 'error', for: 'scenarios', fileName: 'x.json', error: 'This file isn’t valid JSON.' }))
    expect(view.host.textContent).toMatch(/This file can’t be used/)
    expect(view.host.textContent).toMatch(/isn’t valid JSON/)
  })
})
