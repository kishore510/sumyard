import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves, type Refusal, type Sourced } from '@/config/tax/sourced'
import { add, fromPence, fromPounds, type Money, MoneyError, mulRound, ratio, subtract, ZERO } from '@/lib/money'
import { annualAllowanceCharge, annualAllowanceCheck, EngineInputError } from './calc'
import {
  configValues,
  fracOf,
  referenceAdjustedIncome,
  referenceAllowanceCharge,
  referenceAnnualAllowance,
  referenceTaxable,
  referenceThresholdIncome,
} from './fixtures/reference'
import {
  DEFAULT_POLICY,
  PENSION_METHODS,
  type PensionInput,
  type PensionMethod,
  type PensionSavingsInput,
  REGIONS,
  type Region,
  type TaxInputs,
  type UnusedAllowance,
} from './types'

/*
 * Session G2: the annual allowance (decisions G7 to G11). Expected values come
 * from the verified 2026-27 config through fixtures/reference.ts, which is
 * written independently of the engine, or from formulas written here; no tax
 * figure is written in this file.
 */

const config = taxYear
const v = configValues(config)
const aa = v.annualAllowance
const penny = fromPence(1)
const pound = fromPounds(1)
const NO_SAVINGS: PensionSavingsInput = { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false }

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

const inputs = (grossPay: Money, pension?: PensionInput, region: Region = 'rUK'): TaxInputs => ({
  grossPay,
  region,
  studentLoans: [],
  ...(pension ? { pension } : {}),
})
const savings = (over: Partial<PensionSavingsInput> = {}): PensionSavingsInput => ({ ...NO_SAVINGS, ...over })
const check = (i: TaxInputs, s: PensionSavingsInput = NO_SAVINGS, c: TaxYearConfig = config) =>
  ok(annualAllowanceCheck(i, s, c, DEFAULT_POLICY))
const times = (amount: Money, n: number) => mulRound(amount, ratio(n, 1), 'nearest')

/** The adjusted income at which the taper reaches the minimum: the limit plus the allowance above the minimum divided by the reduction rate. */
const taperFloorAt = add(
  aa.adjustedIncomeLimit,
  mulRound(subtract(aa.standard, aa.minimum), ratio(aa.reductionRate.denominator, aa.reductionRate.numerator), 'up'),
)

/** Pay with threshold income over its limit; employer contributions then set adjusted income. */
const overThreshold = add(aa.thresholdIncomeLimit, pound)
const withAdjusted = (adjusted: Money) => savings({ employerContribution: subtract(adjusted, overThreshold) })

