import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { FAKE_TODO_YEAR } from '@/config/tax/fixtures/fakeTaxYears'
import type { TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves, type Refusal, type Sourced } from '@/config/tax/sourced'
import {
  add,
  compareRatio,
  fromPence,
  fromPounds,
  type Money,
  MoneyError,
  mulRound,
  ratio,
  subtract,
  subtractRatio,
  ZERO,
} from '@/lib/money'
import { adjustedNetIncome, EngineInputError, employeeNI, incomeTax, pensionContribution, studentLoan, takeHome } from './calc'
import {
  configValues,
  equalFrac,
  fracOf,
  nearestPence,
  referenceAllowance,
  referenceClaimRelief,
  referenceExactTax,
  referenceGrossUp,
  referenceIncomeTaxWith,
  referencePension,
  referenceTakeHome,
} from './fixtures/reference'
import {
  DEFAULT_POLICY,
  type ModellingPolicy,
  PENSION_METHODS,
  type PensionInput,
  type PensionMethod,
  REGIONS,
  type Region,
  TAPER_ROUNDINGS,
  type TaxInputs,
} from './types'

/*
 * Session G1: pension contributions by salary sacrifice, net pay and relief
 * at source; adjusted net income; income tax with the taper on adjusted net
 * income and the basic rate band extended for relief at source; take-home pay
 * with a pension. Every expected value comes from the verified 2026-27 config
 * through fixtures/reference.ts or a formula written here; no tax figure is
 * written in this file. Amounts such as a salary or a contribution are test
 * inputs, not tax figures. The GOV.UK rules are logged in
 * docs/verification-log.md ("Session G1 lookups").
 */

const config = taxYear
const v = configValues(config)
const penny = fromPence(1)
const POLICIES: readonly ModellingPolicy[] = TAPER_ROUNDINGS.map((taperRounding) => ({ ...DEFAULT_POLICY, taperRounding }))
const pension = (method: PensionMethod, contribution: Money): PensionInput => ({ method, contribution })

function ok<T extends { ok: true }>(result: T | Refusal): T {
  if (!result.ok) throw new Error(`expected a result, got a refusal for ${result.unverified.join(', ')}`)
  return result
}

/** The largest relief at source payment whose gross amount fits in the pay: pay × (1 − rate), rounded down. */
const largestNet = (pay: Money) => mulRound(pay, subtractRatio(ratio(1, 1), v.reliefAtSourceRate), 'down')

/** The first relief at source payment at or above `from` whose grossed-up amount is a whole number of pence. */
function wholeGrossNet(from: Money): Money {
  let net = from
  while (referenceGrossUp(net, config)[0] % referenceGrossUp(net, config)[1] !== 0n) net = add(net, penny)
  return net
}

const grossOf = (net: Money) => nearestPence(referenceGrossUp(net, config))

/** The band taxed at the relief-at-source rate (the basic rate band), found independently of the engine. */
const basicIndex = (region: Region) => v.bands[region].findIndex((band) => compareRatio(band.rate, v.reliefAtSourceRate) === 0)

