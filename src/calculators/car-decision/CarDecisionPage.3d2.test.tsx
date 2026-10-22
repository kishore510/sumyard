// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { formatGBP, formatGBPDelta } from '@/lib/format'
import type { Money } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { click, mount } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { compareOptions, costBridge, fuelPriceFlip, ownershipCost } from '../car-ownership/calc'
import type { Comparison } from '../car-ownership/types'
import { sessionFor } from '../session'
import CarDecisionPage from './CarDecisionPage'
import { type CarDecisionInputs, carDecisionCalculator, toEngineOption, toEngineShared } from './definition'
import { cash, inputs, keep, loan, pcp } from './fixtures/inputs'
import { bridgeSentences, fuelSentence, pairNames } from './results'
import { DRIVERS, driverRow } from './sensitivity'

/*
 * Session 3d-2 on the car decision page: where the difference comes from
 * (F55, F56), the fuel or energy price threshold (F54) and the sensitivity
 * table on a phone. Its own file, so its own test worker: the page's main
 * test file already runs close to the worker's memory (docs/backlog.md).
 * Every expected figure is the engine's. Amounts are made up.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(carDecisionCalculator)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence' })
  session.startNew()
  view = mount(<CarDecisionPage />)
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
  vi.useRealTimers()
})

const $ = (selector: string, within: ParentNode = view.host) => within.querySelector(selector)
const $$ = (selector: string, within: ParentNode = view.host) => [...within.querySelectorAll(selector)]
const money = (amount: Money) => formatGBP(amount, 'pence')
const set = (patch: Partial<CarDecisionInputs>) => act(() => session.setInputs(patch))
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? ''

function engine(i: CarDecisionInputs): Comparison {
  const outcome = compareOptions(
    i.options.map((o) => toEngineOption(o, percentRatio(i.generalIncrease!))),
    toEngineShared(i),
  )
  if (!outcome.ok) throw new Error('refused')
  return outcome.result
}

describe('where the difference comes from (3d-2, F55, F56)', () => {
  const four = inputs([cash({ name: 'Newer car' }), keep({ name: 'Older car' }), loan({ name: 'Loan car' })])
  const pick = (id: string, value: string) => {
    const select = $(id) as HTMLSelectElement
    act(() => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  const bridgeOf = (i: CarDecisionInputs, pair: [number, number]) => {
    const comparison = engine(i)
    return costBridge(comparison.options[pair[0]]!, comparison.options[pair[1]]!, i.valueCase)!
  }

  it('sits in the results under the verdict: the two lowest by default, a row per part equal to the engine’s bridge', () => {
    set(four)
    const section = $('[data-bridge]')!
    expect(section.closest('[data-results]')).not.toBeNull()
    const verdict = $('[data-verdict-panel]')!
    expect(verdict.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const ranking = engine(four).ranking.expected.full
    const pair: [number, number] = [ranking[0]!.option, ranking[1]!.option]
    expect([
      Number(($('#cd-bridge-first') as HTMLSelectElement).value),
      Number(($('#cd-bridge-second') as HTMLSelectElement).value),
    ]).toEqual(pair)
    const b = bridgeOf(four, pair)
    const cells = $$('[data-bridge-table] tbody tr', section)
    expect(cells.map((tr) => text(tr.querySelector('td')))).toEqual(b.parts.map((p) => formatGBPDelta(p.shown, 'pence')))
    expect(text($('[data-bridge-table] tfoot td', section))).toBe(formatGBPDelta(b.total.shown, 'pence'))
    const names = pairNames(four, pair)
    const said = bridgeSentences(b, names, 'expected', money)
    expect(text($('[data-bridge-difference]', section))).toBe(said.difference)
    expect(text($('[data-bridge-largest]', section))).toBe(said.largest)
    for (const row of $$('[data-bridge-row]', section)) expect(Number(row.getAttribute('data-value'))).not.toBe(0)
  })

  it('shares its pair with “What changes the answer”: choosing in either moves both', () => {
    vi.useFakeTimers()
    set(four)
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    pick('#cd-bridge-first', '0')
    pick('#cd-bridge-second', '2')
    expect(($('#cd-pair-first') as HTMLSelectElement).value).toBe('0')
    expect(($('#cd-pair-second') as HTMLSelectElement).value).toBe('2')
    const said = bridgeSentences(bridgeOf(four, [0, 2]), ['Newer car', 'Loan car'], 'expected', money)
    expect(text($('[data-bridge-largest]'))).toBe(said.largest)
    pick('#cd-pair-second', '1')
    expect(($('#cd-bridge-second') as HTMLSelectElement).value).toBe('1')
  })

  it('hidden, with the reason, when fewer than two options cover the whole horizon with results', () => {
    set(inputs([cash({ name: 'New' }), pcp({ name: 'Short PCP', pcpEnd: 'hand-back', term: 24 }), loan({ name: 'No rate', rate: null })]))
    const section = $('[data-bridge]')!
    expect($('[data-bridge-table]', section)).toBeNull()
    expect(text($('[data-bridge-none]', section))).toBe(
      'This needs two options that cover the whole horizon with results. Short PCP covers less than the horizon. No rate has no results yet.',
    )
  })

  it('the same option twice is not a pair', () => {
    set(four)
    pick('#cd-bridge-first', '1')
    pick('#cd-bridge-second', '1')
    expect(text($('[data-bridge]'))).toMatch(/two different options/i)
    expect($('[data-bridge-table]')).toBeNull()
  })

  it('no banned word anywhere in the section or the thresholds', () => {
    vi.useFakeTimers()
    set(four)
    act(() => vi.runAllTimers())
    for (const selector of ['[data-bridge]', '[data-flips]'])
      expect(text($(selector))).not.toMatch(/\b(best|recommended|cheapest|cheaper|guaranteed|should)\b/i)
  })
})

describe('the fuel or energy price threshold on the page (3d-2, F54)', () => {
  it('a sentence for the pair once worked out, as the engine finds it', () => {
    vi.useFakeTimers()
    const two = inputs([cash({ name: 'Newer car' }), keep({ name: 'Older car' })])
    set(two)
    act(() => vi.runAllTimers())
    const options = two.options.map((o) => toEngineOption(o, percentRatio(two.generalIncrease!)))
    const ranking = engine(two).ranking.expected.full
    const pair = [ranking[0]!.option, ranking[1]!.option] as const
    const found = fuelPriceFlip([options[pair[0]]!, options[pair[1]]!], toEngineShared(two), 'expected')
    if (!found.ok) throw new Error('refused')
    const expected = fuelSentence(found.result, options[pair[0]]!.car.fuel, pairNames(two, [pair[0], pair[1]]))
    expect(text($('[data-flip="fuel"]'))).toBe(expected.text)
    expect(text($('[data-flip="fuel"]'))).toMatch(/a litre/)
  })
})

describe('the sensitivity table on a phone (3d-2)', () => {
  it('its first column stays opaque and wraps, the other columns keep a minimum width, and each cell reads as its source', () => {
    vi.useFakeTimers()
    const two = inputs([cash({ name: 'A very long option name that wraps' }), loan()])
    set(two)
    click($('#cd-section-sensitivity-button'))
    act(() => vi.runAllTimers())
    const shared = toEngineShared(two)
    two.options.forEach((o, index) => {
      const option = toEngineOption(o, percentRatio(two.generalIncrease!))
      const base = ownershipCost(option, shared)
      if (!base.ok) throw new Error('refused')
      const table = $(`[data-sensitivity-option="${index}"] table`)!
      expect(table.className).not.toMatch(/min-w-max/)
      for (const th of $$('tbody th, thead th:first-child', table)) {
        expect(th.className).toMatch(/sticky.*bg-surface|bg-surface.*sticky/)
        expect(th.className).toMatch(/\bmin-w-/)
      }
      for (const td of $$('td[data-shift]', table)) expect(td.className).toMatch(/\bmin-w-/)
      for (const driver of DRIVERS) {
        const row = driverRow(option, shared, 'expected', base.result, driver)
        for (const cell of row.cells) {
          const shown = text($(`tr[data-driver="${driver}"] td[data-shift="${cell.shift}"]`, table))
          expect(shown).toBe(cell.change === null ? 'Outside the range' : formatGBPDelta(cell.change, 'pence'))
        }
      }
    })
  })
})
