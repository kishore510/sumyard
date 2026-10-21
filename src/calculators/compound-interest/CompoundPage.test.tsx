// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatGBP, formatPercent } from '@/lib/format'
import { GROWTH_RATE_BOUND, MAX_INPUT_AMOUNT, MAX_PROJECTION_YEARS } from '@/lib/inputLimits'
import { add, fromPence, fromPounds, type Money } from '@/lib/money'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import CompoundPage from './CompoundPage'
import { effectiveAnnualRate, project } from './calc'
import { type CompoundPageInputs, compoundCalculator, toEngineInputs } from './definition'
import type { CompoundResult, Projection } from './types'

/*
 * Slice 2b: the compound interest page at #/c/compound-interest. Every
 * expected figure comes from the engine (project), formatted as the page
 * formats it; nothing is worked out here. Amounts and rates are made up.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(compoundCalculator)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence' })
  session.startNew()
  view = mount(<CompoundPage />)
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
})

const $ = (selector: string) => view.host.querySelector(selector)
const $$ = (selector: string) => [...view.host.querySelectorAll(selector)]
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const set = (patch: Partial<CompoundPageInputs>) => act(() => session.setInputs(patch))

/** The value beside a result row's label, without its detail line. */
function row(label: string, within: ParentNode = view.host): string | undefined {
  const dt = [...within.querySelectorAll('dt')].find((el) => el.textContent?.trim() === label)
  return dt?.nextElementSibling?.firstChild?.textContent?.trim()
}

const example: CompoundPageInputs = {
  lumpSum: fromPounds(5_000),
  contribution: fromPounds(150),
  contributionFrequency: 'monthly',
  timing: 'start',
  years: 20,
  growthRate: '5',
  compounding: 'monthly',
  feeRate: '0.75',
  contributionIncrease: '2',
  inflationRate: '2.5',
}

const engine = (inputs: CompoundPageInputs = session.get().inputs): CompoundResult => {
  const outcome = project(toEngineInputs(inputs))
  if (!outcome.ok) throw new Error('refused')
  return outcome.result
}

const headline = () => $('[data-sticky-value]')?.textContent?.trim()
const chooseView = (label: 'Nominal' | 'Today’s money') => {
  const radio = byText(view.host, 'fieldset label', label)?.querySelector('input')
  click(radio)
}

/** The yearly table's body rows, as the text of each cell. */
const tableRows = () => $$('[data-yearly-table] tbody tr').map((tr) => [...tr.children].map((cell) => cell.textContent?.trim()))
const tableTotals = () => [...($('[data-yearly-table] tfoot tr')?.children ?? [])].map((cell) => cell.textContent?.trim())
const expectedRows = (projection: Projection) =>
  projection.rows.map((r) => [String(r.year), money(r.opening), money(r.contributions), money(r.growth), money(r.fees), money(r.closing)])

