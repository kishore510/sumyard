// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { themeStore } from '@/hooks/useTheme'
import { mount } from '@/test/dom'
import { SplitBar, type SplitBarSegment } from './SplitBar'

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const $ = (selector: string) => view!.host.querySelector(selector)
const $$ = (selector: string) => [...view!.host.querySelectorAll(selector)]

const SEGMENTS: SplitBarSegment[] = [
  { id: 'a', label: 'Alpha', value: 300 },
  { id: 'b', label: 'Beta', value: 0 },
  { id: 'c', label: 'Gamma', value: 200 },
  { id: 'd', label: 'Delta', value: 500 },
]
const props = {
  title: 'Where gross pay goes',
  segments: SEGMENTS,
  total: 1000,
  totalLabel: 'Gross pay',
  formatValue: (v: number) => `${v} pence`,
  highlight: 'd',
}

describe('SplitBar', () => {
  it('draws one segment per non-zero part, in order, whose values add up to the total', () => {
    view = mount(<SplitBar {...props} />)
    const drawn = $$('[data-segment]')
    expect(drawn.map((el) => el.getAttribute('data-segment'))).toEqual(['a', 'c', 'd'])
    expect(drawn.reduce((sum, el) => sum + Number(el.getAttribute('data-value')), 0)).toBe(props.total)
  })

  it('gives each segment a width in proportion, filling the bar exactly', () => {
    view = mount(<SplitBar {...props} />)
    const svg = $('svg[role="img"]')!
    const width = Number(svg.getAttribute('viewBox')!.split(' ')[2])
    const rects = $$('[data-segment] rect')
    const widths = rects.map((r) => Number(r.getAttribute('width')))
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(width, 6)
    expect(widths[0]! / width).toBeCloseTo(0.3, 6)
    expect(widths[2]! / width).toBeCloseTo(0.5, 6)
  })

  it('is an image named by its title and described by a text summary of every part', () => {
    view = mount(<SplitBar {...props} />)
    const svg = $('svg[role="img"]')!
    const title = document.getElementById(svg.getAttribute('aria-labelledby')!)!
    const desc = document.getElementById(svg.getAttribute('aria-describedby')!)!
    expect(title.textContent).toBe('Where gross pay goes')
    expect(desc.textContent).toContain('Gross pay 1000 pence')
    for (const s of ['Alpha: 300 pence', 'Gamma: 200 pence', 'Delta: 500 pence']) expect(desc.textContent).toContain(s)
    expect(desc.textContent).not.toContain('Beta')
  })

  it('offers every part, its share and the total in a table', () => {
    view = mount(<SplitBar {...props} />)
    expect($('details summary')!.textContent).toMatch(/table/i)
    const rows = $$('tbody tr').map((tr) => [...tr.children].map((c) => c.textContent))
    expect(rows).toEqual([
      ['Alpha', '300 pence', '30%'],
      ['Gamma', '200 pence', '20%'],
      ['Delta', '500 pence', '50%'],
    ])
    expect([...$('tfoot tr')!.children].map((c) => c.textContent)).toEqual(['Gross pay', '1000 pence', '100%'])
  })

  it('has a legend naming each drawn part with its value', () => {
    view = mount(<SplitBar {...props} />)
    const items = $$('[data-legend] li').map((li) => li.textContent)
    expect(items).toEqual(['Alpha 300 pence', 'Gamma 200 pence', 'Delta 500 pence'])
  })

  it('cannot draw a part below nothing: says why, and keeps the summary and table', () => {
    view = mount(
      <SplitBar
        {...props}
        segments={[
          { id: 'a', label: 'Alpha', value: 1500 },
          { id: 'd', label: 'Delta', value: -500 },
        ]}
      />,
    )
    expect($('svg[role="img"]')).toBeNull()
    expect(view.host.textContent).toMatch(/below nothing/)
    expect($$('tbody tr')).toHaveLength(2)
  })

  it('draws nothing for a total of nothing, and says so', () => {
    view = mount(<SplitBar {...props} total={0} segments={SEGMENTS.map((s) => ({ ...s, value: 0 }))} />)
    expect($('svg[role="img"]')).toBeNull()
    expect(view.host.textContent).toMatch(/Nothing to show/)
  })

  it('uses token colour classes only, and tells parts apart by more than colour', () => {
    view = mount(<SplitBar {...props} />)
    const markup = view.host.innerHTML
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    const classes = $$('[data-segment] rect').map((r) => r.getAttribute('class') ?? r.getAttribute('fill') ?? '')
    for (const c of classes) expect(c).toMatch(/fill-(?:accent|text|text-muted|border-strong|surface)|url\(#/)
    // A gap between parts, and the legend and table carry the names.
    expect($$('[data-segment] rect').every((r) => r.getAttribute('stroke-width') !== null)).toBe(true)
  })

  it('re-renders when the theme changes, in both themes', () => {
    themeStore.set('light')
    view = mount(<SplitBar {...props} />)
    expect($('figure')!.getAttribute('data-theme')).toBe('light')
    act(() => themeStore.set('dark'))
    expect($('figure')!.getAttribute('data-theme')).toBe('dark')
    expect($$('[data-segment]')).toHaveLength(3)
    act(() => themeStore.set('system'))
  })
})
