// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP } from '@/lib/format'
import { fromPence, fromPounds, type Money, mulRound, ratio, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import { breakdown, DEDUCTION_ROWS } from './breakdown'
import { takeHome } from './calc'
import { REASON_LABELS, THRESHOLD_LABELS } from './chartData'
import { INPUT_LIMITS, type OptimiserPageInputs, optimiserCalculator, resolveInputs, toTaxInputs } from './definition'
import OptimiserPage from './OptimiserPage'
import { calculateOptimise } from './optimiserInputs'
import { payeEstimate } from './paye'
import { payslipNet, splitSegments } from './results'
import { NOT_SET, SECTION_IDS, type SectionId, sectionSummary } from './sections'
import { DEFAULT_POLICY, type OptimiseResult, type PayeEstimate, type TakeHomeResult } from './types'

/*
 * Session 1b-i: the optimiser page at #/c/optimiser. 1b-ii-a adds the
 * pension allowances section and the optimise() chart. Expected figures come
 * from the engine (takeHome, optimise), never from a figure written here.
 * The refusal states are in OptimiserPage.refusal.test.tsx and
 * OptimiserPage.chartRefusal.test.tsx.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(optimiserCalculator)

beforeEach(() => {
  localStorage.clear()
  scenarioStore.clear()
  settingsStore.update({ amounts: 'pence', region: 'ruk' })
  session.startNew()
  view = mount(<OptimiserPage />)
})
afterEach(() => {
  view.unmount()
  toasts.dismiss()
})

const $ = (selector: string) => view.host.querySelector(selector)
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')

/** The value shown beside a result row's label, without its detail line. */
function row(label: string): string | undefined {
  const dt = [...view.host.querySelectorAll('dt')].find((el) => el.textContent?.trim() === label)
  const dd = dt?.nextElementSibling
  return dd?.firstChild?.textContent?.trim()
}

const engine = (patch: Partial<OptimiserPageInputs> = {}): TakeHomeResult => {
  const result = takeHome(toTaxInputs({ ...session.get().inputs, ...patch }), taxYear, DEFAULT_POLICY)
  if (!result.ok) throw new Error('refused')
  return result
}

type List = 'benefits' | 'deductions'

/** The item boxes of a list, in order. */
const items = (list: List) => [...view.host.querySelectorAll('[data-item]')].filter((el) => el.id.startsWith(`opt-${list}-`))

/**
 * Adds an item to a list through the page and fills it in; returns its element id. For a benefit the amount is its
 * value, with nothing taken from pay unless `taken` is given (and how).
 */
function addItem(
  list: List,
  name: string,
  amount: string,
  period: 'month' | 'year' = 'year',
  taken?: { amount: string; payment: 'beforeTax' | 'afterTax' },
) {
  click($(`#opt-${list}-add`))
  const item = items(list).at(-1)!
  type(box(`${item.id}-name`), name)
  type(box(`${item.id}-${list === 'benefits' ? 'value' : 'amount'}`), amount)
  if (taken) {
    type(box(`${item.id}-taken`), taken.amount)
    click($(`input[name="${item.id}-payment"][value="${taken.payment}"]`))
  }
  click($(`input[name="${item.id}-period"][value="${period}"]`))
  return item.id
}

/** The PAYE estimate the engine gives for the page's inputs and a code. */
const estimate = (code: string): PayeEstimate => {
  const result = payeEstimate(code, engine(), taxYear)
  if (!result.ok) throw new Error('no estimate')
  return result
}

const choose = (name: string, value: string) => click($(`input[name="${name}"][value="${value}"]`))

function save(name: string) {
  click(byText(view.host, 'button', 'Save'))
  const input = $('form input') as HTMLInputElement
  type(input, name)
  act(() => (input.form as HTMLFormElement).requestSubmit())
}

describe('Optimiser page', () => {
  it('shows its title, verified badge, results, assumptions and the disclaimer, with no placeholder label', () => {
    expect(byText(view.host, 'h1', optimiserCalculator.name)).toBeDefined()
    expect($('a[href="#/tax-data"]')?.textContent).toMatch(/2026 to 2027 tax year/)
    expect(byText(view.host, 'h2', 'Take-home pay')).toBeDefined()
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
    expect($('details#assumptions')).not.toBeNull()
    expect(view.host.textContent).toMatch(/not financial advice/)
    expect(view.host.textContent).not.toMatch(/Placeholder/)
    expect($('[data-chart]')).toBeNull()
  })

  it('takes region from Settings on a fresh start', () => {
    view.unmount()
    settingsStore.update({ region: 'scotland' })
    session.startNew()
    view = mount(<OptimiserPage />)
    expect(session.get().inputs.region).toBe('scotland')
    expect(($('input[name="opt-region"][value="scotland"]') as HTMLInputElement).checked).toBe(true)
  })

  it('shows annual, monthly and weekly take-home from the engine, labelled as even divisions', () => {
    type(box('opt-salary'), '52,000')
    type(box('opt-bonus'), '4,000')
    const result = engine()
    expect(row('Year')).toBe(money(result.annual.net))
    // The month is the breakdown's monthly rows added up (B14).
    expect(row('Month')).toBe(money(breakdown(result.annual, 'month').takeHome))
    expect(row('Week')).toBe(money(result.weekly.net))
    expect(view.host.textContent).toMatch(/divided evenly/)
    expect(view.host.textContent).toMatch(/payslips/i)
  })

  it('breakdown rows match the engine and add up to take-home', () => {
    type(box('opt-salary'), '70,000')
    click($('#opt-loan-plan2'))
    type(box('opt-employee'), '3,000')
    type(box('opt-children'), '2')
    addItem('deductions', 'Dental', '40', 'month')
    const { annual } = engine()
    const shown = {
      gross: row('Gross pay'),
      tax: row('Income tax'),
      ni: row('National Insurance'),
      loan: row('Student loan'),
      pension: row('Employee pension'),
      hicbc: row('High Income Child Benefit Charge'),
      deductions: row('Post-tax deductions'),
      net: row('Take-home'),
    }
    expect(shown).toEqual({
      gross: money(annual.gross),
      tax: money(annual.incomeTax),
      ni: money(annual.nationalInsurance),
      loan: money(annual.studentLoan),
      pension: money(annual.pension),
      hicbc: money(annual.hicbc),
      deductions: money(annual.postTaxDeductions),
      net: money(annual.net),
    })
    const sum = [annual.incomeTax, annual.nationalInsurance, annual.studentLoan, annual.pension, annual.hicbc, annual.postTaxDeductions]
    expect(sum.reduce((left, r) => left - r, annual.gross as number)).toBe(annual.net)
    expect(row('Child Benefit received')).toBe(money(annual.childBenefit))
  })

  it('a taxable benefit raises income tax and leaves NI alone; a deduction lowers take-home by exactly its amount', () => {
    type(box('opt-salary'), '45,000')
    const before = engine()
    addItem('benefits', 'Medical', '1,500')
    const withBenefit = engine()
    expect(withBenefit.annual.incomeTax).toBeGreaterThan(before.annual.incomeTax)
    expect(row('Income tax')).toBe(money(withBenefit.annual.incomeTax))
    expect(row('National Insurance')).toBe(money(before.annual.nationalInsurance))
    expect(row('Gross pay')).toBe(money(before.annual.gross))
    addItem('deductions', 'Dental', '250')
    expect(row('Income tax')).toBe(money(withBenefit.annual.incomeTax))
    expect(row('Take-home')).toBe(money((withBenefit.annual.net - fromPounds(250)) as Money))
    expect(row('Taxable benefits in kind')).toBe(money(fromPounds(1_500)))
  })

  it('every pension method changes results as the engine says', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '5,000')
    for (const method of ['salarySacrifice', 'netPay', 'reliefAtSource'] as const) {
      const select = box('opt-method') as unknown as HTMLSelectElement
      act(() => {
        select.value = method
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(session.get().inputs.pensionMethod).toBe(method)
      expect(row('Take-home'), method).toBe(money(engine().annual.net))
    }
  })

  it('shows engine warnings as notices, never capping', () => {
    type(box('opt-salary'), '20,000')
    addItem('deductions', 'Rent', '40,000')
    const result = engine()
    expect(result.annual.net).toBeLessThan(0)
    expect($('[data-warning="takeHomeBelowNothing"]')).not.toBeNull()
    expect(row('Take-home')).toBe(money(result.annual.net))
  })

  it('a pension contribution above pay shows a notice instead of results', () => {
    type(box('opt-salary'), '10,000')
    type(box('opt-employee'), '12,000')
    expect($('[data-input-problem]')).not.toBeNull()
    expect(byText(view.host, 'h2', 'Breakdown')).toBeUndefined()
    expect($('details#assumptions')).not.toBeNull()
  })

  it('shows no results while an input is invalid, and disables Save', () => {
    type(box('opt-salary'), '1.234')
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    expect(byText(view.host, 'h2', 'Breakdown')).toBeUndefined()
    expect((byText(view.host, 'button', 'Save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('help text under benefits and deductions explains each with no figures', () => {
    for (const id of ['opt-benefits', 'opt-deductions']) {
      const hint = $(`#${id}-hint`)?.textContent ?? ''
      expect(hint.length, id).toBeGreaterThan(0)
      expect(hint, id).not.toMatch(/\d/)
    }
  })

  it('assumptions list the engine’s and the page’s own', () => {
    type(box('opt-salary'), '30,000')
    addItem('benefits', 'Medical', '900')
    const text = $('details#assumptions')!.textContent ?? ''
    for (const line of engine().assumptions) expect(text).toContain(line)
    for (const word of [/Child Benefit .*weeks/, /taper/i, /tax code/i, /Class 1A/, /as entered/i, /contributions only/i])
      expect(text).toMatch(word)
    expect(text).toContain('Monthly amounts are assumed level through the year.')
    expect(text).toMatch(/percentage .*pensionable pay.*nearest penny/i)
    expect(text).toMatch(/added up from your items/i)
  })

  it('saves inputs only, then loads them back', () => {
    type(box('opt-salary'), '41,000')
    const medical = addItem('benefits', 'Medical', '70', 'month')
    save('Mine')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'optimiser', inputsVersion: 4 })
    expect(stored.scenarios[0].inputs.taxableBenefits).toEqual([
      { name: 'Medical', period: 'month', value: fromPounds(70), taken: 0, payment: 'beforeTax' },
    ])
    expect(Object.keys(stored.scenarios[0].inputs).sort()).toEqual(Object.keys(optimiserCalculator.defaultInputs()).sort())
    expect(JSON.stringify(stored)).not.toMatch(/incomeTax|"net"/)
    type(box('opt-salary'), '1')
    expect($('[data-unsaved]')!.textContent).toBe('Unsaved changes')
    click($('button[aria-label="Load “Mine”"]'))
    expect(box('opt-salary').value).toBe('41,000')
    expect(box(`${items('benefits')[0]!.id}-name`).value).toBe('Medical')
    expect(box(`${items('benefits')[0]!.id}-value`).value).toBe('70')
    expect(medical).toBeDefined()
  })

  it('loads a version 1 scenario with identical take-home, as one item per year', () => {
    const v1 = {
      region: 'rUK',
      salary: fromPounds(58_000),
      bonus: fromPounds(2_000),
      pensionMethod: 'salarySacrifice',
      employeeContribution: fromPounds(4_000),
      employerContribution: fromPounds(1_500),
      taxableBenefits: fromPounds(1_100),
      postTaxDeductions: fromPounds(240),
      studentLoans: ['plan1'],
      children: 1,
      childBenefit: 'claimed',
    }
    const expected = takeHome(
      {
        grossPay: fromPounds(60_000),
        region: 'rUK',
        studentLoans: ['plan1'],
        pension: { method: 'salarySacrifice', contribution: fromPounds(4_000) },
        childBenefit: { children: 1, payments: 'claimed' },
        taxableBenefits: fromPounds(1_100),
        postTaxDeductions: fromPounds(240),
      },
      taxYear,
      DEFAULT_POLICY,
    )
    if (!expected.ok) throw new Error('refused')
    // Save a scenario through the page, then rewrite it in storage as 0.9.0 stored it (inputs version 1).
    save('Before')
    const record = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    record.scenarios[0].inputsVersion = 1
    record.scenarios[0].inputs = v1
    localStorage.setItem(STORAGE_KEYS.scenarios.key, JSON.stringify(record))
    act(() => scenarioStore.reload())
    expect(scenarioStore.get().scenarios.map((sc) => sc.name)).toEqual(['Before'])
    click($('button[aria-label="Load “Before”"]'))
    expect(row('Take-home')).toBe(money(expected.annual.net))
    expect(box(`${items('benefits')[0]!.id}-name`).value).toBe('Benefits in kind')
  })
})

describe('Optimiser page: percentage contributions and pensionable pay', () => {
  it('switches the employee contribution between an amount and a percentage, showing the resolved amount', () => {
    type(box('opt-salary'), '50,000')
    type(box('opt-employee'), '2,000')
    expect($('#opt-employee-pct')).toBeNull()
    choose('opt-employee-mode', 'percentOfPay')
    expect($('#opt-employee')).toBeNull()
    type(box('opt-employee-pct'), '6')
    const resolved = mulRound(fromPounds(50_000), percentRatio('6'), 'nearest')
    expect($('#opt-employee-resolved')!.textContent).toContain(money(resolved))
    expect(row('Employee pension')).toBe(money(engine().annual.pension))
    expect(engine().annual.pension).toBe(resolved)
    choose('opt-employee-mode', 'amount')
    expect(box('opt-employee').value).toBe('2,000')
    expect(row('Employee pension')).toBe(money(fromPounds(2_000)))
  })

  it('shows pensionable pay only with a percentage; the bonus switch and own figure change the resolved amount', () => {
    type(box('opt-salary'), '40,000')
    type(box('opt-bonus'), '10,000')
    expect($('#opt-pensionable-own')).toBeNull()
    choose('opt-employer-mode', 'percentOfPay')
    type(box('opt-employer-pct'), '10')
    expect($('#opt-pensionable-resolved')!.textContent).toContain(money(fromPounds(40_000)))
    expect($('#opt-employer-resolved')!.textContent).toContain(money(fromPounds(4_000)))
    click($('#opt-pensionable-bonus'))
    expect($('#opt-pensionable-resolved')!.textContent).toContain(money(fromPounds(50_000)))
    expect($('#opt-employer-resolved')!.textContent).toContain(money(fromPounds(5_000)))
    click($('#opt-pensionable-own'))
    type(box('opt-pensionable'), '30,000')
    expect($('#opt-pensionable-resolved')!.textContent).toContain(money(fromPounds(40_000)))
    expect($('#opt-employer-resolved')!.textContent).toContain(money(fromPounds(4_000)))
  })

  it('an invalid own pensionable pay stops blocking results once no contribution is a percentage', () => {
    type(box('opt-salary'), '30,000')
    choose('opt-employee-mode', 'percentOfPay')
    click($('#opt-pensionable-own'))
    type(box('opt-pensionable'), '1.234')
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    choose('opt-employee-mode', 'amount')
    expect($('#opt-pensionable')).toBeNull()
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
  })

  it('rounds a percentage to the nearest penny on the page', () => {
    type(box('opt-salary'), '10.10')
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '5')
    expect($('#opt-employee-resolved')!.textContent).toContain(money(fromPence(51)))
  })

  it('warns on a percentage above all of pensionable pay; a resolved contribution above pay shows the existing notice', () => {
    type(box('opt-salary'), '20,000')
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '120')
    expect($('[data-input-warning="percentAboveAllOfPay"]')).not.toBeNull()
    expect($('[data-input-problem]')).not.toBeNull()
    type(box('opt-employee-pct'), '100')
    expect($('[data-input-warning="percentAboveAllOfPay"]')).toBeNull()
  })

  it('an invalid percentage shows its error tied to the box, and no results; switching mode away clears it', () => {
    type(box('opt-salary'), '20,000')
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '5.123')
    const input = box('opt-employee-pct')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('opt-employee-pct-error')
    expect($('#opt-employee-pct-error')!.textContent).toMatch(/decimal/)
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    choose('opt-employee-mode', 'amount')
    expect(view.host.textContent).not.toMatch(/Fix the highlighted inputs/)
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
  })
})

