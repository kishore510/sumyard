// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { latestTaxYear } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
import { yearStatus } from '@/config/tax/sourced'
import { VerifiedBadge } from './VerifiedBadge'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  history.replaceState(null, '', '/')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (config: TaxYearConfig, linked?: boolean) => act(() => root.render(<VerifiedBadge config={config} linked={linked} />))

/** The text a screen reader reads (aria-hidden left out), or what is seen (screen-reader-only text left out too), spaces collapsed. */
function textOf(node: Node, { skipScreenReaderOnly }: { skipScreenReaderOnly: boolean }): string {
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
    if (!(n instanceof Element)) return ''
    if (n.getAttribute('aria-hidden') === 'true') return ''
    if (skipScreenReaderOnly && n.classList.contains('sr-only')) return ''
    return [...n.childNodes].map(walk).join('')
  }
  return walk(node).replace(/\s+/g, ' ').trim()
}

describe('VerifiedBadge', () => {
  it('shows the real latest year with the label its verified values call for', () => {
    render(latestTaxYear())
    expect(host.textContent).toContain('2026 to 2027')
    const { complete } = yearStatus(latestTaxYear())
    expect(host.textContent).toMatch(complete ? /Last verified/ : /Not yet verified/)
  })

  it('shows "Not yet verified" while any group is unverified', () => {
    render(FAKE_PARTIAL_YEAR)
    expect(host.textContent).toContain('2097 to 2098')
    expect(host.textContent).toContain('Not yet verified')
    render(FAKE_TODO_YEAR)
    expect(host.textContent).toContain('Not yet verified')
  })

  it('shows "Last verified <date>" once every value is verified', () => {
    render(FAKE_VERIFIED_YEAR)
    expect(host.textContent).toContain('2098 to 2099')
    expect(host.textContent).toContain('Last verified 2 January 2098')
    expect(host.textContent).not.toMatch(/Not yet/)
  })

  it('links to the Tax data screen, opening it as a sheet', () => {
    render(FAKE_TODO_YEAR)
    const link = host.querySelector('a')!
    expect(link.getAttribute('href')).toBe('#/tax-data')
    act(() => link.click())
    expect(location.hash).toBe('#/tax-data')
  })

  it('names the link by its visible text, then where it goes (label in name)', () => {
    for (const config of [FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR]) {
      render(config)
      const link = host.querySelector('a')!
      expect(link.hasAttribute('aria-label')).toBe(false)
      const visible = textOf(link, { skipScreenReaderOnly: true })
      const name = textOf(link, { skipScreenReaderOnly: false })
      expect(visible).toMatch(/^\d{4} to \d{4} tax year (Not yet verified|Last verified .+)$/)
      expect(name).toBe(`${visible} (see tax data)`)
    }
  })

  it('is plain text where it would link to itself (on the Tax data screen)', () => {
    render(FAKE_TODO_YEAR, false)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toContain('Not yet verified')
  })
})
