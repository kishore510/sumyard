// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { themeStore } from '@/hooks/useTheme'
import { mount } from '@/test/dom'
import { Chart, type ChartProps } from './Chart'

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const props: ChartProps = {
  title: 'Growth',
  categories: ['Step 1', 'Step 2', 'Step 3'],
  series: [{ id: 'a', label: 'Amount', kind: 'line', values: [100, -50, 300] }],
  references: [{ label: 'Start', value: 120 }],
  xLabel: 'Step',
  yLabel: 'Pence',
  formatTick: (v) => `${v}p`,
  formatValue: (v) => `${v} pence`,
  integer: true,
}

describe('Chart', () => {
  it('is an image named by its title and described by a text summary', () => {
    view = mount(<Chart {...props} />)
    const svg = view.host.querySelector('svg[role="img"]')!
    const title = document.getElementById(svg.getAttribute('aria-labelledby')!)!
    const desc = document.getElementById(svg.getAttribute('aria-describedby')!)!
    expect(title.textContent).toBe('Growth')
    expect(desc.textContent).toMatch(/Amount: 100 pence at Step 1 to 300 pence at Step 3; highest 300 pence at Step 2|lowest -50 pence/)
    expect(desc.textContent).toMatch(/Reference line: Start at 120 pence/)
  })

  it('draws a marker per point, labelled axes and a dashed reference line', () => {
    view = mount(<Chart {...props} />)
    expect(view.host.querySelectorAll('[data-series="a"] circle')).toHaveLength(3)
    expect(view.host.querySelector('svg')!.textContent).toContain('Pence')
    expect(view.host.querySelector('svg')!.textContent).toContain('Step')
    expect(view.host.querySelector('[data-reference] line')!.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('draws bars from zero, including negative ones', () => {
    view = mount(<Chart {...props} series={[{ ...props.series[0]!, kind: 'bar' }]} />)
    const bars = [...view.host.querySelectorAll('[data-series="a"] rect')]
    expect(bars).toHaveLength(3)
    for (const bar of bars) expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0)
  })

  it('uses token colour classes only, no colour values', () => {
    view = mount(<Chart {...props} />)
    const markup = view.host.innerHTML
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    expect(markup).toMatch(/stroke-accent/)
  })

  it('offers every value in a table', () => {
    view = mount(<Chart {...props} />)
    const rows = [...view.host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))
    expect(rows).toEqual([
      ['Step 1', '100 pence'],
      ['Step 2', '-50 pence'],
      ['Step 3', '300 pence'],
    ])
    expect(view.host.querySelector('details summary')!.textContent).toMatch(/Show the data as a table/)
  })

  it('says when there is nothing to show', () => {
    view = mount(<Chart {...props} categories={[]} series={[]} references={[]} />)
    expect(view.host.querySelector('svg[role="img"]')).toBeNull()
    expect(view.host.textContent).toMatch(/No data to show/)
  })

  it('handles a single point', () => {
    view = mount(<Chart {...props} categories={['Only']} series={[{ id: 'a', label: 'A', kind: 'line', values: [5] }]} references={[]} />)
    expect(view.host.querySelectorAll('[data-series="a"] circle')).toHaveLength(1)
  })

  it('re-renders when the theme changes', () => {
    themeStore.set('light')
    view = mount(<Chart {...props} />)
    expect(view.host.querySelector('figure')!.dataset.theme).toBe('light')
    act(() => themeStore.set('dark'))
    expect(view.host.querySelector('figure')!.dataset.theme).toBe('dark')
    act(() => themeStore.set('system'))
  })
})
