import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromPounds, ratio, ZERO } from '@/lib/money'
import skeletonSource from './2026-27.ts?raw'
import { auditTaxYear } from './audit'
import { FAKE_MARKER, FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR, FAKE_VERIFIED_YEAR } from './fixtures/fakeTaxYears'
import { getTaxYear, listTaxYears } from './index'
import { TAX_FIELDS, TAX_GROUPS, type TaxYearConfig } from './schema'
import { leafPaths, yearStatus } from './sourced'

/*
 * Repo-level guard on the real config files (src/config/tax/<yyyy-yy>.ts),
 * plus the audit itself proved on fakes. A real file fails if any leaf holds
 * a value without a verified GOV.UK source and date, or if a number (or any
 * other value) sits outside a Sourced leaf.
 */

const YEAR_FILES = import.meta.glob<{ taxYear?: TaxYearConfig }>('./*.ts', { eager: true })
const yearFiles = Object.entries(YEAR_FILES).filter(([path]) => /^\.\/\d{4}-\d{2}\.ts$/.test(path))

describe('real tax-year files', () => {
  it('there is at least one, and each is registered under its file name', () => {
    expect(yearFiles.length).toBeGreaterThan(0)
    for (const [path, module] of yearFiles) {
      const id = path.slice(2, -3)
      expect(module.taxYear, `${path} exports taxYear`).toBeDefined()
      expect(module.taxYear!.id, path).toBe(id)
      expect(getTaxYear(id), `${path} is in the registry`).toBe(module.taxYear)
    }
    expect(listTaxYears()).toHaveLength(yearFiles.length)
  })

  it('every leaf is unverified, or verified with a GOV.UK source and a past date; no number sits outside a leaf', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const year of listTaxYears()) expect(auditTaxYear(year, { today }), year.id).toEqual([])
  })
})