describe('Optimiser page: itemised benefits and deductions', () => {
  it('starts with empty lists, a total of nothing and an add button for each', () => {
    expect(items('benefits')).toHaveLength(0)
    expect($('#opt-benefits-total')!.textContent).toContain(money(fromPence(0)))
    expect($('#opt-benefits-add')!.textContent).toBe('Add a benefit')
    expect($('#opt-deductions-add')!.textContent).toBe('Add a deduction')
  })

  it('adds and edits items, with each item’s annual amount and the running total; monthly times the months in a year', () => {
    type(box('opt-salary'), '45,000')
    const medical = addItem('benefits', 'Medical', '45', 'month')
    addItem('benefits', 'Car', '3,000', 'year')
    const total = fromPounds(45 * MONTHS_PER_YEAR + 3_000)
    expect($('#opt-benefits-total')!.textContent).toContain(money(total))
    expect($(`#${medical}`)!.textContent).toContain(`${money(fromPounds(45 * MONTHS_PER_YEAR))} for the year`)
    expect(row('Taxable benefits in kind')).toBe(money(total))
    expect(row('Income tax')).toBe(money(engine().annual.incomeTax))
    type(box(`${medical}-value`), '50')
    expect($('#opt-benefits-total')!.textContent).toContain(money(fromPounds(50 * MONTHS_PER_YEAR + 3_000)))
    choose(`${medical}-period`, 'year')
    expect($('#opt-benefits-total')!.textContent).toContain(money(fromPounds(3_050)))
    type(box(`${medical}-name`), 'Private medical')
    expect(session.get().inputs.taxableBenefits[0]!.name).toBe('Private medical')
  })

  it('a monthly entry gives the same take-home as the annual entry', () => {
    type(box('opt-salary'), '38,000')
    const item = addItem('deductions', 'Dental', '25', 'month')
    const monthly = row('Take-home')
    type(box(`${item}-amount`), String(25 * MONTHS_PER_YEAR))
    choose(`${item}-period`, 'year')
    expect(row('Take-home')).toBe(monthly)
  })

  it('removes the right item, keeping the others as they were', () => {
    const first = addItem('deductions', 'Gym', '30', 'month')
    const second = addItem('deductions', 'Dental', '200')
    const third = addItem('deductions', 'Union', '10', 'month')
    click($(`#${second}-remove`))
    expect(items('deductions').map((el) => el.id)).toEqual([first, third])
    expect(box(`${third}-name`).value).toBe('Union')
    expect(session.get().inputs.postTaxDeductions.map((i) => i.name)).toEqual(['Gym', 'Union'])
    expect($('#opt-deductions-total')!.textContent).toContain(money(fromPounds(40 * MONTHS_PER_YEAR)))
  })

  it('removing an item with an invalid box clears the problem so results return', () => {
    type(box('opt-salary'), '30,000')
    const item = addItem('benefits', 'Car', '1')
    type(box(`${item}-value`), '1.234')
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    click($(`#${item}-remove`))
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
  })

  it('holds at most the input limit of items, then disables Add and says why', () => {
    for (let i = 0; i < INPUT_LIMITS.maxItems; i++) click($('#opt-benefits-add'))
    expect(items('benefits')).toHaveLength(INPUT_LIMITS.maxItems)
    const add = $('#opt-benefits-add') as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(add.getAttribute('aria-describedby')).toBe('opt-benefits-full')
    expect($('#opt-benefits-full')).not.toBeNull()
  })

  it('a name over the limit shows an error tied to the box; names are shown only as text', () => {
    const item = addItem('benefits', '<b>Bold</b>', '10')
    expect(view.host.querySelector('b')).toBeNull()
    expect($(`#${item} legend`)!.textContent).toBe('Benefit 1')
    expect($(`#${item}-remove`)!.getAttribute('aria-label')).toBe('Remove <b>Bold</b>')
    type(box(`${item}-name`), 'n'.repeat(INPUT_LIMITS.maxNameLength + 1))
    const input = box(`${item}-name`)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(`${item}-name-error`)
    expect(session.get().inputs.taxableBenefits[0]!.name).toBe('<b>Bold</b>')
  })

  it('warns on an item with no amount, naming it', () => {
    type(box('opt-salary'), '30,000')
    addItem('benefits', 'Gym', '0')
    const warning = $('[data-input-warning="itemWithoutAmount"]')
    expect(warning?.textContent).toContain('“Gym”')
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
  })

  it('every list control is a native, labelled control reachable by keyboard', () => {
    const item = addItem('benefits', 'Medical', '10')
    for (const id of [`${item}-name`, `${item}-value`, `${item}-taken`]) {
      const input = box(id)
      expect(input.tagName).toBe('INPUT')
      expect($(`label[for="${id}"]`)).not.toBeNull()
    }
    expect(view.host.querySelectorAll(`input[name="${item}-period"]`)).toHaveLength(2)
    expect(view.host.querySelectorAll(`input[name="${item}-payment"]`)).toHaveLength(2)
    for (const el of [$(`#${item}-remove`), $('#opt-benefits-add')]) {
      expect(el!.tagName).toBe('BUTTON')
      expect(el!.getAttribute('tabindex')).toBeNull()
    }
    expect($(`#${item}-remove`)!.getAttribute('aria-label')).toBe('Remove Medical')
    expect($(`#${item}`)!.tagName).toBe('FIELDSET')
  })
})

