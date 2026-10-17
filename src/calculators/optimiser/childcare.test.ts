import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, subtract, ZERO } from '@/lib/money'
import { childcareCheck, EngineInputError } from './calc'
import { configValues, lessFrac, referenceChildcareEligible, referencePension } from './fixtures/reference'
import { CHILDCARE_SCHEMES, PENSION_METHODS, type PensionInput } from './types'

/*
 * Session G2: the childcare income-limit cliff (decision G12). Limits come from
 * the verified 2026-27 config; no figure is written in this file.
 */

const config = taxYear
const limits = configValues(config).childcare
const penny = fromPence(1)

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

const scheme = (grossPay: Money, pension?: PensionInput, id: (typeof CHILDCARE_SCHEMES)[number] = 'taxFreeChildcare') =>
  ok(childcareCheck(grossPay, pension, config)).schemes.find((s) => s.scheme === id)!

describe('childcareCheck', () => {
  it('refuses on an unverified year, listing both limits', () => {
    const r = childcareCheck(fromPounds(1), undefined, FAKE_TODO_YEAR) as Refusal
    expect(r.ok).toBe(false)
    expect(r.unverified).toEqual(['childcare.taxFreeChildcare.incomeLimit', 'childcare.thirtyHours.incomeLimit'])
  })

  it('reports each scheme in the config, with the limit from the config', () => {
    const r = ok(childcareCheck(fromPounds(50_000), undefined, config))
    expect(r.schemes.map((s) => s.scheme)).toEqual([...CHILDCARE_SCHEMES])
    expect(r.schemes.map((s) => s.incomeLimit)).toEqual([limits.taxFreeChildcare, limits.thirtyHours])
    expect(r.cliff).toBe(true)
    for (const text of r.assumptions) expect(text).not.toMatch(/\d/)
  })

  it.each(CHILDCARE_SCHEMES)('%s: eligible at the limit, not a penny over it (a cliff, no taper)', (id) => {
    const limit = id === 'taxFreeChildcare' ? limits.taxFreeChildcare : limits.thirtyHours
    expect(scheme(limit, undefined, id)).toMatchObject({ eligibleOnIncome: true, headroom: ZERO, over: ZERO })
    expect(scheme(subtract(limit, penny), undefined, id)).toMatchObject({ eligibleOnIncome: true, headroom: penny, over: ZERO })
    expect(scheme(add(limit, penny), undefined, id)).toMatchObject({ eligibleOnIncome: false, headroom: ZERO, over: penny })
  })

  it('warns once per scheme over the limit', () => {
    expect(ok(childcareCheck(add(limits.taxFreeChildcare, penny), undefined, config)).warnings.map((w) => w.code)).toContain(
      'childcareOverLimit',
    )
    expect(ok(childcareCheck(limits.taxFreeChildcare, undefined, config)).warnings).toEqual([])
  })

  it.each(PENSION_METHODS)('%s: tested on adjusted net income, so a contribution can bring the income back under', (method) => {
    const pay = add(limits.taxFreeChildcare, fromPounds(1_000))
    expect(scheme(pay).eligibleOnIncome).toBe(false)
    const pension = { method, contribution: fromPounds(1_000) }
    const eligible = referenceChildcareEligible(referencePension(pay, pension, config).ani, limits.taxFreeChildcare)
    expect(eligible).toBe(true)
    expect(scheme(pay, pension).eligibleOnIncome).toBe(true)
  })

  it('uses the exact adjusted net income: a quarter penny over the limit is over, though it shows as the limit', () => {
    const pension: PensionInput = { method: 'reliefAtSource', contribution: fromPence(3) }
    const pay = add(limits.taxFreeChildcare, fromPence(4))
    const ani = referencePension(pay, pension, config).ani
    expect(lessFrac([BigInt(limits.taxFreeChildcare), 1n], ani)).toBe(true)
    const r = ok(childcareCheck(pay, pension, config))
    expect(r.adjustedNetIncome).toBe(limits.taxFreeChildcare)
    expect(r.schemes[0]).toMatchObject({ eligibleOnIncome: false, over: penny, headroom: ZERO })
  })

  it('rejects negative pay', () => {
    expect(() => childcareCheck(fromPence(-1), undefined, config)).toThrow(EngineInputError)
  })
})
