// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { themeStore } from '@/hooks/useTheme'
import { mount } from '@/test/dom'
import { BridgeBar, type BridgeBarRow } from './BridgeBar'

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const $ = (selector: string) => view!.host.querySelector(selector)
const $$ = (selector: string) => [...view!.host.querySelectorAll(selector)]

const ROWS: BridgeBarRow[] = [
  { id: 'a', label: 'Alpha', value: 300 },
  { id: 'b', label: 'Beta', value: 0 },
  { id: 'c', label: 'Gamma', value: -200 },
  { id: 'd', label: 'Delta', value: 600 },
]
const props = {
  title: 'Where the difference comes from',
  rows: ROWS,
  total: 700,
  totalLabel: 'Difference',
  formatValue: (v: number) => `${v > 0 ? '+' : ''}${v} pence`,
  more: 'More for First',
  less: 'Less for First',
}

/** A drawn bar's ends, in the bar's own units from 0 to 100, the line of nothing at 50. */
const ends = (row: Element) => {
  const rect = row.querySelector('rect')!
  const x = Number(rect.getAttribute('x'))
  return [x, x + Number(rect.getAttribute('width'))] as const
}

describe('BridgeBar (3d-2)', () => {
  it('draws a row per part that differs, in order, and the total; their values add up to it', () => {
    view = mount(<BridgeBar {...props} />)
    const drawn = $$('[data-bridge-row]')
    expect(drawn.map((el) => el.getAttribute('data-bridge-row'))).toEqual(['a', 'c', 'd'])
    expect(drawn.reduce((sum, el) => sum + Number(el.getAttribute('data-value')), 0)).toBe(props.total)
    expect(Number($('[data-bridge-total]')!.getAttribute('data-value'))).toBe(700)
  })

  it('bars go either way from the line of nothing, in proportion to the largest', () => {
    view = mount(<BridgeBar {...props} />)
    const [a, c, d] = $$('[data-bridge-row]').map(ends)
    expect(a![0]).toBe(50)
    expect(c![1]).toBe(50)
    expect(c![0]).toBeLessThan(50)
    const total = ends($('[data-bridge-total]')!)
    // The total is the largest: half the width.
    expect(total[1] - total[0]).toBeCloseTo(50, 6)
    expect((d![1] - d![0]) / (a![1] - a![0])).toBeCloseTo(2, 6)
    expect((a![1] - a![0]) / (c![1] - c![0])).toBeCloseTo(1.5, 6)
  })

  it('token colours only, never the danger colour; above and below nothing differ by side and sign, not colour alone', () => {
    view = mount(<BridgeBar {...props} />)
    const classes = $$('svg *').map((el) => el.getAttribute('class') ?? '')
    expect(classes.join(' ')).not.toMatch(/danger/)
    for (const c of classes.filter(Boolean)) expect(c).toMatch(/^(fill|stroke)-[a-z-]+( |$)/)
    expect($$('[data-bridge-row] [data-bridge-value]').map((el) => el.textContent)).toEqual(['+300 pence', '-200 pence', '+600 pence'])
  })

  it('is an image named by its title and described by a text summary of every part that differs, and those that don’t', () => {
    view = mount(<BridgeBar {...props} />)
    const img = $('[role="img"]')!
    const title = document.getElementById(img.getAttribute('aria-labelledby')!)!
    const desc = document.getElementById(img.getAttribute('aria-describedby')!)!
    expect(title.textContent).toBe('Where the difference comes from')
    expect(desc.textContent).toBe('Difference +700 pence: Alpha +300 pence, Gamma -200 pence, Delta +600 pence. The same for both: Beta.')
  })

  it('says which side is which in words', () => {
    view = mount(<BridgeBar {...props} />)
    expect($('[data-bridge-key]')!.textContent).toMatch(/Right of the line: More for First.*Left of the line: Less for First/)
  })

  it('offers every part, those that are the same included, and the total in a table', () => {
    view = mount(<BridgeBar {...props} />)
    const rows = $$('[data-bridge-table] tbody tr').map((tr) => [tr.querySelector('th')!.textContent, tr.querySelector('td')!.textContent])
    expect(rows).toEqual([
      ['Alpha', '+300 pence'],
      ['Beta', '0 pence'],
      ['Gamma', '-200 pence'],
      ['Delta', '+600 pence'],
    ])
    expect($('[data-bridge-table] tfoot td')!.textContent).toBe('+700 pence')
    const region = $('[data-bridge-table]')!.closest('[tabindex="0"]')
    expect(region).not.toBeNull()
  })

  it('every part the same: no bars, says so, keeps the table', () => {
    view = mount(<BridgeBar {...props} total={0} rows={ROWS.map((r) => ({ ...r, value: 0 }))} />)
    expect($('[data-bridge-row]')).toBeNull()
    expect($('[data-bridge-same]')!.textContent).toBe('Every part is the same for both.')
    expect($$('[data-bridge-table] tbody tr')).toHaveLength(4)
  })

  it('redraws on a theme change', () => {
    view = mount(<BridgeBar {...props} />)
    act(() => themeStore.set('dark'))
    expect($('figure')!.getAttribute('data-theme')).toBe('dark')
    act(() => themeStore.set('light'))
    expect($('figure')!.getAttribute('data-theme')).toBe('light')
    act(() => themeStore.set('system'))
  })
})
