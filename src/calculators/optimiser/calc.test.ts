import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_PARTIAL_YEAR, FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { Refusal } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, MoneyError, mulRound, ratio, roundToPounds, subtract, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR, WEEKS_PER_YEAR } from '@/lib/periods'
import { EngineInputError, employeeNI, incomeTax, personalAllowance, studentLoan, takeHome } from './calc'
import { configValues, referenceAllowance, referenceIncomeTax, referenceNI, referenceRepayment } from './fixtures/reference'
import {
  DEFAULT_POLICY,
  type ModellingPolicy,
  REGIONS,
  type Region,
  STUDENT_LOAN_PLANS,
  type StudentLoanPlanId,
  TAPER_ROUNDINGS,
  type TaxInputs,
  UNDERGRADUATE_PLANS,
} from './types'

/*
 * Unit and edge-case tests for the core tax engine (slice 1a, session F).
 * Every expected value is derived from the verified 2026-27 config, through
 * the independent reference in fixtures/reference.ts or a formula written
 * here; no tax figure is written in this file. Offsets such as a penny or a
 * pound are test inputs, not tax figures.
 */

const config = taxYear
const v = configValues(config)
const penny = fromPence(1)
const pound = fromPounds(1)
const exact: ModellingPolicy = { taperRounding: 'exact' }
const wholePounds: ModellingPolicy = { taperRounding: 'wholePoundsDown' }
const POLICIES: readonly ModellingPolicy[] = TAPER_ROUNDINGS.map((taperRounding) => ({ taperRounding }))

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

/** Where the allowance reaches zero: taper start plus the allowance divided by the taper rate (independent of the engine). */
const zeroPoint = add(v.taperStart, mulRound(v.personalAllowance, ratio(v.taperRate.denominator, v.taperRate.numerator), 'up'))

const around = (x: Money) => [subtract(x, penny), x, add(x, penny)]