describe('pensionContribution', () => {
  const pay = fromPounds(50_000)
  const c = fromPounds(5_000)

  it('salary sacrifice comes off taxable pay, NI-able pay and the student loan base; the pension gets the amount sacrificed', () => {
    expect(ok(pensionContribution(pension('salarySacrifice', c), pay, config))).toEqual({
      ok: true,
      taxYear: config.id,
      method: 'salarySacrifice',
      grossPay: pay,
      contribution: c,
      providerRelief: ZERO,
      grossContribution: c,
      taxablePay: subtract(pay, c),
      niablePay: subtract(pay, c),
      studentLoanPay: subtract(pay, c),
      reliefAtSourceDeduction: ZERO,
      basicRateBandExtension: ZERO,
    })
  })

  it('net pay comes off taxable pay only: NI-able pay and the student loan base are unchanged', () => {
    const result = ok(pensionContribution(pension('netPay', c), pay, config))
    expect(result).toMatchObject({ taxablePay: subtract(pay, c), niablePay: pay, studentLoanPay: pay, grossContribution: c })
    expect(result).toMatchObject({ providerRelief: ZERO, reliefAtSourceDeduction: ZERO, basicRateBandExtension: ZERO })
  })

  it('relief at source grosses the payment up at the config rate; pay is unchanged; ANI step 3 and the band extension use the gross amount', () => {
    for (const net of [c, fromPence(1), fromPence(3), fromPounds('1234.57')]) {
      const result = ok(pensionContribution(pension('reliefAtSource', net), pay, config))
      const gross = grossOf(net)
      expect(result).toMatchObject({ taxablePay: pay, niablePay: pay, studentLoanPay: pay, contribution: net, grossContribution: gross })
      expect(result.providerRelief).toBe(subtract(gross, net))
      expect(result.reliefAtSourceDeduction).toBe(gross)
      expect(result.basicRateBandExtension).toBe(gross)
    }
    // The gross amount less the provider's relief at the rate is the payment.
    const gross = ok(pensionContribution(pension('reliefAtSource', c), pay, config)).grossContribution
    expect(subtract(gross, mulRound(gross, v.reliefAtSourceRate, 'nearest'))).toBe(c)
  })

  it('a zero contribution changes nothing', () => {
    for (const method of PENSION_METHODS) {
      const result = ok(pensionContribution(pension(method, ZERO), pay, config))
      expect(result).toMatchObject({ taxablePay: pay, niablePay: pay, studentLoanPay: pay, grossContribution: ZERO, providerRelief: ZERO })
    }
  })

  it('relief at source needs the verified relief-at-source rate; salary sacrifice and net pay need no tax value', () => {
    expect(pensionContribution(pension('reliefAtSource', c), pay, FAKE_TODO_YEAR)).toEqual({
      ok: false,
      taxYear: FAKE_TODO_YEAR.id,
      unverified: ['pension.reliefAtSourceRate'],
    })
    expect(pensionContribution(pension('salarySacrifice', c), pay, FAKE_TODO_YEAR).ok).toBe(true)
    expect(pensionContribution(pension('netPay', c), pay, FAKE_TODO_YEAR).ok).toBe(true)
  })

  it('refuses a contribution larger than earnings (relief above earnings is not modelled), and allows one equal to them', () => {
    for (const method of ['salarySacrifice', 'netPay'] as const) {
      expect(ok(pensionContribution(pension(method, pay), pay, config)).taxablePay).toBe(ZERO)
      expect(() => pensionContribution(pension(method, add(pay, penny)), pay, config)).toThrow(EngineInputError)
    }
    const net = largestNet(pay)
    expect(ok(pensionContribution(pension('reliefAtSource', net), pay, config)).grossContribution).toBeLessThanOrEqual(pay)
    expect(() => pensionContribution(pension('reliefAtSource', add(net, penny)), pay, config)).toThrow(EngineInputError)
    // No earnings: the no-earnings allowance for relief at source is not in the config, so any payment is refused.
    expect(() => pensionContribution(pension('reliefAtSource', penny), ZERO, config)).toThrow(EngineInputError)
    expect(ok(pensionContribution(pension('reliefAtSource', ZERO), ZERO, config)).grossContribution).toBe(ZERO)
  })

  it('rejects negative, unsafe or fractional amounts and unknown methods', () => {
    expect(() => pensionContribution(pension('netPay', fromPence(-1)), pay, config)).toThrow(EngineInputError)
    expect(() => pensionContribution(pension('netPay', c), fromPence(-1), config)).toThrow(EngineInputError)
    expect(() => pensionContribution(pension('netPay', 0.5 as Money), pay, config)).toThrow(MoneyError)
    expect(() => pensionContribution(pension('employer' as PensionMethod, c), pay, config)).toThrow(EngineInputError)
    expect(() => pensionContribution(undefined as unknown as PensionInput, pay, config)).toThrow(EngineInputError)
  })
})

