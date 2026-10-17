import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getTaxYear } from '@/config/tax/index'
import { fromPounds, type Money } from '@/lib/money'
import { takeHome } from './calc'
import { crossCheckCases } from './fixtures/crossChecks'
import { DEFAULT_POLICY, TAPER_ROUNDINGS, type TakeHomeResult } from './types'

/*
 * HMRC cross-check harness. docs/hmrc-cross-checks.json lists input cases
 * derived from the verified config; the owner fills each case's expected
 * results from HMRC's own online calculators (with the page and the date).
 * Until then a case's expected values are null and it shows as a todo. No
 * expected value is invented here. A filled case is compared with the engine,
 * field by field, within the file's tolerance.
 */

const FILE = join(import.meta.dirname, '..', '..', '..', 'docs', 'hmrc-cross-checks.json')
const EXPECTED_FIELDS = ['incomeTax', 'nationalInsurance', 'studentLoan', 'takeHome'] as const
type Field = (typeof EXPECTED_FIELDS)[number]

interface FileCase {
  id: string
  description: string
  inputs: { grossPay: string; region: 'rUK' | 'scotland'; studentLoans: ('plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgraduate')[] }
  expected: Record<Field, string | null>
  hmrcSource: string | null
  checkedOn: string | null
}

interface CrossCheckFile {
  taxYear: string
  policy: { taperRounding: string }
  tolerancePence: number
  cases: FileCase[]
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as CrossCheckFile
const config = getTaxYear(file.taxYear)

const pick = (result: TakeHomeResult, field: Field): Money =>
  ({
    incomeTax: result.annual.incomeTax,
    nationalInsurance: result.annual.nationalInsurance,
    studentLoan: result.annual.studentLoan,
    takeHome: result.annual.net,
  })[field]

describe('HMRC cross-check file', () => {
  it('is for a registered tax year, with a known policy and a tolerance in whole pence', () => {
    expect(config).toBeDefined()
    expect(TAPER_ROUNDINGS).toContain(file.policy.taperRounding)
    expect(Number.isSafeInteger(file.tolerancePence) && file.tolerancePence >= 0).toBe(true)
  })

  it('holds exactly the cases derived from the config (regenerate it if the config changed)', () => {
    const derived = crossCheckCases(config!)
    expect(file.cases.map(({ id, description, inputs }) => ({ id, description, inputs }))).toEqual(derived)
  })

  it('every case has all expected fields, each null or a pounds amount, with a source and date once filled', () => {
    for (const c of file.cases) {
      expect(Object.keys(c.expected).sort()).toEqual([...EXPECTED_FIELDS].sort())
      for (const value of Object.values(c.expected)) if (value !== null) expect(() => fromPounds(value)).not.toThrow()
      if (Object.values(c.expected).some((value) => value !== null)) {
        expect(c.hmrcSource).toMatch(/^https:\/\/www\.gov\.uk\//)
        expect(c.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
})

describe('HMRC cross-checks', () => {
  for (const c of file.cases) {
    const filled = EXPECTED_FIELDS.filter((field) => c.expected[field] !== null)
    if (filled.length === 0) {
      it.todo(`${c.id}: ${c.description} (expected results not filled in yet)`)
      continue
    }
    it(`${c.id}: ${c.description} matches HMRC on ${filled.join(', ')}`, () => {
      const result = takeHome(
        { grossPay: fromPounds(c.inputs.grossPay), region: c.inputs.region, studentLoans: c.inputs.studentLoans },
        config!,
        file.policy.taperRounding === DEFAULT_POLICY.taperRounding ? DEFAULT_POLICY : { taperRounding: 'wholePoundsDown' },
      )
      if (!result.ok) throw new Error(`refused: ${result.unverified.join(', ')}`)
      for (const field of filled) {
        const difference = Math.abs(pick(result, field) - fromPounds(c.expected[field]!))
        expect(difference, field).toBeLessThanOrEqual(file.tolerancePence)
      }
    })
  }
})
