// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { taxYear } from '@/config/tax/2026-27'
import type { TaxYearConfig } from '@/config/tax/schema'
import { formatGBP } from '@/lib/format'
import { MAX_AGE_YEARS } from '@/lib/inputLimits'
import { fromPounds, type Money } from '@/lib/money'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { mortgageCalculator } from '../mortgage/definition'
import { type OptimiserPageInputs, optimiserCalculator } from '../optimiser/definition'
import { sessionFor } from '../session'
import { calculate, type NextPoundPageInputs, nextPoundCalculator, type PageOutcome } from './definition'
import { unverifiedConfig } from './fixtures/pageInputs'
import NextPoundPage from './NextPoundPage'
import {
  barRows,
  breakEvenBox,
  CAUSE_CLAUSE,
  calloutFacts,
  calloutText,
  headlineParts,
  headlineText,
  legLine,
  stickyLines,
  wordingProblems,
} from './screen'

/*
 * The next pound page (C2, rebuilt as a decision panel). Pay comes from a
 * saved take-home scenario or the take-home page's inputs this visit, the
 * mortgage from a saved mortgage scenario, both read only. Every expected
 * figure comes from the composer through calculate and screen.ts, formatted
 * as the page formats it; nothing is worked out or typed here. Pay, balances
 * and rates are made up for tests. The composer runs once the inputs settle,
 * so the clock is faked.
 */

const mocked = vi.hoisted(() => ({ config: null as TaxYearConfig | null }))
vi.mock('../session', async (original) => {
  const actual = await original<typeof import('../session')>()
  return { ...actual, configFor: (year: string | undefined) => mocked.config ?? actual.configFor(year) }
})

let view: ReturnType<typeof mount>
const session = sessionFor(nextPoundCalculator)
const takeHome = sessionFor(optimiserCalculator)
const TODAY = '2026-10-23'

function remount() {
  view?.unmount()
  view = mount(<NextPoundPage />)
  settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 23, 12))
  mocked.config = null
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence' })
  session.startNew()
  takeHome.startNew()
  view = mount(<NextPoundPage />)
  settle()
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
  vi.useRealTimers()
})

function settle() {
  act(() => vi.advanceTimersByTime(SETTLE_MS))
  act(() => vi.advanceTimersByTime(SETTLE_MS))
}