describe('Optimiser page: benefits taken from pay (B10)', () => {
  it('a benefit for salary given up: its taxable amount and what is taken, the totals, a breakdown row, and a warning', () => {
    type(box('opt-salary'), '48,000')
    const before = engine()
    const item = addItem('benefits', 'Medical', '500', 'year', { amount: '600', payment: 'beforeTax' })
    const result = engine()
    expect($(`#${item}`)!.textContent).toContain(`Taxable: ${money(fromPounds(600))} for the year`)
    expect($(`#${item}`)!.textContent).toContain(`taken from pay: ${money(fromPounds(600))} before tax`)
    expect($('#opt-benefits-total')!.textContent).toContain(`Salary given up: ${money(fromPounds(600))}`)
    expect(row('Salary given up for benefits')).toBe(money(fromPounds(600)))
    expect(row('National Insurance')).toBe(money(result.annual.nationalInsurance))
    expect(result.annual.nationalInsurance).toBeLessThan(before.annual.nationalInsurance)
    expect(row('Take-home')).toBe(money(result.annual.net))
    expect($('[data-warning="benefitSalarySacrifice"]')).not.toBeNull()
  })

  it('a benefit paid for after tax: its own breakdown row, NI unchanged, take-home from the engine', () => {
    type(box('opt-salary'), '48,000')
    const before = engine()
    const item = addItem('benefits', 'Gym', '50', 'month', { amount: '20', payment: 'afterTax' })
    expect($(`#${item}`)!.textContent).toContain(`Taxable: ${money(fromPounds(30 * MONTHS_PER_YEAR))} for the year`)
    expect(row('Benefit payments after tax')).toBe(money(fromPounds(20 * MONTHS_PER_YEAR)))
    expect(row('National Insurance')).toBe(money(before.annual.nationalInsurance))
    expect(row('Take-home')).toBe(money(engine().annual.net))
    expect($('[data-warning="benefitSalarySacrifice"]')).toBeNull()
    expect(row('Salary given up for benefits')).toBeUndefined()
  })

  it('salary given up above pay shows the input problem instead of results', () => {
    type(box('opt-salary'), '10,000')
    addItem('benefits', 'Car', '0', 'year', { amount: '12,000', payment: 'beforeTax' })
    expect($('[data-input-problem]')!.textContent).toMatch(/salary given up/i)
  })

  it('loads a version 2 scenario with identical take-home: each item its value, nothing taken', () => {
    type(box('opt-salary'), '64,000')
    addItem('benefits', 'Medical', '80', 'month')
    addItem('benefits', 'Car', '3,100')
    addItem('deductions', 'Dental', '15', 'month')
    const expected = engine().annual.net
    save('Older')
    const record = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    const { taxCode: _none, ...v2 } = record.scenarios[0].inputs
    v2.taxableBenefits = [
      { name: 'Medical', amount: fromPounds(80), period: 'month' },
      { name: 'Car', amount: fromPounds(3_100), period: 'year' },
    ]
    record.scenarios[0].inputsVersion = 2
    record.scenarios[0].inputs = v2
    localStorage.setItem(STORAGE_KEYS.scenarios.key, JSON.stringify(record))
    act(() => scenarioStore.reload())
    type(box('opt-salary'), '1')
    expect(row('Take-home')).not.toBe(money(expected))
    click($('button[aria-label="Load “Older”"]'))
    expect(row('Take-home')).toBe(money(expected))
    expect(box(`${items('benefits')[1]!.id}-value`).value).toBe('3,100')
    expect(box(`${items('benefits')[1]!.id}-taken`).value).toBe('0')
  })
})

