// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { latestTaxYear } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
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

describe('VerifiedBadge', () => {
  it('shows the tax year and "Not yet verified" for the skeleton', () => {
    render(latestTaxYear())
    expect(host.textContent).toContain('2026 to 2027')
    expect(host.textContent).toContain('Not yet verified')
    expect(host.textContent).not.toMatch(/Last verified/)
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
    expect(link.getAttribute('aria-label')).toMatch(/2096 to 2097 tax year: not yet verified\. See tax data/i)
    act(() => link.click())
    expect(location.hash).toBe('#/tax-data')
  })

  it('is plain text where it would link to itself (on the Tax data screen)', () => {
    render(FAKE_TODO_YEAR, false)
    expect(host.querySelector('a')).toBeNull()
    expect(host.textContent).toContain('Not yet verified')
  })
})
