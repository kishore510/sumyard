// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMonths } from '@/lib/calendar'
import { formatGBP, formatIsoDate, formatPercent } from '@/lib/format'
import { fromPence, fromPounds, type Money, toPence } from '@/lib/money'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import { calculate, type MortgagePageInputs, mortgageCalculator, yearsAndMonths } from './definition'
import MortgagePage from './MortgagePage'
import type { MortgageResult } from './types'

/*
 * M2: the mortgage overpayment page at #/c/mortgage. Every expected figure
 * comes from the engine (through calculate), formatted as the page formats
 * it; nothing is worked out here. Contract figures are made up.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(mortgageCalculator)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence' })
  session.startNew()
  view = mount(<MortgagePage />)
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
})

const $ = (selector: string) => view.host.querySelector(selector)
const $$ = (selector: string) => [...view.host.querySelectorAll(selector)]
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const set = (patch: Partial<MortgagePageInputs>) => act(() => session.setInputs(patch))
const text = () => view.host.textContent ?? ''

/** The value beside a result row's label, without its detail line. */
function row(label: string, within: ParentNode = view.host): string | undefined {
  const dt = [...within.querySelectorAll('dt')].find((el) => el.textContent?.trim() === label)
  return dt?.nextElementSibling?.firstChild?.textContent?.trim()
}

const example: MortgagePageInputs = {
  startDate: '2026-01-15',
  balance: fromPounds(200_000),
  termYears: 25,
  termExtraMonths: 0,
  repaymentType: 'repayment',
  fixed: true,
  fixedRate: '4.5',
  fixedEndDate: '2028-01-31',
  reversionRate: '7',
  monthly: fromPounds(200),
  effect: 'reduce-term',
  lumpSums: [],
  erc: false,
  ercRate: null,
  ercEndDate: null,
  allowanceKind: 'rate',
  allowanceRate: null,
  allowanceAmount: null,
  allowanceUsed: fromPounds(0),
  paymentsToReset: 0,
  interestMethod: 'monthly',
  dayCount: 'actual/365',
}

const withCharge: MortgagePageInputs = {
  ...example,
  lumpSums: [{ date: '2026-06-01', amount: fromPounds(30_000) }],
  erc: true,
  ercRate: '3',
  allowanceRate: '10',
}

function engine(inputs: MortgagePageInputs = session.get().inputs): MortgageResult {
  const out = calculate(inputs)
  if (out.kind !== 'ok') throw new Error(out.kind)
  return out.result
}

const headline = () => $('[data-sticky-value]')?.textContent?.trim()
const sectionButton = (id: string) => $(`#mo-section-${id}-button`) as HTMLButtonElement

describe('a fresh page', () => {
  it('shows the title, the no-tax-rules badge, the disclaimer and no made-up figures', () => {
    expect($('h1')?.textContent).toBe('Mortgage overpayment')
    expect($('[data-no-tax-rules]')).not.toBeNull()
    expect(text()).toMatch(/Illustrative only, not financial advice/)
    expect(box('mo-balance').value).toBe('')
    expect(box('mo-fixed-rate').value).toBe('')
  })

  it('says what to enter instead of results, and opens the sections that need it', () => {
    expect(headline()).toBeUndefined()
    expect($('[data-missing]')?.textContent).toMatch(/Start date.*Balance owed.*Years left.*Fixed rate/s)
    expect(sectionButton('loan').getAttribute('aria-expanded')).toBe('true')
    expect(sectionButton('fixed').getAttribute('aria-expanded')).toBe('true')
    expect(sectionButton('overpay').getAttribute('aria-expanded')).toBe('false')
    expect(sectionButton('erc').getAttribute('aria-expanded')).toBe('false')
    expect(sectionButton('advanced').getAttribute('aria-expanded')).toBe('false')
  })

  it('typing the contract in gives results', () => {
    type(box('mo-start'), '15/01/2026')
    type(box('mo-balance'), '200000')
    type(box('mo-years'), '25')
    type(box('mo-fixed-rate'), '4.5')
    type(box('mo-fixed-end'), '31/01/2028')
    type(box('mo-reversion-rate'), '7')
    expect(session.get().inputs).toMatchObject({
      startDate: '2026-01-15',
      balance: fromPounds(200_000),
      termYears: 25,
      fixedRate: '4.5',
      fixedEndDate: '2028-01-31',
      reversionRate: '7',
    })
    expect($('[data-missing]')).toBeNull()
    expect(row('Contractual payment now')).toBe(money(engine().baseline.paymentNow))
  })
})