describe('refusal when tax values are unverified', () => {
  it('each function returns the typed refusal listing what it needs (fake all-todo year)', () => {
    const pa = personalAllowance(fromPounds(1), FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(pa).toEqual({
      ok: false,
      taxYear: FAKE_TODO_YEAR.id,
      unverified: ['incomeTax.personalAllowance', 'incomeTax.taperStart', 'incomeTax.taperRate'],
    })
    const tax = incomeTax(fromPounds(1), 'scotland', FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(tax.ok).toBe(false)
    expect(!tax.ok && tax.unverified).toEqual([
      'incomeTax.personalAllowance',
      'incomeTax.taperStart',
      'incomeTax.taperRate',
      'incomeTax.bands.scotland',
    ])
    expect(employeeNI(fromPounds(1), FAKE_TODO_YEAR)).toEqual({
      ok: false,
      taxYear: FAKE_TODO_YEAR.id,
      unverified: [
        'nationalInsurance.employee.primaryThreshold',
        'nationalInsurance.employee.upperEarningsLimit',
        'nationalInsurance.employee.mainRate',
        'nationalInsurance.employee.additionalRate',
      ],
    })
    const sl = studentLoan(['postgraduate'], fromPounds(1), FAKE_TODO_YEAR)
    expect(!sl.ok && sl.unverified).toEqual(['studentLoans.postgraduate.threshold', 'studentLoans.postgraduate.rate'])
  })

  it('asks only for the region and plans in use', () => {
    const tax = incomeTax(fromPounds(1), 'rUK', FAKE_PARTIAL_YEAR, DEFAULT_POLICY)
    expect(!tax.ok && tax.unverified).toEqual(['incomeTax.bands.rUK'])
    expect(ok(studentLoan([], fromPounds(1), FAKE_TODO_YEAR)).total).toBe(0)
  })

  it('takeHome refuses with every unverified value it needs, once each', () => {
    const result = takeHome({ grossPay: fromPounds(1), region: 'rUK', studentLoans: ['plan2'] }, FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(result.ok).toBe(false)
    const unverified = !result.ok ? result.unverified : []
    expect(new Set(unverified).size).toBe(unverified.length)
    expect(unverified).toEqual(
      expect.arrayContaining([
        'incomeTax.bands.rUK',
        'nationalInsurance.employee.mainRate',
        'studentLoans.plan2.threshold',
        'studentLoans.plan2.rate',
      ]),
    )
    expect(unverified).not.toContain('incomeTax.bands.scotland')
    expect(unverified).not.toContain('studentLoans.plan1.rate')
  })
})

describe('personalAllowance', () => {
  it('is the full allowance up to and at the taper start', () => {
    for (const income of [ZERO, v.personalAllowance, subtract(v.taperStart, penny), v.taperStart]) {
      const result = ok(personalAllowance(income, config, DEFAULT_POLICY))
      expect(result.allowance).toBe(v.personalAllowance)
      expect(result.reduction).toBe(0)
      expect(result.fullAllowance).toBe(v.personalAllowance)
    }
  })

  it('falls by the taper rate on income over the start (exact)', () => {
    const over = fromPounds(1000)
    const result = ok(personalAllowance(add(v.taperStart, over), config, exact))
    expect(result.reduction).toBe(mulRound(over, v.taperRate, 'nearest'))
    expect(result.allowance).toBe(subtract(v.personalAllowance, mulRound(over, v.taperRate, 'nearest')))
  })

  it('reaches zero at the zero point and stays there', () => {
    for (const policy of POLICIES) {
      expect(ok(personalAllowance(zeroPoint, config, policy)).allowance).toBe(0)
      expect(ok(personalAllowance(add(zeroPoint, fromPounds(10_000)), config, policy)).allowance).toBe(0)
      expect(ok(personalAllowance(subtract(zeroPoint, pound), config, policy)).allowance).toBeGreaterThan(0)
    }
  })

  it('matches the reference at a penny either side of the start and the zero point, under each policy', () => {
    for (const policy of POLICIES)
      for (const income of [...around(v.taperStart), ...around(zeroPoint)]) {
        const expected = referenceAllowance(income, config, policy)
        const result = ok(personalAllowance(income, config, policy))
        // Output is rounded to the nearest penny; the reference gives the exact fraction.
        expect(Math.abs(result.allowance * Number(expected[1]) - Number(expected[0]))).toBeLessThanOrEqual(Number(expected[1]) / 2)
      }
  })

  it('the two taper roundings differ by less than a pound of allowance, exact never above whole pounds', () => {
    const offsets = [1, 2, 3, 99, 100, 101, 150, 199, 201, 12_345, 1_000_001, 2_513_999]
    for (const pence of offsets) {
      const income = add(v.taperStart, fromPence(pence))
      const a = referenceAllowance(income, config, exact)
      const b = ok(personalAllowance(income, config, wholePounds)).allowance
      // b − a, as a fraction: (b × den − num) / den.
      const diff = BigInt(b) * a[1] - a[0]
      expect(diff >= 0n).toBe(true)
      expect(diff <= BigInt(pound) * a[1]).toBe(true)
    }
  })

  it('records the policy used', () => {
    expect(ok(personalAllowance(v.taperStart, config, wholePounds)).taperRounding).toBe('wholePoundsDown')
    expect(DEFAULT_POLICY.taperRounding).toBe('exact')
  })
})

/** Gross income at which taxable income reaches a band's start, below the taper (allowance + band start). */
const grossAtBandStart = (from: Money) => add(v.personalAllowance, from)

describe('incomeTax', () => {
  it('is zero up to and at the personal allowance', () => {
    for (const region of REGIONS) {
      expect(ok(incomeTax(ZERO, region, config, DEFAULT_POLICY)).total).toBe(0)
      expect(ok(incomeTax(v.personalAllowance, region, config, DEFAULT_POLICY)).total).toBe(0)
      const above = ok(incomeTax(add(v.personalAllowance, penny), region, config, DEFAULT_POLICY))
      expect(above.taxableIncome).toBe(penny)
      expect(above.bands[0]?.income).toBe(penny)
    }
  })

  it('applies each band only to income above its start: a penny either side of every boundary, both regions', () => {
    for (const region of REGIONS) {
      const bands = v.bands[region]
      bands.forEach((band, i) => {
        if (i === 0) return
        const gross = add(v.personalAllowance, band.from)
        // Boundaries above the taper start are reached with no allowance left (2026-27: past the zero point).
        const at = gross <= v.taperStart ? gross : band.from >= zeroPoint ? band.from : null
        if (at === null) return
        const [below, on, above] = around(at).map((income) => ok(incomeTax(income, region, config, DEFAULT_POLICY)))
        expect(below?.bands[i]?.income).toBe(0)
        expect(on?.bands[i]?.income).toBe(0)
        expect(above?.bands[i]?.income).toBe(penny)
        expect(above?.bands[i]?.tax).toBe(mulRound(penny, band.rate, 'nearest'))
        expect(above?.bands[i - 1]?.income).toBe(subtract(band.from, bands[i - 1]!.from))
      })
    }
  })

  it('matches the independent reference across incomes, regions and policies', () => {
    const incomes = [
      ZERO,
      penny,
      fromPounds(5000),
      v.personalAllowance,
      ...v.bands.scotland.map((b) => grossAtBandStart(b.from)),
      ...v.bands.rUK.map((b) => grossAtBandStart(b.from)),
      ...around(v.taperStart),
      add(v.taperStart, fromPence(1_234_567)),
      add(v.taperStart, fromPence(1_234_501)),
      ...around(zeroPoint),
      add(zeroPoint, fromPounds(10_000)),
      fromPounds(1_000_000),
    ]
    for (const region of REGIONS)
      for (const policy of POLICIES)
        for (const income of incomes) {
          const result = ok(incomeTax(income, region, config, policy))
          const ref = referenceIncomeTax(income, region, config, policy)
          expect(result.bands.map((b) => b.tax)).toEqual(ref.bandTax)
          expect(result.bands.map((b) => b.income)).toEqual(ref.bandIncome)
          expect(result.total).toBe(ref.total)
          expect(result.taxableIncome).toBe(ref.taxable)
          expect(result.personalAllowance.allowance).toBe(ref.allowance)
        }
  })

  it('beyond the zero point: no allowance, all income taxable', () => {
    const income = add(zeroPoint, fromPounds(10_000))
    for (const region of REGIONS) {
      const result = ok(incomeTax(income, region, config, DEFAULT_POLICY))
      expect(result.personalAllowance.allowance).toBe(0)
      expect(result.taxableIncome).toBe(income)
      expect(result.bands.reduce((sum, b) => add(sum, b.income), ZERO)).toBe(income)
    }
  })

  it('lists every band in config order with its start, end and rate', () => {
    for (const region of REGIONS) {
      const result = ok(incomeTax(fromPounds(1_000_000), region, config, DEFAULT_POLICY))
      expect(result.region).toBe(region)
      expect(result.bands.map((b) => b.name)).toEqual(v.bands[region].map((b) => b.name))
      expect(result.bands.map((b) => b.from)).toEqual(v.bands[region].map((b) => b.from))
      expect(result.bands.map((b) => b.to)).toEqual([...v.bands[region].slice(1).map((b) => b.from), null])
      expect(result.bands.map((b) => b.rate)).toEqual(v.bands[region].map((b) => b.rate))
    }
  })

  it('Scotland and rUK give different tax at the same income, each by its own bands', () => {
    for (const income of [fromPounds(30_000), fromPounds(60_000), add(v.taperStart, fromPounds(5000)), fromPounds(200_000)]) {
      const ruk = ok(incomeTax(income, 'rUK', config, DEFAULT_POLICY))
      const scot = ok(incomeTax(income, 'scotland', config, DEFAULT_POLICY))
      expect(scot.total).not.toBe(ruk.total)
      expect(ruk.total).toBe(referenceIncomeTax(income, 'rUK', config, DEFAULT_POLICY).total)
      expect(scot.total).toBe(referenceIncomeTax(income, 'scotland', config, DEFAULT_POLICY).total)
      // The allowance is the same in both: only the bands differ.
      expect(scot.personalAllowance).toEqual(ruk.personalAllowance)
    }
  })
})

describe('employeeNI', () => {
  it('is zero up to and at the primary threshold', () => {
    expect(ok(employeeNI(ZERO, config)).total).toBe(0)
    expect(ok(employeeNI(v.ni.primaryThreshold, config)).total).toBe(0)
  })

  it('a penny either side of each threshold', () => {
    const [, atPT, abovePT] = around(v.ni.primaryThreshold).map((pay) => ok(employeeNI(pay, config)))
    expect(atPT?.main.earnings).toBe(0)
    expect(abovePT?.main.earnings).toBe(penny)
    const [belowUEL, atUEL, aboveUEL] = around(v.ni.upperEarningsLimit).map((pay) => ok(employeeNI(pay, config)))
    const band = subtract(v.ni.upperEarningsLimit, v.ni.primaryThreshold)
    expect(belowUEL?.main.earnings).toBe(subtract(band, penny))
    expect(atUEL?.main.earnings).toBe(band)
    expect(atUEL?.additional.earnings).toBe(0)
    expect(aboveUEL?.main.earnings).toBe(band)
    expect(aboveUEL?.additional.earnings).toBe(penny)
  })

  it('matches the reference: main rate between the thresholds, additional rate above, each to the nearest penny', () => {
    const pays = [
      ...around(v.ni.primaryThreshold),
      ...around(v.ni.upperEarningsLimit),
      fromPence(3_141_593),
      fromPence(9_999_999),
      fromPounds(1_000_000),
    ]
    for (const pay of pays) {
      const result = ok(employeeNI(pay, config))
      const ref = referenceNI(pay, config)
      expect([result.main.contribution, result.additional.contribution, result.total]).toEqual([ref.main, ref.additional, ref.total])
      expect(result.main.rate).toEqual(v.ni.mainRate)
      expect(result.additional.rate).toEqual(v.ni.additionalRate)
      expect(result.niablePay).toBe(pay)
    }
  })
})

describe('studentLoan', () => {
  const hundredOver = (plan: StudentLoanPlanId) => add(v.plans[plan].threshold, fromPounds(100))

  it('nothing for no plans', () => {
    const result = ok(studentLoan([], fromPounds(1_000_000), config))
    expect(result.total).toBe(0)
    expect(result.deductions).toEqual([])
  })

  it.each(STUDENT_LOAN_PLANS)('%s alone: nothing at or below the threshold, the rate above it, rounded down to the pound', (plan) => {
    const { threshold, rate } = v.plans[plan]
    for (const pay of [ZERO, subtract(threshold, penny), threshold, add(threshold, penny)]) {
      expect(ok(studentLoan([plan], pay, config)).total).toBe(referenceRepayment(pay, threshold, rate))
    }
    expect(ok(studentLoan([plan], threshold, config)).total).toBe(0)
    const pay = hundredOver(plan)
    const result = ok(studentLoan([plan], pay, config))
    expect(result.total).toBe(roundToPounds(mulRound(fromPounds(100), rate, 'down'), 'down'))
    expect(result.deductions).toHaveLength(1)
    expect(result.deductions[0]).toMatchObject({ basis: plan, threshold, rate, excess: fromPounds(100) })
    expect(result.total % 100).toBe(0)
  })

  it.each(UNDERGRADUATE_PLANS)('%s with the postgraduate loan: both deductions, each rounded down on its own', (plan) => {
    const pay = add(v.plans[plan].threshold, fromPence(1_234_567))
    const result = ok(studentLoan([plan, 'postgraduate'], pay, config))
    const expectedPlan = referenceRepayment(pay, v.plans[plan].threshold, v.plans[plan].rate)
    const expectedPg = referenceRepayment(pay, v.plans.postgraduate.threshold, v.plans.postgraduate.rate)
    expect(result.deductions.map((d) => [d.kind, d.repayment])).toEqual([
      ['plan', expectedPlan],
      ['postgraduate', expectedPg],
    ])
    expect(result.total).toBe(expectedPlan + expectedPg)
  })

  it('more than one undergraduate plan: one deduction at the lowest threshold of the plans held', () => {
    const pay = fromPounds(60_000)
    const held = [...UNDERGRADUATE_PLANS]
    const lowest = held.reduce((a, b) => (v.plans[b].threshold < v.plans[a].threshold ? b : a))
    const result = ok(studentLoan(held, pay, config))
    expect(result.deductions).toHaveLength(1)
    expect(result.deductions[0]?.basis).toBe(lowest)
    expect(result.deductions[0]?.plans).toEqual(held)
    expect(result.total).toBe(referenceRepayment(pay, v.plans[lowest].threshold, v.plans[lowest].rate))
  })

  it('ignores duplicates and rejects unknown plans', () => {
    const pay = fromPounds(60_000)
    expect(ok(studentLoan(['plan2', 'plan2'], pay, config))).toEqual(ok(studentLoan(['plan2'], pay, config)))
    expect(() => studentLoan(['plan3' as StudentLoanPlanId], pay, config)).toThrow(EngineInputError)
  })
})

describe('takeHome', () => {
  const inputs = (patch: Partial<TaxInputs> = {}): TaxInputs => ({
    grossPay: fromPounds(85_000),
    region: 'rUK',
    studentLoans: ['plan2', 'postgraduate'],
    ...patch,
  })

  it('net is gross less income tax, NI and student loan, on the same pay', () => {
    for (const region of REGIONS) {
      const result = ok(takeHome(inputs({ region }), config, DEFAULT_POLICY))
      const tax = ok(incomeTax(result.inputs.grossPay, region, config, DEFAULT_POLICY)).total
      const ni = ok(employeeNI(result.inputs.grossPay, config)).total
      const sl = ok(studentLoan(['plan2', 'postgraduate'], result.inputs.grossPay, config)).total
      expect(result.annual).toMatchObject({ gross: fromPounds(85_000), incomeTax: tax, nationalInsurance: ni, studentLoan: sl })
      expect(result.annual.net).toBe(subtract(subtract(subtract(fromPounds(85_000), tax), ni), sl))
      expect(result.incomeTax.total).toBe(tax)
      expect(result.nationalInsurance.total).toBe(ni)
      expect(result.studentLoan.total).toBe(sl)
    }
  })

  it('the student loan is worked out on NI-able pay (here, gross pay)', () => {
    const result = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    expect(result.studentLoan.pay).toBe(result.nationalInsurance.niablePay)
  })

  it('monthly and weekly views divide each annual figure, to the nearest penny, and say so', () => {
    const result = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    const keys = ['gross', 'incomeTax', 'nationalInsurance', 'studentLoan', 'net'] as const
    for (const [view, divisor] of [
      [result.monthly, MONTHS_PER_YEAR],
      [result.weekly, WEEKS_PER_YEAR],
    ] as const) {
      for (const key of keys) expect(view[key]).toBe(mulRound(result.annual[key], ratio(1, divisor), 'nearest'))
      expect(view.label).toMatch(/annual/i)
    }
    expect(result.annual.period).toBe('annual')
    expect(result.monthly.period).toBe('monthly')
    expect(result.weekly.period).toBe('weekly')
  })

  it('is an estimate with a plain-language assumptions list that holds no figures', () => {
    const result = ok(takeHome(inputs(), config, DEFAULT_POLICY))
    expect(result.estimate).toBe(true)
    expect(result.assumptions.length).toBeGreaterThanOrEqual(5)
    for (const line of result.assumptions) {
      expect(typeof line).toBe('string')
      expect(line).not.toMatch(/\d/)
    }
    const text = result.assumptions.join(' ')
    expect(text).toMatch(/pay period/i)
    expect(text).toMatch(/employment income only/i)
    expect(text).toMatch(/estimate/i)
    expect(ok(takeHome(inputs({ region: 'scotland' }), config, DEFAULT_POLICY)).assumptions.join(' ')).toMatch(/Scottish/)
    expect(ok(takeHome(inputs(), config, wholePounds)).assumptions.join(' ')).toMatch(/whole pound/i)
  })

  it('zero gross gives zero everywhere', () => {
    const result = ok(takeHome(inputs({ grossPay: ZERO }), config, DEFAULT_POLICY))
    for (const view of [result.annual, result.monthly, result.weekly])
      expect([view.gross, view.incomeTax, view.nationalInsurance, view.studentLoan, view.net]).toEqual([0, 0, 0, 0, 0])
  })

  it('carries the inputs and policy it used', () => {
    const result = ok(takeHome(inputs(), config, wholePounds))
    expect(result.policy).toEqual(wholePounds)
    expect(result.inputs).toEqual(inputs())
    expect(result.taxYear).toBe(config.id)
  })
})

describe('input guards', () => {
  const minus = fromPence(-1)

  it('rejects negative amounts', () => {
    expect(() => personalAllowance(minus, config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => incomeTax(minus, 'rUK', config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => employeeNI(minus, config)).toThrow(EngineInputError)
    expect(() => studentLoan(['plan1'], minus, config)).toThrow(EngineInputError)
    expect(() => takeHome({ grossPay: minus, region: 'rUK', studentLoans: [] }, config, DEFAULT_POLICY)).toThrow(EngineInputError)
  })

  it('rejects an unknown region or policy', () => {
    expect(() => incomeTax(fromPounds(1), 'wales' as Region, config, DEFAULT_POLICY)).toThrow(EngineInputError)
    expect(() => incomeTax(fromPounds(1), 'rUK', config, { taperRounding: 'nearest' } as unknown as ModellingPolicy)).toThrow(
      EngineInputError,
    )
  })

  it('rejects amounts that are not safe whole pence (safe-integer guard)', () => {
    for (const bad of [0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY] as Money[]) {
      expect(() => incomeTax(bad, 'rUK', config, DEFAULT_POLICY)).toThrow(MoneyError)
      expect(() => employeeNI(bad, config)).toThrow(MoneyError)
      expect(() => studentLoan(['plan1'], bad, config)).toThrow(MoneyError)
    }
  })

  it('works at the largest safe amount, and every result stays a safe integer', () => {
    const result = ok(
      takeHome({ grossPay: fromPence(Number.MAX_SAFE_INTEGER), region: 'scotland', studentLoans: [...STUDENT_LOAN_PLANS] }, config, exact),
    )
    for (const view of [result.annual, result.monthly, result.weekly])
      for (const amount of [view.gross, view.incomeTax, view.nationalInsurance, view.studentLoan, view.net])
        expect(Number.isSafeInteger(amount)).toBe(true)
    expect(result.annual.net).toBeGreaterThan(0)
  })
})
