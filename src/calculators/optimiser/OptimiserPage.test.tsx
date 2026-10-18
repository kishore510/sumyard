// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP } from '@/lib/format'
import { fromPounds, type Money } from '@/lib/money'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { sessionFor } from '../session'
import { takeHome } from './calc'
import { type OptimiserPageInputs, optimiserCalculator, toTaxInputs } from './definition'
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
    type(box('opt-deductions'), '480')
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
    type(box('opt-benefits'), '1,500')
    const withBenefit = engine()
    expect(withBenefit.annual.incomeTax).toBeGreaterThan(before.annual.incomeTax)
    expect(row('Income tax')).toBe(money(withBenefit.annual.incomeTax))
    expect(row('National Insurance')).toBe(money(before.annual.nationalInsurance))
    expect(row('Gross pay')).toBe(money(before.annual.gross))
    type(box('opt-deductions'), '250')
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
    type(box('opt-deductions'), '40,000')
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

  it('help text under benefits and deductions explains each in one line with no figures', () => {
    for (const id of ['opt-benefits', 'opt-deductions']) {
      const hint = $(`#${id}-hint`)?.textContent ?? ''
      expect(hint.length, id).toBeGreaterThan(0)
      expect(hint, id).not.toMatch(/\d/)
    }
  })

  it('assumptions list the engine’s and the page’s own', () => {
    type(box('opt-salary'), '30,000')
    type(box('opt-benefits'), '900')
    const text = $('details#assumptions')!.textContent ?? ''
    for (const line of engine().assumptions) expect(text).toContain(line)
    for (const word of [/Child Benefit .*weeks/, /taper/i, /tax code/i, /Class 1A/, /as entered/i, /contributions only/i])
      expect(text).toMatch(word)
  })

  it('saves inputs only, then loads them back', () => {
    type(box('opt-salary'), '41,000')
    type(box('opt-benefits'), '700')
    save('Mine')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'optimiser', inputsVersion: 1 })
    expect(Object.keys(stored.scenarios[0].inputs).sort()).toEqual(Object.keys(optimiserCalculator.defaultInputs()).sort())
    expect(JSON.stringify(stored)).not.toMatch(/incomeTax|"net"/)
    type(box('opt-salary'), '1')
    expect($('[data-unsaved]')!.textContent).toBe('Unsaved changes')
    click($('button[aria-label="Load “Mine”"]'))
    expect(box('opt-salary').value).toBe('41,000')
    expect(box('opt-benefits').value).toBe('700')
  })
})

describe('page code', () => {
  it('holds no tax figure: no amounts in pounds, no percentages, no config reads', () => {
    for (const name of ['OptimiserPage.tsx', 'definition.ts']) {
      const source = readFileSync(join(__dirname, name), 'utf8')
      expect(source, name).not.toMatch(/£\s?\d|\d\s?%|per ?cent/i)
      expect(source, name).not.toMatch(/requireVerified|from '@\/config\/tax\/2026-27'/)
    }
  })
})
