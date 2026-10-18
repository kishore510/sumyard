// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP } from '@/lib/format'
import { fromPence, fromPounds, type Money, mulRound } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { sessionFor } from '../session'
import { takeHome } from './calc'
import { INPUT_LIMITS, type OptimiserPageInputs, optimiserCalculator, toTaxInputs } from './definition'
import OptimiserPage from './OptimiserPage'
import { DEFAULT_POLICY, type TakeHomeResult } from './types'

/*
 * Session 1b-i: the optimiser page at #/c/optimiser (take-home only; no
 * optimise(), chart or threshold points yet). Expected figures come from the
 * engine (takeHome), never from a figure written here. The refusal state is
 * in OptimiserPage.refusal.test.tsx.
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
afterEach(() => view.unmount())

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

/** Adds an item to a list through the page and fills it in; returns its element id. */
function addItem(list: List, name: string, amount: string, period: 'month' | 'year' = 'year') {
  click($(`#opt-${list}-add`))
  const item = items(list).at(-1)!
  type(box(`${item.id}-name`), name)
  type(box(`${item.id}-amount`), amount)
  click($(`input[name="${item.id}-period"][value="${period}"]`))
  return item.id
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
    expect(row('Month')).toBe(money(result.monthly.net))
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
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'optimiser', inputsVersion: 2 })
    expect(stored.scenarios[0].inputs.taxableBenefits).toEqual([{ name: 'Medical', amount: fromPounds(70), period: 'month' }])
    expect(Object.keys(stored.scenarios[0].inputs).sort()).toEqual(Object.keys(optimiserCalculator.defaultInputs()).sort())
    expect(JSON.stringify(stored)).not.toMatch(/incomeTax|"net"/)
    type(box('opt-salary'), '1')
    expect($('[data-unsaved]')!.textContent).toBe('Unsaved changes')
    click($('button[aria-label="Load “Mine”"]'))
    expect(box('opt-salary').value).toBe('41,000')
    expect(box(`${items('benefits')[0]!.id}-name`).value).toBe('Medical')
    expect(box(`${items('benefits')[0]!.id}-amount`).value).toBe('70')
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
    type(box(`${medical}-amount`), '50')
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
    type(box(`${item}-amount`), '1.234')
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
    expect($(`#${item} legend`)!.textContent).toBe('<b>Bold</b>')
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
    for (const id of [`${item}-name`, `${item}-amount`]) {
      const input = box(id)
      expect(input.tagName).toBe('INPUT')
      expect($(`label[for="${id}"]`)).not.toBeNull()
    }
    const radios = view.host.querySelectorAll(`input[name="${item}-period"]`)
    expect(radios).toHaveLength(2)
    for (const el of [$(`#${item}-remove`), $('#opt-benefits-add')]) {
      expect(el!.tagName).toBe('BUTTON')
      expect(el!.getAttribute('tabindex')).toBeNull()
    }
    expect($(`#${item}-remove`)!.getAttribute('aria-label')).toBe('Remove Medical')
    expect($(`#${item}`)!.tagName).toBe('FIELDSET')
  })
})

describe('page code', () => {
  it('holds no tax figure: no amounts in pounds, no percentages, no config reads', () => {
    for (const name of ['OptimiserPage.tsx', 'definition.ts', 'pageInputs.ts']) {
      const source = readFileSync(join(__dirname, name), 'utf8')
      // "per cent" or "percent" as a word, not inside a name like PercentInput or percentRatio.
      expect(source, name).not.toMatch(/£\s?\d|\d\s?%|\bper ?cent\b/i)
      expect(source, name).not.toMatch(/requireVerified|from '@\/config\/tax\/2026-27'/)
    }
  })
})