const $ = (selector: string) => view.host.querySelector(selector)
const $$ = (selector: string) => [...view.host.querySelectorAll(selector)]
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const select = (id: string) => $(`#${id}`) as HTMLSelectElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const text = () => view.host.textContent ?? ''
const set = (patch: Partial<NextPoundPageInputs>) => {
  act(() => session.setInputs(patch))
  settle()
}
const choose = (id: string, value: string) => {
  const el = select(id)
  act(() => {
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  settle()
}
const openTile = (name: string) => click($(`#np-tile-${name}`))
const headline = () => $('[data-headline]')?.textContent?.trim()

const pay = (salary: number, extra: Partial<OptimiserPageInputs> = {}): OptimiserPageInputs => ({
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(salary),
  pensionMethod: 'netPay',
  employeeContribution: { mode: 'amount', amount: fromPounds(3_000), percentOfPay: '0' },
  employerContribution: { mode: 'amount', amount: fromPounds(3_000), percentOfPay: '0' },
  ...extra,
})
const home = {
  ...mortgageCalculator.defaultInputs(),
  startDate: '2026-11-01' as const,
  balance: fromPounds(200_000),
  termYears: 25,
  fixedRate: '4.5',
  fixedEndDate: '2028-11-30' as const,
  reversionRate: '7',
}

function save(calculatorId: 'optimiser' | 'mortgage', name: string, inputs: unknown) {
  const made = scenarioStore.create({ calculatorId, taxYear: '2026-27', name, inputs })
  if (!made.ok) throw new Error(made.error)
  return made.scenario
}

/** A take-home scenario and a mortgage scenario saved, the essentials typed: the usual starting point. */
function setUp(essentials: Partial<NextPoundPageInputs> = {}) {
  const p = save('optimiser', 'My pay', pay(60_000))
  const m = save('mortgage', 'Home', home)
  remount()
  set({ lumpSum: fromPounds(10_000), horizonYears: 20, ageNow: 40, feeRate: '0.5', inflationRate: '2', ...essentials })
  return { p, m }
}

type Ok = Extract<PageOutcome, { kind: 'ok' }>
function engine(): Ok {
  const out = calculate(session.get().inputs, mocked.config ?? taxYear)
  if (out.kind !== 'ok') throw new Error(out.kind)
  return out
}

describe('a fresh page', () => {
  it('the title, the date filled with today, the age empty, and the illustrative growth rates', () => {
    expect($('h1')?.textContent).toBe('Where does the next £X go?')
    expect(session.get().inputs.asOf).toBe(TODAY)
    expect(text()).toMatch(/2026 to 2027 tax year/)
    openTile('ageNow')
    expect(box('np-age').value).toBe('')
    expect(text()).toMatch(/illustrative/)
  })

  it('no pay anywhere: a prompt to enter it on the take-home page first; the pension leg needs your pay, not an error', () => {
    const prompt = $('[data-pay-prompt]')!
    expect(prompt.textContent).toMatch(/Enter your pay on the take-home page first/)
    expect(prompt.querySelector('a')?.getAttribute('href')).toBe('#/c/optimiser')
    set({ lumpSum: fromPounds(10_000) })
    expect($('[data-bar="pension"]')?.textContent).toMatch(/Needs your pay/)
    expect($('[data-bar="pension"] [data-refusal]')).toBeNull()
  })

  it('no mortgage saved: no mortgage, the leg “not set up” with a link to the mortgage page', () => {
    set({ lumpSum: fromPounds(10_000) })
    expect($('[data-tile="mortgage"]')?.textContent).toMatch(/No mortgage/)
    const bar = $('[data-bar="mortgage"]')!
    expect(bar.textContent).toMatch(/No mortgage is set up/)
    expect(bar.querySelector('a')?.getAttribute('href')).toBe('#/c/mortgage')
  })
})

describe('where pay comes from', () => {
  it('the take-home page’s inputs this visit, by default, with the pay and method in the line', () => {
    act(() => takeHome.setInputs(pay(45_000, { pensionMethod: 'salarySacrifice' })))
    remount()
    expect(session.get().inputs.paySource).toEqual({ kind: 'session' })
    expect($('[data-pay-source]')?.textContent).toMatch(/^Using your pay from take-home: £45,000\.00, salary sacrifice/)
  })

  it('several saved: the latest by default; the picker lists them and the result follows the one picked', () => {
    const first = save('optimiser', 'Old pay', pay(40_000))
    vi.setSystemTime(new Date(2026, 9, 23, 13))
    const second = save('optimiser', 'New pay', pay(80_000))
    remount()
    set({ lumpSum: fromPounds(10_000), ageNow: 40 })
    expect(session.get().inputs.paySource).toMatchObject({ kind: 'scenario', id: second.id })
    click(byText(view.host, 'button', 'Change'))
    expect([...select('np-pay-source').options].map((o) => o.textContent)).toEqual(['New pay', 'Old pay'])
    const before = headline()
    choose('np-pay-source', `scenario:${first.id}`)
    expect(session.get().inputs.paySource).toEqual({ kind: 'scenario', id: first.id, name: 'Old pay' })
    expect(session.get().inputs.pay).toEqual(first.inputs)
    expect(headline()).toBe(headlineText(headlineParts(engine()), money))
    expect(headline()).not.toBe(before)
  })

  it('a deleted source: a visible notice, the pay saved with this scenario, and results', () => {
    const { p } = setUp()
    const shown = headline()
    act(() => {
      scenarioStore.remove(p.id)
    })
    settle()
    expect($('[data-source-notice]')?.textContent).toBe('“My pay” is no longer saved, so this uses the pay saved with this scenario.')
    expect(headline()).toBe(shown)
  })

  it('a long scenario name is shown whole and wraps', () => {
    const name = 'A very long name for a take-home scenario that keeps going on and on until it is eighty chars'.slice(0, 80)
    save('optimiser', name, pay(60_000))
    remount()
    expect($('[data-pay-source]')?.textContent).toContain(name)
    expect($('[data-pay-source]')?.className).toMatch(/overflow-wrap:anywhere/)
  })
})

describe('where the mortgage comes from', () => {
  it('the latest saved by default, “Saved: 1 of 2”, and a pick over the saved ones and no mortgage', () => {
    save('mortgage', 'Flat', { ...home, balance: fromPounds(100_000) })
    vi.setSystemTime(new Date(2026, 9, 23, 13))
    const house = save('mortgage', 'House', home)
    remount()
    expect(session.get().inputs.mortgageSource).toMatchObject({ kind: 'scenario', id: house.id })
    expect($('[data-tile="mortgage"]')?.textContent).toMatch(/Saved: 1 of 2/)
    openTile('mortgage')
    expect([...select('np-mortgage-source').options].map((o) => o.textContent)).toEqual(['No mortgage', 'House', 'Flat'])
    choose('np-mortgage-source', 'none')
    expect($('[data-bar="mortgage"]')?.textContent).toMatch(/No mortgage is set up/)
  })

  it('reads only: the scenarios key and the take-home inputs are the same after using the page', () => {
    act(() => takeHome.setInputs(pay(45_000)))
    setUp()
    const stored = localStorage.getItem(STORAGE_KEYS.scenarios.key)
    const theirs = JSON.stringify(takeHome.get())
    click(byText(view.host, 'button', 'Change'))
    choose('np-pay-source', 'session')
    openTile('mortgage')
    choose('np-mortgage-source', 'none')
    set({ lumpSum: fromPounds(20_000) })
    expect(localStorage.getItem(STORAGE_KEYS.scenarios.key)).toBe(stored)
    expect(JSON.stringify(takeHome.get())).toBe(theirs)
  })
})

describe('the decision panel', () => {
  beforeEach(() => setUp())

  it('the title names the lump sum; the headline is the composer’s, in the fixed order', () => {
    expect($('h1')?.textContent).toBe(`Where does the next ${money(fromPounds(10_000))} go?`)
    expect(headline()).toBe(headlineText(headlineParts(engine()), money))
    expect(headline()).toMatch(/Not ranked, and not advice\.$/)
  })

  it('three bars in the fixed order, on one scale, with the lines under them', () => {
    const out = engine()
    expect($$('[data-bar]').map((el) => el.getAttribute('data-bar'))).toEqual(['pension', 'mortgage', 'isa'])
    const { rows } = barRows(out)
    for (const row of rows) {
      const el = $(`[data-bar="${row.leg}"]`)!
      expect(Number(el.getAttribute('data-mid-share'))).toBeCloseTo(row.midShare)
      expect(el.querySelector('[data-leg-line]')?.textContent).toBe(legLine(out, row.leg, money))
    }
    expect(Math.max(...rows.map((r) => r.highShare ?? 0))).toBe(1)
  })

  it('bar order does not follow the values', () => {
    set({ growthLow: '0', growthMid: '0', growthHigh: '0' })
    expect($$('[data-bar]').map((el) => el.getAttribute('data-bar'))).toEqual(['pension', 'mortgage', 'isa'])
  })

  it('the Guaranteed badge on the mortgage only', () => {
    expect($$('[data-badge="guaranteed"]').map((el) => el.closest('[data-bar]')?.getAttribute('data-bar'))).toEqual(['mortgage'])
    expect($('[data-badge="guaranteed"]')?.textContent).toBe('Guaranteed')
  })

  it('every figure in a table, today’s money and nominal', () => {
    click(byText(view.host, 'button, summary', /Show the data as a table/))
    const table = $('[data-np-table]')!
    const out = engine()
    const isa = out.isa.kind === 'shown' ? out.isa.leg : null
    expect(table.textContent).toContain(money(isa!.rates.high.value.nominal))
    expect(table.textContent).toContain(money(isa!.rates.low.value.todaysMoney))
    expect(table.textContent).toMatch(/Nominal/)
  })

  it('the callout: one sentence from the composer, under “What only this page tells you”', () => {
    const facts = calloutFacts(engine())!
    expect($('[data-callout]')?.textContent).toBe(`What only this page tells you${calloutText(facts, money)}`)
    expect($('[data-callout]')?.textContent).not.toContain(CAUSE_CLAUSE)
  })

  it('the callout names the cause only when the personal allowance taper is in play', () => {
    const tapered = save('optimiser', 'Tapered', pay(110_000))
    click(byText(view.host, 'button', 'Change'))
    choose('np-pay-source', `scenario:${tapered.id}`)
    expect(engine().taperInPlay).toBe(true)
    expect($('[data-callout]')?.textContent).toContain(CAUSE_CLAUSE)
  })

  it('the break-even box: “about” each rate, the reversion note when it applies', () => {
    const box = breakEvenBox(engine())
    expect($('[data-break-even] h2')?.textContent).toBe('The ISA would need to return about')
    expect($$('[data-break-even-line]').map((el) => el.textContent)).toEqual(box.lines.map((l) => l.text))
    expect($('[data-reversion-note]')?.textContent).toBe(box.reversionNote)
  })

  it('the sticky result: one line a leg', () => {
    expect($('[data-sticky-value]')?.textContent).toBe(stickyLines(engine(), money).join('\n'))
  })

  it('the footer says what is illustrative and the tax year', () => {
    expect($('[data-footnote]')?.textContent).toMatch(/Growth rates are illustrative/)
    expect($('[data-footnote]')?.textContent).toMatch(/2026 to 2027/)
  })
})

describe('states', () => {
  it('age missing: the pension figure with “Access age not checked”, and its break-even', () => {
    setUp({ ageNow: null })
    expect($('[data-bar="pension"]')?.textContent).toMatch(/Access age not checked: add your age/)
    expect($('[data-break-even-line="pension"]')).not.toBeNull()
  })

  it('age present, not accessible at the horizon: the bar replaced by the sentence, no break-even against it', () => {
    setUp({ horizonYears: 5 })
    expect($('[data-bar="pension"] [data-bar-track]')).toBeNull()
    expect($('[data-bar="pension"]')?.textContent).toMatch(/Not accessible at that horizon/)
    expect($('[data-break-even-omitted="pension"]')?.textContent).toMatch(/not accessible at that horizon/)
    expect(headline()).toMatch(/a pension is not accessible at that horizon/)
  })

  it('age present and accessible: the pension bar and its range', () => {
    setUp({ ageNow: MAX_AGE_YEARS - 30 })
    expect($('[data-bar="pension"] [data-bar-track]')).not.toBeNull()
  })

  it('a mortgage with a charge and a cash remainder says both', () => {
    save('mortgage', 'Charged', { ...home, balance: fromPounds(9_000), erc: true, ercRate: '3', allowanceRate: '1' })
    remount()
    set({ lumpSum: fromPounds(10_000), horizonYears: 20, ageNow: 40 })
    const line = $('[data-bar="mortgage"] [data-leg-line]')?.textContent ?? ''
    expect(line).toBe(legLine(engine(), 'mortgage', money))
    expect(line).toMatch(/is held as cash/)
  })

  it('a mortgage paid off before the horizon', () => {
    setUp({ lumpSum: fromPounds(500_000), horizonYears: 30 })
    expect($('[data-bar="mortgage"] [data-leg-line]')?.textContent).toMatch(/^Balance £0\.00 instead of /)
  })

  it('X of nothing: the title keeps £X, nothing anywhere, not a refusal', () => {
    setUp({ lumpSum: fromPounds(0) })
    expect($('h1')?.textContent).toBe('Where does the next £X go?')
    expect($('[data-refusal]')).toBeNull()
    expect($('[data-callout]')).toBeNull()
  })

  it('the composer refusing a leg by field: that leg’s notice names it; the others show', () => {
    setUp()
    set({ mortgageSource: { kind: 'kept' }, mortgage: { ...home, termYears: 0, termExtraMonths: 0 } })
    expect(engine().mortgage.kind).toBe('refused')
    expect($('[data-bar="mortgage"] [data-refusal="inputs"]')?.textContent).toMatch(/Term left/)
    expect($('[data-bar="isa"] [data-bar-track]')).not.toBeNull()
  })

  it('the composer refusing by unverified config: the refusal notice with the values', () => {
    mocked.config = unverifiedConfig('isa.annualLimit')
    setUp()
    expect($('[data-refusal]')?.textContent).toMatch(/ISA/)
    expect(headline()).toBeUndefined()
  })

  it('growth out of order refuses by field', () => {
    setUp({ growthLow: '6' })
    expect($('[data-refusal-field="growth.mid"]')?.textContent).toMatch(/Mid growth rate/)
  })

  it('very large figures, negative real growth and inflation above growth still read', () => {
    setUp({ lumpSum: fromPounds(5_000_000), growthLow: '-5', growthMid: '-2', growthHigh: '1', inflationRate: '10' })
    expect(headline() ?? $('[data-refusal]')?.textContent).toBeTruthy()
    for (const el of $$('[data-bar]')) expect(Number(el.getAttribute('data-mid-share'))).toBeGreaterThanOrEqual(0)
  })

  it('warnings are grouped by leg and never hidden', () => {
    setUp({ isaPaidThisYear: fromPounds(19_000) })
    expect($('[data-warnings-leg="isa"]')?.textContent).toMatch(/ISA annual limit/)
  })
})

describe('inputs', () => {
  it('the tiles open to normal fields; typing the essentials gives results', () => {
    save('optimiser', 'My pay', pay(60_000))
    remount()
    openTile('lumpSum')
    type(box('np-lump-sum'), '10000')
    openTile('horizonYears')
    type(box('np-horizon'), '20')
    openTile('ageNow')
    type(box('np-age'), '40')
    settle()
    expect(session.get().inputs).toMatchObject({ lumpSum: fromPounds(10_000), horizonYears: 20, ageNow: 40 })
    expect(headline()).toMatch(/^In 20 years, /)
  })

  it('a tile with text that isn’t valid stays open and holds the results', () => {
    openTile('horizonYears')
    type(box('np-horizon'), 'abc')
    settle()
    expect(box('np-horizon')).not.toBeNull()
    expect(text()).toMatch(/No results until the inputs are fixed/)
  })

  it('the sections are closed on a fresh page, each with its summary', () => {
    for (const id of ['growth', 'pension', 'isa', 'date']) {
      expect($(`#np-section-${id}-button`)?.getAttribute('aria-expanded')).toBe('false')
      expect($(`#np-section-${id}-summary`)?.textContent).toBeTruthy()
    }
    expect($('#np-section-date-summary')?.textContent).toBe('Today, 23 October 2026')
  })
})

describe('wording', () => {
  it('nothing on the page ranks or advises, in every state; “wins back” only in the cause clause', () => {
    const cases: Partial<NextPoundPageInputs>[] = [
      {},
      { horizonYears: 5 },
      { ageNow: null },
      { lumpSum: fromPounds(0) },
      { growthLow: '-5', growthMid: '-5', growthHigh: '-5', inflationRate: '10' },
    ]
    setUp()
    for (const patch of cases) {
      set(patch)
      const panel = $('#assumptions') as HTMLDetailsElement
      panel.open = true
      for (const button of $$('[aria-expanded="false"]')) click(button)
      expect(wordingProblems(text())).toEqual([])
    }
  })
})

describe('accessibility', () => {
  it('each bar has a text alternative; inputs have labels; nothing relies on colour', () => {
    setUp()
    for (const el of $$('[data-bar]')) {
      const track = el.querySelector('[data-bar-track]')
      if (track) expect(track.getAttribute('aria-hidden')).toBe('true')
      expect(el.querySelector('[data-bar-value]')?.textContent || el.textContent).toBeTruthy()
    }
    for (const button of $$('[aria-expanded="false"]')) click(button)
    for (const input of $$('input, select')) {
      const el = input as HTMLInputElement
      if (el.type === 'file' || el.type === 'hidden' || el.type === 'radio' || el.type === 'checkbox') continue
      expect(el.id && $(`label[for="${el.id}"]`), el.id).toBeTruthy()
    }
    expect($('[data-badge="guaranteed"]')?.textContent).toBe('Guaranteed')
  })
})

describe('scenarios', () => {
  it('save with the picked sources, and load back with the same results', () => {
    const { p, m } = setUp()
    const shown = headline()
    click(byText(view.host, 'button', 'Save'))
    click(byText(view.host, 'form button', 'Save'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    const mine = stored.scenarios.find((s: { calculatorId: string }) => s.calculatorId === 'next-pound')
    expect(mine).toMatchObject({ inputsVersion: 2, taxYear: '2026-27' })
    expect(mine.inputs.paySource).toEqual({ kind: 'scenario', id: p.id, name: 'My pay' })
    expect(mine.inputs.mortgageSource).toEqual({ kind: 'scenario', id: m.id, name: 'Home' })
    act(() => session.startNew())
    settle()
    act(() => session.load(scenarioStore.get().scenarios.find((s) => s.calculatorId === 'next-pound')!))
    settle()
    expect(headline()).toBe(shown)
  })

  it('adds no storage key', () => {
    setUp()
    for (let i = 0; i < localStorage.length; i++) expect(Object.values(STORAGE_KEYS).map((k) => k.key)).toContain(localStorage.key(i))
  })
})
