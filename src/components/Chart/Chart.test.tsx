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

  describe('with numeric x values, markers and ranges', () => {
    const numeric: ChartProps = {
      ...props,
      categories: ['0p', '10p', '40p', '50p'],
      xValues: [0, 10, 40, 50],
      formatXTick: (v) => `${v}p`,
      series: [{ id: 'a', label: 'Amount', kind: 'line', values: [100, 90, 60, 61] }],
      references: [],
      markers: [
        { x: 10, label: 'Now: 10p' },
        { x: 50, label: 'Most: 50p' },
      ],
      spans: [{ from: 10, to: 40, label: 'A jump lies here' }],
      pointMarkers: false,
      columns: [{ label: 'Marked', values: ['', 'Now: 10p', '', 'Most: 50p'] }],
    }

    it('places points by value, not evenly: the gap between 10 and 40 is three times that between 0 and 10', () => {
      view = mount(<Chart {...numeric} />)
      const xs = view.host
        .querySelector('[data-series="a"] polyline')!
        .getAttribute('points')!
        .split(' ')
        .map((p) => Number(p.split(',')[0]))
      const solid = [...view.host.querySelectorAll('[data-series="a"] polyline')].flatMap((line) =>
        line
          .getAttribute('points')!
          .split(' ')
          .map((p) => Number(p.split(',')[0])),
      )
      const all = [...new Set([...xs, ...solid])].sort((a, b) => a - b)
      expect(all).toHaveLength(4)
      expect(all[2]! - all[1]!).toBeCloseTo(3 * (all[1]! - all[0]!), 5)
    })

    it('draws no marker on every point when asked, but a numbered line at each marker, listed with its label', () => {
      view = mount(<Chart {...numeric} />)
      expect(view.host.querySelectorAll('[data-series="a"] circle')).toHaveLength(0)
      const markers = [...view.host.querySelectorAll('[data-marker]')]
      expect(markers).toHaveLength(2)
      expect(markers.map((m) => m.textContent)).toEqual(['1', '2'])
      const legend = view.host.querySelector('[data-marker-list]')!.textContent!
      expect(legend).toContain('1Now: 10p')
      expect(legend).toContain('2Most: 50p')
    })

    it('shades each range, lettered, draws the line across it dashed, and lists it', () => {
      view = mount(<Chart {...numeric} />)
      const span = view.host.querySelector('[data-span]')!
      expect(span.textContent).toBe('A')
      expect(view.host.querySelector('[data-marker-list]')!.textContent).toContain('AA jump lies here')
      const dashed = [...view.host.querySelectorAll('[data-series="a"] polyline')].filter((l) => l.getAttribute('stroke-dasharray'))
      expect(dashed).toHaveLength(1)
      expect(dashed[0]!.getAttribute('points')!.split(' ')).toHaveLength(2)
    })

    it('labels the x axis with value ticks, and puts the row notes in the table', () => {
      view = mount(<Chart {...numeric} />)
      expect(view.host.querySelector('[data-x-ticks]')!.textContent).toMatch(/0p.*50p/)
      const rows = [...view.host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))
      expect(rows[1]).toEqual(['10p', '90 pence', 'Now: 10p'])
      expect(view.host.querySelector('thead')!.textContent).toContain('Marked')
    })

    it('puts every extra column in the table, in order', () => {
      view = mount(
        <Chart {...numeric} columns={[...numeric.columns!, { label: 'Change', values: ['+1p', '0p', '-1p', '-2p'], numeric: true }]} />,
      )
      const rows = [...view.host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))
      expect(rows[2]).toEqual(['40p', '60 pence', '', '-1p'])
      expect(view.host.querySelector('thead')!.textContent).toMatch(/Marked.*Change/)
    })

    it('highlights the selected point on the line and its table row', () => {
      view = mount(<Chart {...numeric} selectedX={40} />)
      expect(view.host.querySelectorAll('[data-selected]')).toHaveLength(1)
      const rows = [...view.host.querySelectorAll('tbody tr')]
      expect(rows.map((r) => r.hasAttribute('data-selected-row'))).toEqual([false, false, true, false])
      view.unmount()
      view = mount(<Chart {...numeric} />)
      expect(view.host.querySelectorAll('[data-selected]')).toHaveLength(0)
    })

    it('says the markers and ranges in the text summary', () => {
      view = mount(<Chart {...numeric} />)
      const svg = view.host.querySelector('svg[role="img"]')!
      const desc = document.getElementById(svg.getAttribute('aria-describedby')!)!.textContent!
      expect(desc).toContain('Marked 1: Now: 10p.')
      expect(desc).toContain('Range A: A jump lies here.')
    })

    it('uses token colour classes only', () => {
      view = mount(<Chart {...numeric} />)
      expect(view.host.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    })
  })
})
