import { describe, expect, it } from 'vitest'
import { type Money, type Ratio, toPence, ZERO } from '@/lib/money'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_ON, FAKE_VERIFIED_YEAR } from './fixtures/fakeTaxYears'
import { TAX_GROUPS } from './schema'
import { groupStatus, isSourceUrl, isVerified, leafAt, requireVerified, type Sourced, TODO, yearStatus } from './sourced'

/* Everything here runs on the fake fixtures. No real tax figure is used. */

const verified = (overrides: Record<string, unknown> = {}) =>
  ({
    status: 'verified',
    value: ZERO,
    sourceUrl: 'https://www.gov.uk/sumyard-fake-fixture/x',
    verifiedOn: '2098-01-02',
    ...overrides,
  }) as Sourced<Money>

describe('Sourced<T> at the type level (tsc fails if a @ts-expect-error has nothing to catch)', () => {
  it('rejects a malformed verified leaf as a type error', () => {
    const fine: Sourced<Money> = { status: 'verified', value: ZERO, sourceUrl: 'https://www.gov.uk/x', verifiedOn: '2098-01-02' }
    // @ts-expect-error a verified leaf needs a source URL
    const noUrl: Sourced<Money> = { status: 'verified', value: ZERO, verifiedOn: '2098-01-02' }
    // @ts-expect-error a verified leaf needs a verified date
    const noDate: Sourced<Money> = { status: 'verified', value: ZERO, sourceUrl: 'https://www.gov.uk/x' }
    // @ts-expect-error the source must be a GOV.UK page over https
    const otherSite: Sourced<Money> = { status: 'verified', value: ZERO, sourceUrl: 'https://example.com/x', verifiedOn: '2098-01-02' }
    // @ts-expect-error the source must be https
    const insecure: Sourced<Money> = { status: 'verified', value: ZERO, sourceUrl: 'http://www.gov.uk/x', verifiedOn: '2098-01-02' }
    // @ts-expect-error the date must be YYYY-MM-DD
    const prose: Sourced<Money> = { status: 'verified', value: ZERO, sourceUrl: 'https://www.gov.uk/x', verifiedOn: '2 January 2098' }
    // @ts-expect-error a verified leaf needs a value
    const noValue: Sourced<Money> = { status: 'verified', sourceUrl: 'https://www.gov.uk/x', verifiedOn: '2098-01-02' }
    // @ts-expect-error a money leaf holds Money, not a plain number
    const plainNumber: Sourced<Money> = { status: 'verified', value: 100, sourceUrl: 'https://www.gov.uk/x', verifiedOn: '2098-01-02' }
    // @ts-expect-error an unverified leaf cannot carry a value
    const todoWithValue: Sourced<Money> = { status: 'todo', value: ZERO }
    // @ts-expect-error a bare value is not a leaf
    const bare: Sourced<Money> = ZERO
    expect([fine, noUrl, noDate, otherSite, insecure, prose, noValue, plainNumber, todoWithValue, bare]).toHaveLength(10)
  })
})

describe('isSourceUrl', () => {
  it.each(['https://www.gov.uk/x', 'https://www.gov.uk/guidance/some-page', 'https://www.gov.uk/a/b?c=d#e'])('accepts %s', (url) => {
    expect(isSourceUrl(url)).toBe(true)
  })

  it.each([
    '',
    'https://www.gov.uk',
    'https://www.gov.uk/',
    'http://www.gov.uk/x',
    'https://gov.uk/x',
    'https://www.legislation.gov.uk/x',
    'https://www.gov.uk.example.com/x',
    'https://example.com/https://www.gov.uk/x',
    'https://user@www.gov.uk/x',
    'https://www.gov.uk:8443/x',
    'https://www.gov.uk/x y',
    'https://www.gov.uk/x"onmouseover="y',
    'https://www.gov.uk/x<script>',
    'https://www.gov.uk/x\\y',
    'javascript:alert(1)',
    '//www.gov.uk/x',
  ])('rejects %j', (url) => {
    expect(isSourceUrl(url)).toBe(false)
  })

  it('rejects values that are not strings', () => {
    for (const value of [null, undefined, 1, {}, []]) expect(isSourceUrl(value)).toBe(false)
  })
})

describe('isVerified', () => {
  it('is true only for a verified leaf with a valid source and date', () => {
    expect(isVerified(verified())).toBe(true)
    expect(isVerified(TODO)).toBe(false)
    expect(isVerified({ status: 'todo' })).toBe(false)
  })

  it('treats a forged or malformed verified leaf as unverified (and so refused)', () => {
    expect(isVerified(verified({ sourceUrl: undefined }))).toBe(false)
    expect(isVerified(verified({ sourceUrl: 'https://example.com/x' }))).toBe(false)
    expect(isVerified(verified({ verifiedOn: undefined }))).toBe(false)
    expect(isVerified(verified({ verifiedOn: '2098-02-30' }))).toBe(false)
    expect(
      isVerified({ status: 'verified', sourceUrl: 'https://www.gov.uk/x', verifiedOn: '2098-01-02' } as unknown as Sourced<Money>),
    ).toBe(false)
    expect(isVerified({ status: 'TODO_VERIFY' } as unknown as Sourced<Money>)).toBe(false)
    expect(isVerified(null as unknown as Sourced<Money>)).toBe(false)
  })
})

