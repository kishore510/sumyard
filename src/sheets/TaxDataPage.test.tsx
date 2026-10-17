// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import { getTaxYear } from '@/config/tax/index'
import { TAX_FIELDS, TAX_GROUPS, type TaxYearConfig } from '@/config/tax/schema'
import { groupStatus, isVerified, leafAt, type Sourced } from '@/config/tax/sourced'
import { TaxDataPage } from './TaxDataPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (years?: readonly TaxYearConfig[]) => act(() => root.render(<TaxDataPage years={years} />))
const year = (id: string) => host.querySelector<HTMLElement>(`[data-tax-year="${id}"]`)
const group = (yearId: string, groupId: string) => year(yearId)!.querySelector<HTMLElement>(`[data-tax-group="${groupId}"]`)!
const field = (yearId: string, path: string) => year(yearId)!.querySelector<HTMLElement>(`[data-tax-field="${path}"]`)!

describe('Tax data screen, real registry', () => {
  it('lists the 2026 to 2027 year with each group flagged by how many of its values are verified', () => {
    render()
    const real = getTaxYear('2026-27')!
    const el = year('2026-27')
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('2026 to 2027')
    for (const g of TAX_GROUPS) {
      const status = groupStatus(real, g)
      const groupEl = group('2026-27', g.id)
      expect(groupEl.dataset.status, g.id).toBe(status.complete ? 'all' : status.verified > 0 ? 'some' : 'none')
      expect(groupEl.textContent).toContain(g.title)
      if (!status.complete) expect(groupEl.textContent).toMatch(/Not yet verified/)
    }
    const verified = TAX_FIELDS.filter((f) => isVerified(leafAt(real, f.path) as Sourced<unknown>))
    expect(el!.querySelectorAll('[data-tax-field][data-verified="true"]')).toHaveLength(verified.length)
    expect(el!.querySelectorAll('[data-tax-field][data-verified="false"]')).toHaveLength(TAX_FIELDS.length - verified.length)
  })

  it('links each verified value only to its www.gov.uk source, opened in a new tab', () => {
    render()
    const real = getTaxYear('2026-27')!
    for (const f of TAX_FIELDS) {
      const l = leafAt(real, f.path) as Sourced<unknown>
      const links = [...field('2026-27', f.path).querySelectorAll('a')]
      if (!isVerified(l)) {
        expect(links, f.path).toHaveLength(0)
        continue
      }
      expect(links, f.path).toHaveLength(1)
      expect(links[0]!.getAttribute('href'), f.path).toBe(l.sourceUrl)
      expect(links[0]!.getAttribute('target')).toBe('_blank')
      expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('says why: calculators show no results while a value they need is unverified', () => {
    render()
    expect(host.textContent).toMatch(/no results/i)
    expect(host.textContent).toMatch(/not financial advice/i)
  })
})

describe('Tax data screen states (fake years)', () => {
  it('shows nothing-loaded as an empty state', () => {
    render([])
    expect(host.textContent).toMatch(/No tax years are loaded/)
  })

  it('shows a partly verified year: verified groups as verified, the rest flagged', () => {
    render([FAKE_PARTIAL_YEAR])
    const allowance = group('2097-98', 'personal-allowance')
    expect(allowance.dataset.status).toBe('all')
    expect(allowance.textContent).toContain('All 3 verified')
    expect(group('2097-98', 'ni-employee').dataset.status).toBe('none')
    expect(year('2097-98')!.textContent).toContain('3 of')
    expect(year('2097-98')!.textContent).toMatch(/Not yet verified/)
  })

  it('shows a value, a GOV.UK source link and the verified date for each verified leaf', () => {
    render([FAKE_VERIFIED_YEAR])
    const allowance = field('2098-99', 'incomeTax.personalAllowance')
    expect(allowance.dataset.verified).toBe('true')
    expect(allowance.textContent).toMatch(/£[\d,]+\.\d\d/)
    expect(allowance.textContent).toContain('Verified 2 January 2098')
    const link = allowance.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://www.gov.uk/sumyard-fake-fixture/incomeTax.personalAllowance')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('aria-label')).toMatch(/Personal allowance.*GOV\.UK.*new tab/)
    expect(field('2098-99', 'incomeTax.taperRate').textContent).toMatch(/\d%/)
    expect(field('2098-99', 'incomeTax.bands.rUK').textContent).toContain('Fake band B')
    expect(field('2098-99', 'incomeTax.bands.rUK').textContent).toMatch(/Fake band A: \S+ from .*Fake band B: \S+ above /)
    expect(field('2098-99', 'incomeTax.bands.rUK').textContent).toContain('On income after allowances')
    expect(field('2098-99', 'period.start').textContent).toContain('1 January 2098')
    for (const g of TAX_GROUPS) expect(group('2098-99', g.id).dataset.status).toBe('all')
    expect(year('2098-99')!.textContent).toContain('Last verified 2 January 2098')
  })

  it('lists several years, newest first as given, each with its own badge', () => {
    render([FAKE_VERIFIED_YEAR, FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR])
    const ids = [...host.querySelectorAll<HTMLElement>('[data-tax-year]')].map((el) => el.dataset.taxYear)
    expect(ids).toEqual(['2098-99', '2097-98', '2096-97'])
    expect(year('2096-97')!.textContent).toMatch(/Not yet verified/)
  })

  it('renders a forged verified leaf as unverified, with no link', () => {
    const forged = {
      ...FAKE_VERIFIED_YEAR,
      incomeTax: {
        ...FAKE_VERIFIED_YEAR.incomeTax,
        personalAllowance: { status: 'verified', value: 1, sourceUrl: 'https://example.com/x', verifiedOn: '2098-01-02' },
      },
    } as unknown as TaxYearConfig
    render([forged])
    const allowance = field('2098-99', 'incomeTax.personalAllowance')
    expect(allowance.dataset.verified).toBe('false')
    expect(allowance.querySelector('a')).toBeNull()
    expect(host.innerHTML).not.toContain('example.com')
  })
})
