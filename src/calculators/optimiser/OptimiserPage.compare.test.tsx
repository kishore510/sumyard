// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP, formatGBPChange, formatPercent } from '@/lib/format'
import { compare, fromPounds, type Money, mulRound, ratio, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { click, mount, type } from '@/test/dom'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import { compareContributions } from './compare'
import { optimiserCalculator, resolveInputs } from './definition'
import OptimiserPage from './OptimiserPage'
import { calculateOptimise, toOptimiserInputs } from './optimiserInputs'
import { THRESHOLD_NAMES } from './reading'
import { changeSentence, pickerStops } from './targetWords'
import { DEFAULT_POLICY, type OptimiseResult } from './types'

/*
 * The compare redesign (0.21.0): the contribution picker, the change
 * summary, the cost chart, milestones and warnings on the take-home page.
 * Expected figures come from the engine (optimise, compareContributions),
 * never from a figure written here; amounts typed are inputs.
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
const $$ = (selector: string) => [...view.host.querySelectorAll(selector)]
const box = (id: string) => $(`#${id}`) as HTMLInputElement
const money = (amount: Money) => formatGBP(amount, 'pence')
const choose = (name: string, value: string) => click($(`input[name="${name}"][value="${value}"]`))

const sweep = (): OptimiseResult => {
  const result = calculateOptimise(session.get().inputs, taxYear)
  if (!result.ok || 'problem' in result) throw new Error('no result')
  return result
}

/** The comparison the page should show for the inputs now and a target. */
const expected = (target: Money) => {
  const inputs = session.get().inputs
  const result = compareContributions(toOptimiserInputs(inputs), taxYear, DEFAULT_POLICY, sweep().currentContribution, target, {
    pensionablePay: resolveInputs(inputs).pensionablePay,
    step: sweep().step,
  })
  if (!result.ok) throw new Error('refused')
  return result
}

/** A card's cell: row (month, year, percent, share) and column (now, new, change). */
const cell = (card: string, row: string, column: 'now' | 'new' | 'change') =>
  $(`[data-compare-card="${card}"] tr[data-row="${row}"] [data-col="${column}"]`)?.textContent?.trim()

const slide = (to: Money) => type(box('opt-target-slider'), String(toPence(to)))

describe('contribution picker', () => {
  it('replaces the dropdown: a typed amount, a native range slider and pills', () => {
    type(box('opt-salary'), '60,000')
    expect($('#opt-chosen')).toBeNull()
    expect($('[data-picker] select')).toBeNull()
    expect(box('opt-target').type).toBe('text')
    const slider = box('opt-target-slider')
    expect(slider.type).toBe('range')
    expect(slider.min).toBe('0')
    expect(slider.max).toBe(String(toPence(sweep().maximumContribution)))
    expect(slider.getAttribute('aria-valuetext')).toMatch(/a year/)
    expect($('label[for="opt-target-slider"]') ?? slider.getAttribute('aria-label')).toBeTruthy()
  })

  it('typing an amount moves the slider and the comparison', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-target'), '6,000')
    expect(box('opt-target-slider').value).toBe(String(toPence(fromPounds(6_000))))
    expect(cell('ownContribution', 'year', 'new')).toBe(money(fromPounds(6_000)))
  })

  it('moving the slider (as the keyboard does) updates the typed amount and the comparison', () => {
    type(box('opt-salary'), '60,000')
    slide(fromPounds(4_500))
    expect(box('opt-target').value).toBe('4,500')
    expect(cell('ownContribution', 'year', 'new')).toBe(money(fromPounds(4_500)))
    expect($('[data-target-amounts]')!.textContent).toContain(
      `${money(mulRound(fromPounds(4_500), ratio(1, MONTHS_PER_YEAR), 'nearest'))} a month`,
    )
  })

  it('shows the amount a month and a year and the share of pay under the picker', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-target'), '3,000')
    const text = $('[data-target-amounts]')!.textContent!
    expect(text).toContain(`${money(fromPounds(3_000))} a year`)
    expect(text).toContain(`${money(fromPounds(250))} a month`)
    expect(text).toContain(`${formatPercent(ratio(1, 20))} of pensionable pay`)
  })

  it('has pills for Now, each threshold still ahead (named from the engine’s thresholds) and Maximum, which snap the target', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-children'), '2')
    const stops = pickerStops(sweep())
    const pills = $$('[data-pill]')
    expect(pills.map((p) => p.getAttribute('data-pill'))).toEqual(stops.map((s) => s.id))
    for (const stop of stops.slice(1, -1))
      expect($(`[data-pill="${stop.id}"]`)!.textContent).toContain(THRESHOLD_NAMES[stop.id as keyof typeof THRESHOLD_NAMES])
    click($('[data-pill="maximum"]'))
    expect(cell('ownContribution', 'year', 'new')).toBe(money(sweep().maximumContribution))
    expect($('[data-pill="maximum"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(box('opt-target-slider').value).toBe(String(toPence(sweep().maximumContribution)))
    click($('[data-pill="now"]'))
    expect(cell('ownContribution', 'year', 'new')).toBe(money(sweep().currentContribution))
  })

  it('clamps a typed amount above the maximum, with a visible message', () => {
    type(box('opt-salary'), '30,000')
    expect($('[data-clamp]')).toBeNull()
    type(box('opt-target'), '45,000')
    expect($('[data-clamp]')!.textContent).toContain(money(sweep().maximumContribution))
    expect(cell('ownContribution', 'year', 'new')).toBe(money(sweep().maximumContribution))
  })

  it('in percentage mode, takes a percentage of pensionable pay and still shows the amounts', () => {
    type(box('opt-salary'), '50,000')
    choose('opt-employee-mode', 'percentOfPay')
    type(box('opt-employee-pct'), '4')
    expect($('#opt-target')).toBeNull()
    type(box('opt-target-pct'), '8')
    expect(cell('ownContribution', 'year', 'new')).toBe(money(fromPounds(4_000)))
    expect($('[data-target-amounts]')!.textContent).toContain(`${money(fromPounds(4_000))} a year`)
    expect(cell('ownContribution', 'share', 'now')).toBe('4%')
    expect(cell('ownContribution', 'share', 'new')).toBe('8%')
    expect(cell('ownContribution', 'share', 'change')).toBe('+4 pts')
  })

  it('opens on the nearest threshold ahead; with none, on now, saying there is no change', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-children'), '2')
    const stops = pickerStops(sweep())
    expect(cell('ownContribution', 'year', 'new')).toBe(money(stops[1]!.amount))
    view.unmount()
    session.startNew()
    view = mount(<OptimiserPage />)
    type(box('opt-salary'), '30,000')
    expect(cell('ownContribution', 'year', 'change')).toBe(money(ZERO))
    expect($('[data-change-sentence]')!.textContent).toMatch(/no change to compare/i)
  })

  it('the target is not stored', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-target'), '6,000')
    expect(JSON.stringify(session.get().inputs)).not.toContain(String(toPence(fromPounds(6_000))))
  })
})

