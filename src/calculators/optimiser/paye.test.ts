import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, subtract, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { takeHome } from './calc'
import { configValues, referencePaye, referenceTakeHome } from './fixtures/reference'
import { parseTaxCode, paye, payeEstimate } from './paye'
import {
  DEFAULT_POLICY,
  type PayeEstimate,
  type PayeNotModelled,
  type PayeResult,
  PENSION_METHODS,
  type TakeHomeResult,
  type TaxInputs,
  type UnsupportedTaxCode,
} from './types'

/*
 * 0.11.0: tax codes and the PAYE estimate (decisions B11 to B13). A supported
 * code is a number and a suffix letter (L, M, N or T) with an optional S or C
 * prefix (What your tax code means; PAYE11015); its allowance is the number
 * times the config's code unit (Understanding your employees' tax codes). The
 * estimate is level monthly pay on the cumulative basis (PAYE11090,
 * PAYE70025): month n has n twelfths of the pay, the allowance and each
 * band's start; tax to date rounded once to the nearest penny (D3, as Tables
 * B to D could not be read). Codes here are built from the config's own
 * figures or from round numbers that are not tax figures; the published
 * examples are in published.test.ts (TC-1 to TC-3).
 */

const config = taxYear
const v = configValues(config)
const policy = DEFAULT_POLICY

/** The number that gives exactly the personal allowance: what HMRC starts from (What your tax code means). */
const standard = v.personalAllowance / v.codeUnit

const done = <T extends { ok: true }>(result: T | PayeNotModelled | Refusal): T => {
  if (!result.ok) throw new Error(`no estimate: ${JSON.stringify(result)}`)
  return result
}

const run = (code: string, pay: Money): PayeResult => done(paye(code, pay, config))

const home = (inputs: TaxInputs): TakeHomeResult => {
  const r = takeHome(inputs, config, policy)
  if (!r.ok) throw new Error('refused')
  return r
}

/** Mulberry32: a small seeded generator for repeatable samples. */
function generator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = generator(1257)
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!

