// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_MS } from '@/components/StickyResult'
import { taxYear } from '@/config/tax/2026-27'
import { requireVerified } from '@/config/tax/sourced'
import { formatGBP } from '@/lib/format'
import { MAX_AGE_YEARS } from '@/lib/inputLimits'
import { fromPounds, type Money } from '@/lib/money'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { byText, click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { mortgageCalculator } from '../mortgage/definition'
import { optimiserCalculator } from '../optimiser/definition'
import { sessionFor } from '../session'
import { amountsText, calculate, midValue, type NextPoundPageInputs, nextPoundCalculator } from './definition'
import NextPoundPage from './NextPoundPage'

/*
 * C2: the next pound page at #/c/next-pound. Every expected figure comes from
 * the composer (through calculate), formatted as the page formats it;
 * nothing is worked out here. Pay, balances and rates are made up for tests.
 * The composer runs once the inputs settle, so the clock is faked.
 */

let view: ReturnType<typeof mount>
const session = sessionFor(nextPoundCalculator)
const takeHome = sessionFor(optimiserCalculator)

beforeEach(() => {
  vi.useFakeTimers()
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
}

const $ = (selector: string) => view.host.querySelector(selector)
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const set = (patch: Partial<NextPoundPageInputs>) => {
  act(() => session.setInputs(patch))
  settle()
}
const text = () => view.host.textContent ?? ''
const card = (leg: string) => $(`[data-leg="${leg}"]`) as HTMLElement
const headline = () => $('[data-sticky-value]')?.textContent?.trim()

function row(label: string, within: ParentNode = view.host): string | undefined {
  const dt = [...within.querySelectorAll('dt')].find((el) => el.textContent?.trim() === label)
  return dt?.nextElementSibling?.firstChild?.textContent?.trim()
}

const pension = {
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(60_000),
  pensionMethod: 'netPay' as const,
  employeeContribution: { mode: 'amount' as const, amount: fromPounds(3_000), percentOfPay: '0' },
  employerContribution: { mode: 'amount' as const, amount: fromPounds(3_000), percentOfPay: '0' },
}
const mortgage = {
  ...mortgageCalculator.defaultInputs(),
  startDate: '2026-11-01' as const,
  balance: fromPounds(200_000),
  termYears: 25,
  fixedRate: '4.5',
  fixedEndDate: '2028-11-30' as const,
  reversionRate: '7',
}
const example: NextPoundPageInputs = {
  ...nextPoundCalculator.defaultInputs(),
  lumpSum: fromPounds(10_000),
  horizonYears: 20,
  asOf: '2026-10-23',
  ageNow: 40,
  pay: pension,
  mortgage,
  feeRate: '0.5',
  inflationRate: '2',
}

function engine(inputs: NextPoundPageInputs = session.get().inputs) {
  const out = calculate(inputs, taxYear)
  if (out.kind !== 'ok') throw new Error(out.kind)
  return out
}

describe('a fresh page', () => {
  it('shows the title, the verified badge for the tax year, the disclaimer and no made-up figures', () => {
    expect($('h1')?.textContent).toBe('Where does the next £X go?')
    expect(text()).toMatch(/2026 to 2027 tax year/)
    expect(text()).not.toMatch(/Uses no tax rules/)
    expect(text()).toMatch(/Illustrative only, not financial advice/)
    expect(box('np-as-of').value).toBe('')
    expect(box('np-age').value).toBe('')
  })

  it('names the date it needs, with no figure in the bar', () => {
    expect(headline()).toBeUndefined()
    expect($('[data-refusal-field="asOf"]')?.textContent).toMatch(/Date the money goes in/)
  })

  it('the growth rates start at the illustrative values, and say they are illustrative', () => {
    expect([box('np-growth-low').value, box('np-growth-mid').value, box('np-growth-high').value]).toEqual(['2', '5', '8'])
    expect(text()).toMatch(/illustrative, not forecasts or market figures/)
  })

  it('“Use today’s date” fills the date from the device clock', () => {
    vi.setSystemTime(new Date(2026, 9, 23, 12))
    click(byText(view.host, 'button', 'Use today’s date'))
    expect(session.get().inputs.asOf).toBe('2026-10-23')
  })
})

describe('results, answer first', () => {
  beforeEach(() => set(example))

  it('the sticky result is each leg at the mid rate, today’s money first, nominal beside it, as the composer says', () => {
    const out = engine()
    const p = midValue(out.pension)!
    const m = midValue(out.mortgage)!
    const i = midValue(out.isa)!
    expect(headline()).toBe(
      `Pension ${amountsText(p, money)} · Mortgage overpayment ${amountsText(m, money)} · ISA ${amountsText(i, money)}`,
    )
  })

  it('three cards: pension, mortgage (marked guaranteed) and ISA, each with what it assumes', () => {
    const out = engine()
    for (const leg of ['pension', 'mortgage', 'isa']) {
      expect(card(leg)).not.toBeNull()
      expect(card(leg).textContent).toMatch(/Assumes:/)
    }
    expect(card('mortgage').textContent).toMatch(/Guaranteed/)
    expect(card('pension').textContent).not.toMatch(/Guaranteed:/)
    expect(card('isa').textContent).not.toMatch(/Guaranteed:/)
    const isa = out.isa.kind === 'shown' ? out.isa.leg : null
    expect(row('Low (2% a year)', card('isa'))).toBe(money(isa!.rates.low.value.todaysMoney))
    expect(row('High (8% a year)', card('isa'))).toBe(money(isa!.rates.high.value.todaysMoney))
  })

  it('the pension card states the extra contribution bought and any cash remainder', () => {
    const out = engine()
    const leg = out.pension.kind === 'shown' ? out.pension.leg : null
    expect(row('Extra contribution bought', card('pension'))).toBe(money(leg!.contribution.extra))
    expect(row('Held as cash in this column', card('pension'))).toBe(money(leg!.contribution.leftoverCash))
  })

  it('the mortgage card states the overpayment, the charge paid and any cash remainder', () => {
    set({ mortgage: { ...mortgage, erc: true, ercRate: '3', allowanceRate: '1' } })
    const out = engine()
    const leg = out.mortgage.kind === 'shown' ? out.mortgage.leg : null
    expect(leg!.erc).toBeGreaterThan(0)
    expect(row('Overpayment', card('mortgage'))).toBe(money(leg!.overpaymentUsed))
    expect(row('Early repayment charge paid', card('mortgage'))).toBe(money(leg!.erc))
    expect(row('Held as cash in this column', card('mortgage'))).toBe(money(leg!.leftoverCash))
  })

  it('the break-even ISA return in words against each', () => {
    expect($('[data-break-even-mortgage]')?.textContent).toMatch(/^The ISA matches the mortgage overpayment at the horizon at a growth rate/)
    expect($('[data-break-even-pension]')?.textContent).toMatch(/^The ISA matches the pension at the mid rate/)
  })

  it('the comparison chart in today’s money, with a table', () => {
    expect(text()).toMatch(/The three columns compared/)
    expect(view.host.querySelector('svg[role="img"], figure, [role="img"]')).not.toBeNull()
    expect(byText(view.host, 'summary, button', /as a table/i)).toBeTruthy()
  })

  it('the assumptions list every reading by name and the page’s own', () => {
    const panel = $('#assumptions')?.textContent ?? ''
    for (const reading of ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'CP7', 'Page reading (C2)']) expect(panel).toContain(reading)
  })

  it('a change waits for the inputs to settle, keeping the last results marked as updating', () => {
    const before = headline()
    act(() => session.setInputs({ lumpSum: fromPounds(20_000) }))
    expect(headline()).toBeUndefined()
    expect($('[data-np-results]')?.getAttribute('aria-busy')).toBe('true')
    expect(text()).toMatch(/Updating for your changes/)
    settle()
    expect(headline()).not.toBe(before)
    expect($('[data-np-results]')?.getAttribute('aria-busy')).toBe('false')
  })
})

describe('each card’s states', () => {
  it('the pension not accessible at the horizon: no number and no break-even', () => {
    set({ ...example, schemeAccessAge: MAX_AGE_YEARS })
    expect(card('pension').getAttribute('data-leg-kind')).toBe('not-accessible')
    expect(card('pension').querySelector('[data-headline]')?.textContent).toBe('Not accessible at horizon')
    expect(card('pension').textContent).not.toMatch(/Mid rate/)
    expect($('[data-break-even-pension]')?.textContent).toBe('No break-even: the pension is not accessible at horizon.')
    expect(headline()).toMatch(/^Pension: not accessible at horizon · /)
  })

  it('no mortgage entered: that leg is not set up, not a refusal', () => {
    set({ ...example, mortgage: mortgageCalculator.defaultInputs() })
    expect(card('mortgage').getAttribute('data-leg-kind')).toBe('none')
    expect(card('mortgage').textContent).toMatch(/Not set up/)
    expect(card('mortgage').querySelector('[data-refusal]')).toBeNull()
    expect($('[data-break-even-mortgage]')?.textContent).toMatch(/no mortgage is set up/)
  })

  it('a mortgage part-entered names what it needs on that leg; the others still show', () => {
    set({ ...example, mortgage: { ...mortgage, reversionRate: null } })
    expect(card('mortgage').querySelector('[data-refusal-field="mortgage.reversionRate"]')).not.toBeNull()
    expect(card('isa').getAttribute('data-leg-kind')).toBe('shown')
  })

  it('a leg refused by its engine names the field on that leg', () => {
    set({ ...example, mortgage: { ...mortgage, termYears: 0 } })
    expect(card('mortgage').querySelector('[data-refusal="inputs"]')?.textContent).toMatch(/Term left/)
    expect(card('pension').getAttribute('data-leg-kind')).toBe('accessible')
  })

  it('without an age, the pension leg asks for it', () => {
    set({ ...example, ageNow: null })
    expect(card('pension').querySelector('[data-refusal-field="ageNow"]')).not.toBeNull()
  })

  it('a lump sum of nothing: every leg nothing, not a refusal', () => {
    set({ ...example, lumpSum: fromPounds(0) })
    for (const leg of ['pension', 'mortgage', 'isa']) expect(card(leg).getAttribute('data-leg-kind')).toBe('nothing')
    expect($('[data-refusal]')).toBeNull()
  })

  it('growth rates out of order refuse by field', () => {
    set({ ...example, growthLow: '6' })
    expect($('[data-refusal-field="growth.mid"]')?.textContent).toMatch(/Mid growth rate/)
  })
})

describe('warnings', () => {
  it('are grouped by leg and never hidden', () => {
    set({ ...example, isaPaidThisYear: fromPounds(19_000), mortgage: { ...mortgage, erc: true, ercRate: '3', allowanceRate: '1' } })
    const out = engine()
    expect(out.warnings.isa.length).toBeGreaterThan(0)
    expect(out.warnings.mortgage.length).toBeGreaterThan(0)
    expect($('[data-warnings-leg="isa"]')?.textContent).toMatch(/ISA annual limit/)
    expect($('[data-warnings-leg="mortgage"]')?.textContent).toMatch(/penalty-free limit/)
  })

  it('the transitional age warning shows on the pension', () => {
    const granted = requireVerified(taxYear, ['pension.minimumAge.announced', 'pension.minimumAge.announcedFrom'])
    if (!granted.ok) throw new Error('unverified')
    const announced = granted.values['pension.minimumAge.announced']
    const years = Number(granted.values['pension.minimumAge.announcedFrom'].slice(0, 4)) - Number(example.asOf!.slice(0, 4)) + 1
    // Under the announced age at the horizon, past the date it applies from: transitional rules may matter.
    set({ ...example, ageNow: announced - years - 1, horizonYears: years })
    const out = engine()
    expect(out.warnings.pension.some((w) => w.source === 'next-pound' && w.code === 'transitionalAgeRules')).toBe(true)
    expect($('[data-warnings-leg="pension"]')?.textContent).toMatch(/Transitional rules/)
  })
})

describe('wording', () => {
  it('nothing on the page is called best or better, recommended, or what anyone should do', () => {
    for (const inputs of [
      example,
      { ...example, schemeAccessAge: MAX_AGE_YEARS },
      { ...example, mortgage: mortgageCalculator.defaultInputs() },
      { ...example, growthLow: '-50', growthMid: '-50', growthHigh: '-50' },
    ]) {
      set(inputs)
      const panel = $('#assumptions') as HTMLDetailsElement
      panel.open = true
      for (const button of view.host.querySelectorAll('[aria-expanded="false"]')) click(button)
      expect(text()).not.toMatch(/\b(best|better|recommend\w*|should)\b/i)
    }
  })
})

describe('inputs', () => {
  it('typing the essentials in gives results', () => {
    set({ ...example, asOf: null, ageNow: null, lumpSum: fromPounds(0) })
    type(box('np-lump-sum'), '10000')
    type(box('np-as-of'), '23/10/2026')
    type(box('np-age'), '40')
    settle()
    expect(session.get().inputs).toMatchObject({ lumpSum: fromPounds(10_000), asOf: '2026-10-23', ageNow: 40 })
    expect(headline()).toMatch(/^Pension £/)
  })

  it('an invalid box holds the results until it is fixed', () => {
    type(box('np-horizon'), 'abc')
    settle()
    expect(text()).toMatch(/No results until the inputs are fixed/)
    expect(headline()).toBeUndefined()
  })

  it('copies the take-home page’s inputs from this visit, with no new storage', () => {
    expect((byText(view.host, 'button', 'Copy from the take-home page') as HTMLButtonElement).disabled).toBe(true)
    act(() => takeHome.setInputs({ salary: fromPounds(45_000), children: 2 }))
    const copy = byText(view.host, 'button', 'Copy from the take-home page') as HTMLButtonElement
    expect(copy.disabled).toBe(false)
    click(copy)
    expect(session.get().inputs.pay).toEqual(takeHome.get().inputs)
    expect(box('np-salary').value).toBe('45,000')
  })

  it('the mortgage section is closed on a fresh page and says not set up', () => {
    expect(($('#np-section-mortgage-button') as HTMLButtonElement).getAttribute('aria-expanded')).toBe('false')
    expect($('#np-section-mortgage-summary')?.textContent).toBe('Not set up')
  })

  it('“Clear the mortgage” puts the leg back to not set up', () => {
    set(example)
    click(byText(view.host, 'button', 'Clear the mortgage'))
    settle()
    expect(card('mortgage').getAttribute('data-leg-kind')).toBe('none')
  })
})

describe('accessibility', () => {
  it('each card is a labelled region; inputs have labels; the status is polite', () => {
    set(example)
    for (const leg of ['pension', 'mortgage', 'isa']) {
      const region = card(leg)
      const labelId = region.getAttribute('aria-labelledby')!
      expect(view.host.querySelector(`#${CSS.escape(labelId)}`)?.textContent).toBeTruthy()
    }
    for (const input of view.host.querySelectorAll('input')) {
      if (input.type === 'file' || input.type === 'hidden' || input.type === 'radio') continue
      expect(input.id && view.host.querySelector(`label[for="${input.id}"]`), input.id).toBeTruthy()
    }
    expect(view.host.querySelector('[data-np-results] [role="status"]')).not.toBeNull()
  })
})

describe('scenarios', () => {
  it('saves with the tax year, and loads back with the same results', () => {
    set(example)
    const shown = headline()
    click(byText(view.host, 'button', 'Save'))
    click(byText(view.host, 'form button', 'Save'))
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.scenarios.key)!)
    expect(stored.scenarios[0]).toMatchObject({ calculatorId: 'next-pound', inputsVersion: 1, taxYear: '2026-27', inputs: example })
    act(() => session.startNew())
    settle()
    expect(session.get().inputs).toEqual(nextPoundCalculator.defaultInputs())
    act(() => session.load(scenarioStore.get().scenarios[0]!))
    settle()
    expect(session.get().inputs).toEqual(example)
    expect(headline()).toBe(shown)
  })

  it('adds no storage key', () => {
    set(example)
    for (let i = 0; i < localStorage.length; i++) expect(Object.values(STORAGE_KEYS).map((k) => k.key)).toContain(localStorage.key(i))
  })
})