describe('annualAllowanceCheck: refusals and inputs', () => {
  it('refuses on an unverified year, listing the pension values it needs', () => {
    const result = annualAllowanceCheck(inputs(fromPounds(1)), NO_SAVINGS, FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(result.ok).toBe(false)
    const refusal = result as Refusal
    expect(refusal.unverified).toEqual(
      expect.arrayContaining([
        'pension.annualAllowance',
        'pension.taper.thresholdIncome',
        'pension.taper.adjustedIncome',
        'pension.taper.minimumAllowance',
        'pension.taper.reductionRate',
        'pension.carryForward.yearsBack',
      ]),
    )
    expect(refusal.unverified).not.toContain('pension.moneyPurchaseAnnualAllowance')
    const mpaa = annualAllowanceCheck(
      inputs(fromPounds(1)),
      savings({ moneyPurchaseAnnualAllowance: true }),
      FAKE_TODO_YEAR,
      DEFAULT_POLICY,
    ) as Refusal
    expect(mpaa.unverified).toContain('pension.moneyPurchaseAnnualAllowance')
  })

  it('rejects negative, unsafe and malformed savings inputs', () => {
    const i = inputs(fromPounds(1))
    expect(() => check(i, savings({ employerContribution: fromPence(-1) }))).toThrow(EngineInputError)
    expect(() => check(i, savings({ employerContribution: 0.5 as Money }))).toThrow(MoneyError)
    const bad: UnusedAllowance[][] = [
      [{ yearsAgo: 0, amount: pound }],
      [{ yearsAgo: 1.5, amount: pound }],
      [{ yearsAgo: 1, amount: fromPence(-1) }],
      [
        { yearsAgo: 1, amount: pound },
        { yearsAgo: 1, amount: pound },
      ],
    ]
    for (const carryForward of bad) expect(() => check(i, savings({ carryForward }))).toThrow(EngineInputError)
    expect(() => check(i, { ...NO_SAVINGS, moneyPurchaseAnnualAllowance: 'yes' as unknown as boolean })).toThrow(EngineInputError)
  })

  it('refuses a contribution above gross pay, as take-home does', () => {
    for (const method of PENSION_METHODS)
      expect(() => check(inputs(fromPounds(1), { method, contribution: fromPounds(2) }))).toThrow(EngineInputError)
  })

  it('zero in: the standard allowance, nothing counted, all of it headroom', () => {
    const r = check(inputs(ZERO))
    expect(r).toMatchObject({
      tapered: false,
      standardAllowance: aa.standard,
      taperReduction: ZERO,
      allowance: aa.standard,
      allowanceAvailable: aa.standard,
      route: 'standard',
      moneyPurchaseAnnualAllowance: null,
      counted: { employee: ZERO, employer: ZERO, total: ZERO },
      headroom: aa.standard,
      excess: ZERO,
      thresholdIncome: ZERO,
      adjustedIncome: ZERO,
    })
    expect(r.charge.total).toBe(ZERO)
    expect(r.warnings).toEqual([])
    expect(r.assumptions.length).toBeGreaterThan(0)
    for (const text of r.assumptions) expect(text).not.toMatch(/\d/)
  })
})

describe('annualAllowanceCheck: threshold income and adjusted income (G7)', () => {
  const pay = fromPounds(150_000)
  const c = fromPounds(12_345)
  const employer = fromPounds(6_000)

  it.each(PENSION_METHODS)('%s: both measures match the PTM057100 steps (reference)', (method) => {
    const pension = { method, contribution: c }
    const r = check(inputs(pay, pension), savings({ employerContribution: employer }))
    const ti = referenceThresholdIncome(pay, pension, config)
    expect(r.thresholdIncome).toBe(Number((ti[0] * 2n + ti[1]) / (ti[1] * 2n)))
    expect(r.adjustedIncome).toBe(referenceAdjustedIncome(pay, pension, employer, config))
  })

  it.each(PENSION_METHODS)('%s: no employee contribution lowers adjusted income: it is gross pay plus employer contributions', (method) => {
    const r = check(inputs(pay, { method, contribution: c }), savings({ employerContribution: employer }))
    expect(r.adjustedIncome).toBe(add(pay, employer))
  })

  it('threshold income: salary sacrifice is added back; net pay and relief at source lower it', () => {
    expect(check(inputs(pay, { method: 'salarySacrifice', contribution: c })).thresholdIncome).toBe(pay)
    expect(check(inputs(pay, { method: 'netPay', contribution: c })).thresholdIncome).toBe(subtract(pay, c))
    const ras = check(inputs(pay, { method: 'reliefAtSource', contribution: c }))
    expect(ras.thresholdIncome).toBe(subtract(pay, ras.counted.employee))
  })

  it('employer contributions do not enter threshold income', () => {
    expect(check(inputs(pay), savings({ employerContribution: employer })).thresholdIncome).toBe(pay)
  })
})

describe('annualAllowanceCheck: what counts (G8)', () => {
  const pay = fromPounds(80_000)
  const c = fromPounds(4_321)

  it('salary sacrifice counts as an employer contribution; net pay as the employee’s; relief at source grossed up', () => {
    expect(check(inputs(pay, { method: 'salarySacrifice', contribution: c })).counted).toEqual({ employee: ZERO, employer: c, total: c })
    expect(check(inputs(pay, { method: 'netPay', contribution: c })).counted).toEqual({ employee: c, employer: ZERO, total: c })
    const ras = check(inputs(pay, { method: 'reliefAtSource', contribution: c }))
    const ref = referenceAnnualAllowance(inputs(pay, { method: 'reliefAtSource', contribution: c }), NO_SAVINGS, config)
    expect(ras.counted.employee).toBe(ref.employee)
    expect(ras.counted.employee).toBeGreaterThan(c)
  })

  it('other employer contributions add to the total', () => {
    const r = check(inputs(pay, { method: 'netPay', contribution: c }), savings({ employerContribution: pound }))
    expect(r.counted).toEqual({ employee: c, employer: pound, total: add(c, pound) })
  })
})

describe('annualAllowanceCheck: the taper (PTM057100)', () => {
  it('needs both measures over their limits', () => {
    const highAdjusted = add(taperFloorAt, fromPounds(1_000))
    // Threshold income at its limit: not tapered, however high adjusted income is.
    const atLimit = check(
      inputs(aa.thresholdIncomeLimit),
      savings({ employerContribution: subtract(highAdjusted, aa.thresholdIncomeLimit) }),
    )
    expect(atLimit.tapered).toBe(false)
    expect(atLimit.allowance).toBe(aa.standard)
    // A penny more threshold income: tapered.
    const over = check(
      inputs(add(aa.thresholdIncomeLimit, penny)),
      savings({ employerContribution: subtract(highAdjusted, add(aa.thresholdIncomeLimit, penny)) }),
    )
    expect(over.tapered).toBe(true)
    expect(over.allowance).toBe(aa.minimum)
    // Adjusted income at its limit: not tapered.
    expect(check(inputs(overThreshold), withAdjusted(aa.adjustedIncomeLimit)).tapered).toBe(false)
  })

  it('a penny over the adjusted income limit tapers, but the reduction rounds down to a whole pound', () => {
    const r = check(inputs(overThreshold), withAdjusted(add(aa.adjustedIncomeLimit, penny)))
    expect(r.tapered).toBe(true)
    expect(r.taperReduction).toBe(ZERO)
    expect(r.allowance).toBe(aa.standard)
    expect(r.warnings.map((w) => w.code)).toContain('tapered')
  })

  it('the reduction is the rate on the excess, rounded down to a pound (a pound less than a whole step loses nothing more)', () => {
    const step = mulRound(pound, ratio(aa.reductionRate.denominator, aa.reductionRate.numerator), 'nearest')
    const one = check(inputs(overThreshold), withAdjusted(add(aa.adjustedIncomeLimit, step)))
    expect(one.taperReduction).toBe(pound)
    const justUnder = check(inputs(overThreshold), withAdjusted(add(aa.adjustedIncomeLimit, subtract(times(step, 2), penny))))
    expect(justUnder.taperReduction).toBe(pound)
  })

  it('reaches the minimum at the floor point and stays there beyond it', () => {
    expect(check(inputs(overThreshold), withAdjusted(taperFloorAt)).allowance).toBe(aa.minimum)
    expect(check(inputs(overThreshold), withAdjusted(subtract(taperFloorAt, fromPounds(2)))).allowance).toBe(add(aa.minimum, pound))
    const beyond = check(inputs(overThreshold), withAdjusted(times(taperFloorAt, 2)))
    expect(beyond.allowance).toBe(aa.minimum)
    expect(beyond.taperReduction).toBe(subtract(aa.standard, aa.minimum))
  })

  it('agrees with the reference across the taper zone', () => {
    for (let k = 0; k <= 40; k++) {
      const adjusted = add(aa.adjustedIncomeLimit, mulRound(subtract(taperFloorAt, aa.adjustedIncomeLimit), ratio(k, 30), 'nearest'))
      const s = withAdjusted(adjusted)
      expect(check(inputs(overThreshold), s).allowance).toBe(referenceAnnualAllowance(inputs(overThreshold), s, config).allowance)
    }
  })
})

describe('annualAllowanceCheck: carry forward (PTM055100)', () => {
  const pay = fromPounds(90_000)
  const years = (amounts: Money[]): UnusedAllowance[] => amounts.map((amount, i) => ({ yearsAgo: i + 1, amount }))
  const unused = fromPounds(5_000)

  it('the current year’s allowance is used first: nothing carried forward is used below it', () => {
    const r = check(inputs(pay), savings({ employerContribution: aa.standard, carryForward: years([unused, unused, unused]) }))
    expect(r.carryForwardUsed).toBe(ZERO)
    expect(r.allowanceAvailable).toBe(add(aa.standard, times(unused, aa.yearsBack)))
    expect(r.headroom).toBe(times(unused, aa.yearsBack))
    expect(r.warnings.map((w) => w.code)).not.toContain('carryForwardUsed')
  })

  it('then the earliest year first: partly used', () => {
    const r = check(
      inputs(pay),
      savings({ employerContribution: add(aa.standard, fromPounds(7_000)), carryForward: years([unused, unused, unused]) }),
    )
    expect(r.carryForward.map((y) => y.yearsAgo)).toEqual([3, 2, 1])
    expect(r.carryForward.map((y) => y.used)).toEqual([unused, fromPounds(2_000), ZERO])
    expect(r.carryForward.map((y) => y.left)).toEqual([ZERO, fromPounds(3_000), unused])
    expect(r.carryForwardUsed).toBe(fromPounds(7_000))
    expect(r.excess).toBe(ZERO)
    expect(r.warnings.map((w) => w.code)).toContain('carryForwardUsed')
  })

  it('fully used, then the rest is excess', () => {
    const over = fromPounds(1_234)
    const total = add(add(aa.standard, times(unused, aa.yearsBack)), over)
    const r = check(inputs(pay), savings({ employerContribution: total, carryForward: years([unused, unused, unused]) }))
    expect(r.carryForward.every((y) => y.left === ZERO)).toBe(true)
    expect(r.excess).toBe(over)
    expect(r.headroom).toBe(ZERO)
    expect(r.warnings.map((w) => w.code)).toContain('overAllowance')
  })

  it('a year beyond the look-back is ignored, with a warning', () => {
    const r = check(inputs(pay), savings({ carryForward: [{ yearsAgo: aa.yearsBack + 1, amount: unused }] }))
    expect(r.carryForward).toEqual([])
    expect(r.allowanceAvailable).toBe(aa.standard)
    expect(r.warnings.map((w) => w.code)).toContain('carryForwardOutOfTime')
  })

  it('is added to a tapered allowance', () => {
    const s = { ...withAdjusted(taperFloorAt), carryForward: years([unused]) }
    const r = check(inputs(overThreshold), s)
    expect(r.allowance).toBe(aa.minimum)
    expect(r.allowanceAvailable).toBe(add(aa.minimum, unused))
  })
})

describe('annualAllowanceCheck: the money purchase annual allowance (G10)', () => {
  const pay = fromPounds(60_000)
  const unused = fromPounds(20_000)
  const mp = (employerContribution: Money, carryForward: UnusedAllowance[] = []) =>
    savings({ moneyPurchaseAnnualAllowance: true, employerContribution, carryForward })

  it('binds below the annual allowance: savings over it are excess', () => {
    const over = fromPounds(500)
    const r = check(inputs(pay), mp(add(aa.moneyPurchase, over)))
    expect(r.route).toBe('moneyPurchase')
    expect(r.moneyPurchaseAnnualAllowance).toBe(aa.moneyPurchase)
    expect(r.allowanceAvailable).toBe(aa.moneyPurchase)
    expect(r.excess).toBe(over)
    expect(r.warnings.map((w) => w.code)).toContain('overMoneyPurchaseAllowance')
  })

  it('carry forward cannot be added to it, and is left untouched', () => {
    const r = check(inputs(pay), mp(add(aa.moneyPurchase, pound), [{ yearsAgo: 1, amount: unused }]))
    expect(r.excess).toBe(pound)
    expect(r.carryForwardUsed).toBe(ZERO)
    expect(r.carryForward[0]?.left).toBe(unused)
  })

  it('under it: no excess, headroom to it', () => {
    const r = check(inputs(pay, { method: 'netPay', contribution: pound }), mp(ZERO))
    expect(r.headroom).toBe(subtract(aa.moneyPurchase, pound))
    expect(r.excess).toBe(ZERO)
  })
})

describe('annualAllowanceCheck: invariants', () => {
  it('headroom plus counted equals the available allowance when under it; counted less excess equals it when over', () => {
    let seed = 7
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const methods: PensionMethod[] = [...PENSION_METHODS]
    for (let n = 0; n < 300; n++) {
      const pay = fromPence(Math.floor(next() * 40_000_000))
      const method = methods[Math.floor(next() * methods.length)]!
      const contribution = fromPence(Math.floor(next() * (pay * (method === 'reliefAtSource' ? 0.8 : 1))))
      const s = savings({
        employerContribution: fromPence(Math.floor(next() * 8_000_000)),
        carryForward: next() < 0.5 ? [{ yearsAgo: 1 + Math.floor(next() * 4), amount: fromPence(Math.floor(next() * 4_000_000)) }] : [],
        moneyPurchaseAnnualAllowance: next() < 0.2,
      })
      const i = inputs(pay, { method, contribution }, next() < 0.5 ? 'rUK' : 'scotland')
      const r = check(i, s)
      const ref = referenceAnnualAllowance(i, s, config)
      expect(r.counted.total).toBe(ref.counted)
      expect(r.allowanceAvailable).toBe(ref.available)
      expect(r.route).toBe(ref.route)
      expect(r.carryForward.map((y) => y.used)).toEqual(ref.carryForward.map((y) => y.used))
      if (r.excess === ZERO) expect(add(r.headroom, r.counted.total)).toBe(r.allowanceAvailable)
      else {
        expect(r.headroom).toBe(ZERO)
        expect(subtract(r.counted.total, r.excess)).toBe(r.allowanceAvailable)
      }
      expect(r.charge.total).toBeGreaterThanOrEqual(0)
      expect(r.excess > 0).toBe(r.warnings.some((w) => w.code === 'overAllowance' || w.code === 'overMoneyPurchaseAllowance'))
    }
  })
})

describe('annualAllowanceCharge (PTM056110, PTM056120)', () => {
  it('refuses on an unverified year', () => {
    const r = annualAllowanceCharge(pound, ZERO, 'rUK', FAKE_TODO_YEAR) as Refusal
    expect(r.ok).toBe(false)
    expect(r.unverified).toEqual(['incomeTax.bands.rUK', 'pension.reliefAtSourceRate'])
  })

  it('no excess, no charge', () => {
    const r = ok(annualAllowanceCharge(ZERO, fromPounds(50_000), 'rUK', config))
    expect(r.total).toBe(ZERO)
    expect(r.bands.every((b) => b.excess === ZERO && b.charge === ZERO)).toBe(true)
  })

  it.each(REGIONS)('%s: matches the reference wherever the excess falls, including across band starts', (region) => {
    const bands = v.bands[region]
    const points = bands.flatMap((b) => [b.from, add(b.from, penny), subtract(b.from, penny)]).filter((x) => x >= 0)
    for (const reducedNetIncome of points)
      for (const excess of [penny, fromPounds(1_000), fromPounds(80_000)]) {
        const r = ok(annualAllowanceCharge(excess, reducedNetIncome, region, config))
        const ref = referenceAllowanceCharge(excess, fracOf(reducedNetIncome), fracOf(ZERO), region, config)
        expect(r.bands.map((b) => b.charge)).toEqual(ref.slices)
        expect(r.total).toBe(ref.total)
        expect(r.bands.reduce((sum, b) => add(sum, b.excess), ZERO)).toBe(excess)
      }
  })

  it('Scotland: nothing is charged below the Scottish basic rate (the starter rate does not apply)', () => {
    const bands = v.bands.scotland
    const basic = bands.findIndex(
      (b) => b.rate.numerator * v.reliefAtSourceRate.denominator === v.reliefAtSourceRate.numerator * b.rate.denominator,
    )
    expect(basic).toBeGreaterThan(0)
    const r = ok(annualAllowanceCharge(pound, ZERO, 'scotland', config))
    expect(r.bands[0]?.rate).toEqual(bands[basic]!.rate)
    expect(r.total).toBe(mulRound(pound, bands[basic]!.rate, 'nearest'))
  })

  it('a relief at source extension moves every band above the basic rate band up', () => {
    const higher = v.bands.rUK[1]!.from
    const extension = fromPounds(10_000)
    const without = ok(annualAllowanceCharge(fromPounds(5_000), higher, 'rUK', config))
    const with_ = ok(annualAllowanceCharge(fromPounds(5_000), higher, 'rUK', config, extension))
    expect(with_.total).toBeLessThan(without.total)
    expect(with_.total).toBe(referenceAllowanceCharge(fromPounds(5_000), fracOf(higher), fracOf(extension), 'rUK', config).total)
  })

  it('rejects a negative excess, income or extension', () => {
    expect(() => annualAllowanceCharge(fromPence(-1), ZERO, 'rUK', config)).toThrow(EngineInputError)
    expect(() => annualAllowanceCharge(ZERO, fromPence(-1), 'rUK', config)).toThrow(EngineInputError)
    expect(() => annualAllowanceCharge(ZERO, ZERO, 'rUK', config, fromPence(-1))).toThrow(EngineInputError)
  })
})

describe('annualAllowanceCheck: the charge on the excess', () => {
  it.each(REGIONS)('%s: the charge is worked out on the exact taxable income and band starts (reference)', (region) => {
    for (const method of PENSION_METHODS) {
      const pension = { method, contribution: fromPounds(30_000) }
      const i = inputs(fromPounds(140_000), pension, region)
      const s = savings({ employerContribution: fromPounds(45_000) })
      const r = check(i, s)
      const ref = referenceAnnualAllowance(i, s, config)
      expect(r.excess).toBe(ref.excess)
      const { taxable, extension } = referenceTaxable(i, config, DEFAULT_POLICY)
      expect(r.charge.total).toBe(referenceAllowanceCharge(ref.excess, taxable, extension, region, config).total)
      expect(r.charge.total).toBeGreaterThan(0)
    }
  })

  it('Scotland and rUK charge differently on the same excess', () => {
    const s = savings({ employerContribution: add(aa.standard, fromPounds(10_000)) })
    const ruk = check(inputs(fromPounds(70_000)), s).charge.total
    const sco = check(inputs(fromPounds(70_000), undefined, 'scotland'), s).charge.total
    expect(ruk).not.toBe(sco)
  })

  it('a contribution over the allowance is kept, never capped: the excess grows penny for penny', () => {
    const base = check(inputs(fromPounds(100_000)), savings({ employerContribution: aa.standard }))
    const more = check(inputs(fromPounds(100_000)), savings({ employerContribution: add(aa.standard, penny) }))
    expect(base.excess).toBe(ZERO)
    expect(more.excess).toBe(penny)
    expect(more.counted.total).toBe(add(aa.standard, penny))
  })
})

describe('annualAllowanceCheck: config shape', () => {
  it('reads the look-back from the config', () => {
    const shorter = mapLeaves(
      config,
      (path, current): Sourced<unknown> =>
        path === 'pension.carryForward.yearsBack' && current.status === 'verified' ? { ...current, value: 1 } : current,
    )
    const r = check(inputs(fromPounds(50_000)), savings({ carryForward: [{ yearsAgo: 2, amount: pound }] }), shorter)
    expect(r.carryForward).toEqual([])
    expect(r.warnings.map((w) => w.code)).toContain('carryForwardOutOfTime')
  })
})