describe('the page', () => {
  it('has the calculator’s name as its title, the summary, and says it uses no tax rules (no tax year, no verified badge)', () => {
    expect($('h1')?.textContent).toBe(compoundCalculator.name)
    expect($$('[data-no-tax-rules]').length).toBeGreaterThan(0)
    expect($('[data-verified]')).toBeNull()
    expect(view.host.textContent).not.toMatch(/tax year/i)
  })

  it('shows the default inputs’ results as the engine works them out', () => {
    expect(headline()).toBe(money(engine().withFee.nominal.closing))
  })

  it('the headline, paid in, growth and fees are the engine’s, nominal by default', () => {
    set(example)
    const result = engine(example)
    const nominal = result.withFee.nominal
    expect(headline()).toBe(money(nominal.closing))
    expect(row('Paid in')).toBe(money(add(nominal.lumpSum, nominal.contributions)))
    expect(row('Growth')).toBe(money(nominal.growth))
    expect(row('Fees')).toBe(money(nominal.fees))
  })

  it('the headline is the balance with the fee, not without it', () => {
    set(example)
    const result = engine(example)
    expect(headline()).toBe(money(result.withFee.nominal.closing))
    expect(headline()).not.toBe(money(result.noFee.nominal.closing))
  })

  it('switches between nominal and today’s money: headline, rows, fee drag, table and chart follow', () => {
    set(example)
    const result = engine(example)
    chooseView('Today’s money')
    const real = result.withFee.real
    expect(headline()).toBe(money(real.closing))
    expect(headline()).not.toBe(money(result.withFee.nominal.closing))
    expect(row('Paid in')).toBe(money(add(real.lumpSum, real.contributions)))
    expect(row('Growth')).toBe(money(real.growth))
    expect(row('Fees')).toBe(money(real.fees))
    expect(row('Fee drag')).toBe(money(result.feeDrag.real))
    expect(row('Without the fee')).toBe(money(result.noFee.real.closing))
    expect(row('With the fee')).toBe(money(real.closing))
    expect(tableRows()).toEqual(expectedRows(real))
    expect($('[data-chart] tbody tr:last-child td')?.textContent).toBe(money(real.closing))
    chooseView('Nominal')
    expect(headline()).toBe(money(result.withFee.nominal.closing))
    expect(tableRows()).toEqual(expectedRows(result.withFee.nominal))
  })

  it('fee drag: with and without the fee, nominal, with today’s money beside it', () => {
    set(example)
    const result = engine(example)
    expect(row('Fee drag')).toBe(money(result.feeDrag.nominal))
    expect(row('Without the fee')).toBe(money(result.noFee.nominal.closing))
    expect(row('With the fee')).toBe(money(result.withFee.nominal.closing))
    const dt = $$('dt').find((el) => el.textContent?.trim() === 'Fee drag')
    expect(dt?.nextElementSibling?.textContent).toContain(`${money(result.feeDrag.real)} in today’s money`)
  })

  it('says near the headline that returns are assumed constant and this is not a forecast', () => {
    const caveat = $('[data-caveat]')?.textContent ?? ''
    expect(caveat).toMatch(/steady|constant/i)
    expect(caveat).toMatch(/vary/i)
    expect(caveat).toMatch(/not a forecast/i)
  })

  it('shows the rates the engine gives: effective, after fees, and real', () => {
    set(example)
    const result = engine(example)
    expect(row('Effective annual rate')).toBe(formatPercent(result.effectiveAnnualRate))
    expect(row('After fees')).toBe(formatPercent(result.effectiveAnnualRateAfterFees))
    expect(row('After fees and inflation')).toBe(formatPercent(result.realAnnualRate))
  })

  it('shows the effective annual rate beside the growth input, from the engine, and follows the compounding', () => {
    set(example)
    expect($('[data-effective-rate]')?.textContent).toContain(
      formatPercent(effectiveAnnualRate(toEngineInputs(example).growthRate, 'monthly')),
    )
    set({ compounding: 'annual' })
    expect($('[data-effective-rate]')?.textContent).toContain(
      formatPercent(effectiveAnnualRate(toEngineInputs(example).growthRate, 'annual')),
    )
  })
})

describe('the yearly table', () => {
  it('has a row per year, each the engine’s row, adding up to the headline', () => {
    set(example)
    const nominal = engine(example).withFee.nominal
    expect(tableRows()).toEqual(expectedRows(nominal))
    expect(tableRows()).toHaveLength(example.years)
    expect(tableRows().at(-1)?.at(-1)).toBe(headline())
    expect(tableTotals()).toEqual([
      'Total',
      money(nominal.lumpSum),
      money(nominal.contributions),
      money(nominal.growth),
      money(nominal.fees),
      money(nominal.closing),
    ])
  })

  it('scrolls inside its own focusable, labelled region, with the year column sticky', () => {
    const region = $('[data-yearly-table]')!.closest('[tabindex="0"]')!
    expect(region.className).toContain('overflow-x-auto')
    expect(region.getAttribute('aria-labelledby') ?? region.getAttribute('aria-label')).toBeTruthy()
    expect($('[data-yearly-table] tbody th')?.className).toContain('sticky')
  })
})