describe('change summary', () => {
  it('three cards, Now / New / Change, month and year together, from compareContributions', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '2,000')
    type(box('opt-target'), '5,000')
    const c = expected(fromPounds(5_000))
    expect($$('[data-compare-card]').map((el) => el.getAttribute('data-compare-card'))).toEqual([
      'ownContribution',
      'totalIntoPension',
      'takeHome',
    ])
    expect($('[data-compare-card="ownContribution"] h3')!.textContent).toBe('Your pension contribution')
    expect($('[data-compare-card="totalIntoPension"] h3')!.textContent).toBe('Total paid into your pension')
    expect($('[data-compare-card="takeHome"] h3')!.textContent).toBe('Your take-home pay')
    for (const measure of ['ownContribution', 'totalIntoPension', 'takeHome'] as const) {
      const m = c[measure]
      expect(cell(measure, 'month', 'now')).toBe(money(m.monthly.now))
      expect(cell(measure, 'month', 'new')).toBe(money(m.monthly.new))
      expect(cell(measure, 'month', 'change')).toBe(formatGBPChange(m.monthly.change, 'pence'))
      expect(cell(measure, 'year', 'now')).toBe(money(m.annual.now))
      expect(cell(measure, 'year', 'new')).toBe(money(m.annual.new))
      expect(cell(measure, 'year', 'change')).toBe(formatGBPChange(m.annual.change, 'pence'))
      expect($(`[data-compare-card="${measure}"] tr[data-row="percent"]`)).not.toBeNull()
    }
    // Column and row labels.
    const head = $('[data-compare-card="takeHome"] thead')!.textContent!
    expect(head).toMatch(/Now.*New.*Change/)
    const labels = $$('[data-compare-card="ownContribution"] tbody th').map((th) => th.textContent)
    expect(labels).toEqual(['Per month', 'Per year', '% change', 'Share of pay'])
  })

  it('both change forms: % change on the figure now and pts for the share of pay', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '3,000')
    type(box('opt-target'), '6,000')
    expect(cell('ownContribution', 'percent', 'change')).toBe('+100%')
    expect(cell('ownContribution', 'share', 'change')).toBe('+5 pts')
    expect($('[data-compare-card="ownContribution"]')!.textContent).toContain('pts')
  })

  it('a fall: true minus signs, take-home rises, plain text and neutral colours', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '6,000')
    type(box('opt-target'), '3,000')
    expect(cell('ownContribution', 'year', 'change')).toMatch(/^−£/)
    expect(cell('takeHome', 'year', 'change')).toMatch(/^\+£/)
    expect($('[data-change-sentence]')!.textContent).toMatch(/take-home rises by/)
    expect($('[data-change-sentence]')!.textContent).toMatch(/pension falls by/)
    const html = $('[data-change-summary]')!.innerHTML
    expect(html).not.toMatch(/text-danger|text-success|bg-danger|bg-success/)
  })

  it('a rise: take-home falls, pension rises; the sentence matches its template', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '3,000')
    type(box('opt-target'), '6,000')
    const c = expected(fromPounds(6_000))
    const sentence = changeSentence(c, money)
    expect($('[data-change-sentence]')!.textContent).toBe(sentence)
    expect(sentence).toMatch(/take-home falls by/)
    expect(sentence).toMatch(/pension rises by/)
  })

  it('puts the sentence in the sticky bar', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-employee'), '3,000')
    type(box('opt-target'), '6,000')
    expect($('[data-sticky-result] [data-sticky-sentence]')!.textContent).toBe($('[data-change-sentence]')!.textContent)
  })

  it('the % change is left out, in words, when the figure now is nothing', () => {
    type(box('opt-salary'), '60,000')
    type(box('opt-target'), '3,000')
    expect(cell('ownContribution', 'percent', 'change')).not.toMatch(/%$/)
  })

  it('the old “now and the one you are looking at” block, the view switch and the range switch are gone', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-employee'), '6,000')
    expect($('[data-compare-choice]')).toBeNull()
    expect($('[data-readout]')).toBeNull()
    expect($('#opt-chart-view')).toBeNull()
    expect($('#opt-full-range')).toBeNull()
    expect(view.host.textContent).not.toMatch(/the one you are looking at/)
  })

  it('the primary view avoids spendable, adjusted net income and threshold income', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-children'), '2')
    const text = $('[data-change-summary]')!.textContent!
    expect(text).not.toMatch(/spendable|adjusted net income|threshold income/i)
    expect(text).not.toMatch(/\bbest\b|optimal|recommend/i)
  })

  it('shows spendable only where it differs from take-home', () => {
    type(box('opt-salary'), '60,000')
    expect($('[data-spendable]')).toBeNull()
    type(box('opt-salary'), '70,000')
    type(box('opt-children'), '2')
    expect($('[data-spendable]')).not.toBeNull()
  })
})

