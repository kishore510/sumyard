// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { formatGBP, formatPercent } from '@/lib/format'
import { MAX_CAR_OPTIONS } from '@/lib/inputLimits'
import { fromPence, fromPounds, type Money } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { compareOptions } from '../car-ownership/calc'
import type { Comparison, OwnershipResult, ValueCase } from '../car-ownership/types'
import { sessionFor } from '../session'
import CarDecisionPage from './CarDecisionPage'
import { type CarDecisionInputs, carDecisionCalculator, type OptionInputs, toEngineOption } from './definition'
import { blank, cash, hp, inputs, keep, keepOwing, loan, ownerPage, pcp } from './fixtures/inputs'

/*
 * The car decision page at #/c/car-decision, continued from
 * CarDecisionPage.test.tsx: scenarios, the property test, words, 3d-1, 3d-1.1
 * and 3e. Split in 3d-2 so each file runs in its own worker: happy-dom keeps
 * every unmounted page with a native select alive, and one file had grown
 * close to the worker's memory (docs/backlog.md). Every expected figure
 * comes from the engine. Amounts and rates are made up.
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

const example = inputs([keep(), loan(), pcp()])

function engine(i: CarDecisionInputs = session.get().inputs): Comparison {
  const outcome = compareOptions(
    i.options.map((o) => toEngineOption(o, percentRatio(i.generalIncrease!))),
    { horizonMonths: i.horizonMonths, savingsReturn: percentRatio(i.savingsReturn!) },
  )
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const cards = () => $$('[data-option-card]')
const card = (index: number) => $(`[data-option-card][data-option-index="${index}"]`)!
const editors = () => $$('[data-option-editor]')
const editor = (index: number) => editors()[index]!
const field = (index: number, suffix: string) => $(`[id$="-${suffix}"]`, editor(index)) as HTMLInputElement
function expectCard(index: number, result: OwnershipResult, valueCase: ValueCase) {
  const c = result.cases[valueCase]
  const el = card(index)
  expect(text($('[data-headline]', el))).toBe(money(c.netCostPerCoverageMonth))
  expect(text($('[data-total]', el))).toBe(money(c.netCost))
  expect(text($('[data-cash-out]', el))).toBe(money(c.cashOut))
  expect(text($('[data-opportunity]', el))).toBe(money(c.breakdown.opportunityCost))
  expect(text($('[data-coverage]', el))).toContain(`${result.coverageMonths} of ${result.horizonMonths} months`)
  if (result.fullCoverage) expect(text($('[data-equity]', el))).toBe(money(c.months.at(-1)!.equity))
}

describe('scenarios', () => {
  it('saves through the page with no tax year, loads back, and compare rows name each option', () => {
    set(example)
    click(byText(view.host, 'button', 'Save'))
    click(byText(view.host, 'form button', 'Save'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'car-decision', inputsVersion: 3, inputs: example })
    expect(Object.hasOwn(stored.scenarios[0], 'taxYear')).toBe(false)
    act(() => session.startNew())
    expect(session.get().inputs).toEqual(carDecisionCalculator.defaultInputs())
    act(() => session.load(scenarioStore.get().scenarios[0]!))
    expect(session.get().inputs).toEqual(example)
    for (const [i, option] of engine().options.entries()) expectCard(i, option, 'expected')
    const summary = carDecisionCalculator.summarise(example, undefined as never)
    const labels = summary.results.ok ? summary.results.rows.map((r) => r.label) : []
    expect(labels).toContain('PCP: average cost per month owned')
    expect(view.host.textContent).toContain('Uses no tax rules')
  })
})

/** A small seeded generator (mulberry32), so the property run is the same every time. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('property', () => {
  it('over 150 random valid inputs every card figure is the engine’s', () => {
    const random = seeded(3_031)
    const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
    const pounds = (lo: number, hi: number) => fromPence(int(lo * 100, hi * 100))
    const pctText = (lo: number, hi: number) => String(int(lo * 100, hi * 100) / 100)
    const kinds = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp'] as const
    const cases = ['low', 'expected', 'high'] as const
    let compared = 0
    for (let n = 0; n < 150; n++) {
      const options = Array.from({ length: int(1, MAX_CAR_OPTIONS) }, (): OptionInputs => {
        const price = int(2_000, 40_000)
        const ends = [int(0, price), int(0, price), int(0, price)].sort((a, b) => a - b)
        const deposit = int(0, Math.floor(price / 2))
        const base: OptionInputs = {
          ...cash(),
          name: `Car ${n}`,
          acquisition: kinds[int(0, kinds.length - 1)]!,
          value: fromPounds(price),
          endLow: fromPounds(ends[0]!),
          endExpected: fromPounds(ends[1]!),
          endHigh: fromPounds(ends[2]!),
          annualMileage: int(0, 20_000),
          fuelPriceChange: pctText(-5, 8),
          insurance: pounds(0, 1_500),
          maintenance: pounds(0, 1_500),
          ved: pounds(0, 600),
          other: pounds(0, 300),
          loanAmount: fromPounds(int(1, price)),
          deposit: fromPounds(deposit),
          term: int(6, 72),
          rate: pctText(0, 15),
          basis: random() < 0.5 ? 'annual' : 'monthly',
          arrangementFee: pounds(0, 300),
          arrangementFeeTiming: random() < 0.5 ? 'start' : 'added',
          balloon: fromPounds(int(0, Math.floor((price - deposit) / 3))),
          optionFee: pounds(0, 20),
          finalPayment: fromPounds(int(0, Math.floor((price - deposit) / 2))),
          purchaseFee: pounds(0, 20),
          pcpEnd: random() < 0.5 ? 'buy' : 'hand-back',
          mileageAllowance: int(0, 20_000),
          excessPerMile: int(0, 30),
        }
        return base
      })
      const i = inputs(options, {
        horizonMonths: int(1, 60),
        valueCase: cases[int(0, 2)]!,
        savingsReturn: pctText(0, 8),
        generalIncrease: pctText(-3, 8),
      })
      expect(carDecisionCalculator.validateInputs(i).ok, JSON.stringify(i)).toBe(true)
      set(i)
      const outcome = compareOptions(
        i.options.map((o) => toEngineOption(o, percentRatio(i.generalIncrease!))),
        { horizonMonths: i.horizonMonths, savingsReturn: percentRatio(i.savingsReturn!) },
      )
      if (!outcome.ok) continue
      compared++
      for (const [k, option] of outcome.result.options.entries()) expectCard(k, option, i.valueCase)
    }
    expect(compared).toBeGreaterThanOrEqual(120)
    // Each case renders the whole page (up to four editors and cards) in happy-dom: about 15 seconds here, so a wider limit than the default.
  }, 60_000)
})

describe('words', () => {
  const BANNED = /\b(best|recommended|cheapest|cheaper|guaranteed|should|winner|optimal)\b|will be worth/i

  it('the page never uses the banned words (filled, assumptions open, flips shown, a refusal, missing inputs)', () => {
    vi.useFakeTimers()
    set(example)
    click($('#cd-section-sensitivity-button'))
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    act(() => vi.runAllTimers())
    ;($('details#assumptions') as HTMLDetailsElement).open = true
    expect($('[data-sensitivity-option]')).not.toBeNull()
    expect($('[data-readout]')).not.toBeNull()
    expect(view.host.textContent).not.toMatch(BANNED)
    set(inputs([cash(), hp({ deposit: fromPounds(18_000) }), blank('pcp')]))
    expect(view.host.textContent).not.toMatch(BANNED)
    set(ownerPage())
    expect(view.host.textContent).not.toMatch(BANNED)
    set(inputs([cash({ name: 'A' }), cash({ name: 'B' })]))
    expect(view.host.textContent).not.toMatch(BANNED)
  })

  it('nor do the page’s sources, the engines’ assumptions or the Help topic', () => {
    const here = import.meta.dirname
    for (const file of [
      'CarDecisionPage.tsx',
      'OptionEditor.tsx',
      'CarResults.tsx',
      'CarViews.tsx',
      'CarAnswer.tsx',
      'narrative.ts',
      'definition.ts',
      'results.ts',
      'rates.ts',
      'chart.ts',
      'sensitivity.ts',
    ])
      expect(readFileSync(join(here, file), 'utf8'), file).not.toMatch(BANNED)
    const result = engine(example)
    for (const line of [...result.assumptions, ...result.options.flatMap((o) => [...o.assumptions, ...(o.finance?.assumptions ?? [])])])
      expect(line).not.toMatch(BANNED)
    expect(readFileSync(join(here, '../../../content/help/car-decision.md'), 'utf8')).not.toMatch(BANNED)
  })
})

describe('the answer first (3d-1)', () => {
  it('the results column opens with the verdict, then the bottom line, the three cases, then the order', () => {
    set(ownerPage())
    const results = $('[data-results]')!
    const panels = [...results.querySelectorAll('section[aria-labelledby]')].filter((el) => el.parentElement?.closest('section') === null)
    expect(panels.map((el) => el.getAttribute('aria-labelledby'))).toEqual([
      'cd-verdict-title',
      'cd-bottom-title',
      'cd-scenarios-title',
      // 3d-2: where the difference comes from, under the verdict's panels.
      'cd-bridge-title',
      'cd-order-title',
    ])
    expect(text($('[data-verdict]'))).toBe(
      'Current car has the lowest net cost under these assumptions: £182.26 a month less than New car PCP, £8,748.56 over 48 months. ' +
        'It uses a savings return of 0% a year, so tying up cash costs nothing in this comparison.',
    )
    expect($$('[data-switch-cost]').map(text)).toEqual([
      'Switching to New car PCP costs £182.26 a month more than keeping Current car: £8,748.56 more over 48 months.',
    ])
    // The switch line names the same pair, so the bottom line leaves the alternative out (3d-1.1).
    expect($('[data-bottom-row="alternative"]')).toBeNull()
    expect(text($('[data-scenario-sentence]'))).toBe('Current car has the lowest net cost in all three end-value cases.')
    // The phone bar carries the verdict in short.
    expect(text($('[data-sticky-value]'))).toBe('Current car, £182.26 a month less than New car PCP')
  })

  it('cards keep their detail, headed by the average cost per month owned, its largest part and the money in and out', () => {
    set(ownerPage())
    const [keepCard, pcpCard] = [card(0), card(1)]
    expect(keepCard.textContent).toContain('Average cost per month owned')
    expect(text($('[data-headline]', keepCard))).toBe('£379.85')
    expect(text($('[data-headline]', pcpCard))).toBe('£562.11')
    expect(text($('[data-largest]', pcpCard))).toBe('Largest part of the cost: Depreciation (£21,000.00 of £26,981.20)')
    expect(text($('[data-upfront]', pcpCard))).toBe('£13,000.00')
    expect(text($('[data-monthly]', pcpCard))).toBe('£208.33 a month')
    expect(text($('[data-final]', pcpCard))).toBe('£20,000.00')
    expect(pcpCard.querySelector('[data-money-flows]')!.textContent).toContain('with a £10.00 purchase fee')
    expect(text($('[data-upfront]', keepCard))).toBe('£0.00')
    expect($('[data-monthly]', keepCard)).toBeNull()
    expect($('[data-final]', keepCard)).toBeNull()
    // The detail stays below.
    for (const marker of ['[data-total]', '[data-coverage]', '[data-equity]', '[data-cash-out]', '[data-opportunity]'])
      expect($(marker, pcpCard), marker).not.toBeNull()
  })

  it('the effective rate says which fees it includes', () => {
    set(ownerPage())
    expect(text($('[data-rate-fees]', card(1)))).toMatch(/^It includes any arrangement or documentation fee/)
  })

  it('no verdict for a single option, with the reason in the bar', () => {
    set(inputs([cash({ name: 'A' })]))
    expect($('[data-sticky-value]')).toBeNull()
    expect(view.host.textContent).toContain('No verdict: one option only')
    expect(text($('[data-verdict]'))).toMatch(/^No verdict: there is only one option/)
  })

  it('one polite announcement of the verdict once the inputs settle', () => {
    vi.useFakeTimers()
    set(ownerPage())
    set(ownerPage({ valueCase: 'low' }))
    const live = $('[data-sticky-announcer]')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    act(() => vi.advanceTimersByTime(SETTLE_MS / 2))
    expect(text(live)).toBe('')
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(text(live)).toMatch(/^Current car has the lowest net cost under these assumptions/)
    expect(document.querySelectorAll('[aria-live]').length).toBe(1)
  })

  it('plain-English labels: what the kept car is worth today, the expected value at the end', () => {
    set(ownerPage())
    expect(view.host.textContent).toContain('What is the car worth today?')
    expect(view.host.textContent).toContain('Expected value at the end')
    expect(view.host.textContent).toContain('Low value at the end')
    expect(view.host.textContent).toContain('High value at the end')
  })
})

describe('3d-1.1 fixes', () => {
  const ZERO_POUNDS = fromPounds(0)

  it('a card lists its running-cost boxes left empty; none when all are filled', () => {
    set(inputs([cash({ name: 'A' }), cash({ name: 'B', insurance: ZERO_POUNDS, ved: ZERO_POUNDS })]))
    expect($('[data-empty-costs]', card(0))).toBeNull()
    expect(text($('[data-empty-costs]', card(1)))).toBe('Left empty, counted as nothing: insurance and VED.')
  })

  it('a line under the verdict when the options differ in which boxes are empty, naming each', () => {
    set(inputs([cash({ name: 'A' }), cash({ name: 'B', insurance: ZERO_POUNDS, ved: ZERO_POUNDS })]))
    const note = $('[data-empty-costs-differ]')!
    expect(note.closest('[data-verdict-panel]')).not.toBeNull()
    expect(text(note)).toBe(
      'Running costs left empty differ between the options (an empty box counts as nothing): A, none; B, insurance and VED.',
    )
  })

  it('no line under the verdict when every box is filled, or the same boxes are empty in each', () => {
    set(inputs([cash({ name: 'A' }), cash({ name: 'B', value: fromPounds(19_000) })]))
    expect($('[data-empty-costs-differ]')).toBeNull()
    set(inputs([cash({ name: 'A', other: ZERO_POUNDS }), cash({ name: 'B', value: fromPounds(19_000), other: ZERO_POUNDS })]))
    expect($('[data-empty-costs-differ]')).toBeNull()
    for (const c of cards()) expect(text($('[data-empty-costs]', c))).toBe('Left empty, counted as nothing: other costs.')
  })

  it('every cell of the side-by-side table reads as its card does for the same measure', () => {
    // A handed-back PCP (no equity), an APR, an effective rate and no finance, over a long horizon.
    set(
      inputs([keep({ name: 'Old' }), loan({ name: 'Loan' }), pcp({ name: 'Merc', pcpEnd: 'hand-back', term: 24 }), pcp({ name: 'Buy' })], {
        horizonMonths: 121,
      }),
    )
    const table = $('[data-compare-table]')!
    const order = cards().map((c) => Number(c.getAttribute('data-option-index')))
    const row = (label: string) => $$('tbody tr', table).find((tr) => text(tr.querySelector('th')) === label)!
    const measures: [string, string][] = [
      ['Average cost per month owned', '[data-headline]'],
      ['Total net cost', '[data-total]'],
      ['Coverage', '[data-coverage]'],
      ['Equity at the horizon', '[data-equity]'],
      ['Cash out', '[data-cash-out]'],
      ['Opportunity cost', '[data-opportunity]'],
    ]
    for (const [label, marker] of measures) {
      const cells = $$('td', row(label))
      order.forEach((index, k) => {
        expect(text(cells[k]), `${label}, option ${index}`).toBe(text($(marker, card(index))))
      })
    }
    const rates = $$('td', row('Rate'))
    order.forEach((index, k) => {
      const shown = $('[data-rate-value]', card(index))
      if (shown) expect(text($('[data-rate-value]', rates[k]!)), `rate, option ${index}`).toBe(text(shown))
    })
    expect(text($('[data-coverage]', card(2)))).toBe('24 of 121 months')
    expect(text($('[data-coverage]', card(0)))).toBe('121 of 121 months')
  })

  it('the side-by-side table: its first column stays opaque and wraps, the other columns keep a minimum width', () => {
    set(example)
    const table = $('[data-compare-table]')!
    expect(table.className).not.toMatch(/min-w-max/)
    for (const th of $$('tbody th', table)) expect(th.className).toMatch(/sticky.*bg-surface|bg-surface.*sticky/)
    for (const th of $$('tbody th', table)) expect(th.className).toMatch(/\bmin-w-/)
    for (const td of $$('td', table)) expect(td.className).toMatch(/\bmin-w-/)
  })

  it('cards align to the top: a short card is not stretched to the tallest', () => {
    set(example)
    expect($('[data-cards]')!.className).toMatch(/\bitems-start\b/)
  })

  it('the three-case table’s Option header does not wrap', () => {
    set(ownerPage())
    const header = $$('[data-scenario-table] thead th').find((th) => text(th) === 'Option')!
    expect(header.className).toMatch(/whitespace-nowrap/)
  })

  it('the phone bar’s verdict wraps a long unbroken option name instead of widening the page', () => {
    set(inputs([keep({ name: 'Old' }), cash({ name: 'L'.repeat(80), value: fromPounds(19_000) })]))
    expect(text($('[data-sticky-value]'))).toContain('L'.repeat(80))
    expect($('[data-sticky-value]')!.className).toMatch(/\[overflow-wrap:anywhere\]/)
  })

  it('the chart legend names each option without a “(line)” suffix', () => {
    set(example)
    const legend = $('[data-crossover] ul')!
    expect(legend.textContent).not.toMatch(/\(line\)/)
    for (const name of example.options.map((o) => o.name)) expect(legend.textContent).toContain(name)
  })
})

describe('finance still owed on a kept car (3e)', () => {
  const owing = inputs([keepOwing(), cash()])
  const box = (suffix: string) => field(0, suffix)
  const label = (input: Element) => text($(`label[for="${input.id}"]`))
  const hint = (input: Element) => text($(`[id="${input.id}-hint"]`))
  const BOXES = ['settlement', 'owed-payment', 'payments-left', 'owed-final-payment']

  it('the Keep option’s finance section has the switch, off, and no boxes until it is on', () => {
    set(inputs([keep(), cash()]))
    expect($('[data-section$="-finance"]', editor(0))).not.toBeNull()
    expect($('[data-section$="-finance"]', editor(1))).toBeNull()
    const toggle = box('owes-finance')
    expect(toggle.getAttribute('role')).toBe('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(text(toggle)).toBe('Still owe finance on it?')
    for (const suffix of BOXES) expect(box(suffix), suffix).toBeNull()
    expect(text($('[id$="-finance-summary"]', editor(0)))).toBe('No finance owed')
  })

  it('switching on shows the four boxes after the switch, in order, with plain labels and hints with no figures', () => {
    set(inputs([keep(), cash()]))
    click(box('owes-finance'))
    expect(session.get().inputs.options[0]!.owesFinance).toBe(true)
    expect(box('owes-finance').getAttribute('aria-checked')).toBe('true')
    const boxes = BOXES.map(box)
    expect(boxes.map(label)).toEqual([
      'What does the lender say you owe to clear it today?',
      'How much do you pay each month?',
      'How many payments are left?',
      'Any final payment due at the end? Enter 0 if none.',
    ])
    expect(hint(boxes[0]!)).toMatch(/lender’s current settlement quote/i)
    for (const b of boxes) expect(hint(b), b.id).not.toMatch(/\d/)
    expect(hint(boxes[3]!)).toMatch(/empty box counts as nothing/i)
    expect(boxes[3]!.getAttribute('placeholder')).toBe('0')
    // Keyboard order: the switch, then each box, in the document's order.
    const order = $$('button[role="switch"], input', editor(0)).map((el) => el.id)
    const at = (id: string) => order.indexOf(id)
    expect(at(box('owes-finance').id)).toBeLessThan(at(boxes[0]!.id))
    for (let k = 1; k < boxes.length; k++) expect(at(boxes[k - 1]!.id)).toBeLessThan(at(boxes[k]!.id))
  })

  it('every box shown must be filled before costing, except the final payment, which reads as nothing', () => {
    set(inputs([keep({ owesFinance: true }), cash()]))
    const missing = $('[data-card-missing]', card(0))
    expect(text(missing)).toContain('Settlement figure')
    expect(text(missing)).toContain('Monthly payment')
    expect(text(missing)).toContain('Payments left')
    expect(text(missing)).not.toContain('Final payment')
    set(inputs([keepOwing({ owedPayment: fromPounds(320), owedFinalPayment: fromPounds(0) }), cash()]))
    expect($('[data-headline]', card(0))).not.toBeNull()
    expect(box('owed-final-payment').value).toBe('')
  })

  it('the card: the engine’s figures, money in and out with the payments left and the final payment, the implied rate', () => {
    set(owing)
    const result = engine()
    expectCard(0, result.options[0]!, 'expected')
    const el = card(0)
    expect(text($('[data-upfront]', el))).toBe(money(fromPounds(0)))
    expect(text($('[data-monthly]', el))).toBe(`${money(fromPounds(260))} a month`)
    expect(text($('[data-money-flows]', el))).toContain('24 payments left')
    expect(text($('[data-final]', el))).toBe(money(fromPounds(1_500)))
    const rate = $('[data-rate]', el)!
    expect(rate.getAttribute('data-rate-kind')).toBe('implied')
    expect(text(rate)).toContain('Implied rate from your figures, not the lender’s APR')
    const finance = result.options[0]!.finance!
    if (!finance.effectiveRate.ok) throw new Error('no rate')
    expect(text($('[data-rate-value]', rate))).toBe(formatPercent(finance.effectiveRate.annual))
    expect($('[data-negative-equity-now]', el)).toBeNull()
  })

  it('flags negative equity now when the settlement is above the car’s value', () => {
    set(inputs([keepOwing({ settlement: fromPounds(9_500), owedPayment: fromPounds(360) }), cash()]))
    expect(text($('[data-negative-equity-now]', card(0)))).toMatch(/more than the car is worth today/i)
  })

  it('a refusal names the box: payments that don’t cover the settlement', () => {
    set(inputs([keepOwing({ owedPayment: fromPounds(200), owedFinalPayment: fromPounds(0) }), cash()]))
    expect(text($('[data-option-problems]', editor(0)))).toContain('Monthly payment')
    expect(text(card(0))).toMatch(/less than the settlement figure/)
    expect($('[data-headline]', card(1))).not.toBeNull()
  })

  it('the verdict, the switch line, the bottom line and the three cases work with it', () => {
    set(owing)
    const result = engine()
    const names = ['Keep, still paying', 'Buy outright']
    const lowest = result.ranking.expected.full[0]!.option
    expect(text($('[data-verdict]'))).toContain(`${names[lowest]} has the lowest net cost`)
    expect(text($('[data-switch-cost]'))).toContain('Switching to Buy outright costs')
    expect($$('[data-scenario-table] tbody tr')).toHaveLength(2)
  })

  it('the chart marks the end of the payments inside the horizon', () => {
    set(owing)
    expect(text($('[data-crossover] [data-marker-list]'))).toContain('Keep, still paying: finance term ends at month 24')
  })

  it('a section summary says what is owed', () => {
    set(owing)
    const summary = text($('[id$="-finance-summary"]', editor(0)))
    expect(summary).toContain(`settle ${money(fromPounds(7_200))}`)
    expect(summary).toContain('24 payments left')
  })

  it('saved and loaded back with the scenario', () => {
    set(owing)
    const stored = carDecisionCalculator.validateInputs(JSON.parse(JSON.stringify(session.get().inputs)))
    expect(stored).toEqual({ ok: true, inputs: owing })
  })
})