describe('results, answer first', () => {
  beforeEach(() => set(example))

  it('the sticky figure is interest saved, with the term cut', () => {
    const r = engine()
    expect(headline()).toBe(
      `${money(r.interestSaved)} saved; cleared in ${yearsAndMonths(r.overpaying.payoffMonth!)} instead of ${yearsAndMonths(r.baseline.payoffMonth!)}`,
    )
    expect(
      $('[data-answer] h2')?.parentElement?.textContent?.match(new RegExp(money(r.interestSaved).replace(/[.$]/g, '\\$&'), 'g')),
    ).toHaveLength(1)
  })

  it('the answer card: interest saved, term cut, new payoff date, total paid, charge paid', () => {
    const r = engine()
    const card = $('[data-answer]')!
    expect(row('Interest saved', card)).toBe(money(r.interestSaved))
    expect(row('Mortgage cleared in', card)).toBe(yearsAndMonths(r.overpaying.payoffMonth!))
    const cleared = [...card.querySelectorAll('dt')].find((dt) => dt.textContent === 'Mortgage cleared in')!.nextElementSibling!.textContent
    expect(cleared).toContain(`Instead of ${yearsAndMonths(r.baseline.payoffMonth!)}: ${yearsAndMonths(r.monthsSaved)} sooner`)
    expect(cleared).toContain(`${formatIsoDate(r.overpaying.payoffDate!)} instead of ${formatIsoDate(r.baseline.payoffDate!)}`)
    expect(row('Total paid', card)).toBe(money(r.overpaying.totalPaid))
    expect(row('Early repayment charge paid', card)).toBe(money(r.overpaying.totalErc))
    expect(row('Net saving', card)).toBeUndefined()
  })

  it('with a charge: the net saving and the break-even month', () => {
    set(withCharge)
    const r = engine()
    const card = $('[data-answer]')!
    expect(r.charge).not.toBeNull()
    expect(row('Net saving', card)).toBe(money(r.charge!.netSaving))
    expect(row('Break-even', card)).toBe(formatIsoDate(addMonths('2026-01-15', r.charge!.breakEvenMonth!)))
  })

  it('what you pay each month now: the contractual payment and the overpayment together', () => {
    const r = engine()
    const first = r.overpaying.rows[0]!
    expect(row('You pay each month now')).toBe(money(fromPence(toPence(first.payment) + toPence(first.overpayment))))
    expect(text()).toContain(`${money(first.payment)} payment and ${money(first.overpayment)} overpayment`)
    expect(text()).toMatch(/check it against your statement/)
  })

  it('after the fixed rate: the contractual payment, and what you pay with the overpayment, said as such', () => {
    const r = engine()
    const first = r.overpaying.rows[r.overpaying.rows.findIndex((row) => row.period === 'reversion')]!
    expect(row('You pay each month after the fixed rate')).toBe(money(fromPence(toPence(first.payment) + toPence(first.overpayment))))
    expect(text()).toContain(`${money(first.payment)} payment and ${money(first.overpayment)} overpayment, if you keep overpaying`)
    expect(row('Contractual payment after the fixed rate')).toBe(money(r.overpaying.paymentAfterFixedEnd!))
    expect(text()).toContain(`Not counting overpayments. Had you never overpaid: ${money(r.baseline.paymentAfterFixedEnd!)}`)
  })

  it('one return per rate period, each with what it is measured against', () => {
    const r = engine()
    const card = $('[data-returns]')!
    expect(row('While fixed', card)).toBe(formatPercent(r.returns[0]!.effective))
    expect(row('After the fixed rate', card)).toBe(formatPercent(r.returns[1]!.effective))
    expect(card.textContent).toMatch(/Measured against/)
    expect(card.textContent).toMatch(/your guess of 7%/)
  })

  it('the balance chart, baseline against overpaying, with its table', () => {
    const chart = $('[data-chart]')!
    expect(chart.querySelector('[data-series="baseline"]')).not.toBeNull()
    expect(chart.querySelector('[data-series="overpaying"]')).not.toBeNull()
    expect(chart.querySelector('table')).not.toBeNull()
  })

  it('a yearly table: one row a year, from the engine', () => {
    const r = engine()
    const rows = $$('[data-yearly-table] tbody tr')
    expect(rows).toHaveLength(r.years.length)
    expect(rows[0]!.textContent).toContain(money(r.years[0]!.overpayingClosing))
  })

  it('never calls a point or option the best', () => {
    set(withCharge)
    expect(text()).not.toMatch(/\bbest\b/i)
  })
})