describe('Optimiser page: tax code and PAYE estimate (B11 to B13)', () => {
  it('no code: neither the PAYE card nor a notice', () => {
    type(box('opt-salary'), '40,000')
    expect($('[data-paye]')).toBeNull()
    expect($('[data-paye-notice]')).toBeNull()
  })

  it('a supported code: the estimate, a month, the year’s tax and the difference, from the engine; stored in canonical form', () => {
    type(box('opt-salary'), '56,000')
    addItem('benefits', 'Medical', '1,200')
    type(box('opt-tax-code'), ' 900 l ')
    expect(session.get().inputs.taxCode).toBe('900L')
    const e = estimate('900L')
    const card = $('[data-paye]')!
    expect(card.textContent).toContain(money(e.paye.total))
    expect(card.textContent).toContain('900L')
    expect(row('PAYE a month')).toBe(money(e.paye.months[0]!.tax))
    expect(row('Income tax for the year')).toBe(money(e.liability))
    expect(row('Income tax for the year')).toBe(row('Income tax'))
    expect(row('Difference')).toBe(money(Math.abs(e.difference) as Money))
    expect(card.textContent).toMatch(/tax code|Self Assessment/)
    expect(card.textContent).not.toMatch(/\d\s*%/)
    // The headline stays the year's liability.
    expect(row('Year')).toBe(money(engine().annual.net))
  })

  it('a code that is not modelled: a notice saying why, and no estimate', () => {
    type(box('opt-salary'), '40,000')
    for (const [code, kind] of [
      ['BR', 'BR'],
      ['k100', 'K'],
      ['SD1', 'D'],
      ['0T', '0T'],
      ['NT', 'NT'],
      ['100L M1', 'emergency'],
    ] as const) {
      type(box('opt-tax-code'), code)
      expect($(`[data-paye-notice="${kind}"]`), code).not.toBeNull()
      expect($('[data-paye]'), code).toBeNull()
      expect(byText(view.host, 'h2', 'Breakdown'), code).toBeDefined()
    }
  })

  it('text that is not a code: an error tied to the box and no results; clearing it brings them back', () => {
    type(box('opt-salary'), '40,000')
    type(box('opt-tax-code'), '12A')
    const input = box('opt-tax-code')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('opt-tax-code-error')
    expect(view.host.textContent).toMatch(/Fix the highlighted inputs/)
    type(box('opt-tax-code'), '')
    expect(byText(view.host, 'h2', 'Breakdown')).toBeDefined()
    expect(session.get().inputs.taxCode).toBe('')
  })

  it('warns when the code’s prefix and where you live disagree', () => {
    type(box('opt-salary'), '40,000')
    type(box('opt-tax-code'), 'S100L')
    expect($('[data-input-warning="taxCodeRegion"]')).not.toBeNull()
    choose('opt-region', 'scotland')
    expect($('[data-input-warning="taxCodeRegion"]')).toBeNull()
  })

  it('lists the PAYE assumptions with a supported code (level monthly pay), with no figures', () => {
    type(box('opt-salary'), '40,000')
    type(box('opt-tax-code'), '100L')
    const text = $('details#assumptions')!.textContent ?? ''
    for (const line of estimate('100L').paye.assumptions) expect(text).toContain(line)
    expect(text).toMatch(/level monthly pay/i)
  })
})