describe('adjustedNetIncome', () => {
  const pay = fromPounds(110_000)

  it('without a pension is gross pay, and needs no tax value', () => {
    expect(ok(adjustedNetIncome(pay, undefined, FAKE_TODO_YEAR))).toEqual({
      ok: true,
      taxYear: FAKE_TODO_YEAR.id,
      grossPay: pay,
      method: null,
      netIncome: pay,
      reliefAtSourceDeduction: ZERO,
      adjustedNetIncome: pay,
    })
  })

  it('salary sacrifice and net pay come off at step 1 (they are not taxable pay); relief at source comes off grossed up at step 3', () => {
    const c = fromPounds(8_000)
    for (const method of PENSION_METHODS) {
      const result = ok(adjustedNetIncome(pay, pension(method, c), config))
      const ref = referencePension(pay, pension(method, c), config)
      expect(result.method).toBe(method)
      expect(result.netIncome).toBe(nearestPence(ref.taxablePay))
      expect(result.adjustedNetIncome).toBe(nearestPence(ref.ani))
    }
    expect(ok(adjustedNetIncome(pay, pension('salarySacrifice', c), config)).adjustedNetIncome).toBe(subtract(pay, c))
    expect(ok(adjustedNetIncome(pay, pension('netPay', c), config)).adjustedNetIncome).toBe(subtract(pay, c))
    const ras = ok(adjustedNetIncome(pay, pension('reliefAtSource', c), config))
    expect(ras.netIncome).toBe(pay)
    expect(ras.reliefAtSourceDeduction).toBe(grossOf(c))
    expect(ras.adjustedNetIncome).toBe(subtract(pay, grossOf(c)))
  })

  it('relief at source refuses on an unverified rate', () => {
    expect(adjustedNetIncome(pay, pension('reliefAtSource', penny), FAKE_TODO_YEAR)).toEqual({
      ok: false,
      taxYear: FAKE_TODO_YEAR.id,
      unverified: ['pension.reliefAtSourceRate'],
    })
  })
})