describe('cost chart', () => {
  it('plots the engine’s net cost per pound over the full range, from zero, with now and the target marked', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-children'), '2')
    type(box('opt-employee'), '2,000')
    const result = sweep()
    const section = $('[data-optimiser]')!
    expect(section.querySelector('h2')!.textContent).toMatch(/each £1 into your pension costs/)
    expect(section.textContent).toMatch(/average from no contribution/)
    expect(section.querySelectorAll('tbody tr')).toHaveLength(result.points.length)
    const list = section.querySelector('[data-marker-list]')!.textContent!
    expect(list).toMatch(/Your contribution now/)
    expect(list).toMatch(/Your target/)
    // y axis from zero.
    const ticks = [...section.querySelectorAll('svg[role="img"] text.tabular-nums')].map((t) => t.textContent ?? '')
    expect(ticks).toContain('0p')
    expect(section.querySelector('[data-span]')).not.toBeNull()
  })

  it('does not follow the breakdown’s Year / Month choice', () => {
    type(box('opt-salary'), '120,000')
    const before = $('[data-optimiser] tbody')!.textContent
    choose('opt-period', 'month')
    expect($('[data-optimiser] tbody')!.textContent).toBe(before)
  })
})

describe('milestones', () => {
  it('are always visible, one per threshold, in plain words', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-children'), '2')
    type(box('opt-employee'), '2,000')
    const items = $$('[data-milestones] [data-threshold]')
    expect(items.map((li) => li.getAttribute('data-threshold'))).toEqual(sweep().thresholds.map((t) => t.threshold))
    expect($('[data-milestones]')!.closest('[hidden]')).toBeNull()
    const text = $('[data-milestones]')!.textContent!
    expect(text).toMatch(/Contribute £[\d,.]+ a year \(£[\d,.]+ a month\) more/)
    expect(text).toMatch(/whole charge still applies/)
  })
})