describe('parseTaxCode (B12)', () => {
  it.each([
    [`${standard}L`, 'rUK', standard, 'L'],
    [`${standard}M`, 'rUK', standard, 'M'],
    [`${standard}N`, 'rUK', standard, 'N'],
    [`${standard}T`, 'rUK', standard, 'T'],
    [`S${standard}L`, 'scotland', standard, 'L'],
    [`C${standard}L`, 'wales', standard, 'L'],
    ['1L', 'rUK', 1, 'L'],
    ['S1T', 'scotland', 1, 'T'],
    [`C${standard * 3}M`, 'wales', standard * 3, 'M'],
  ] as const)('%s is supported', (text, regime, number, suffix) => {
    expect(parseTaxCode(text)).toEqual({ ok: true, code: { text, regime, number, suffix } })
  })

  it('reads lower case and spaces, and gives the canonical form', () => {
    expect(parseTaxCode(` s ${standard} l `)).toEqual({
      ok: true,
      code: { text: `S${standard}L`, regime: 'scotland', number: standard, suffix: 'L' },
    })
  })

  it.each([
    ['K100', 'K'],
    ['SK1', 'K'],
    ['CK99', 'K'],
    ['BR', 'BR'],
    ['SBR', 'BR'],
    ['CBR', 'BR'],
    ['D0', 'D'],
    ['D1', 'D'],
    ['SD0', 'D'],
    ['SD1', 'D'],
    ['SD2', 'D'],
    ['SD3', 'D'],
    ['SD8', 'D'],
    ['CD0', 'D'],
    ['CD1', 'D'],
    ['0T', '0T'],
    ['S0T', '0T'],
    ['C0T', '0T'],
    ['NT', 'NT'],
    [`${standard}L W1`, 'emergency'],
    [`S${standard}L M1`, 'emergency'],
    [`C${standard}L X`, 'emergency'],
    [`${standard}L NONCUM`, 'emergency'],
    [`${standard}LM1`, 'emergency'],
  ] as [string, UnsupportedTaxCode][])('%s is a code that is not modelled (%s)', (text, kind) => {
    const parsed = parseTaxCode(text)
    expect(parsed).toMatchObject({ ok: false, reason: 'unsupported', kind })
  })

  it('an emergency code keeps one space before its marker in the canonical form', () => {
    expect(parseTaxCode(`${standard}l   m1`)).toEqual({ ok: false, reason: 'unsupported', kind: 'emergency', text: `${standard}L M1` })
    expect(parseTaxCode('k100')).toEqual({ ok: false, reason: 'unsupported', kind: 'K', text: 'K100' })
  })

  it.each([
    '',
    'L',
    '0L',
    '012L',
    `${standard}`,
    `${standard}Q`,
    `X${standard}L`,
    `SS${standard}L`,
    `SC${standard}L`,
    'SNT',
    'CNT',
    'D9',
    'SD9',
    'CD2',
    'K',
    'K0',
    'BR1',
    '<b>',
    `${standard}L W2`,
    `${standard}L.`,
    `${'1'.repeat(16)}L`,
  ])('%j is not a tax code', (text) => {
    expect(parseTaxCode(text)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('paye (B13)', () => {
  it('matches the reference on random codes and pay', () => {
    for (let i = 0; i < 200; i++) {
      const prefix = pick(['', 'S', 'C'])
      const number = 1 + Math.floor(random() * standard * 2)
      const code = `${prefix}${number}${pick(['L', 'M', 'N', 'T'])}`
      const pay = fromPence(Math.floor(random() * v.taperStart * 2))
      const r = run(code, pay)
      const ref = referencePaye(code, pay, config)
      expect(r.codeAllowance, code).toBe(ref.allowance)
      expect(r.total, code).toBe(ref.total)
      expect(
        r.months.map((m) => m.taxToDate),
        code,
      ).toEqual(ref.months.map((m) => m.taxToDate))
      expect(
        r.months.map((m) => m.tax),
        code,
      ).toEqual(ref.months.map((m) => m.tax))
      expect(
        r.months.map((m) => m.taxablePayToDate),
        code,
      ).toEqual(ref.months.map((m) => m.taxable))
    }
  })

  it('has one row per month; the months add up to the year; every figure is nothing or more', () => {
    for (const pay of [ZERO, fromPence(1), fromPounds(30_000), fromPounds(150_000)]) {
      const r = run(`${standard}L`, pay)
      expect(r.months).toHaveLength(MONTHS_PER_YEAR)
      expect(r.months.map((m) => m.month)).toEqual(Array.from({ length: MONTHS_PER_YEAR }, (_, i) => i + 1))
      expect(r.months.reduce((sum, m) => sum + m.tax, 0)).toBe(r.total)
      expect(r.months.reduce((sum, m) => sum + m.pay, 0)).toBe(pay)
      expect(r.months.at(-1)!.payToDate).toBe(pay)
      expect(r.months.at(-1)!.freePayToDate).toBe(r.codeAllowance)
      expect(r.months.at(-1)!.taxToDate).toBe(r.total)
      for (const m of r.months) for (const value of [m.tax, m.taxToDate, m.taxablePayToDate, m.pay]) expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  it('the estimate is never below nothing (property)', () => {
    for (let i = 0; i < 300; i++) {
      const code = `${pick(['', 'S', 'C'])}${1 + Math.floor(random() * standard * 3)}${pick(['L', 'T'])}`
      const r = run(code, fromPence(Math.floor(random() * v.taperStart * 3)))
      expect(r.total).toBeGreaterThanOrEqual(0)
      for (const m of r.months) expect(m.tax).toBeGreaterThanOrEqual(0)
    }
  })

  it('level pay: each month within a penny of the others', () => {
    const r = run(`${standard}L`, fromPounds('57123.45'))
    const taxes = r.months.map((m) => m.tax)
    expect(Math.max(...taxes) - Math.min(...taxes)).toBeLessThanOrEqual(1)
  })

  it('pay at or under the code allowance gives nothing; a penny over gives tax', () => {
    const allowance = (standard * v.codeUnit) as Money
    expect(run(`${standard}L`, allowance).total).toBe(ZERO)
    expect(run(`${standard}L`, subtract(allowance, fromPence(1))).total).toBe(ZERO)
    expect(run(`${standard}L`, add(allowance, fromPounds(100))).total).toBeGreaterThan(0)
  })

  it('the code allowance is the number times the config’s code unit, whatever the suffix', () => {
    for (const suffix of ['L', 'M', 'N', 'T'])
      expect(run(`${standard}${suffix}`, fromPounds(40_000)).codeAllowance).toBe(v.personalAllowance)
    expect(run('7L', ZERO).codeAllowance).toBe(7 * v.codeUnit)
  })

  it('S uses the Scottish bands; C and no prefix the England, Wales and Northern Ireland bands', () => {
    const pay = fromPounds(70_000)
    const plain = run(`${standard}L`, pay)
    const wales = run(`C${standard}L`, pay)
    const scotland = run(`S${standard}L`, pay)
    expect([plain.bands, wales.bands, scotland.bands]).toEqual(['rUK', 'rUK', 'scotland'])
    expect(wales.total).toBe(plain.total)
    expect(scotland.total).not.toBe(plain.total)
    // At the standard code, the year's PAYE is the year's tax with no pension or benefit, within a penny a band.
    for (const [r, region] of [
      [plain, 'rUK'],
      [scotland, 'scotland'],
    ] as const) {
      const liability = home({ grossPay: pay, region, studentLoans: [] }).annual.incomeTax
      expect(Math.abs(r.total - liability), region).toBeLessThanOrEqual(v.bands[region].length)
    }
  })

  it('a supported code gives the estimate; others give a typed "not modelled" result, never a throw', () => {
    expect(paye('BR', fromPounds(1), config)).toMatchObject({ ok: false, reason: 'unsupported', kind: 'BR' })
    expect(paye('nonsense', fromPounds(1), config)).toMatchObject({ ok: false, reason: 'invalid', kind: null })
    for (const text of ['K100', 'D0', '0T', 'NT', `${standard}L X`]) {
      const result = paye(text, fromPounds(1), config) as PayeNotModelled
      expect(result.ok).toBe(false)
      expect(result.message.length).toBeGreaterThan(0)
      expect(result.message).not.toMatch(/£|\d\s*%/)
    }
  })

  it('refuses, listing the value, when the code unit or the bands are unverified', () => {
    const result = paye('1L', fromPounds(1), FAKE_TODO_YEAR) as Refusal
    expect(result.ok).toBe(false)
    expect(result.unverified).toEqual(expect.arrayContaining(['paye.codeUnit', 'incomeTax.bands.rUK']))
    expect((paye('S1L', fromPounds(1), FAKE_TODO_YEAR) as Refusal).unverified).toContain('incomeTax.bands.scotland')
  })

  it('rejects negative or fractional pay', () => {
    expect(() => paye('1L', fromPence(-1), config)).toThrow()
    expect(() => paye('1L', fromPence(0.5), config)).toThrow()
  })

  it('assumptions say level monthly pay, the cumulative basis and the code limits, with no figures', () => {
    const text = run(`${standard}L`, fromPounds(1)).assumptions.join('\n')
    expect(text).toMatch(/level/i)
    expect(text).toMatch(/cumulative/i)
    expect(text).toMatch(/not modelled/i)
    expect(text).not.toMatch(/£|\d/)
  })
})

describe('payeEstimate (B11, B13)', () => {
  it('uses payroll pay: salary given up and net pay contributions out, relief at source and benefits in kind not', () => {
    const grossPay = fromPounds(80_000)
    for (const method of PENSION_METHODS) {
      const inputs: TaxInputs = {
        grossPay,
        region: 'rUK',
        studentLoans: [],
        pension: { method, contribution: fromPounds(4_000) },
        taxableBenefits: fromPounds(1_000),
        benefits: [{ value: fromPounds(500), taken: fromPounds(700), payment: 'beforeTax' }],
      }
      const result = home(inputs)
      const estimate = done(payeEstimate(`${standard}L`, result, config)) as PayeEstimate
      const ref = referenceTakeHome(inputs, config, policy)
      expect(result.payrollPay, method).toBe(ref.payrollPay)
      expect(estimate.paye.pay, method).toBe(ref.payrollPay)
      expect(estimate.paye.total, method).toBe(referencePaye(`${standard}L`, result.payrollPay, config).total)
    }
  })

  it('PAYE taxes the same pay as the year’s income tax: benefits in kind included, as payrolled (B17)', () => {
    const grossPay = fromPounds(100_000)
    const sacrificed = fromPounds(4_000)
    const sacrificedForBenefit = fromPounds(1_500)
    const employerPaid = fromPounds(1_200)
    const inputs: TaxInputs = {
      grossPay,
      region: 'rUK',
      studentLoans: [],
      pension: { method: 'salarySacrifice', contribution: sacrificed },
      benefits: [
        { value: sacrificedForBenefit, taken: sacrificedForBenefit, payment: 'beforeTax' },
        { value: employerPaid, taken: ZERO, payment: 'beforeTax' },
      ],
    }
    const result = home(inputs)
    const code = `${standard - 100}T`
    const estimate = done(payeEstimate(code, result, config)) as PayeEstimate
    // Gross, less sacrificed pension and sacrificed benefit cash, plus the full taxable value of the benefits.
    const expected = add(subtract(subtract(grossPay, sacrificed), sacrificedForBenefit), add(sacrificedForBenefit, employerPaid))
    expect(result.incomeTax.taxablePay).toBe(expected)
    expect(result.payrollPay).toBe(expected)
    expect(estimate.paye.pay).toBe(result.incomeTax.taxablePay)
    expect(estimate.paye.total).toBe(referencePaye(code, result.incomeTax.taxablePay, config).total)
  })

  it('PAYE’s pay is the year’s taxable pay for every pension method and benefit mix', () => {
    for (let i = 0; i < 100; i++) {
      const grossPay = fromPence(Math.floor(random() * v.taperStart * 2) + 1)
      const benefits = [
        { value: fromPence(Math.floor(random() * 300_000)), taken: fromPence(Math.floor(random() * 100_000)), payment: 'beforeTax' as const },
        { value: fromPence(Math.floor(random() * 300_000)), taken: fromPence(Math.floor(random() * 100_000)), payment: 'afterTax' as const },
      ]
      const inputs: TaxInputs = {
        grossPay: add(grossPay, fromPounds(1_000)),
        region: pick(['rUK', 'scotland'] as const),
        studentLoans: [],
        pension: { method: pick(PENSION_METHODS), contribution: fromPence(Math.floor((grossPay as number) * random() * 0.2)) },
        taxableBenefits: fromPence(Math.floor(random() * 200_000)),
        benefits,
      }
      const result = home(inputs)
      const estimate = done(payeEstimate(`${standard}L`, result, config)) as PayeEstimate
      expect(estimate.paye.pay, JSON.stringify(inputs)).toBe(result.incomeTax.taxablePay)
    }
  })

  it('the difference is the estimate less the liability’s income tax', () => {
    for (let i = 0; i < 100; i++) {
      const inputs: TaxInputs = {
        grossPay: fromPence(Math.floor(random() * v.taperStart * 2)),
        region: pick(['rUK', 'scotland'] as const),
        studentLoans: [],
        taxableBenefits: fromPence(Math.floor(random() * v.personalAllowance)),
      }
      const result = home(inputs)
      const code = `${inputs.region === 'scotland' ? 'S' : ''}${1 + Math.floor(random() * standard)}L`
      const estimate = done(payeEstimate(code, result, config)) as PayeEstimate
      expect(estimate.liability).toBe(result.annual.incomeTax)
      expect(estimate.difference).toBe(estimate.paye.total - result.annual.incomeTax)
    }
  })

  it('a benefit in kind with the code it would bring keeps PAYE close to the liability', () => {
    // HMRC takes a benefit off the allowance in the code (What your tax code means): number less benefit ÷ code unit.
    const benefit = (v.codeUnit * 150) as Money
    const result = home({ grossPay: fromPounds(40_000), region: 'rUK', studentLoans: [], taxableBenefits: benefit })
    const estimate = done(payeEstimate(`${standard - 150}L`, result, config)) as PayeEstimate
    expect(Math.abs(estimate.difference)).toBeLessThanOrEqual(v.bands.rUK.length)
    const ignored = done(payeEstimate(`${standard}L`, result, config)) as PayeEstimate
    expect(ignored.difference).toBeLessThan(0)
  })

  it('passes a code that is not modelled through, without an estimate', () => {
    const result = home({ grossPay: fromPounds(40_000), region: 'rUK', studentLoans: [] })
    expect(payeEstimate('BR', result, config)).toMatchObject({ ok: false, reason: 'unsupported', kind: 'BR' })
  })
})