describe('leafAt', () => {
  it('reads a leaf by its dotted path', () => {
    expect(leafAt(FAKE_TODO_YEAR, 'incomeTax.personalAllowance')).toEqual({ status: 'todo' })
    expect(leafAt(FAKE_VERIFIED_YEAR, 'studentLoans.postgraduate.rate')).toMatchObject({ status: 'verified' })
  })
})

describe('requireVerified', () => {
  it('returns the plain values when every requested leaf is verified', () => {
    const result = requireVerified(FAKE_VERIFIED_YEAR, [
      'incomeTax.personalAllowance',
      'incomeTax.taperRate',
      'pension.carryForward.yearsBack',
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Typed per path: Money, Ratio and number.
    const allowance: Money = result.values['incomeTax.personalAllowance']
    const rate: Ratio = result.values['incomeTax.taperRate']
    const years: number = result.values['pension.carryForward.yearsBack']
    const leaf = (path: string) => (leafAt(FAKE_VERIFIED_YEAR, path) as { value: unknown }).value
    expect(toPence(allowance)).toBe(toPence(leaf('incomeTax.personalAllowance') as Money))
    expect(rate).toEqual(leaf('incomeTax.taperRate'))
    expect(years).toBe(3)
    expect(result.taxYear).toBe('2098-99')
  })

  it('refuses, listing every unverified path in the order asked, when any is unverified', () => {
    const result = requireVerified(FAKE_PARTIAL_YEAR, [
      'incomeTax.bands.scotland',
      'incomeTax.personalAllowance',
      'nationalInsurance.employee.mainRate',
      'incomeTax.bands.scotland',
    ])
    expect(result).toEqual({
      ok: false,
      taxYear: '2097-98',
      unverified: ['incomeTax.bands.scotland', 'nationalInsurance.employee.mainRate'],
    })
  })

  it('refuses everything on a year with nothing verified', () => {
    const result = requireVerified(FAKE_TODO_YEAR, ['period.start', 'period.end'])
    expect(result).toEqual({ ok: false, taxYear: '2096-97', unverified: ['period.start', 'period.end'] })
  })

  it('refuses a leaf whose source was forged into the config', () => {
    const forged = {
      ...FAKE_VERIFIED_YEAR,
      incomeTax: { ...FAKE_VERIFIED_YEAR.incomeTax, personalAllowance: verified({ sourceUrl: 'https://example.com/x' }) },
    }
    expect(requireVerified(forged, ['incomeTax.personalAllowance'])).toMatchObject({
      ok: false,
      unverified: ['incomeTax.personalAllowance'],
    })
  })

  it('accepts only known paths (type error otherwise)', () => {
    // @ts-expect-error not a leaf path
    const unknown = () => requireVerified(FAKE_TODO_YEAR, ['incomeTax.nope'])
    // @ts-expect-error a group, not a leaf
    const group = () => requireVerified(FAKE_TODO_YEAR, ['incomeTax'])
    expect([unknown, group]).toHaveLength(2)
  })
})

describe('yearStatus and groupStatus', () => {
  it('counts verified values per group and for the year', () => {
    const partial = yearStatus(FAKE_PARTIAL_YEAR)
    expect(partial.complete).toBe(false)
    expect(partial.verified).toBe(3)
    expect(partial.lastVerified).toBeUndefined()
    const allowance = groupStatus(FAKE_PARTIAL_YEAR, TAX_GROUPS.find((g) => g.id === 'personal-allowance')!)
    expect(allowance).toMatchObject({ total: 3, verified: 3, complete: true })
    const ni = groupStatus(FAKE_PARTIAL_YEAR, TAX_GROUPS.find((g) => g.id === 'ni-employee')!)
    expect(ni).toMatchObject({ verified: 0, complete: false })
  })

  it('gives the most recent verified date only once every value is verified', () => {
    expect(yearStatus(FAKE_VERIFIED_YEAR)).toMatchObject({ complete: true, lastVerified: FAKE_VERIFIED_ON })
    expect(yearStatus(FAKE_TODO_YEAR)).toMatchObject({ complete: false, verified: 0 })
    const total = TAX_GROUPS.reduce((n, g) => n + g.fields.length, 0)
    expect(yearStatus(FAKE_TODO_YEAR).total).toBe(total)
  })
})