describe('incomeTax with a pension: the taper on adjusted net income', () => {
  const incomes = [
    fromPounds(20_000),
    fromPounds(60_000),
    v.taperStart,
    add(v.taperStart, fromPounds(7_500)),
    add(v.taperStart, fromPounds(20_000)),
    fromPounds(180_000),
  ]
  const c = fromPounds(6_000)

  it('without a pension, it is F’s income tax on the income, with the new fields filled in', () => {
    const result = ok(incomeTax(fromPounds(60_000), 'rUK', config, DEFAULT_POLICY))
    expect(result).toMatchObject({ pensionMethod: null, taxablePay: fromPounds(60_000), adjustedNetIncome: fromPounds(60_000) })
    expect(result.basicRateBandExtension).toBe(ZERO)
  })

  it('net pay and salary sacrifice are income tax on the lower pay: taxable pay and the taper both fall by the contribution', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES)
        for (const income of incomes)
          for (const method of ['netPay', 'salarySacrifice'] as const) {
            const withPension = ok(incomeTax(income, region, config, policy, pension(method, c)))
            const lower = ok(incomeTax(subtract(income, c), region, config, policy))
            expect(withPension.total).toBe(lower.total)
            expect(withPension.bands).toEqual(lower.bands)
            expect(withPension.taxablePay).toBe(subtract(income, c))
            expect(withPension.adjustedNetIncome).toBe(subtract(income, c))
            expect(withPension.personalAllowance.income).toBe(subtract(income, c))
          }
  })

  it('relief at source: the allowance tapers on gross pay less the grossed-up amount; taxable pay is unchanged; matches the reference', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES)
        for (const income of incomes) {
          const p = pension('reliefAtSource', c)
          const result = ok(incomeTax(income, region, config, policy, p))
          const ref = referenceIncomeTaxWith(income, p, region, config, policy)
          expect(result.taxablePay).toBe(income)
          expect(result.adjustedNetIncome).toBe(ref.ani)
          expect(result.personalAllowance.allowance).toBe(ref.allowance)
          expect(result.bands.map((b) => b.tax)).toEqual(ref.bandTax)
          expect(result.total).toBe(ref.total)
        }
  })

  it('the taper starts on adjusted net income: a penny either side of the taper start, for each method', () => {
    for (const method of PENSION_METHODS) {
      const net = method === 'reliefAtSource' ? wholeGrossNet(fromPounds(4_000)) : fromPounds(4_000)
      const off = method === 'reliefAtSource' ? grossOf(net) : net
      const atStart = add(v.taperStart, off)
      const at = ok(incomeTax(atStart, 'rUK', config, DEFAULT_POLICY, pension(method, net)))
      const above = ok(incomeTax(add(atStart, penny), 'rUK', config, DEFAULT_POLICY, pension(method, net)))
      const below = ok(incomeTax(subtract(atStart, penny), 'rUK', config, DEFAULT_POLICY, pension(method, net)))
      expect(at.adjustedNetIncome).toBe(v.taperStart)
      expect(at.personalAllowance.allowance).toBe(v.personalAllowance)
      expect(below.personalAllowance.allowance).toBe(v.personalAllowance)
      expect(above.personalAllowance.reduction).toBeGreaterThanOrEqual(0)
      expect(above.personalAllowance.allowance).toBe(nearestPence(referenceAllowance(add(v.taperStart, penny), config, DEFAULT_POLICY)))
      // Without the pension, the same gross pay is already in the taper zone.
      expect(ok(incomeTax(atStart, 'rUK', config, DEFAULT_POLICY)).personalAllowance.allowance).toBeLessThan(v.personalAllowance)
    }
  })

  it('relief at source moves every band above the basic rate band up by the gross amount, in each region', () => {
    const net = wholeGrossNet(fromPounds(3_000))
    const gross = grossOf(net)
    for (const region of REGIONS) {
      const basic = basicIndex(region)
      expect(basic).toBeGreaterThanOrEqual(0)
      const result = ok(incomeTax(fromPounds(70_000), region, config, DEFAULT_POLICY, pension('reliefAtSource', net)))
      expect(result.basicRateBandExtension).toBe(gross)
      result.bands.forEach((band, i) => {
        const from = v.bands[region][i]!.from
        expect(band.from).toBe(i > basic ? add(from, gross) : from)
      })
    }
  })

  it('relief at source gives the higher-rate relief GOV.UK states: each band’s rate less the relief-at-source rate on the income taxed at it', () => {
    for (const region of REGIONS)
      for (const income of [...incomes, fromPounds(15_000), fromPounds(35_000), fromPounds(45_000)])
        for (const net of [fromPounds(800), fromPounds(4_000), fromPounds(24_000)]) {
          const p = referencePension(income, pension('reliefAtSource', net), config)
          const without = referenceExactTax(p.taxablePay, p.ani, fracOf(0), region, config, DEFAULT_POLICY)
          const withExtension = referenceExactTax(p.taxablePay, p.ani, p.extension, region, config, DEFAULT_POLICY)
          const sum = (xs: readonly (readonly [bigint, bigint])[]) =>
            xs.reduce<readonly [bigint, bigint]>(([a, b], [c2, d]) => [a * d + c2 * b, b * d], [0n, 1n])
          const [wn, wd] = sum(without.bandTax)
          const [xn, xd] = sum(withExtension.bandTax)
          const saving: readonly [bigint, bigint] = [wn * xd - xn * wd, wd * xd]
          expect(equalFrac(saving, referenceClaimRelief(without.taxable, p.extension, region, config))).toBe(true)
        }
  })

  it('Scotland: a starter-rate taxpayer’s tax is unchanged by relief at source (the provider still adds relief at the basic rate)', () => {
    const starterTop = v.bands.scotland[basicIndex('scotland')]!.from
    const income = add(v.personalAllowance, subtract(starterTop, fromPounds(100)))
    const net = fromPounds(400)
    const result = ok(incomeTax(income, 'scotland', config, DEFAULT_POLICY, pension('reliefAtSource', net)))
    expect(result.total).toBe(ok(incomeTax(income, 'scotland', config, DEFAULT_POLICY)).total)
    expect(ok(pensionContribution(pension('reliefAtSource', net), income, config)).providerRelief).toBeGreaterThan(0)
  })

  it('Scotland against rUK at the same pay: the same gross amount, a saving at each region’s band rates', () => {
    const income = fromPounds(45_000)
    const net = wholeGrossNet(fromPounds(1_000))
    const gross = grossOf(net)
    for (const region of REGIONS) {
      const saving = subtract(
        ok(incomeTax(income, region, config, DEFAULT_POLICY)).total,
        ok(incomeTax(income, region, config, DEFAULT_POLICY, pension('reliefAtSource', net))).total,
      )
      // At this pay the top band reached holds more than the gross amount, so the saving is its rate less the relief-at-source rate.
      const top = ok(incomeTax(income, region, config, DEFAULT_POLICY)).bands.findLast((band) => band.income > 0)!
      expect(top.income).toBeGreaterThan(gross)
      expect(saving).toBe(mulRound(gross, subtractRatio(top.rate, v.reliefAtSourceRate), 'nearest'))
    }
  })

  it('stops with an error if no band is taxed at the relief-at-source rate (the relevant rate would be unknown)', () => {
    const odd: TaxYearConfig = mapLeaves(
      taxYear,
      (path, current): Sourced<unknown> =>
        path === 'pension.reliefAtSourceRate' && current.status === 'verified' ? { ...current, value: ratio(1, 3) } : current,
    )
    expect(() => incomeTax(fromPounds(70_000), 'rUK', odd, DEFAULT_POLICY, pension('reliefAtSource', fromPounds(1_000)))).toThrow(
      /basic rate band/,
    )
  })

  it('asks for the relief-at-source rate only with relief at source', () => {
    const refusal = incomeTax(fromPounds(1), 'rUK', FAKE_TODO_YEAR, DEFAULT_POLICY, pension('reliefAtSource', penny))
    expect(!refusal.ok && refusal.unverified).toContain('pension.reliefAtSourceRate')
    const plain = incomeTax(fromPounds(1), 'rUK', FAKE_TODO_YEAR, DEFAULT_POLICY, pension('netPay', penny))
    expect(!plain.ok && plain.unverified).not.toContain('pension.reliefAtSourceRate')
  })
})