describe('warnings at the target and elsewhere', () => {
  it('a line always gives the counts; warnings at the target are shown in full, never collapsed', () => {
    type(box('opt-salary'), '300,000')
    click($('[data-pill="maximum"]'))
    const result = sweep()
    const atMax = result.points.at(-1)!
    expect(atMax.warnings.length).toBeGreaterThan(0)
    expect($('[data-warning-count]')!.textContent).toMatch(new RegExp(`${atMax.warnings.length} warnings? at this contribution`))
    for (const warning of atMax.warnings) {
      const el = $(`[data-target-warning="${warning.code}"]`)!
      expect(el.textContent).toContain(warning.message)
      expect(el.closest('[hidden]')).toBeNull()
    }
  })

  it('warnings elsewhere in the range are counted in a Section summary and say what the range measures', () => {
    type(box('opt-salary'), '300,000')
    click($('[data-pill="now"]'))
    const codes = new Set(sweep().points.flatMap((p) => p.warnings.map((w) => w.code)))
    expect(codes.size).toBeGreaterThan(0)
    const summary = $('#opt-other-warnings-summary')!.textContent!
    expect(summary).toMatch(new RegExp(`${codes.size} warnings?`))
    const panel = $('#opt-other-warnings-panel')!
    expect(panel.textContent).toMatch(/if your own contribution is/)
    expect(panel.textContent).not.toMatch(/From £[\d,.]+ a year to/)
    expect($('[data-warning-count]')!.textContent).toMatch(/No warnings at this contribution/)
  })

  it('with no warnings anywhere, the line says so', () => {
    type(box('opt-salary'), '40,000')
    expect($('[data-warning-count]')!.textContent).toMatch(/No warnings/)
  })
})

describe('detail sections', () => {
  it('cost of £1 detail and the milestone audit sit in Sections with live summaries', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-employee'), '6,000')
    expect($('[data-section="opt-cost-detail"]')).not.toBeNull()
    expect($('#opt-cost-detail-summary')!.textContent!.length).toBeGreaterThan(0)
    expect($('#opt-cost-detail-panel [data-cost]')).not.toBeNull()
    expect($('#opt-milestone-detail-panel [data-thresholds]')).not.toBeNull()
    expect($('#opt-milestone-detail-summary')!.textContent).toMatch(/threshold/)
  })

  it('the cost of £1 detail gives the average over the range and the engine’s figure at the target, kept apart', () => {
    type(box('opt-salary'), '120,000')
    type(box('opt-employee'), '6,000')
    type(box('opt-target'), '9,000')
    act(() => {
      ;($('#opt-cost-detail-button') as HTMLButtonElement).click()
    })
    const text = $('[data-cost]')!.textContent!
    expect(text).toMatch(/average/i)
    expect(text).toMatch(/at your target/i)
    expect(text).not.toMatch(/marginal rate/i)
    expect(compare(fromPounds(9_000), ZERO)).toBe(1)
  })
})