describe('the chart', () => {
  it('draws the balance with the fee, without it and the total paid in, by year, with a table and a summary', () => {
    set(example)
    const result = engine(example)
    expect($$('[data-chart] [data-series]').map((g) => g.getAttribute('data-series'))).toEqual(['withFee', 'noFee', 'paidIn'])
    const header = $$('[data-chart] thead th').map((th) => th.textContent)
    expect(header).toEqual(['Year', 'Balance', 'Balance without the fee', 'Paid in'])
    const last = $$('[data-chart] tbody tr:last-child td').map((td) => td.textContent)
    const nominal = result.withFee.nominal
    expect(last).toEqual([money(nominal.closing), money(result.noFee.nominal.closing), money(add(nominal.lumpSum, nominal.contributions))])
    expect($('[data-chart] figcaption')?.textContent).toContain(money(nominal.closing))
    expect($$('[data-chart] tbody tr')).toHaveLength(example.years + 1)
  })
})

describe('refusals and input errors', () => {
  it('a result past the safe range is the engine’s refusal, naming the result, and no number', () => {
    set({
      lumpSum: MAX_INPUT_AMOUNT,
      contribution: MAX_INPUT_AMOUNT,
      growthRate: formatPercent(GROWTH_RATE_BOUND).replace('%', ''),
      years: MAX_PROJECTION_YEARS,
    })
    const notice = $('[data-refusal="inputs"]')
    expect(notice).not.toBeNull()
    expect(notice?.querySelector('[data-refusal-field="result"]')).not.toBeNull()
    expect(headline()).toBeUndefined()
    expect($('[data-yearly-table]')).toBeNull()
    expect($('[data-chart]')).toBeNull()
  })

  it('an input being typed that isn’t valid yet shows its error and holds the results back', () => {
    type(box('ci-years'), '0')
    expect(view.host.textContent).toContain('Enter at least 1.')
    expect(view.host.textContent).toContain('Fix the highlighted inputs')
    expect(headline()).toBeUndefined()
    expect($('[data-yearly-table]')).toBeNull()
    type(box('ci-years'), '12')
    expect(session.get().inputs.years).toBe(12)
    expect(headline()).toBe(money(engine().withFee.nominal.closing))
  })

  it('accepts a negative growth rate', () => {
    type(box('ci-growth'), '-2.5')
    expect(session.get().inputs.growthRate).toBe('-2.5')
    expect(headline()).toBe(money(engine().withFee.nominal.closing))
  })
})

describe('inputs and hints', () => {
  it('has every input, the essentials always visible and the rest in two sections', () => {
    for (const id of ['ci-lump-sum', 'ci-contribution', 'ci-years']) expect(box(id).closest('[hidden]'), id).toBeNull()
    expect($$('[data-section]').map((s) => s.getAttribute('data-section'))).toEqual(['ci-section-growth', 'ci-section-time'])
    for (const id of ['ci-growth', 'ci-fee']) expect(box(id).closest('[data-section="ci-section-growth"]'), id).not.toBeNull()
    for (const id of ['ci-increase', 'ci-inflation']) expect(box(id).closest('[data-section="ci-section-time"]'), id).not.toBeNull()
    expect($('#ci-compounding')?.closest('[data-section="ci-section-growth"]')).not.toBeNull()
    expect($('#ci-frequency')?.closest('[data-section]')).toBeNull()
    expect($$('input[name="ci-timing"]')).toHaveLength(2)
  })

  it('sections open on load only when set, with live summaries', () => {
    expect($('[data-section="ci-section-growth"] button')?.getAttribute('aria-expanded')).toBe('false')
    expect($('#ci-section-growth-summary')?.textContent).toBe('Not set')
    set(example)
    expect($('#ci-section-growth-summary')?.textContent).toContain('5%')
    expect($('#ci-section-growth-summary')?.textContent).toContain('0.75%')
    expect($('#ci-section-time-summary')?.textContent).toContain('2.5%')
  })

  it('hints say the conventions in words, with no figures', () => {
    const hints = $$('[id$="-hint"]').map((el) => el.textContent ?? '')
    expect(hints.length).toBeGreaterThanOrEqual(6)
    for (const hint of hints) expect(hint, hint).not.toMatch(/\d/)
    const all = hints.join(' ')
    expect(all).toMatch(/nominal/i)
    expect(all).toMatch(/after that period’s growth/i)
    expect(all).toMatch(/negative/i)
    expect(all).toMatch(/today’s money/i)
  })
})