describe('Optimiser page: the breakdown by year or month (B14)', () => {
  /** The breakdown card's rows, by label. */
  const shownRows = () => {
    const card = $('[data-breakdown]')!
    return Object.fromEntries(
      [...card.querySelectorAll('dt')].map((dt) => [dt.textContent!.trim(), dt.nextElementSibling!.firstChild!.textContent!.trim()]),
    )
  }

  it('starts on the year; the month shows each row per month, adding up to take-home, with the PAYE month alongside', () => {
    type(box('opt-salary'), '71,000')
    click($('#opt-loan-plan1'))
    type(box('opt-employee'), '2,500')
    addItem('benefits', 'Medical', '40', 'month', { amount: '45', payment: 'beforeTax' })
    addItem('deductions', 'Dental', '13', 'month')
    type(box('opt-tax-code'), '900L')
    expect(($('input[name="opt-breakdown-period"][value="year"]') as HTMLInputElement).checked).toBe(true)
    expect($('[data-breakdown]')!.getAttribute('data-breakdown')).toBe('year')
    choose('opt-breakdown-period', 'month')
    const { annual } = engine()
    const month = breakdown(annual, 'month')
    const rows = shownRows()
    expect(rows['Gross pay']).toBe(money(month.gross))
    expect(rows['Income tax']).toBe(money(month.rows.incomeTax))
    expect(rows['Salary given up for benefits']).toBe(money(month.rows.benefitSacrifice))
    expect(rows['Take-home']).toBe(money(month.takeHome))
    expect(rows['Income tax through PAYE']).toBe(money(estimate('900L').paye.months[0]!.tax))
    expect(DEDUCTION_ROWS.reduce((left, r) => left - month.rows[r], month.gross as number)).toBe(month.takeHome)
    choose('opt-breakdown-period', 'year')
    expect(shownRows()['Take-home']).toBe(money(annual.net))
    expect(shownRows()['Income tax through PAYE']).toBeUndefined()
  })

  it('states a penny difference from the year divided evenly when there is one', () => {
    // Find salaries whose rounding moves the month: the difference is shown in words with both figures.
    let shown = false
    for (const salary of ['40,001', '40,003', '40,007', '40,011', '40,013', '40,017', '40,019', '40,023']) {
      type(box('opt-salary'), salary)
      choose('opt-breakdown-period', 'month')
      const month = breakdown(engine().annual, 'month')
      const text = $('[data-breakdown]')!.textContent ?? ''
      if (month.difference !== 0) {
        expect(text).toContain(money(month.evenShare))
        expect(text).toMatch(/divided evenly/)
        shown = true
      } else expect(text).not.toMatch(/than the year’s take-home divided evenly/)
    }
    expect(shown).toBe(true)
  })

  it('the toggle is a native radio group with a legend, reachable by keyboard', () => {
    type(box('opt-salary'), '30,000')
    const radios = view.host.querySelectorAll('input[name="opt-breakdown-period"]')
    expect(radios).toHaveLength(2)
    for (const radio of radios) expect(radio.getAttribute('tabindex')).toBeNull()
    expect(radios[0]!.closest('fieldset')!.querySelector('legend')!.textContent).toMatch(/breakdown/i)
  })
})

/** Loads inputs as a saved scenario would be, through the store and the session. */
function loadScenario(name: string, inputs: OptimiserPageInputs) {
  const created = scenarioStore.create({ calculatorId: 'optimiser', taxYear: taxYear.id, name, inputs })
  if (!created.ok) throw new Error(created.error)
  act(() => session.load(created.scenario))
}

const sectionButton = (id: SectionId) => $(`#opt-section-${id}-button`) as HTMLButtonElement
const isOpen = (id: SectionId) => sectionButton(id).getAttribute('aria-expanded') === 'true'
const openSections = () => SECTION_IDS.filter(isOpen)
const summaryOf = (id: SectionId) => $(`#opt-section-${id}-summary`)!.textContent
const defaults = optimiserCalculator.defaultInputs()

