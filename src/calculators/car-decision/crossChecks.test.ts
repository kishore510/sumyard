import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromPounds, subtract, toPence } from '@/lib/money'
import { calculate, carDecisionCalculator, MONEY_FIELDS } from './definition'

/*
 * Car decision cross-check harness (slice 3c-1). docs/car-cross-checks.json
 * seeds six one-option cases (cash, loan, HP, PCP buy, PCP hand back, keep);
 * the owner fills each case's expected figures from an independent source (a
 * spreadsheet, or a real dealer quote for the finance payment), with the
 * source and the date. Until then a case shows as a todo. No expected value
 * is invented here. A filled case is compared with the engine's figures in
 * the expected case, within the file's tolerance.
 */

const FILE = join(import.meta.dirname, '..', '..', '..', 'docs', 'car-cross-checks.json')

interface FileCase {
  id: string
  description: string
  inputs: Record<string, unknown> & { options: Record<string, unknown>[] }
  expected: { netCost: string | null; netCostPerCoverageMonth: string | null; regularPayment: string | null }
  source: string | null
  checkedOn: string | null
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as { tolerancePence: number; cases: FileCase[] }

/** A case's inputs as the page stores them: pounds strings become whole pence. */
const pageInputs = (c: FileCase) => ({
  ...c.inputs,
  options: c.inputs.options.map((o) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, (MONEY_FIELDS as readonly string[]).includes(k) && typeof v === 'string' ? fromPounds(v) : v]),
    ),
  ),
})

const filled = (c: FileCase) => Object.values(c.expected).some((v) => v !== null)

describe('car decision cross-check file', () => {
  it('has a tolerance in whole pence and unique case ids', () => {
    expect(Number.isSafeInteger(file.tolerancePence) && file.tolerancePence >= 0).toBe(true)
    expect(new Set(file.cases.map((c) => c.id)).size).toBe(file.cases.length)
  })

  it('covers cash, a loan, HP, PCP buy, PCP hand back and keep, one option each', () => {
    const kinds = file.cases.map((c) => {
      const o = c.inputs.options[0]!
      return o.acquisition === 'pcp' ? `pcp-${o.pcpEnd}` : o.acquisition
    })
    expect(kinds.sort()).toEqual(['cash', 'hire-purchase', 'keep', 'loan', 'pcp-buy', 'pcp-hand-back'])
    for (const c of file.cases) expect(c.inputs.options).toHaveLength(1)
  })

  it('every case’s inputs are valid, complete page inputs the engine accepts', () => {
    for (const c of file.cases) {
      const checked = carDecisionCalculator.validateInputs(pageInputs(c))
      if (!checked.ok) throw new Error(`${c.id}: ${checked.errors.join(' ')}`)
      const outcome = calculate(checked.inputs)
      expect(outcome.kind === 'ok' && outcome.statuses[0]!.kind, c.id).toBe('ok')
    }
  })

  it('a filled case has pounds amounts, a source and a date', () => {
    for (const c of file.cases) {
      if (!filled(c)) continue
      for (const value of Object.values(c.expected)) if (value !== null) expect(() => fromPounds(value)).not.toThrow()
      expect(c.source, c.id).toMatch(/\S/)
      expect(c.checkedOn, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('car decision cross-checks', () => {
  for (const c of file.cases) {
    if (!filled(c)) {
      it.todo(`${c.id}: ${c.description} (expected results not filled in yet)`)
      continue
    }
    it(`${c.id}: ${c.description}`, () => {
      const checked = carDecisionCalculator.validateInputs(pageInputs(c))
      if (!checked.ok) throw new Error(checked.errors.join(' '))
      const outcome = calculate(checked.inputs)
      if (outcome.kind !== 'ok' || outcome.statuses[0]!.kind !== 'ok') throw new Error('refused')
      const result = outcome.statuses[0]!.result
      const within = (actual: ReturnType<typeof fromPounds>, expected: string, what: string) => {
        const difference = subtract(actual, fromPounds(expected))
        expect(Math.abs(toPence(difference)), `${c.id} ${what} differs by ${toPence(difference)}p`).toBeLessThanOrEqual(file.tolerancePence)
      }
      const expectedCase = result.cases.expected
      if (c.expected.netCost !== null) within(expectedCase.netCost, c.expected.netCost, 'net cost')
      if (c.expected.netCostPerCoverageMonth !== null)
        within(expectedCase.netCostPerCoverageMonth, c.expected.netCostPerCoverageMonth, 'net cost per month of coverage')
      if (c.expected.regularPayment !== null) {
        if (!result.finance) throw new Error(`${c.id}: no finance to check a payment against`)
        within(result.finance.schedule.regularPayment, c.expected.regularPayment, 'regular payment')
      }
    })
  }
})
