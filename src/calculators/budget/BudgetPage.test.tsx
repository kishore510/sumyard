// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatGBP, formatPercent } from '@/lib/format'
import { fromPence, fromPounds, type Money, toPence } from '@/lib/money'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import BudgetPage from './BudgetPage'
import { type BudgetPageInputs, budgetCalculator, calculate } from './definition'
import type { BudgetResult } from './types'

/*
 * The household budget page at #/c/budget. Expected figures come from the
 * engine through calculate(), formatted as the page formats them. Amounts
 * are made up. Default lines get keys in order: Groceries is bd-out-0,
 * Joint account bd-out-4, Credit card payment bd-out-5, the ISA bd-out-7.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(budgetCalculator)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence' })
  session.startNew()
  view = mount(<BudgetPage />)
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
})

const $ = (selector: string) => view.host.querySelector(selector)
const $$ = (selector: string) => [...view.host.querySelectorAll(selector)]
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const set = (patch: Partial<BudgetPageInputs>) => act(() => session.setInputs(patch))
const headline = () => $('[data-sticky-value]')?.textContent?.trim()
const engine = (inputs: BudgetPageInputs = session.get().inputs): BudgetResult => {
  const outcome = calculate(inputs)
  if (!outcome.ok) throw new Error('refused')
  return outcome.result
}
function row(label: string, within: ParentNode = view.host): string | undefined {
  const dt = [...within.querySelectorAll('dt')].find((el) => el.textContent?.trim() === label)
  return dt?.nextElementSibling?.firstChild?.textContent?.trim()
}
const chooseView = (label: 'Year' | 'Month') => click($(`input[name="bd-view"][value="${label === 'Year' ? 'year' : 'month'}"]`))
const slide = (input: HTMLInputElement, pence: number) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, String(pence))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const amountOf = (key: number) => box(`bd-out-${key}-amount`)

const typical = () => {
  type(box('bd-pay'), '3,000')
  type(amountOf(0), '400')
  type(amountOf(4), '800')
  type(amountOf(5), '200')
  type(amountOf(7), '300')
}

describe('the page', () => {
  it('has its title, says it uses no tax rules, and shows no verified badge', () => {
    expect($('h1')?.textContent).toBe('Household budget')
    expect($('[data-no-tax-rules]')?.textContent).toMatch(/no tax rules/i)
    expect($('[data-verified-badge]')).toBeNull()
  })

  it('says it is illustrative, not advice, and lists assumptions including double counting', () => {
    expect(view.host.textContent).toMatch(/Illustrative only, not financial advice/)
    const assumptions = $('#assumptions')!.textContent!
    expect(assumptions).toMatch(/card payment or the spending on that card, not both/)
    expect(assumptions).toMatch(/joint account counts as an outgoing/)
  })

  it('has Your pay always in view and the sections closed on a fresh page', () => {
    expect(box('bd-pay')).not.toBeNull()
    for (const id of ['income', 'spending', 'joint', 'debt', 'savings', 'whatif'])
      expect($(`#bd-section-${id}-button`)?.getAttribute('aria-expanded'), id).toBe('false')
  })

  it('a loaded scenario opens only the sections it sets', () => {
    const inputs = budgetCalculator.defaultInputs()
    const outgoings = inputs.outgoings.map((l) => (l.kind === 'debt' ? { ...l, amount: fromPounds(90) } : l))
    act(() =>
      session.load({
        id: 's1',
        calculatorId: 'budget',
        name: 'Loaded',
        inputs: { ...inputs, pay: fromPounds(2_000), outgoings },
        inputsVersion: 1,
        createdAt: '2026-10-23T00:00:00Z',
        updatedAt: '2026-10-23T00:00:00Z',
      }),
    )
    const open = (id: string) => $(`#bd-section-${id}-button`)?.getAttribute('aria-expanded')
    expect(open('debt')).toBe('true')
    for (const id of ['income', 'spending', 'joint', 'savings', 'whatif']) expect(open(id), id).toBe('false')
    expect($('#bd-section-debt-summary')?.textContent).toBe(`1 line, ${money(fromPounds(90))} a month`)
  })

  it('prefills the named lines, blank, in their sections', () => {
    const names = (id: string) => $$(`#bd-section-${id}-panel [data-line] input[id$="-name"]`).map((i) => (i as HTMLInputElement).value)
    expect(names('spending')).toEqual(['Groceries', 'Car insurance', 'Mobile', 'Other spending'])
    expect(names('joint')).toEqual(['Joint account'])
    expect(names('debt')).toEqual(['Credit card payment'])
    expect(names('savings')).toEqual(['Cash savings', 'Stocks and shares ISA', 'Fixed saver'])
    expect(amountOf(0).value).toBe('')
  })

  it('a blank amount is nothing, with no warning about it', () => {
    type(box('bd-pay'), '1,000')
    expect(headline()).toMatch(money(fromPounds(1_000)))
    expect($('[data-line] [id$="-amount-error"]')).toBeNull()
  })

  it('the debt section says to enter the payment or the spending, not both', () => {
    expect($('#bd-section-debt-panel')!.textContent).toMatch(/card payment or the spending on that card, not both/)
  })
})

describe('results', () => {
  it('shows what is left a month with its share of your income, outgoings and the savings rate', () => {
    typical()
    const r = engine()
    expect(headline()).toBe(`${money(r.leftover.month)} (${formatPercent(r.leftover.share!)} of your income)`)
    expect(row('Income')).toBe(money(r.income.month))
    expect(row('Outgoings')).toBe(money(r.outgoings.month))
    expect(row('Left over')).toBe(money(r.leftover.month))
    expect(row('Savings rate')).toBe(formatPercent(r.savingsRate!))
  })

  it('Year and Month agree: a year is twelve months for whole-month amounts', () => {
    typical()
    const month = engine()
    chooseView('Year')
    expect(row('Left over')).toBe(money(month.leftover.year))
    expect(toPence(month.leftover.year)).toBe(toPence(month.leftover.month) * 12)
    expect(headline()).toMatch(money(month.leftover.year))
  })

  it('splits income into spending, joint, debt, savings and left over, drawn from the exact year figures and labelled in the view', () => {
    typical()
    const r = engine()
    const segments = $$('[data-segment]').map((g) => [g.getAttribute('data-segment'), Number(g.getAttribute('data-value'))])
    expect(segments).toEqual([
      ['spending', toPence(r.perKind[0]!.year)],
      ['joint', toPence(r.perKind[1]!.year)],
      ['debt', toPence(r.perKind[2]!.year)],
      ['savings', toPence(r.perKind[3]!.year)],
      ['leftover', toPence(r.leftover.year)],
    ])
    expect($('[data-legend]')?.textContent).toContain(money(r.perKind[0]!.month))
  })

  it('with outgoings over income, the bar shows where outgoings go', () => {
    type(box('bd-pay'), '100')
    type(amountOf(0), '150')
    expect($$('[data-segment]').map((g) => g.getAttribute('data-segment'))).toEqual(['spending'])
  })

  it('has a per-kind table with each kind’s amount and share of your income', () => {
    typical()
    const r = engine()
    const rows = $$('[data-kind-table] tbody tr').map((tr) => [...tr.children].map((c) => c.textContent?.trim()))
    expect(rows[0]).toEqual(['Spending', money(r.perKind[0]!.month), formatPercent(r.perKind[0]!.share!)])
    expect(rows.map((x) => x[0])).toEqual(['Spending', 'Joint account', 'Debt payments', 'Savings and investing'])
  })

  it('negative leftover is shown as it is, with a warning', () => {
    type(box('bd-pay'), '1,000')
    type(amountOf(0), '1,200')
    expect(headline()).toMatch(money(fromPounds(-200)))
    expect($('[data-warning="negative-leftover"]')).not.toBeNull()
  })

  it('no income: shares are n/a', () => {
    type(amountOf(0), '100')
    expect(row('Savings rate')).toBe('n/a')
    expect(headline()).toMatch(/n\/a/)
  })

  it('states the penny difference in the month view when rounded lines differ from the total', () => {
    set({
      pay: fromPounds(2_000),
      outgoings: [0, 1, 2].map(() => ({ name: 'Bus', amount: fromPounds(10), period: 'weekly', kind: 'spending' })),
    })
    expect($('[data-penny-note]')?.textContent).toMatch(/penny|pence/)
    chooseView('Year')
    expect($('[data-penny-note]')).toBeNull()
  })

  it('an invalid amount shows no results until it is fixed', () => {
    type(amountOf(0), '-5')
    expect(headline()).toBeUndefined()
    expect(view.host.textContent).toMatch(/Fix the highlighted input/)
    type(amountOf(0), '5')
    expect(headline()).toBeDefined()
  })
})

describe('lines', () => {
  it('a line can be added to a section and named', () => {
    click($('#bd-section-spending-button'))
    click($('#bd-add-spending'))
    const added = $$('#bd-section-spending-panel [data-line]')
    expect(added).toHaveLength(5)
    expect(session.get().inputs.outgoings.filter((l) => l.kind === 'spending')).toHaveLength(5)
    expect(document.activeElement?.id).toMatch(/-name$/)
  })

  it('a removed line comes back with Undo', () => {
    type(amountOf(5), '150')
    click($('#bd-out-5-remove'))
    expect(session.get().inputs.outgoings.some((l) => l.name === 'Credit card payment')).toBe(false)
    act(() => toasts.undo())
    const restored = session.get().inputs.outgoings.find((l) => l.name === 'Credit card payment')
    expect(restored?.amount).toBe(fromPounds(150))
    expect(session.get().inputs.outgoings.map((l) => l.name)[5]).toBe('Credit card payment')
  })

  it('extra income adds to income', () => {
    type(box('bd-pay'), '1,000')
    click($('#bd-add-income'))
    const amount = $('#bd-section-income-panel [data-line] input[id$="-amount"]') as HTMLInputElement
    type(amount, '100')
    expect(row('Income')).toBe(money(fromPounds(1_100)))
  })

  it('a yearly line counts a twelfth a month', () => {
    type(box('bd-pay'), '1,000')
    type(amountOf(1), '600')
    expect(row('Outgoings')).toBe(money(fromPounds(50)))
  })
})

describe('what if (BD7)', () => {
  it('a slider shows the what-if beside the inputs, with the change, without touching the inputs', () => {
    typical()
    const before = session.get().inputs
    slide(box('bd-wi-out-0'), toPence(fromPounds(300)))
    expect(session.get().inputs).toBe(before)
    const card = $('[data-what-if-results]')!
    expect(card).not.toBeNull()
    const base = engine()
    const next = engine({ ...before, outgoings: before.outgoings.map((l, i) => (i === 0 ? { ...l, amount: fromPounds(300) } : l)) })
    expect(card.textContent).toContain(money(base.leftover.month))
    expect(card.textContent).toContain(money(next.leftover.month))
    expect(card.textContent).toContain(`+${money(fromPounds(100))}`)
  })

  it('Reset what-ifs drops them', () => {
    typical()
    slide(box('bd-wi-out-0'), toPence(fromPounds(300)))
    click($('#bd-wi-reset'))
    expect($('[data-what-if-results]')).toBeNull()
  })

  it('Apply writes the what-ifs into the inputs, with Undo', () => {
    typical()
    slide(box('bd-wi-pay'), toPence(fromPounds(3_200)))
    click($('#bd-wi-apply'))
    expect(session.get().inputs.pay).toBe(fromPounds(3_200))
    expect(box('bd-pay').value).toBe('3,200')
    expect($('[data-what-if-results]')).toBeNull()
    act(() => toasts.undo())
    expect(session.get().inputs.pay).toBe(fromPounds(3_000))
  })

  it('what-ifs are never stored: a fresh start or a load drops them', () => {
    typical()
    slide(box('bd-wi-out-0'), toPence(fromPounds(300)))
    act(() => session.startNew())
    expect($('[data-what-if-results]')).toBeNull()
    expect(JSON.stringify(session.get().inputs)).not.toMatch(/whatIf/i)
  })

  it('typing a what-if in its box works as the slider does', () => {
    typical()
    type(box('bd-wi-out-7-amount'), '500')
    expect($('[data-what-if-results]')?.textContent).toMatch(/Savings rate/)
    expect(session.get().inputs.outgoings[7]!.amount).toBe(fromPounds(300))
  })
})

describe('Apply keeps lines and values exact', () => {
  it('the slider range is native and labelled in words', () => {
    typical()
    expect(box('bd-wi-out-0').type).toBe('range')
    expect(box('bd-wi-out-0').getAttribute('aria-valuetext')).toBe('400 pounds per month')
    expect(fromPence(Number(box('bd-wi-out-0').value))).toBe(fromPounds(400))
  })
})