describe('scenarios', () => {
  it('saves through the page with no tax year, and loads back', () => {
    set(example)
    click(byText(view.host, 'button', 'Save'))
    click(byText(view.host, 'form button', 'Save'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'compound-interest', inputsVersion: 1, inputs: example })
    expect(Object.hasOwn(stored.scenarios[0], 'taxYear')).toBe(false)
    expect($('[data-unsaved]')?.getAttribute('data-unsaved')).toBe('false')
    expect(view.host.textContent).toContain('Saved')

    act(() => session.startNew())
    expect(session.get().inputs).toEqual(compoundCalculator.defaultInputs())
    const saved = scenarioStore.get().scenarios[0]!
    act(() => session.load(saved))
    expect(session.get().inputs).toEqual(example)
    expect(headline()).toBe(money(engine(example).withFee.nominal.closing))
    expect(view.host.textContent).toContain('Uses no tax rules')
    expect(view.host.textContent).not.toMatch(/tax year/i)
  })
})

describe('compare rows', () => {
  it('are final balance (nominal and today’s money), paid in, growth, fees, fee drag and the effective annual rate', () => {
    const summary = compoundCalculator.summarise(example, undefined as never)
    expect(summary.results.ok && summary.results.rows.map((r) => r.label)).toEqual([
      'Final balance',
      'Final balance in today’s money',
      'Paid in',
      'Growth',
      'Fees',
      'Fee drag',
      'Fee drag in today’s money',
      'Effective annual rate',
      'Effective annual rate after fees',
    ])
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
  it('over 150 random valid inputs the page’s headline is the engine’s, in both views', () => {
    const random = seeded(2_026)
    const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!
    const pct = (lo: number, hi: number) => String(Math.round((lo + random() * (hi - lo)) * 100) / 100)
    for (let i = 0; i < 150; i++) {
      const inputs: CompoundPageInputs = {
        lumpSum: fromPence(Math.floor(random() * 5_000_000)),
        contribution: fromPence(Math.floor(random() * 100_000)),
        contributionFrequency: pick(['weekly', 'monthly', 'quarterly', 'annual'] as const),
        timing: pick(['start', 'end'] as const),
        years: 1 + Math.floor(random() * 40),
        growthRate: pct(-10, 15),
        compounding: pick(['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as const),
        feeRate: pct(0, 3),
        contributionIncrease: pct(0, 5),
        inflationRate: pct(-2, 8),
      }
      const valid = compoundCalculator.validateInputs(inputs)
      expect(valid.ok, JSON.stringify(inputs)).toBe(true)
      set(inputs)
      const result = engine(inputs)
      const nominal = i % 2 === 0
      chooseView(nominal ? 'Nominal' : 'Today’s money')
      expect(headline(), JSON.stringify(inputs)).toBe(money((nominal ? result.withFee.nominal : result.withFee.real).closing))
    }
  })
})

describe('words', () => {
  const BANNED = /\b(guaranteed|best|optimal)\b|will be worth/i

  it('the page never says guaranteed, best, optimal or will be worth (assumptions open, a refusal, a typing error)', () => {
    set(example)
    ;($('details#assumptions') as HTMLDetailsElement).open = true
    expect(view.host.textContent).not.toMatch(BANNED)
    chooseView('Today’s money')
    expect(view.host.textContent).not.toMatch(BANNED)
    set({ lumpSum: MAX_INPUT_AMOUNT, contribution: MAX_INPUT_AMOUNT, growthRate: '50', years: MAX_PROJECTION_YEARS })
    expect(view.host.textContent).not.toMatch(BANNED)
  })

  it('nor do the page’s source, its definition, the engine’s assumptions or the Help topic', () => {
    const here = import.meta.dirname
    for (const file of ['CompoundPage.tsx', 'definition.ts', 'results.ts'])
      expect(readFileSync(join(here, file), 'utf8'), file).not.toMatch(BANNED)
    for (const line of engine(example).assumptions) expect(line).not.toMatch(BANNED)
    expect(readFileSync(join(here, '../../../content/help/compound-interest.md'), 'utf8')).not.toMatch(BANNED)
  })
})