describe('the 2026-27 skeleton', () => {
  const year = getTaxYear('2026-27')!

  it('has every leaf { status: "todo" }', () => {
    expect(yearStatus(year)).toMatchObject({ verified: 0, complete: false })
    for (const path of leafPaths(year)) expect(TAX_FIELDS.some((f) => f.path === path)).toBe(true)
  })

  it('contains no figure, rate, threshold, allowance or date: no number literal except its own id', () => {
    const code = skeletonSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replaceAll("'2026-27'", "'<id>'")
    expect(code.match(/(?<![\w$])\d/g) ?? []).toEqual([])
    expect(code).not.toMatch(/https?:/)
    expect(code).not.toMatch(/verified'|value:|sourceUrl|verifiedOn/)
  })
})

describe('auditTaxYear (on fake years)', () => {
  it('passes the fake years built from the skeleton', () => {
    for (const year of [FAKE_TODO_YEAR, FAKE_PARTIAL_YEAR, FAKE_VERIFIED_YEAR]) expect(auditTaxYear(year), year.id).toEqual([])
  })

  const fake = FAKE_VERIFIED_YEAR
  const withAllowance = (leaf: unknown) => ({ ...fake, incomeTax: { ...fake.incomeTax, personalAllowance: leaf } })
  const good = fake.incomeTax.personalAllowance

  it.each<[string, unknown, RegExp]>([
    ['a bare number where a leaf belongs', withAllowance(1000), /incomeTax\.personalAllowance.*not a Sourced leaf/],
    ['a bare Money value', withAllowance(ZERO), /incomeTax\.personalAllowance.*not a Sourced leaf/],
    ['a string where a leaf belongs', withAllowance('TODO_VERIFY'), /incomeTax\.personalAllowance.*not a Sourced leaf/],
    ['an unverified leaf with a value', withAllowance({ status: 'todo', value: ZERO }), /todo.*only.*status/],
    ['the old TODO_VERIFY marker', withAllowance({ status: 'TODO_VERIFY' }), /unknown status/],
    ['a verified leaf with no source', withAllowance({ ...good, sourceUrl: undefined }), /sourceUrl/],
    ['a verified leaf sourced off GOV.UK', withAllowance({ ...good, sourceUrl: 'https://example.com/x' }), /sourceUrl/],
    ['a verified leaf with an http source', withAllowance({ ...good, sourceUrl: 'http://www.gov.uk/x' }), /sourceUrl/],
    ['a verified leaf with no date', withAllowance({ ...good, verifiedOn: undefined }), /verifiedOn/],
    ['a verified leaf with an impossible date', withAllowance({ ...good, verifiedOn: '2098-02-30' }), /verifiedOn/],
    [
      'a verified leaf with no value',
      withAllowance({ status: 'verified', sourceUrl: good.status === 'verified' ? good.sourceUrl : '', verifiedOn: '2098-01-02' }),
      /value/,
    ],
    ['a verified leaf with extra fields', withAllowance({ ...good, note: 'x' }), /unexpected field/],
    ['a money value in pounds as a float', withAllowance({ ...good, value: 12.5 }), /money/],
    ['a negative money value', withAllowance({ ...good, value: -100 }), /money/],
    [
      'a ratio as a float',
      { ...fake, incomeTax: { ...fake.incomeTax, taperRate: { ...good, value: 0.5 } } },
      /incomeTax\.taperRate.*ratio/,
    ],
    [
      'bands out of order',
      {
        ...fake,
        incomeTax: {
          ...fake.incomeTax,
          bands: {
            ...fake.incomeTax.bands,
            rUK: {
              ...good,
              value: [
                { name: 'B', from: fromPounds(10), rate: ratio(1, 10) },
                { name: 'A', from: ZERO, rate: ratio(1, 10) },
              ],
            },
          },
        },
      },
      /incomeTax\.bands\.rUK.*bands/,
    ],
    [
      'an empty band list',
      { ...fake, incomeTax: { ...fake.incomeTax, bands: { ...fake.incomeTax.bands, scotland: { ...good, value: [] } } } },
      /incomeTax\.bands\.scotland.*bands/,
    ],
    [
      'a count that is not a whole number',
      { ...fake, pension: { ...fake.pension, carryForward: { yearsBack: { ...good, value: 2.5 } } } },
      /count/,
    ],
    [
      'a period date that is not a date',
      { ...fake, period: { ...fake.period, start: { ...good, value: 'April' } } },
      /period\.start.*date/,
    ],
    ['an unknown group holding a number', { ...fake, surprise: { rate: 5 } }, /surprise.*not a Sourced leaf|surprise.*unknown/],
    ['a missing leaf', { ...fake, period: { start: fake.period.start } }, /period\.end.*missing/],
    ['a malformed id', { ...fake, id: 2098 }, /id/],
  ])('fails on %s', (_label, config, problem) => {
    const problems = auditTaxYear(config)
    expect(problems.join('\n')).toMatch(problem)
  })

  it('fails on a verified date in the future', () => {
    expect(auditTaxYear(fake, { today: '2098-01-01' }).join('\n')).toMatch(/verifiedOn.*future/)
    expect(auditTaxYear(fake, { today: '2098-01-02' })).toEqual([])
  })

  it('rejects a source the build scan would reject (legislation.gov.uk needs an owner decision first)', () => {
    expect(auditTaxYear(withAllowance({ ...good, sourceUrl: 'https://www.legislation.gov.uk/x' })).join('\n')).toMatch(/sourceUrl/)
  })
})

describe('schema coverage', () => {
  it('has a group for every area the slice 0.5 brief lists, plus the reserved savings and dividends slot', () => {
    expect(TAX_GROUPS.map((g) => g.id)).toEqual([
      'period',
      'personal-allowance',
      'income-tax-ruk',
      'income-tax-scotland',
      'ni-employee',
      'ni-employer',
      'student-loans',
      'pension',
      'child-benefit',
      'childcare',
    ])
    expect(FAKE_TODO_YEAR.savingsAndDividends).toEqual({ reserved: true })
  })

  it('covers each named part of the brief', () => {
    const paths = TAX_FIELDS.map((f) => f.path)
    for (const plan of ['plan1', 'plan2', 'plan4', 'plan5', 'postgraduate']) {
      expect(paths).toContain(`studentLoans.${plan}.threshold`)
      expect(paths).toContain(`studentLoans.${plan}.rate`)
    }
    for (const path of [
      'period.start',
      'period.end',
      'incomeTax.personalAllowance',
      'incomeTax.taperStart',
      'incomeTax.taperRate',
      'incomeTax.bands.rUK',
      'incomeTax.bands.scotland',
      'nationalInsurance.employee.primaryThreshold',
      'nationalInsurance.employee.upperEarningsLimit',
      'nationalInsurance.employee.mainRate',
      'nationalInsurance.employee.additionalRate',
      'nationalInsurance.employer.secondaryThreshold',
      'nationalInsurance.employer.rate',
      'pension.annualAllowance',
      'pension.taper.thresholdIncome',
      'pension.taper.adjustedIncome',
      'pension.taper.minimumAllowance',
      'pension.carryForward.yearsBack',
      'pension.moneyPurchaseAnnualAllowance',
      'childBenefit.weeklyRates.eldestOrOnly',
      'childBenefit.weeklyRates.additionalChild',
      'childBenefit.hicbc.threshold',
      'childBenefit.hicbc.fullChargeAt',
      'childcare.taxFreeChildcare.incomeLimit',
      'childcare.thirtyHours.incomeLimit',
    ]) {
      expect(paths).toContain(path)
    }
  })

  it('lists every leaf of the config exactly once, with a label, and nothing else', () => {
    const paths = TAX_FIELDS.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect([...paths].sort()).toEqual([...leafPaths(FAKE_TODO_YEAR)].sort())
    for (const field of TAX_FIELDS) expect(field.label.length, field.path).toBeGreaterThan(2)
  })
})

describe('fixtures stay out of the app', () => {
  const SRC = join(import.meta.dirname, '..', '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
    })

  it('only tests (and the fixtures themselves) import the fake years', () => {
    const offenders = files(SRC)
      .filter((path) => !/\.test\.tsx?$/.test(path) && !path.includes(`${join('config', 'tax', 'fixtures')}`))
      .filter((path) => /fixtures\/fakeTaxYears|fakeTaxYears'/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
    expect(offenders).toEqual([])
  })

  it('carry a marker that the build check looks for', () => {
    expect(FAKE_MARKER).toBe('sumyard-fake-fixture')
  })
})
