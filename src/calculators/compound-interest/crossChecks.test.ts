import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromPounds, subtract, toPence } from '@/lib/money'
import { project } from './calc'
import { compoundCalculator, toEngineInputs } from './definition'

/*
 * Compound interest cross-check harness (slice 2b). docs/compound-cross-checks.json
 * seeds input cases (weekly, monthly and annual; start and end; with and
 * without a fee); the owner fills each case's final balance from an
 * independent source (a spreadsheet FV formula or a reputable calculator),
 * with the source and the date. Until then a case shows as a todo. No
 * expected value is invented here. A filled case is compared with the
 * engine's nominal closing balance with the fee, within the file's tolerance.
 */

const FILE = join(import.meta.dirname, '..', '..', '..', 'docs', 'compound-cross-checks.json')

interface FileCase {
  id: string
  description: string
  inputs: Record<string, unknown> & { lumpSum: string; contribution: string }
  expected: { finalBalance: string | null }
  source: string | null
  checkedOn: string | null
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as { tolerancePence: number; cases: FileCase[] }

/** A case's inputs as the page stores them: pounds strings become whole pence. */
const pageInputs = (c: FileCase) => ({
  ...c.inputs,
  lumpSum: fromPounds(c.inputs.lumpSum),
  contribution: fromPounds(c.inputs.contribution),
})

describe('compound interest cross-check file', () => {
  it('has a tolerance in whole pence and unique case ids', () => {
    expect(Number.isSafeInteger(file.tolerancePence) && file.tolerancePence >= 0).toBe(true)
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(file.cases.length)
  })

  it('covers weekly, monthly and annual contributions, start and end, with and without a fee', () => {
    const inputs = file.cases.map((c) => c.inputs)
    expect(new Set(inputs.map((i) => i.contributionFrequency))).toEqual(new Set(['weekly', 'monthly', 'annual']))
    expect(new Set(inputs.map((i) => i.timing))).toEqual(new Set(['start', 'end']))
    expect(new Set(inputs.map((i) => i.feeRate === '0'))).toEqual(new Set([true, false]))
  })

  it('every case’s inputs are valid page inputs', () => {
    for (const c of file.cases) expect(compoundCalculator.validateInputs(pageInputs(c)).ok, c.id).toBe(true)
  })

  it('a filled case has a pounds amount, a source and a date', () => {
    for (const c of file.cases) {
      if (c.expected.finalBalance === null) continue
      expect(() => fromPounds(c.expected.finalBalance!)).not.toThrow()
      expect(c.source, c.id).toMatch(/\S/)
      expect(c.checkedOn, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('compound interest cross-checks', () => {
  for (const c of file.cases) {
    if (c.expected.finalBalance === null) {
      it.todo(`${c.id}: ${c.description} (expected result not filled in yet)`)
      continue
    }
    it(`${c.id}: ${c.description}`, () => {
      const checked = compoundCalculator.validateInputs(pageInputs(c))
      if (!checked.ok) throw new Error(checked.errors.join(' '))
      const outcome = project(toEngineInputs(checked.inputs))
      if (!outcome.ok) throw new Error('refused')
      const difference = subtract(outcome.result.withFee.nominal.closing, fromPounds(c.expected.finalBalance!))
      expect(Math.abs(toPence(difference)), `${c.id} differs by ${toPence(difference)}p`).toBeLessThanOrEqual(file.tolerancePence)
    })
  }
})
