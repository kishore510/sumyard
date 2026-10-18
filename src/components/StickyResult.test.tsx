// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, mount } from '@/test/dom'
import { SETTLE_MS, StickyResult } from './StickyResult'

let view: ReturnType<typeof mount> | undefined
afterEach(() => {
  view?.unmount()
  view = undefined
  vi.useRealTimers()
})

const $ = (selector: string) => view!.host.querySelector(selector)

const page = (value: string | null, announcement: string | null = value === null ? null : `Take-home for the year: ${value}`) => (
  <StickyResult
    label="Take-home for the year"
    value={value}
    emptyText="No result yet"
    announcement={announcement}
    controls={<p id="controls">Period and badge</p>}
    results={<p id="results">Results</p>}
  >
    <p id="inputs">Inputs</p>
  </StickyResult>
)

/** Scrolls the page so the bar's resting place is `top` px from the top of the viewport (negative: scrolled past). */
function scrollTo(top: number) {
  const sentinel = $('[data-sticky-sentinel]') as HTMLElement
  sentinel.getBoundingClientRect = () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} })
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('StickyResult', () => {
  beforeEach(() => {
    view = mount(page('£1,000.00'))
    // happy-dom lays nothing out: give the bar a height, as a browser would.
    Object.defineProperty($('[data-sticky-result]'), 'offsetHeight', { value: 120, configurable: true })
  })

  it('shows the inputs, the results, and on a phone a bar with the figure and its controls', () => {
    expect($('#inputs')).not.toBeNull()
    expect($('#results')).not.toBeNull()
    const bar = $('[data-sticky-result]')!
    expect(bar.textContent).toContain('Take-home for the year')
    expect(bar.textContent).toContain('£1,000.00')
    expect(bar.querySelector('#controls')).not.toBeNull()
  })

  it('the bar is sticky and only on a phone; from md the results column is the sticky one', () => {
    const bar = $('[data-sticky-result]')!
    expect(bar.className).toMatch(/\bsticky\b/)
    expect(bar.className).toMatch(/\bmd:hidden\b/)
    expect($('[data-results]')!.className).toMatch(/\bmd:sticky\b/)
  })

  it('says so when there is no result', () => {
    view!.rerender(page(null))
    expect($('[data-sticky-result]')!.textContent).toContain('No result yet')
  })

  it('the figure is not a live region, at any level', () => {
    let el: Element | null = $('[data-sticky-value]')
    expect(el).not.toBeNull()
    while (el) {
      expect(el.getAttribute('aria-live'), el.tagName).toBeNull()
      expect(el.getAttribute('role'), el.tagName).not.toBe('status')
      el = el.parentElement
    }
  })

  it('collapses to one line, a toggle, once scrolled past; a tap expands it; back at the top it is full again', () => {
    expect($('[data-sticky-toggle]')).toBeNull()
    scrollTo(-1000)
    const toggle = $('[data-sticky-toggle]') as HTMLButtonElement
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('£1,000.00')
    expect($('#controls')).toBeNull()
    click(toggle)
    expect(($('[data-sticky-toggle]') as HTMLButtonElement).getAttribute('aria-expanded')).toBe('true')
    expect($('#controls')).not.toBeNull()
    click($('[data-sticky-toggle]'))
    expect($('#controls')).toBeNull()
    scrollTo(10)
    expect($('[data-sticky-toggle]')).toBeNull()
    expect($('#controls')).not.toBeNull()
  })

  it('stays collapsed for a small move back that a layout shift could cause, and needs to be scrolled clear of to collapse', () => {
    scrollTo(-1)
    // Not yet past its own height: still full (no flicker at the edge).
    expect($('[data-sticky-toggle]')).toBeNull()
    scrollTo(-1000)
    expect($('[data-sticky-toggle]')).not.toBeNull()
    scrollTo(-1)
    expect($('[data-sticky-toggle]')).not.toBeNull()
  })
})

describe('StickyResult announcements', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    view = mount(page('£1,000.00'))
  })

  const live = () => $('[data-sticky-announcer]') as HTMLElement

  it('has one polite status region, empty on load', () => {
    expect(live().getAttribute('aria-live')).toBe('polite')
    expect(live().textContent).toBe('')
  })

  it('announces nothing while values keep changing, then once when they settle', () => {
    for (const value of ['£1,001.00', '£1,002.00', '£1,003.00']) {
      view!.rerender(page(value))
      act(() => vi.advanceTimersByTime(SETTLE_MS / 2))
      expect(live().textContent).toBe('')
    }
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(live().textContent).toBe('Take-home for the year: £1,003.00')
  })

  it('does not repeat an announcement for the same text, and says nothing for no result', () => {
    view!.rerender(page('£2,000.00'))
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(live().textContent).toBe('Take-home for the year: £2,000.00')
    view!.rerender(page(null))
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(live().textContent).toBe('')
  })

  it('waits while a field has focus and is being typed in', () => {
    const input = $('#inputs')!.appendChild(document.createElement('input'))
    input.focus()
    view!.rerender(page('£3,000.00'))
    act(() => vi.advanceTimersByTime(SETTLE_MS / 2))
    expect(live().textContent).toBe('')
    act(() => vi.advanceTimersByTime(SETTLE_MS))
    expect(live().textContent).toBe('Take-home for the year: £3,000.00')
  })
})
