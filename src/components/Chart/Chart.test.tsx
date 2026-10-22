// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('the table scrolls sideways in a keyboard-focusable region named by the chart title (axe scrollable-region-focusable)', () => {
    view = mount(<Chart {...props} />)
    const region = view.host.querySelector('details table')!.parentElement!
    expect(region.className).toContain('overflow-x-auto')
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.tagName).toBe('SECTION')
    const name = view.host.querySelector(`#${region.getAttribute('aria-labelledby')}`)?.textContent
    expect(name).toBe(props.title)
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

    it('merges markers closer than a label’s width into one number, listing every label under it', () => {
      const close = [...numeric.markers!, { x: 11, label: 'Close: 11p' }].sort((a, b) => a.x - b.x)
      view = mount(<Chart {...numeric} markers={close} />)
      const markers = [...view.host.querySelectorAll('[data-marker]')]
      expect(markers.map((m) => m.querySelector('text')!.textContent)).toEqual(['1', '2'])
      const items = [...view.host.querySelectorAll('[data-marker-list] li')].map((li) => li.textContent)
      expect(items[0]).toBe('1Now: 10pClose: 11p')
      expect(items[1]).toBe('2Most: 50p')
      const svg = view.host.querySelector('svg[role="img"]')!
      const desc = document.getElementById(svg.getAttribute('aria-describedby')!)!.textContent!
      expect(desc).toContain('Marked 1: Now: 10p; Close: 11p.')
    })

    it('keeps the y axis at or above zero when no value is below it', () => {
      view = mount(<Chart {...numeric} series={[{ id: 'a', label: 'Amount', kind: 'line', values: [0, 1, 1, 0] }]} />)
      const ticks = [...view.host.querySelectorAll('svg text.tabular-nums')].map((t) => t.textContent)
      expect(ticks.some((t) => t?.startsWith('-'))).toBe(false)
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

  describe('four line series, a series ending early and selecting a position (3c-2)', () => {
    const four: ChartProps = {
      ...props,
      title: 'Cumulative',
      categories: ['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4'],
      xValues: [0, 1, 2, 3, 4],
      xLabel: 'Month',
      references: [],
      pointMarkers: false,
      endLabels: true,
      series: [
        { id: 'a', label: 'Alpha', kind: 'line', values: [0, 10, 20, 30, 40] },
        { id: 'b', label: 'Bravo', kind: 'line', values: [5, 12, 18, 25, 33] },
        { id: 'c', label: 'Charlie', kind: 'line', values: [2, 9, 15, null, null], style: 'neutral' },
        { id: 'd', label: 'Delta', kind: 'line', values: [8, 11, 14, 17, 19], style: 'danger' },
      ],
    }
    const desc = () => {
      const svg = view!.host.querySelector('svg[role="img"]')!
      return document.getElementById(svg.getAttribute('aria-describedby')!)!.textContent!
    }
    const style = (id: string) => {
      const line = view!.host.querySelector(`[data-series="${id}"] polyline`)!
      return `${line.getAttribute('class')} / ${line.getAttribute('stroke-dasharray') ?? 'solid'}`
    }
    const dash = (id: string) => view!.host.querySelector(`[data-series="${id}"] polyline`)!.getAttribute('stroke-dasharray') ?? 'solid'
    const lastX = (id: string) =>
      Math.max(
        ...[...view!.host.querySelectorAll(`[data-series="${id}"] polyline`)].flatMap((l) =>
          l
            .getAttribute('points')!
            .split(' ')
            .map((p) => Number(p.split(',')[0])),
        ),
      )

    it('draws four lines with four distinct styles, each a different dash pattern, not by colour alone', () => {
      view = mount(<Chart {...four} />)
      const ids = ['a', 'b', 'c', 'd']
      expect(new Set(ids.map(style)).size).toBe(4)
      expect(new Set(ids.map(dash)).size).toBe(4)
      // The legend draws each series' own dash.
      const legend = [...view.host.querySelectorAll('ul li svg line')].map((l) => l.getAttribute('stroke-dasharray') ?? 'solid')
      expect(legend).toEqual(ids.map(dash))
    })

    it('has a neutral style that is not the danger colour', () => {
      view = mount(<Chart {...four} />)
      const neutral = view.host.querySelector('[data-series="c"] polyline')!.getAttribute('class')!
      expect(neutral).not.toMatch(/danger/)
      expect(neutral).toMatch(/stroke-text-muted/)
      expect(view.host.querySelector('[data-series="d"] polyline')!.getAttribute('class')).toMatch(/stroke-danger/)
    })

    it('without a style, series keep their order’s style, and the order never picks the danger colour', () => {
      const plain = four.series.map(({ style: _style, ...s }) => s)
      view = mount(<Chart {...four} series={plain} />)
      expect(view.host.querySelector('[data-series="a"] polyline')!.getAttribute('class')).toMatch(/stroke-accent/)
      expect(view.host.querySelector('[data-series="b"] polyline')!.getAttribute('class')).toMatch(/stroke-text\b/)
      expect(view.host.querySelector('[data-series="c"] polyline')!.getAttribute('class')).toMatch(/stroke-text-muted/)
      expect(view.host.querySelector('[data-series="d"] polyline')!.getAttribute('class')).toMatch(/stroke-swatch-teal/)
      expect(view.host.querySelector('.stroke-danger, .fill-danger')).toBeNull()
    })

    describe('a fourth style that is not the danger colour (secondary)', () => {
      const five: ChartProps = {
        ...four,
        series: [...four.series, { id: 'e', label: 'Echo', kind: 'line', values: [1, 4, 7, 9, 12], style: 'secondary' }],
      }
      const marker = (id: string) => view!.host.querySelector(`[data-series="${id}"] [data-end-marker]`)!

      it('has its own token colour (not the danger colour, nor another style’s), its own dash and its own marker shape', () => {
        view = mount(<Chart {...five} />)
        const cls = view.host.querySelector('[data-series="e"] polyline')!.getAttribute('class')!
        expect(cls).toMatch(/stroke-swatch-teal/)
        expect(cls).not.toMatch(/danger/)
        const ids = ['a', 'b', 'c', 'd', 'e']
        expect(new Set(ids.map(style)).size).toBe(5)
        expect(new Set(ids.map(dash)).size).toBe(5)
        expect(marker('e').tagName.toLowerCase()).toBe('polygon')
        expect(new Set(ids.map((id) => `${marker(id).tagName}/${marker(id).getAttribute('transform') ?? ''}`)).size).toBe(4)
        const legend = [...view.host.querySelectorAll('ul li svg line')].map((l) => l.getAttribute('stroke-dasharray') ?? 'solid')
        expect(legend).toEqual(ids.map(dash))
      })

      it('is labelled at its end like the others, with labels kept apart', () => {
        view = mount(<Chart {...five} />)
        const labels = [...view.host.querySelectorAll('[data-end-label]')]
        expect(labels.map((l) => l.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
        const ys = labels.map((l) => Number(l.querySelector('text')!.getAttribute('y'))).sort((p, q) => p - q)
        for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!).toBeGreaterThanOrEqual(10)
      })

      it('marks the selected position with its own shape', () => {
        view = mount(<Chart {...five} selectedX={2} onSelectX={() => {}} selectLabel="Month" />)
        const selected = view.host.querySelectorAll('[data-selected]')
        expect(
          [...selected].some((m) => m.tagName.toLowerCase() === 'polygon' && /stroke-swatch-teal/.test(m.getAttribute('class')!)),
        ).toBe(true)
      })
    })

    it('labels the end of each line with its name and its own marker shape', () => {
      view = mount(<Chart {...four} />)
      const labels = [...view.host.querySelectorAll('[data-end-label]')]
      expect(labels.map((l) => l.getAttribute('data-end-label'))).toEqual(['a', 'b', 'c', 'd'])
      expect(labels.map((l) => l.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
      for (const id of ['a', 'b', 'c', 'd']) expect(view.host.querySelector(`[data-series="${id}"] [data-end-marker]`)).not.toBeNull()
      // Labels never sit on top of each other.
      const ys = labels.map((l) => Number(l.querySelector('text')!.getAttribute('y'))).sort((p, q) => p - q)
      for (let k = 1; k < ys.length; k++) expect(ys[k]! - ys[k - 1]!).toBeGreaterThanOrEqual(10)
    })

    it('a series may end before the x range does: its line stops at its last value, and the table shows a dash after', () => {
      view = mount(<Chart {...four} />)
      expect(lastX('c')).toBeLessThan(lastX('a'))
      const marker = view.host.querySelector('[data-series="c"] [data-end-marker]')!
      const at = Number(marker.getAttribute('cx') ?? Number(marker.getAttribute('x')) + Number(marker.getAttribute('width')) / 2)
      expect(at).toBeCloseTo(lastX('c'), 5)
      const rows = [...view.host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))
      expect(rows[3]![3]).toBe('–')
      expect(desc()).toContain('Charlie: 2 pence at Month 0 to 15 pence at Month 2')
    })

    it('with onSelectX, the chart is a slider named for the selection: arrows, Home and End report the x selected', () => {
      const onSelectX = vi.fn()
      view = mount(<Chart {...four} selectedX={2} onSelectX={onSelectX} selectLabel="Month on the chart" />)
      const slider = view.host.querySelector('[role="slider"]') as HTMLElement
      expect(slider.getAttribute('tabindex')).toBe('0')
      expect(slider.getAttribute('aria-label')).toBe('Month on the chart')
      expect(slider.getAttribute('aria-valuenow')).toBe('2')
      expect(slider.getAttribute('aria-valuemin')).toBe('0')
      expect(slider.getAttribute('aria-valuemax')).toBe('4')
      expect(slider.getAttribute('aria-valuetext')).toMatch(/^Month 2: Alpha 20 pence, Bravo 18 pence, Charlie 15 pence, Delta 14 pence$/)
      const key = (k: string) => act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))
      key('ArrowRight')
      key('ArrowUp')
      key('ArrowLeft')
      key('ArrowDown')
      key('Home')
      key('End')
      expect(onSelectX.mock.calls.map((c) => c[0])).toEqual([3, 3, 1, 1, 0, 4])
    })

    it('a series with no value at the selected x says so in the slider’s text', () => {
      view = mount(<Chart {...four} selectedX={4} onSelectX={() => {}} selectLabel="Month" />)
      expect(view.host.querySelector('[role="slider"]')!.getAttribute('aria-valuetext')).toContain('Charlie no value')
    })

    it('a tap or click selects the nearest x', () => {
      const onSelectX = vi.fn()
      view = mount(<Chart {...four} selectedX={0} onSelectX={onSelectX} selectLabel="Month" />)
      const svg = view.host.querySelector('svg[role="img"]') as SVGSVGElement
      const width = Number(svg.getAttribute('width'))
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 300, right: width, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
      act(() => svg.dispatchEvent(new MouseEvent('click', { clientX: width - 1, clientY: 100, bubbles: true })))
      expect(onSelectX).toHaveBeenLastCalledWith(4)
    })

    it('marks the selected position across the plot and on every line, highlights its row, and says it in the summary', () => {
      view = mount(<Chart {...four} selectedX={1} onSelectX={() => {}} selectLabel="Month" />)
      expect(view.host.querySelectorAll('[data-selected-position]')).toHaveLength(1)
      expect(view.host.querySelectorAll('[data-selected]')).toHaveLength(4)
      const rows = [...view.host.querySelectorAll('tbody tr')]
      expect(rows.map((r) => r.hasAttribute('data-selected-row'))).toEqual([false, true, false, false, false])
      expect(desc()).toContain('Selected: Month 1. Alpha 10 pence, Bravo 12 pence, Charlie 9 pence, Delta 11 pence.')
    })

    it('a table row selects its x: each row has a button, pressed for the selected one', () => {
      const onSelectX = vi.fn()
      view = mount(<Chart {...four} selectedX={1} onSelectX={onSelectX} selectLabel="Month" />)
      const buttons = [...view.host.querySelectorAll('tbody tr th button')] as HTMLButtonElement[]
      expect(buttons).toHaveLength(5)
      expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false'])
      act(() => buttons[3]!.click())
      expect(onSelectX).toHaveBeenLastCalledWith(3)
    })

    it('without onSelectX nothing is a slider and rows have no buttons', () => {
      view = mount(<Chart {...four} selectedX={1} />)
      expect(view.host.querySelector('[role="slider"]')).toBeNull()
      expect(view.host.querySelector('tbody button')).toBeNull()
      expect(view.host.querySelectorAll('[data-selected]')).toHaveLength(1)
    })

    it('uses token colour classes only', () => {
      view = mount(<Chart {...four} selectedX={1} onSelectX={() => {}} selectLabel="Month" />)
      expect(view.host.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    })
  })
})