describe('Optimiser page layout (0.12.0): your pay and sections', () => {
  it('keeps salary, bonus, where you live and tax year always visible, outside any section', () => {
    for (const id of ['opt-salary', 'opt-bonus', 'opt-tax-year']) {
      expect(box(id).closest('[hidden]'), id).toBeNull()
      expect(box(id).closest('[data-section]'), id).toBeNull()
    }
    const region = $('input[name="opt-region"]')!
    expect(region.closest('[hidden]')).toBeNull()
    expect(region.closest('[data-section]')).toBeNull()
    expect(byText(view.host, 'h2', 'Your pay')).toBeDefined()
  })

  it('has the five sections, in order, each closed with “Not set” on a fresh start', () => {
    expect([...view.host.querySelectorAll('[data-section]')].map((el) => el.getAttribute('data-section'))).toEqual(
      SECTION_IDS.map((id) => `opt-section-${id}`),
    )
    expect(openSections()).toEqual([])
    for (const id of SECTION_IDS) expect(summaryOf(id), id).toBe(NOT_SET)
  })

  it('puts each input in its section', () => {
    const inSection = (selector: string) =>
      $(selector)!.closest('[data-section]')?.getAttribute('data-section')?.replace('opt-section-', '')
    expect(inSection('#opt-method')).toBe('pension')
    expect(inSection('#opt-employee')).toBe('pension')
    expect(inSection('#opt-employer')).toBe('pension')
    expect(inSection('#opt-benefits-add')).toBe('benefits')
    expect(inSection('#opt-deductions-add')).toBe('benefits')
    expect(inSection('#opt-loan-plan1')).toBe('studentLoans')
    expect(inSection('#opt-children')).toBe('childBenefit')
    expect(inSection('#opt-tax-code')).toBe('taxCode')
  })

  it('opens and closes a section by its button, which says its state', () => {
    click(sectionButton('pension'))
    expect(isOpen('pension')).toBe(true)
    expect(($('#opt-section-pension-panel') as HTMLElement).hidden).toBe(false)
    click(sectionButton('pension'))
    expect(isOpen('pension')).toBe(false)
    expect(($('#opt-section-pension-panel') as HTMLElement).hidden).toBe(true)
  })

  it('summaries follow the inputs and match the resolved amounts the engine receives', () => {
    type(box('opt-salary'), '50,000')
    click(sectionButton('pension'))
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '6')
    addItem('benefits', 'Medical', '45', 'month')
    addItem('deductions', 'Dental', '20', 'month')
    click($('#opt-loan-plan2'))
    type(box('opt-children'), '2')
    type(box('opt-tax-code'), '900L')
    const inputs = session.get().inputs
    const resolved = resolveInputs(inputs)
    for (const id of SECTION_IDS) expect(summaryOf(id), id).toBe(sectionSummary(id, inputs, resolved, money))
    expect(summaryOf('pension')).toContain(money(resolved.employeeContribution))
    expect(summaryOf('benefits')).toContain(money(resolved.taxableBenefits))
    expect(summaryOf('benefits')).toContain(money(resolved.postTaxDeductions))
  })

  it('a section with an input to fix says so in its summary', () => {
    type(box('opt-employee'), '1.234')
    expect(summaryOf('pension')).toMatch(/needs fixing/)
    type(box('opt-employee'), '1')
    expect(summaryOf('pension')).not.toMatch(/needs fixing/)
  })

  it('a loaded scenario opens the sections it sets, and only those; starting new closes them all', () => {
    loadScenario('Some set', {
      ...defaults,
      salary: fromPounds(60_000),
      employeeContribution: { mode: 'amount', amount: fromPounds(3_000), percentOfPay: '0' },
      taxCode: '1100L',
    })
    expect(openSections()).toEqual(['pension', 'taxCode'])
    loadScenario('Others', { ...defaults, salary: fromPounds(30_000), studentLoans: ['plan1'], children: 1 })
    expect(openSections()).toEqual(['studentLoans', 'childBenefit'])
    act(() => session.startNew())
    expect(openSections()).toEqual([])
  })

  it('open sections are not stored: a new visit opens only what the inputs set', () => {
    click(sectionButton('studentLoans'))
    expect(isOpen('studentLoans')).toBe(true)
    view.unmount()
    view = mount(<OptimiserPage />)
    expect(openSections()).toEqual([])
    const keys = Object.keys(localStorage)
    expect(keys.every((key) => Object.values(STORAGE_KEYS).some((k) => k.key === key))).toBe(true)
  })
})

