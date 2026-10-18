// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { click, mount, type } from '@/test/dom'
import { Section } from './Section'

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const $ = (selector: string) => view!.host.querySelector(selector)
const button = () => $('#sec-button') as HTMLButtonElement
const panel = () => $('#sec-panel') as HTMLElement

function Typed() {
  const [text, setText] = useState('')
  return <input id="inside" value={text} onChange={(e) => setText(e.currentTarget.value)} />
}

describe('Section', () => {
  it('is a native button in a heading, closed by default, controlling a hidden panel', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Not set">
        <p>Inside</p>
      </Section>,
    )
    const b = button()
    expect(b.tagName).toBe('BUTTON')
    expect(b.getAttribute('type')).toBe('button')
    expect(b.getAttribute('tabindex')).toBeNull()
    expect(b.closest('h2')).not.toBeNull()
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(b.getAttribute('aria-controls')).toBe('sec-panel')
    expect(panel().hidden).toBe(true)
  })

  it('opens and closes by click, keeping aria-expanded and the panel in step', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Not set">
        <p>Inside</p>
      </Section>,
    )
    click(button())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(panel().hidden).toBe(false)
    click(button())
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(panel().hidden).toBe(true)
  })

  it('is reached and worked by keyboard: a native, focusable button (Enter and Space are the browser’s; checked in Chromium)', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Not set">
        <p>Inside</p>
      </Section>,
    )
    button().focus()
    expect(document.activeElement).toBe(button())
    expect(button().disabled).toBe(false)
    // happy-dom does not turn Enter or Space into a click; a native button does in every browser.
    expect(button().onkeydown).toBeNull()
  })

  it('is named by its visible text, the title then the summary, both in the header', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Salary sacrifice · You: £1.00 a year">
        <p>Inside</p>
      </Section>,
    )
    // No aria-label or aria-labelledby: the name is the visible text, so voice control can say what it sees.
    expect(button().getAttribute('aria-label')).toBeNull()
    expect(button().getAttribute('aria-labelledby')).toBeNull()
    expect($('#sec-title')!.textContent).toBe('Pension')
    expect($('#sec-summary')!.textContent).toBe('Salary sacrifice · You: £1.00 a year')
    expect(button().contains($('#sec-title'))).toBe(true)
    expect(button().contains($('#sec-summary'))).toBe(true)
    expect(button().textContent).toBe('PensionSalary sacrifice · You: £1.00 a year')
  })

  it('updates its summary when the summary changes', () => {
    view = mount(
      <Section id="sec" title="Tax code" summary="Not set">
        <p>Inside</p>
      </Section>,
    )
    view.rerender(
      <Section id="sec" title="Tax code" summary="Code entered">
        <p>Inside</p>
      </Section>,
    )
    expect($('#sec-summary')!.textContent).toBe('Code entered')
  })

  it('opens on load when told to (non-default values)', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Set" defaultOpen>
        <p>Inside</p>
      </Section>,
    )
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(panel().hidden).toBe(false)
  })

  it('keeps its contents mounted while closed, so typed text survives closing and opening', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Not set" defaultOpen>
        <Typed />
      </Section>,
    )
    type($('#inside') as HTMLInputElement, 'kept')
    click(button())
    click(button())
    expect(($('#inside') as HTMLInputElement).value).toBe('kept')
  })

  it('meets the touch target and has no motion of its own', () => {
    view = mount(
      <Section id="sec" title="Pension" summary="Not set">
        <p>Inside</p>
      </Section>,
    )
    expect(button().className).toMatch(/\bmin-h-touch\b/)
    expect(view.host.innerHTML).not.toMatch(/transition|animate-/)
  })
})
