// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { formatGBP, formatPence, formatPercentFixed } from '@/lib/format'
import { MAX_CAR_OPTIONS } from '@/lib/inputLimits'
import { APR_DISPLAY_DIGITS, fromPence, fromPounds, type Money, roundRatio, toPence } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { compareOptions, costPerMile } from '../car-ownership/calc'
import type { Comparison, OwnershipResult, ValueCase } from '../car-ownership/types'
import { sessionFor } from '../session'
import CarDecisionPage from './CarDecisionPage'
import { type CarDecisionInputs, carDecisionCalculator, type OptionInputs, toEngineOption } from './definition'
import { blank, cash, electric, hp, inputs, keep, loan, pcp, perMile } from './fixtures/inputs'

/*
 * Slice 3c-1: the car decision page at #/c/car-decision. Every expected
 * figure comes from the engine (compareOptions), formatted as the page
 * formats it; nothing is worked out here. Amounts and rates are made up.
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
const choose = (within: ParentNode, name: string, label: string) =>
  click($$(`input[name$="${name}"]`, within).find((input) => text(input.closest('label')) === label))
const chooseCase = (label: 'Low' | 'Expected' | 'High') => choose($('[data-shared-controls]')!, 'cd-case', label)

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

describe('the page', () => {
  it('has the calculator’s name, its summary, and says it uses no tax rules (no tax year, no verified badge)', () => {
    expect(text($('h1'))).toBe(carDecisionCalculator.name)
    expect($$('[data-no-tax-rules]').length).toBeGreaterThan(0)
    expect($('[data-verified]')).toBeNull()
    expect(view.host.textContent).not.toMatch(/tax year/i)
  })

  it('starts with every amount and rate empty, asks for the shared assumptions and shows no figure', () => {
    for (const input of $$('[data-option-editor] input[type="text"]') as HTMLInputElement[]) expect(input.value, input.id).toBe('')
    expect(($('#cd-savings') as HTMLInputElement).value).toBe('')
    expect(text($('[data-results-waiting]'))).toMatch(/savings return/i)
    expect(cards().every((c) => $('[data-headline]', c) === null)).toBe(true)
  })

  it('each card’s figures are the engine’s, in the expected case by default', () => {
    set(example)
    const result = engine()
    for (const [i, option] of result.options.entries()) expectCard(i, option, 'expected')
  })

  it('switching the case changes every card to that case, and the choice is stored with the inputs', () => {
    set(example)
    const result = engine()
    chooseCase('Low')
    expect(session.get().inputs.valueCase).toBe('low')
    for (const [i, option] of result.options.entries()) expectCard(i, option, 'low')
    expect(text($('[data-headline]', card(0)))).not.toBe(money(result.options[0]!.cases.expected.netCostPerCoverageMonth))
    chooseCase('High')
    for (const [i, option] of result.options.entries()) expectCard(i, option, 'high')
  })

  it('the horizon changes coverage: a PCP handed back covers its term and is flagged when that is under the horizon', () => {
    set(inputs([cash(), pcp({ pcpEnd: 'hand-back', term: 36 })], { horizonMonths: 48 }))
    expect(text($('[data-coverage]', card(1)))).toContain('36 of 48 months')
    expect($('[data-coverage-flag]', card(1))).not.toBeNull()
    expect($('[data-coverage-flag]', card(0))).toBeNull()
    set({ horizonMonths: 36 })
    expect(text($('[data-coverage]', card(1)))).toContain('36 of 36 months')
    expect($('[data-coverage-flag]', card(1))).toBeNull()
  })

  it('the horizon box and slider set the same horizon; years show whole years', () => {
    type($('#cd-horizon') as HTMLInputElement, '30')
    expect(session.get().inputs.horizonMonths).toBe(30)
    expect(($('#cd-horizon-range') as HTMLInputElement).value).toBe('30')
    choose($('[data-shared-controls]')!, 'cd-horizon-unit', 'Years')
    expect(session.get().inputs.horizonMonths % 12).toBe(0)
    type($('#cd-horizon') as HTMLInputElement, '5')
    expect(session.get().inputs.horizonMonths).toBe(60)
  })
})

describe('ordering', () => {
  it('cards follow the engine’s ranking, full coverage first; partial options come after, unranked, with the rule in words', () => {
    const i = inputs([cash(), pcp({ pcpEnd: 'hand-back', term: 36 }), keep(), loan()], { horizonMonths: 48 })
    set(i)
    const ranking = engine(i).ranking.expected
    const order = cards().map((c) => Number(c.getAttribute('data-option-index')))
    expect(order).toEqual([...ranking.full.map((e) => e.option), ...ranking.partial.map((e) => e.option)])
    expect(order.at(-1)).toBe(1)
    const rule = text($('[data-ordering-rule]'))
    expect(rule).toMatch(/net cost per month of coverage, lowest first/i)
    expect(rule).toMatch(/not ordered against/i)
    expect(rule).toMatch(/under these assumptions/i)
  })

  it('a partial option with the lowest net cost per month still comes after every full-coverage option', () => {
    const cheapHandBack = pcp({
      name: 'Short PCP',
      pcpEnd: 'hand-back',
      term: 24,
      value: fromPounds(8_000),
      endExpected: fromPounds(5_000),
      deposit: fromPounds(500),
      finalPayment: fromPounds(5_000),
      rate: '0',
    })
    const dear = cash({ name: 'Dear car', value: fromPounds(40_000), endLow: fromPounds(8_000), endExpected: fromPounds(10_000) })
    const i = inputs([cheapHandBack, dear, keep()], { horizonMonths: 48 })
    set(i)
    const result = engine(i)
    const perMonth = (k: number) => toPence(result.options[k]!.cases.expected.netCostPerCoverageMonth)
    // The precondition: the partial option is cheaper per month than a full one, so only the coverage rule puts it last.
    expect(result.options[0]!.fullCoverage).toBe(false)
    expect(perMonth(0)).toBeLessThan(perMonth(1))
    expect(cards().map((c) => Number(c.getAttribute('data-option-index'))).at(-1)).toBe(0)
    expect(text($('[data-headline]', card(0)))).toBe(money(result.options[0]!.cases.expected.netCostPerCoverageMonth))
  })

  it('states ties', () => {
    set(inputs([cash({ name: 'Red' }), cash({ name: 'Blue' })]))
    expect(text($('[data-ties]'))).toMatch(/Red and Blue.*tied/)
  })

  it('the sticky figure is the lowest net cost per month of coverage, under these assumptions', () => {
    set(example)
    const result = engine()
    const first = result.ranking.expected.full[0]!
    expect(text($('[data-sticky-value]'))).toContain(money(result.options[first.option]!.cases.expected.netCostPerCoverageMonth))
    expect(view.host.textContent).toMatch(/lowest net cost under these assumptions/i)
  })
})

describe('cards', () => {
  it('the breakdown has every part, each the engine’s, and the parts add up to the net cost', () => {
    set(inputs([cash(), loan(), pcp({ pcpEnd: 'hand-back', term: 36 })]))
    const result = engine()
    result.options.forEach((option, index) => {
      const b = option.cases.expected.breakdown
      const rows = $$('table tbody tr', card(index)).map((tr) => [text(tr.querySelector('th')), text(tr.querySelector('td'))])
      const expected: [string, Money][] = [
        ['Interest and fees', b.interestAndFees],
        ['Depreciation', b.depreciation],
        ['Equity handed back', b.equityHandedBack],
        ['Fuel or energy', b.fuel],
        ['Insurance', b.insurance],
        ['Maintenance', b.maintenance],
        ['VED', b.ved],
        ['Other', b.other],
        ['Opportunity cost', b.opportunityCost],
      ]
      expect(rows).toEqual(expected.filter(([, v]) => toPence(v) !== 0).map(([l, v]) => [l, money(v)]))
      const sum = expected.reduce((total, [, v]) => total + toPence(v), 0)
      expect(sum).toBe(toPence(option.cases.expected.netCost))
      const drawn = $$('[data-segment]', card(index)).map((g) => Number(g.getAttribute('data-value')))
      if (drawn.length > 0) expect(drawn.reduce((a, v) => a + v, 0)).toBe(toPence(option.cases.expected.netCost))
    })
  })

  it('shows equity at the horizon, and flags negative equity', () => {
    // A long loan on a car that loses most of its value: still owing more than it is worth at the horizon.
    const i = inputs([loan({ term: 84, loanAmount: fromPounds(18_000), endExpected: fromPounds(3_000), endLow: fromPounds(2_000) })], {
      horizonMonths: 24,
    })
    set(i)
    const c = engine(i).options[0]!.cases.expected
    const equity = c.months.at(-1)!.equity
    expect(toPence(equity)).toBeLessThan(0)
    expect(text($('[data-equity]', card(0)))).toBe(money(equity))
    expect(text($('[data-negative-equity]', card(0)))).toMatch(/negative equity/i)
    set({ options: [cash()] })
    expect($('[data-negative-equity]', card(0))).toBeNull()
  })

  it('a car handed back has no car, so no equity, at the horizon', () => {
    set(inputs([pcp({ pcpEnd: 'hand-back', term: 24 })], { horizonMonths: 36 }))
    expect(text($('[data-equity]', card(0)))).toMatch(/handed back/i)
  })

  it('cards are in a row that scrolls on phones, focusable by keyboard, with a visible hint, each card reachable', () => {
    set(example)
    const row = $('[data-cards]')!
    expect(row.getAttribute('tabindex')).toBe('0')
    expect(row.className).toMatch(/snap-x/)
    expect(row.getAttribute('aria-labelledby') ?? row.getAttribute('aria-label')).toBeTruthy()
    expect(text($('[data-scroll-hint]'))).toMatch(/scroll/i)
    for (const c of cards()) expect(c.getAttribute('tabindex')).toBe('0')
  })

  it('a comparison table below holds the same figures, as the accessible equivalent', () => {
    set(example)
    const result = engine()
    const table = $('[data-compare-table]')!
    expect(table.closest('[tabindex="0"]')).not.toBeNull()
    const header = $$('thead th', table).map(text)
    const order = cards().map((c) => Number(c.getAttribute('data-option-index')))
    expect(header.slice(1)).toEqual(order.map((i) => example.options[i]!.name))
    const net = $$('tbody tr', table).find((tr) => text(tr.querySelector('th')) === 'Net cost per month of coverage')!
    expect($$('td', net).map(text)).toEqual(order.map((i) => money(result.options[i]!.cases.expected.netCostPerCoverageMonth)))
  })
})

describe('rates', () => {
  it('a plain loan shows the engine’s APR; a PCP shows the effective rate, labelled not the lender’s APR', () => {
    set(example)
    const result = engine()
    const loanRate = $('[data-rate]', card(1))!
    expect(loanRate.getAttribute('data-rate-kind')).toBe('apr')
    const finance = result.options[1]!.finance!
    if (!finance.effectiveRate.ok) throw new Error('no rate')
    expect(text(loanRate)).toContain(formatPercentFixed(roundRatio(finance.effectiveRate.annual, APR_DISPLAY_DIGITS, 'nearest'), 1))
    expect(text(loanRate)).toMatch(/APR/)
    const pcpRate = $('[data-rate]', card(2))!
    expect(pcpRate.getAttribute('data-rate-kind')).toBe('effective')
    expect(text(pcpRate)).toMatch(/effective interest rate, not the lender’s APR/i)
    expect($('[data-rate]', card(0))).toBeNull()
  })

  it('an APR is shown to one fixed decimal place, so a whole rate keeps its .0', () => {
    set(inputs([loan({ rate: '10', basis: 'annual' })]))
    expect(text($('[data-rate]', card(0)))).toContain('10.0%')
  })

  it('HP shows the APR with no option fee, and the effective rate with one', () => {
    set(inputs([hp(), hp({ optionFee: fromPounds(10) })]))
    expect($('[data-rate]', card(0))!.getAttribute('data-rate-kind')).toBe('apr')
    expect($('[data-rate]', card(1))!.getAttribute('data-rate-kind')).toBe('effective')
  })
})

describe('what changes the answer', () => {
  const settle = () => act(() => vi.advanceTimersByTime(SETTLE_MS))

  it('once the inputs settle: end value, savings return and mileage thresholds in words, each saying what is held fixed', () => {
    vi.useFakeTimers()
    set(inputs([cash({ name: 'Newer car' }), keep({ name: 'Older car' })]))
    settle()
    const flips = $('[data-flips]')!
    const sentences = ['value-0', 'value-1', 'savings', 'mileage'].map((id) => text($(`[data-flip="${id}"]`, flips)))
    for (const sentence of sentences) {
      expect(sentence.length, sentence).toBeGreaterThan(0)
      expect(sentence).toMatch(/everything else as entered|held as entered/i)
    }
    expect(sentences[3]).toMatch(/if both cars are driven the same distance, as one driver/i)
    expect(text(flips)).toMatch(/Newer car/)
    expect(text(flips)).toMatch(/Older car/)
  })

  it('says “no crossing in range” where there is none', () => {
    vi.useFakeTimers()
    // The same car at two prices: the dearer one costs more at every savings return and mileage.
    set(inputs([cash({ name: 'Cheaper deal' }), cash({ name: 'Dearer deal', value: fromPounds(19_000) })]))
    settle()
    expect(text($('[data-flip="mileage"]'))).toMatch(/no crossing in range/i)
    expect(text($('[data-flip="savings"]'))).toMatch(/no crossing in range/i)
  })

  it('needs two options that cover the whole horizon', () => {
    vi.useFakeTimers()
    set(inputs([cash()]))
    settle()
    expect(text($('[data-flips]'))).toMatch(/two options/i)
  })
})

describe('refusals and input errors', () => {
  it('an option the engine refuses shows the refusal with the field names on its card and in its editor; the others keep their figures', () => {
    set(inputs([cash(), hp({ deposit: fromPounds(18_000) })]))
    const notice = $('[data-refusal="inputs"]', card(1))
    expect(notice).not.toBeNull()
    expect($('[data-refusal-field="deposit"]', notice!)).not.toBeNull()
    expect($('[data-headline]', card(1))).toBeNull()
    expect(text($('[data-option-problems]', editor(1)))).toMatch(/Deposit/)
    expect($('[data-headline]', card(0))).not.toBeNull()
  })

  it('an option missing inputs says which, on its card; the others keep their figures', () => {
    set(inputs([cash(), blank('cash')]))
    expect(text($('[data-card-missing]', card(1)))).toMatch(/Price/)
    expect($('[data-headline]', card(0))).not.toBeNull()
  })

  it('an input being typed that is not valid yet holds back only its option', () => {
    set(inputs([cash(), keep()]))
    type(field(1, 'value'), 'abc')
    expect(text($('[data-card-invalid]', card(1)))).toMatch(/fix the highlighted input/i)
    expect($('[data-headline]', card(1))).toBeNull()
    expect($('[data-headline]', card(0))).not.toBeNull()
    type(field(1, 'value'), '6,000')
    expect($('[data-headline]', card(1))).not.toBeNull()
  })

  it('a shared input being typed that is not valid holds back every result', () => {
    set(example)
    type($('#cd-savings') as HTMLInputElement, 'x')
    expect(cards().every((c) => $('[data-headline]', c) === null)).toBe(true)
    expect(text($('[data-results-waiting]'))).toMatch(/fix the highlighted/i)
  })
})

describe('fuel', () => {
  it.each<[string, (patch?: Partial<OptionInputs>) => OptionInputs]>([
    ['petrol or diesel', cash],
    ['electric', electric],
    ['cost per mile', perMile],
  ])('%s: shows the derived cost per mile from the engine', (_label, make) => {
    const option = make()
    set(inputs([option]))
    const perMileCost = costPerMile(toEngineOption(option, percentRatio('3')).car.fuel)
    expect(text($('[data-cost-per-mile]', editor(0)))).toContain(formatPence(perMileCost))
  })

  it('switching the fuel type shows its own boxes and keeps the others’ values', () => {
    set(inputs([cash()]))
    choose(editor(0), 'fuel-mode', 'Electric')
    expect(session.get().inputs.options[0]!.fuelMode).toBe('electric')
    expect(field(0, 'mpkwh')).not.toBeNull()
    expect(field(0, 'mpg')).toBeNull()
    choose(editor(0), 'fuel-mode', 'Petrol or diesel')
    expect(field(0, 'mpg').value).toBe('45.5')
  })

  it('VED is an amount you enter, with a hint to check GOV.UK and no figure', () => {
    const hint = text($(`[id="${field(0, 'ved').id}-hint"]`))
    expect(hint).toMatch(/gov\.uk/i)
    expect(hint).not.toMatch(/\d/)
  })

  it('hints say the conventions in words, with no figures', () => {
    set(example)
    const hints = $$('[id$="-hint"]').map(text)
    expect(hints.length).toBeGreaterThanOrEqual(10)
    for (const hint of hints) expect(hint, hint).not.toMatch(/\d/)
  })
})

describe('the option editor', () => {
  it('adds, duplicates and removes options, up to the most compared', () => {
    expect(editors()).toHaveLength(2)
    click($('#cd-add'))
    expect(session.get().inputs.options).toHaveLength(3)
    click($('[id$="-duplicate"]', editor(0)))
    expect(session.get().inputs.options).toHaveLength(MAX_CAR_OPTIONS)
    expect(($('#cd-add') as HTMLButtonElement).disabled).toBe(true)
    expect(($('[id$="-duplicate"]', editor(0)) as HTMLButtonElement).disabled).toBe(true)
  })

  it('remove shows Undo, which puts the option back where it was', () => {
    set(example)
    click($('[id$="-remove"]', editor(1)))
    expect(session.get().inputs.options.map((o) => o.name)).toEqual(['Keep the old car', 'PCP'])
    expect(toasts.get().toast?.undo).toBeDefined()
    act(() => toasts.undo())
    expect(session.get().inputs.options).toEqual(example.options)
  })

  it('the last option cannot be removed', () => {
    set(inputs([cash()]))
    expect(($('[id$="-remove"]', editor(0)) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the finance section only for a loan, HP or PCP, and sections with live summaries', () => {
    set(inputs([cash(), loan()]))
    expect($('[data-section$="-finance"]', editor(0))).toBeNull()
    expect($('[data-section$="-finance"]', editor(1))).not.toBeNull()
    expect(text($('[id$="-car-summary"]', editor(0)))).toContain(money(fromPounds(18_000)))
    expect(text($('[id$="-running-summary"]', editor(0)))).toContain(money(fromPounds(550)))
    expect(text($('[id$="-car-summary"]', editors()[0]!))).not.toBe('Not set')
  })

  it('a fresh option’s sections are closed and say what is missing', () => {
    expect($('[data-section$="-car"] button', editor(0))?.getAttribute('aria-expanded')).toBe('false')
    expect(text($('[id$="-car-summary"]', editor(0)))).toMatch(/not set/i)
  })
})

describe('scenarios', () => {
  it('saves through the page with no tax year, loads back, and compare rows name each option', () => {
    set(example)
    click(byText(view.host, 'button', 'Save'))
    click(byText(view.host, 'form button', 'Save'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'car-decision', inputsVersion: 1, inputs: example })
    expect(Object.hasOwn(stored.scenarios[0], 'taxYear')).toBe(false)
    act(() => session.startNew())
    expect(session.get().inputs).toEqual(carDecisionCalculator.defaultInputs())
    act(() => session.load(scenarioStore.get().scenarios[0]!))
    expect(session.get().inputs).toEqual(example)
    for (const [i, option] of engine().options.entries()) expectCard(i, option, 'expected')
    const summary = carDecisionCalculator.summarise(example, undefined as never)
    const labels = summary.results.ok ? summary.results.rows.map((r) => r.label) : []
    expect(labels).toContain('PCP: net cost per month of coverage')
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
  const BANNED = /\b(best|recommended|cheapest|guaranteed|winner|optimal)\b|will be worth|you should/i

  it('the page never uses the banned words (filled, assumptions open, flips shown, a refusal, missing inputs)', () => {
    vi.useFakeTimers()
    set(example)
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    ;($('details#assumptions') as HTMLDetailsElement).open = true
    expect(view.host.textContent).not.toMatch(BANNED)
    set(inputs([cash(), hp({ deposit: fromPounds(18_000) }), blank('pcp')]))
    expect(view.host.textContent).not.toMatch(BANNED)
  })

  it('nor do the page’s sources, the engines’ assumptions or the Help topic', () => {
    const here = import.meta.dirname
    for (const file of ['CarDecisionPage.tsx', 'OptionEditor.tsx', 'CarResults.tsx', 'definition.ts', 'results.ts', 'rates.ts'])
      expect(readFileSync(join(here, file), 'utf8'), file).not.toMatch(BANNED)
    const result = engine(example)
    for (const line of [...result.assumptions, ...result.options.flatMap((o) => [...o.assumptions, ...(o.finance?.assumptions ?? [])])])
      expect(line).not.toMatch(BANNED)
    expect(readFileSync(join(here, '../../../content/help/car-decision.md'), 'utf8')).not.toMatch(BANNED)
  })
})