describe('warnings, never hidden', () => {
  beforeEach(() => set(example))

  it('over the penalty-free limit, with the charge', () => {
    set(withCharge)
    const r = engine()
    const warning = $('[data-warning="over-allowance"]')
    expect(warning?.textContent).toContain(money(r.allowances[0]!.charged))
  })

  it('an overpayment capped at the balance', () => {
    set({ ...example, lumpSums: [{ date: '2026-03-01', amount: fromPounds(500_000) }] })
    expect($('[data-warning="unused"]')?.textContent).toMatch(/not needed/)
  })

  it('daily interest drift, worded as approximate', () => {
    set({
      ...example,
      termYears: 39,
      fixed: false,
      reversionRate: '9',
      balance: fromPounds(500_000),
      interestMethod: 'daily',
      dayCount: 'actual/actual',
    })
    expect($('[data-warning="drift"]')?.textContent).toMatch(
      /this schedule drifts under daily interest, so treat the figures as approximate/,
    )
  })

  it('a fixed rate past the term, and one already ended', () => {
    set({ ...example, fixedEndDate: '2060-01-01' })
    expect($('[data-warning="fixed-past-term"]')).not.toBeNull()
    set({ ...example, fixedEndDate: '2026-01-20' })
    expect($('[data-warning="fixed-ended"]')).not.toBeNull()
  })

  it('interest-only: the effect does not apply', () => {
    set({ ...example, repaymentType: 'interest-only' })
    expect($('[data-warning="effect"]')).not.toBeNull()
  })

  it('a lump sum dated outside the term is refused by field', () => {
    set({ ...example, lumpSums: [{ date: '2025-01-01', amount: fromPounds(1_000) }] })
    expect(text()).toMatch(/Lump sum 1 date/)
    expect($('[data-answer]')).toBeNull()
  })
})

describe('inputs', () => {
  beforeEach(() => set(example))

  it('lump sums: add with a date and an amount, shown with their payment date, and remove', () => {
    click(byText(view.host, 'button', /Add a lump sum/))
    type(box('mo-lump-0-date'), '01/06/2026')
    type(box('mo-lump-0-amount'), '5000')
    expect(session.get().inputs.lumpSums).toEqual([{ date: '2026-06-01', amount: fromPounds(5_000) }])
    expect(text()).toMatch(/Paid with the payment on 15 June 2026/)
    click(byText(view.host, 'button', /Remove lump sum 1/))
    expect(session.get().inputs.lumpSums).toEqual([])
  })

  it('the charge switch reveals its boxes', () => {
    click(sectionButton('erc'))
    expect($('#mo-erc-rate')).toBeNull()
    click($('#mo-erc'))
    expect($('#mo-erc-rate')).not.toBeNull()
    expect($('#mo-allowance-used')).not.toBeNull()
    expect($('#mo-payments-to-reset')).not.toBeNull()
  })

  it('the day count shows only with daily interest', () => {
    expect($('#mo-day-count')).toBeNull()
    set({ ...example, interestMethod: 'daily' })
    expect($('#mo-day-count')).not.toBeNull()
  })
})

describe('what if (U40, U41)', () => {
  beforeEach(() => set(example))

  it('the slider tries another monthly overpayment beside your inputs, never saved', () => {
    const reset = $('#mo-wi-reset') as HTMLButtonElement
    expect(reset.disabled).toBe(true)
    type(box('mo-wi-amount'), '500')
    const tried = engine({ ...example, monthly: fromPounds(500) })
    expect(headline()).toBe(
      `${money(tried.interestSaved)} saved; cleared in ${yearsAndMonths(tried.overpaying.payoffMonth!)} instead of ${yearsAndMonths(tried.baseline.payoffMonth!)}`,
    )
    expect($('[data-what-if-results]')).not.toBeNull()
    expect(session.get().inputs.monthly).toBe(fromPounds(200))
    click($('#mo-wi-reset'))
    expect($('[data-what-if-results]')).toBeNull()
  })

  it('Apply puts the what-if into your inputs, with Undo', () => {
    type(box('mo-wi-amount'), '500')
    click($('#mo-wi-apply'))
    expect(session.get().inputs.monthly).toBe(fromPounds(500))
    expect($('[data-what-if-results]')).toBeNull()
  })
})

describe('assumptions and privacy', () => {
  it('the assumptions name the method, day count, timing, allowance years, the charge in cash, rounding, bounds and lender terms', () => {
    set({ ...withCharge, interestMethod: 'daily' })
    const panel = text()
    for (const words of [
      /worked out daily/,
      /common year/,
      /payment dates only/,
      /allowance year/,
      /from your pocket/,
      /nearest penny/,
      /refused, never changed/,
      /Lender terms vary/,
      /check your offer documents/,
    ])
      expect(panel).toMatch(words)
  })

  it('adds no storage key', () => {
    set(withCharge)
    for (let i = 0; i < localStorage.length; i++) expect(Object.values(STORAGE_KEYS).map((k) => k.key)).toContain(localStorage.key(i))
  })
})