describe('Optimiser page layout (0.12.0): results', () => {
  const sticky = () => $('[data-sticky-result]')!

  it('the sticky bar shows take-home for the chosen period, with the tax-year badge', () => {
    type(box('opt-salary'), '52,000')
    const r = engine()
    expect($('[data-sticky-value]')!.textContent).toBe(money(r.annual.net))
    expect(sticky().textContent).toMatch(/for the year/)
    expect(sticky().querySelector('a[href="#/tax-data"]')).not.toBeNull()
    choose('opt-period', 'month')
    expect($('[data-sticky-value]')!.textContent).toBe(money(breakdown(r.annual, 'month').takeHome))
    expect(sticky().textContent).toMatch(/a month/)
    // One period for the page: the breakdown follows.
    expect($('[data-breakdown]')!.getAttribute('data-breakdown')).toBe('month')
  })

  it('the sticky bar says there is no result while an input is invalid', () => {
    type(box('opt-salary'), '1.234')
    expect($('[data-sticky-value]')).toBeNull()
    expect(sticky().textContent).toMatch(/fix/i)
  })

  it('announces take-home once, after the inputs settle, never on each keystroke', () => {
    vi.useFakeTimers()
    try {
      const live = $('[data-sticky-announcer]')!
      for (const text of ['5', '52', '52,0', '52,00', '52,000']) {
        type(box('opt-salary'), text)
        act(() => vi.advanceTimersByTime(SETTLE_MS / 2))
        expect(live.textContent).toBe('')
      }
      act(() => vi.advanceTimersByTime(SETTLE_MS))
      expect(live.textContent).toContain(money(engine().annual.net))
      // No other live region in the inputs announces as you type.
      expect($('[data-inputs] [aria-live]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('results run headline, split bar, breakdown, PAYE card, top to bottom', () => {
    type(box('opt-salary'), '56,000')
    type(box('opt-tax-code'), '900L')
    const order = ['[data-headline]', '[data-split]', '[data-breakdown]', '[data-paye]'].map((sel) => $(sel)!)
    for (let i = 1; i < order.length; i++)
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, String(i)).toBeTruthy()
    for (const el of order) expect(el.closest('[data-results]')).not.toBeNull()
  })

  it('the split bar shows where gross pay goes for the period, adding up to gross pay', () => {
    type(box('opt-salary'), '70,000')
    click($('#opt-loan-plan2'))
    type(box('opt-employee'), '3,000')
    addItem('benefits', 'Car', '0', 'year', { amount: '1,200', payment: 'beforeTax' })
    for (const period of ['year', 'month'] as const) {
      choose('opt-period', period)
      const shown = breakdown(engine().annual, period)
      const drawn = [...$('[data-split]')!.querySelectorAll('[data-segment]')]
      const values: Record<string, number> = Object.fromEntries(
        drawn.map((el) => [el.getAttribute('data-segment'), Number(el.getAttribute('data-value'))]),
      )
      const expected = Object.fromEntries(
        splitSegments(shown)
          .filter((s) => s.amount !== 0)
          .map((s) => [s.id, s.amount]),
      )
      expect(values, period).toEqual(expected)
      expect(
        Object.values(values).reduce((a, b) => a + b, 0),
        period,
      ).toBe(shown.gross)
      expect($('[data-split] figcaption')!.textContent).toContain(money(shown.gross))
      expect($('[data-split] table')).not.toBeNull()
    }
  })

  it('without a tax code, or with one not modelled, one take-home line as before', () => {
    type(box('opt-salary'), '56,000')
    expect(row('Estimated payslip net pay')).toBeUndefined()
    expect(row('Take-home after the year-end adjustment')).toBeUndefined()
    type(box('opt-tax-code'), 'BR')
    expect(row('Estimated payslip net pay')).toBeUndefined()
    expect(row('Year')).toBe(money(engine().annual.net))
  })

  it('with a supported code, two labelled lines: payslip net pay on the PAYE tax, and take-home after the year-end adjustment', () => {
    type(box('opt-salary'), '56,000')
    addItem('benefits', 'Medical', '1,200')
    type(box('opt-tax-code'), '900L')
    const e = estimate('900L')
    const { annual } = engine()
    expect(row('Estimated payslip net pay')).toBe(money(payslipNet(breakdown(annual, 'year'), e)))
    expect(row('Take-home after the year-end adjustment')).toBe(money(annual.net))
    choose('opt-period', 'month')
    expect(row('Estimated payslip net pay')).toBe(money(payslipNet(breakdown(annual, 'month'), e)))
    expect(row('Take-home after the year-end adjustment')).toBe(money(breakdown(annual, 'month').takeHome))
    const note = $('[data-net-pay-note]')!.textContent ?? ''
    expect(note.length).toBeGreaterThan(0)
    expect(note).not.toMatch(/\d/)
  })

  it('the scenario bar sits in the inputs column, above the inputs', () => {
    const bar = byText(view.host, 'button', 'Save')!.closest('section')!
    const inputs = $('[data-inputs]')!
    expect(inputs.contains(bar)).toBe(true)
    expect(bar.compareDocumentPosition(box('opt-salary')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ['salary and bonus', { salary: fromPounds(52_000), bonus: fromPounds(4_000) }],
    [
      'every section',
      {
        salary: fromPounds(118_000),
        pensionMethod: 'netPay',
        employeeContribution: { mode: 'percentOfPay', amount: ZERO, percentOfPay: '6' },
        taxableBenefits: [{ name: 'Car', period: 'year', value: fromPounds(3_200), taken: fromPounds(3_600), payment: 'beforeTax' }],
        postTaxDeductions: [{ name: 'Dental', amount: fromPounds(18), period: 'month' }],
        studentLoans: ['plan2'],
        children: 2,
        taxCode: '900L',
      },
    ],
    ['scotland', { region: 'scotland', salary: fromPounds(64_000), studentLoans: ['plan4'], taxCode: 'S1100L' }],
  ] as [string, Partial<OptimiserPageInputs>][])('shows the same results as before for %s', (_name, patch) => {
    loadScenario('Case', { ...defaults, ...patch })
    const { annual, weekly } = engine()
    expect(row('Year')).toBe(money(annual.net))
    expect(row('Week')).toBe(money(weekly.net))
    for (const [label, value] of [
      ['Gross pay', annual.gross],
      ['Income tax', annual.incomeTax],
      ['National Insurance', annual.nationalInsurance],
      ['Take-home', annual.net],
    ] as const)
      expect(row(label), label).toBe(money(value))
  })
})

describe('Optimiser page layout (0.12.0): item cards', () => {
  it('a new item opens for editing with its name box focused; Done folds it to one line with its name and amounts', () => {
    type(box('opt-salary'), '40,000')
    const id = addItem('benefits', 'Medical', '45', 'month')
    const edit = $(`#${id}-edit`) as HTMLButtonElement
    expect(edit.getAttribute('aria-expanded')).toBe('true')
    expect(edit.getAttribute('aria-controls')).toBe(`${id}-fields`)
    click(edit)
    expect(edit.getAttribute('aria-expanded')).toBe('false')
    expect(($(`#${id}-fields`) as HTMLElement).hidden).toBe(true)
    const header = $(`#${id}-summary`)!.textContent ?? ''
    expect(header).toContain('Medical')
    expect(header).toContain(money(fromPounds(45 * MONTHS_PER_YEAR)))
  })

  it('focuses the new item’s name when added', () => {
    click(sectionButton('benefits'))
    click($('#opt-deductions-add'))
    const id = items('deductions').at(-1)!.id
    expect(document.activeElement).toBe(box(`${id}-name`))
  })

  it('items in a loaded scenario show folded, and open in place to edit', () => {
    loadScenario('Items', {
      ...defaults,
      salary: fromPounds(40_000),
      postTaxDeductions: [{ name: 'Dental', amount: fromPounds(20), period: 'month' }],
    })
    const id = items('deductions')[0]!.id
    expect(($(`#${id}-fields`) as HTMLElement).hidden).toBe(true)
    click($(`#${id}-edit`))
    expect(($(`#${id}-fields`) as HTMLElement).hidden).toBe(false)
    expect(box(`${id}-name`).value).toBe('Dental')
  })

  it('an item with an input to fix stays open', () => {
    const id = addItem('deductions', 'Gym', '30')
    type(box(`${id}-amount`), '1.234')
    click($(`#${id}-edit`))
    expect(($(`#${id}-fields`) as HTMLElement).hidden).toBe(false)
  })

  it('Remove takes the item out and offers Undo, which puts it back where it was', () => {
    type(box('opt-salary'), '40,000')
    addItem('deductions', 'Gym', '30', 'month')
    const second = addItem('deductions', 'Dental', '200')
    addItem('deductions', 'Union', '10', 'month')
    const before = row('Take-home')
    click($(`#${second}-remove`))
    expect(session.get().inputs.postTaxDeductions.map((i) => i.name)).toEqual(['Gym', 'Union'])
    expect(toasts.get().toast?.message).toContain('“Dental”')
    expect(toasts.get().toast?.undo).toBeDefined()
    act(() => toasts.undo())
    expect(session.get().inputs.postTaxDeductions.map((i) => i.name)).toEqual(['Gym', 'Dental', 'Union'])
    expect(items('deductions')).toHaveLength(3)
    expect(row('Take-home')).toBe(before)
  })

  it('Undo does nothing, and says so, once a different scenario is loaded', () => {
    const id = addItem('deductions', 'Gym', '30')
    click($(`#${id}-remove`))
    loadScenario('Other', { ...defaults, salary: fromPounds(1) })
    act(() => toasts.undo())
    expect(session.get().inputs.postTaxDeductions).toEqual([])
    expect(toasts.get().toast?.message).toMatch(/couldn’t undo/i)
  })
})

describe('page code', () => {
  it('holds no tax figure: no amounts in pounds, no percentages, no config reads', () => {
    for (const name of ['OptimiserPage.tsx', 'definition.ts', 'pageInputs.ts', 'breakdown.ts', 'chartData.ts']) {
      const source = readFileSync(join(__dirname, name), 'utf8')
      // "per cent" or "percent" as a word, not inside a name like PercentInput or percentRatio.
      expect(source, name).not.toMatch(/£\s?\d|\d\s?%|\bper ?cent\b/i)
      expect(source, name).not.toMatch(/requireVerified|from '@\/config\/tax\/2026-27'/)
    }
  })
})

/** optimise() for the page's inputs now, as the page asks for it. */
const sweep = (): OptimiseResult => {
  const result = calculateOptimise(session.get().inputs, taxYear)
  if (!result.ok || 'problem' in result) throw new Error('no result')
  return result
}

describe('Optimiser chart (1b-ii-a)', () => {
  it('shows no chart until there is pay, then one in the results column below the split bar', () => {
    expect($('[data-optimiser]')).toBeNull()
    type(box('opt-salary'), '120,000')
    const chart = $('[data-optimiser]')!
    expect(chart).not.toBeNull()
    expect(chart.querySelector('[data-chart]')).not.toBeNull()
    const split = $('[data-split]')!
    expect(split.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // In the same results column, straight after the split bar.
    expect(split.nextElementSibling).toBe(chart)
  })

  it('plots spendable against contribution by default, and take-home after the switch, from optimise()', () => {
    type(box('opt-salary'), '110,000')
    type(box('opt-children'), '2')
    const result = sweep()
    const tableValues = () => [...$('[data-optimiser] tbody')!.querySelectorAll('tr')].map((tr) => tr.children[1]!.textContent)
    expect($('[data-optimiser] thead')!.textContent).toMatch(/Spendable/)
    expect(tableValues()).toEqual(result.points.map((p) => money(p.spendable)))
    choose('opt-chart-view', 'takeHome')
    expect($('[data-optimiser] thead')!.textContent).toMatch(/Take-home/)
    expect(tableValues()).toEqual(result.points.map((p) => money(p.takeHome)))
  })

  it('marks the current contribution, the maximum and each threshold point, and calls none the best', () => {
    type(box('opt-salary'), '125,000')
    type(box('opt-employee'), '4,000')
    const result = sweep()
    const list = $('[data-optimiser] [data-marker-list]')!.textContent!
    expect(list).toContain(`${REASON_LABELS.current}: ${money(result.currentContribution)}`)
    expect(list).toContain(REASON_LABELS.maximum)
    for (const t of result.thresholds.filter((t) => t.contribution !== null && t.contribution <= result.maximumContribution))
      expect(list, t.threshold).toContain(THRESHOLD_LABELS[t.threshold])
    expect($('[data-optimiser]')!.textContent).not.toMatch(/\bbest\b|optimal|recommended/i)
  })

  it('shows a percentage contribution as a percentage of pensionable pay beside the marker labels', () => {
    type(box('opt-salary'), '100,000')
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '5')
    expect($('[data-optimiser] [data-marker-list]')!.textContent).toMatch(/: £5,000\.00 \(5% of pensionable pay\)/)
  })

  it('draws the Child Benefit charge’s steps as a labelled range, and says the curve can move a little either way', () => {
    type(box('opt-salary'), '95,000')
    type(box('opt-children'), '1')
    expect($('[data-optimiser] [data-span]')).not.toBeNull()
    expect($('[data-optimiser] [data-marker-list]')!.textContent).toMatch(/Child Benefit charge/)
    expect($('[data-optimiser]')!.textContent).toMatch(/either way/)
  })
})

describe('Optimiser chart by period (1b-ii-b)', () => {
  it('follows the page’s Year / Month switch: axes, values and the month note', () => {
    type(box('opt-salary'), '120,000')
    expect($('[data-optimiser] thead')!.textContent).toMatch(/Spendable a year/)
    expect($('[data-optimiser] [data-month-note]')).toBeNull()
    choose('opt-period', 'month')
    const result = calculateOptimise(session.get().inputs, taxYear, 'month')
    if (!result.ok || 'problem' in result) throw new Error('no result')
    expect($('[data-optimiser] thead')!.textContent).toMatch(/Pension a month/)
    expect($('[data-optimiser] thead')!.textContent).toMatch(/Spendable a month/)
    const first = $('[data-optimiser] tbody tr')!.children[1]!.textContent
    expect(first).toBe(money(mulRound(result.points[0]!.spendable, ratio(1, MONTHS_PER_YEAR), 'nearest')))
    expect($('[data-optimiser] [data-month-note]')!.textContent).toMatch(/PAYE estimate/)
  })
})

describe('Change vs now (1b-ii-b)', () => {
  it('adds a signed change against the current contribution to the table, nothing on the current row', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-employee'), '6,000')
    expect($('[data-optimiser] thead')!.textContent).toContain('Change vs now')
    const rows = [...$('[data-optimiser] tbody')!.querySelectorAll('tr')]
    const now = rows.find((tr) => tr.textContent!.includes(REASON_LABELS.current))!
    expect(now.lastElementChild!.textContent).toBe(money(ZERO))
    expect(rows.some((tr) => tr.lastElementChild!.textContent!.startsWith('+'))).toBe(true)
    expect(rows.some((tr) => tr.lastElementChild!.textContent!.startsWith('-'))).toBe(true)
  })

  it('reads out the chosen point above the chart, the current contribution until another is chosen', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-employee'), '6,000')
    const result = sweep()
    const readout = () => $('[data-optimiser] [data-readout]')!.textContent!
    expect(readout()).toContain(money(result.currentContribution))
    expect(readout()).toMatch(/your contribution now/i)
    const select = box('opt-chosen') as unknown as HTMLSelectElement
    const other = result.points.find((p) => p.contribution > result.currentContribution)!
    act(() => {
      select.value = String(other.contribution)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(readout()).toContain(money(other.contribution))
    expect(readout()).toMatch(/[+-]£/)
    // The readout precedes the chart.
    const chart = $('[data-optimiser] [data-chart]')!
    expect($('[data-optimiser] [data-readout]')!.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Pension allowances section (inputs version 4)', () => {
  it('starts closed and not set, and is placed after Pension', () => {
    expect($('#opt-section-allowances-button')!.getAttribute('aria-expanded')).toBe('false')
    expect($('#opt-section-allowances-summary')!.textContent).toBe(NOT_SET)
    const pension = $('[data-section="opt-section-pension"]')!
    expect(pension.nextElementSibling).toBe($('[data-section="opt-section-allowances"]'))
  })

  it('stores carry forward by year, the money purchase flag and the childcare check, with no take-home change', () => {
    type(box('opt-salary'), '130,000')
    const before = row('Year')
    type(box('opt-carry-2'), '6,000')
    type(box('opt-carry-1'), '1,500')
    click($('#opt-mpaa'))
    click($('#opt-childcare'))
    expect(session.get().inputs).toMatchObject({
      carryForward: [
        { yearsAgo: 1, amount: fromPounds(1_500) },
        { yearsAgo: 2, amount: fromPounds(6_000) },
      ],
      moneyPurchaseAnnualAllowance: true,
      checkChildcare: true,
    })
    expect(row('Year')).toBe(before)
    type(box('opt-carry-2'), '0')
    expect(session.get().inputs.carryForward).toEqual([{ yearsAgo: 1, amount: fromPounds(1_500) }])
    expect($('#opt-section-allowances-summary')!.textContent).toMatch(/Carry forward/)
  })

  it('the childcare check adds the childcare limits as marked points', () => {
    type(box('opt-salary'), '120,000')
    expect($('[data-optimiser] [data-marker-list]')!.textContent).not.toContain(THRESHOLD_LABELS.taxFreeChildcareLimit)
    click($('#opt-childcare'))
    expect($('[data-optimiser] [data-marker-list]')!.textContent).toContain(THRESHOLD_LABELS.taxFreeChildcareLimit)
  })

  it('lists optimise()’s assumptions in the assumptions panel once there is a sweep', () => {
    type(box('opt-salary'), '120,000')
    click($('#opt-childcare'))
    const text = $('details#assumptions')!.textContent!
    for (const line of sweep().assumptions) expect(text).toContain(line)
  })
})