describe('takeHome with a pension', () => {
  const inputs = (patch: Partial<TaxInputs> = {}): TaxInputs => ({
    grossPay: fromPounds(105_000),
    region: 'rUK',
    studentLoans: ['plan2', 'postgraduate'],
    ...patch,
  })
  const c = fromPounds(10_000)

  it('net is gross less income tax, NI, student loan and the pension contribution, from the separate functions', () => {
    for (const region of REGIONS)
      for (const method of PENSION_METHODS) {
        const p = pension(method, c)
        const result = ok(takeHome(inputs({ region, pension: p }), config, DEFAULT_POLICY))
        const effect = ok(pensionContribution(p, fromPounds(105_000), config))
        const tax = ok(incomeTax(fromPounds(105_000), region, config, DEFAULT_POLICY, p)).total
        const ni = ok(employeeNI(effect.niablePay, config)).total
        const loan = ok(studentLoan(['plan2', 'postgraduate'], effect.studentLoanPay, config)).total
        expect(result.annual).toMatchObject({ incomeTax: tax, nationalInsurance: ni, studentLoan: loan, pension: c, hicbc: ZERO })
        expect(result.annual.net).toBe(subtract(subtract(subtract(subtract(fromPounds(105_000), tax), ni), loan), c))
        expect(result.annual.netIncludingChildBenefit).toBe(result.annual.net)
        expect(result.pension).toEqual(effect)
        expect(result.adjustedNetIncome).toEqual(ok(adjustedNetIncome(fromPounds(105_000), p, config)))
      }
  })

  it('NI and the student loan use pay after salary sacrifice; net pay and relief at source leave them on gross pay', () => {
    const sacrifice = ok(takeHome(inputs({ pension: pension('salarySacrifice', c) }), config, DEFAULT_POLICY))
    expect(sacrifice.nationalInsurance.niablePay).toBe(subtract(fromPounds(105_000), c))
    expect(sacrifice.studentLoan.pay).toBe(subtract(fromPounds(105_000), c))
    for (const method of ['netPay', 'reliefAtSource'] as const) {
      const result = ok(takeHome(inputs({ pension: pension(method, c) }), config, DEFAULT_POLICY))
      expect(result.nationalInsurance.niablePay).toBe(fromPounds(105_000))
      expect(result.studentLoan.pay).toBe(fromPounds(105_000))
    }
  })

  it('matches the independent reference across methods, regions, plans, policies and pay', () => {
    for (const region of REGIONS)
      for (const policy of POLICIES)
        for (const method of PENSION_METHODS)
          for (const pay of [fromPounds(9_000), fromPounds(40_000), fromPounds(104_321), fromPounds(130_000)])
            for (const studentLoans of [[], ['plan1'], ['plan5', 'postgraduate']] as const) {
              const net = method === 'reliefAtSource' ? fromPounds('3333.33') : fromPounds('4166.67')
              const these = inputs({ grossPay: pay, region, studentLoans, pension: pension(method, net) })
              const result = ok(takeHome(these, config, policy))
              const ref = referenceTakeHome(these, config, policy)
              expect([result.annual.incomeTax, result.annual.nationalInsurance, result.annual.studentLoan]).toEqual([
                ref.tax,
                ref.ni,
                ref.loan,
              ])
              expect([result.annual.pension, result.annual.net]).toEqual([ref.pension, ref.net])
              expect(result.adjustedNetIncome.adjustedNetIncome).toBe(ref.ani)
              expect(result.pension?.grossContribution).toBe(ref.pot)
            }
  })

  it('a non-taxpayer: net pay gives no relief, relief at source still adds the provider’s relief', () => {
    const pay = subtract(v.personalAllowance, fromPounds(1_000))
    const cost = fromPounds(800)
    const netPay = ok(takeHome(inputs({ grossPay: pay, studentLoans: [], pension: pension('netPay', cost) }), config, DEFAULT_POLICY))
    const ras = ok(takeHome(inputs({ grossPay: pay, studentLoans: [], pension: pension('reliefAtSource', cost) }), config, DEFAULT_POLICY))
    const none = ok(takeHome(inputs({ grossPay: pay, studentLoans: [] }), config, DEFAULT_POLICY))
    for (const result of [netPay, ras, none]) expect(result.annual.incomeTax).toBe(ZERO)
    expect(netPay.annual.net).toBe(subtract(none.annual.net, cost))
    expect(ras.annual.net).toBe(subtract(none.annual.net, cost))
    expect(netPay.pension?.grossContribution).toBe(cost)
    expect(ras.pension?.grossContribution).toBe(grossOf(cost))
    expect(ras.pension!.grossContribution).toBeGreaterThan(netPay.pension!.grossContribution)
  })

  it('a taper-zone earner: net pay and relief at source putting the same amount in leave the same take-home (to the penny per band)', () => {
    const net = wholeGrossNet(fromPounds(2_000))
    const gross = grossOf(net)
    for (const region of REGIONS)
      for (const pay of [add(v.taperStart, fromPounds(5_000)), add(v.taperStart, fromPounds(15_000))]) {
        const viaNetPay = ok(takeHome(inputs({ grossPay: pay, region, pension: pension('netPay', gross) }), config, DEFAULT_POLICY))
        const viaRas = ok(takeHome(inputs({ grossPay: pay, region, pension: pension('reliefAtSource', net) }), config, DEFAULT_POLICY))
        expect(viaRas.pension?.grossContribution).toBe(viaNetPay.pension?.grossContribution)
        expect(viaRas.adjustedNetIncome.adjustedNetIncome).toBe(viaNetPay.adjustedNetIncome.adjustedNetIncome)
        expect(viaRas.incomeTax.personalAllowance.allowance).toBe(viaNetPay.incomeTax.personalAllowance.allowance)
        expect(Math.abs(viaRas.annual.net - viaNetPay.annual.net)).toBeLessThanOrEqual(v.bands[region].length)
        // Both lift the allowance out of the taper by the same amount: half the gross amount at this taper rate.
        expect(viaRas.incomeTax.personalAllowance.allowance).toBeGreaterThan(
          ok(takeHome(inputs({ grossPay: pay, region }), config, DEFAULT_POLICY)).incomeTax.personalAllowance.allowance,
        )
      }
  })

  it('salary sacrifice beats net pay by the NI and student loan saved, for the same amount in', () => {
    const viaSacrifice = ok(takeHome(inputs({ pension: pension('salarySacrifice', c) }), config, DEFAULT_POLICY))
    const viaNetPay = ok(takeHome(inputs({ pension: pension('netPay', c) }), config, DEFAULT_POLICY))
    expect(viaSacrifice.annual.incomeTax).toBe(viaNetPay.annual.incomeTax)
    const saved = add(
      subtract(viaNetPay.annual.nationalInsurance, viaSacrifice.annual.nationalInsurance),
      subtract(viaNetPay.annual.studentLoan, viaSacrifice.annual.studentLoan),
    )
    expect(saved).toBeGreaterThan(0)
    expect(viaSacrifice.annual.net).toBe(add(viaNetPay.annual.net, saved))
  })

  it('refuses a contribution larger than earnings', () => {
    for (const method of PENSION_METHODS)
      expect(() =>
        takeHome(inputs({ grossPay: fromPounds(1_000), pension: pension(method, fromPounds(1_001)) }), config, DEFAULT_POLICY),
      ).toThrow(EngineInputError)
  })

  it('zero pay and a zero contribution give zero everywhere', () => {
    for (const method of PENSION_METHODS) {
      const result = ok(takeHome(inputs({ grossPay: ZERO, pension: pension(method, ZERO) }), config, DEFAULT_POLICY))
      for (const view of [result.annual, result.monthly, result.weekly])
        expect([view.gross, view.incomeTax, view.nationalInsurance, view.studentLoan, view.pension, view.hicbc, view.net]).toEqual([
          0, 0, 0, 0, 0, 0, 0,
        ])
    }
  })

  it('lists only the values it needs: the relief-at-source rate only for relief at source', () => {
    const ras = takeHome(inputs({ pension: pension('reliefAtSource', c) }), FAKE_TODO_YEAR, DEFAULT_POLICY)
    const sacrifice = takeHome(inputs({ pension: pension('salarySacrifice', c) }), FAKE_TODO_YEAR, DEFAULT_POLICY)
    const none = takeHome(inputs(), FAKE_TODO_YEAR, DEFAULT_POLICY)
    expect(!ras.ok && ras.unverified).toContain('pension.reliefAtSourceRate')
    expect(!sacrifice.ok && sacrifice.unverified).toEqual(!none.ok && none.unverified)
    const listed = !ras.ok ? ras.unverified : []
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('names the method, the relief and the rounding in its assumptions, with no figures', () => {
    const text = (method: PensionMethod) =>
      ok(takeHome(inputs({ pension: pension(method, c) }), config, DEFAULT_POLICY)).assumptions.join(' ')
    expect(text('salarySacrifice')).toMatch(/salary sacrifice/i)
    expect(text('netPay')).toMatch(/net pay arrangement/i)
    expect(text('reliefAtSource')).toMatch(/relief at source/i)
    expect(text('reliefAtSource')).toMatch(/Self Assessment/)
    expect(text('reliefAtSource')).toMatch(/grossed up/i)
    expect(text('netPay')).toMatch(/adjusted net income/i)
    for (const method of PENSION_METHODS)
      for (const line of ok(takeHome(inputs({ pension: pension(method, c) }), config, DEFAULT_POLICY)).assumptions)
        expect(line).not.toMatch(/\d/)
    expect(ok(takeHome(inputs(), config, DEFAULT_POLICY)).assumptions.join(' ')).toMatch(/no pension contribution/i)
  })
})
