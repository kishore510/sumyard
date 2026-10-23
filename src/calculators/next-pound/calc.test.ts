import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import type { TaxBand, TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves, type Refusal, requireVerified, type Sourced } from '@/config/tax/sourced'
import { addMonths } from '@/lib/calendar'
import { BREAK_EVEN_RATE_DENOMINATOR, GROWTH_RATE_BOUND, MAX_INPUT_AMOUNT, MAX_PROJECTION_YEARS } from '@/lib/inputLimits'
import type { IsoDate } from '@/lib/isoDate'
import {
  add,
  compare,
  compareRatio,
  fromPence,
  fromPounds,
  type Money,
  mulRound,
  percent,
  type Ratio,
  ratio,
  subtract,
  subtractRatio,
  toPence,
  ZERO,
} from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { project } from '../compound-interest/calc'
import { FIGURE, split } from '../fixtures/literalGuard'
import { overpay } from '../mortgage/calc'
import { evaluateContribution, optimise } from '../optimiser/calc'
import { configValues } from '../optimiser/fixtures/reference'
import { DEFAULT_POLICY, type OptimiserInputs } from '../optimiser/types'
import { accessAt, breakEvenRate, nextPound, pensionAfterTax } from './calc'
import { inputs, mortgageInputs, pensionInputs } from './fixtures/inputs'
import type { IsaLeg, MortgageLeg, MortgageLegInputs, NextPoundInputs, NextPoundProblems, NextPoundResult, PensionLeg } from './types'

/*
 * The next pound composer (C1): the brief's edge-case table row by row, and
 * each leg reproduced from its own engine. Tax figures come only from the
 * verified 2026-27 config; pay, balances and growth rates are test inputs.
 */

const config = taxYear
const v = configValues(config)
const penny = fromPence(1)

const own = (() => {
  const granted = requireVerified(config, [
    'pension.minimumAge.current',
    'pension.minimumAge.announced',
    'pension.minimumAge.announcedFrom',
    'pension.lumpSum.taxFreeShare',
    'pension.lumpSum.allowance',
    'isa.annualLimit',
  ])
  if (!granted.ok) throw new Error('config refused')
  const g = granted.values
  return {
    current: g['pension.minimumAge.current'],
    announced: g['pension.minimumAge.announced'],
    announcedFrom: g['pension.minimumAge.announcedFrom'],
    share: g['pension.lumpSum.taxFreeShare'],
    allowance: g['pension.lumpSum.allowance'],
    isaLimit: g['isa.annualLimit'],
  }
})()

const basicRate = v.bands.rUK.find((b: TaxBand) => b.name === 'Basic rate')!.rate

function run(i: NextPoundInputs, c: TaxYearConfig = config): NextPoundResult {
  const r = nextPound(i, c, DEFAULT_POLICY)
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`)
  return r
}

type Accessible = Extract<PensionLeg, { status: 'accessible' }>
type Shared = Extract<PensionLeg, { status: 'accessible' | 'not-accessible' }>
type MortgageOk = Extract<MortgageLeg, { status: 'ok' }>
type IsaOk = Extract<IsaLeg, { status: 'ok' }>

function accessible(leg: PensionLeg): Accessible {
  if (leg.status !== 'accessible') throw new Error(`pension leg ${leg.status}`)
  return leg
}
function shared(leg: PensionLeg): Shared {
  if (leg.status !== 'accessible' && leg.status !== 'not-accessible') throw new Error(`pension leg ${leg.status}`)
  return leg
}
function mortgageOk(leg: MortgageLeg): MortgageOk {
  if (leg.status !== 'ok') throw new Error(`mortgage leg ${leg.status}: ${JSON.stringify(leg)}`)
  return leg
}
function isaOk(leg: IsaLeg): IsaOk {
  if (leg.status !== 'ok') throw new Error(`isa leg ${leg.status}`)
  return leg
}

const pensionWith = (optimiser: Partial<OptimiserInputs>, rest: Partial<NextPoundInputs['pension']> = {}) =>
  pensionInputs({ optimiser: { ...pensionInputs().optimiser, ...optimiser }, ...rest })

/** Spendable and the pension total at a contribution, by the optimiser's single point. */
function at(i: OptimiserInputs, contribution: Money) {
  const r = evaluateContribution(i, config, DEFAULT_POLICY, contribution)
  if (!r.ok) throw new Error('refused')
  return r
}

/** CP3 by the optimiser alone: E's cost within X, a penny more past it (or the maximum), the pension added the totals' difference. */
function expectPensionFromOptimiser(i: NextPoundInputs) {
  const leg = shared(run(i).legs.pension)
  const o = i.pension.optimiser
  const matched =
    compare(i.pension.employerMatch, ZERO) > 0
      ? { ...o, savings: { ...o.savings, employerContribution: add(o.savings.employerContribution, i.pension.employerMatch) } }
      : o
  const base = at(o, o.pension.contribution)
  const after = compare(leg.contribution.extra, ZERO) > 0 ? at(matched, leg.contribution.after) : base
  const cost = subtract(base.point.spendable, after.point.spendable)
  expect(leg.contribution.cost).toBe(cost)
  expect(leg.contribution.pensionAdded).toBe(subtract(after.point.pension.total, base.point.pension.total))
  expect(leg.contribution.leftoverCash).toBe(subtract(i.lumpSum, cost))
  expect(compare(cost, i.lumpSum)).toBeLessThanOrEqual(0)
  if (leg.contribution.atMaximum) expect(leg.contribution.after).toBe(base.maximumContribution)
  else {
    const more = at(matched, add(leg.contribution.after, penny))
    expect(compare(subtract(base.point.spendable, more.point.spendable), i.lumpSum)).toBe(1)
  }
  return { leg, base, after }
}

describe('nextPound(): no age given (C2.1, a no-behaviour-change optional input)', () => {
  const at = (ageNow: number | null) => run(inputs({ horizonYears: 10, pension: pensionInputs({ ageNow }) }))

  it('the access test is not run: access is null, the leg has its numbers and the break-even against it', () => {
    const r = at(null)
    const leg = accessible(r.legs.pension)
    expect(leg.access).toBeNull()
    expect(r.breakEven.pension).not.toBeNull()
  })

  it('the figures are those at any age that can take the pension at the horizon; the other legs are unchanged', () => {
    const none = at(null)
    const old = at(own.announced)
    const { access: _a, ...withoutAge } = accessible(none.legs.pension)
    const { access: _b, ...withAge } = accessible(old.legs.pension)
    expect(withoutAge).toEqual(withAge)
    expect(none.breakEven).toEqual(old.breakEven)
    expect(none.legs.mortgage).toEqual(old.legs.mortgage)
    expect(none.legs.isa).toEqual(old.legs.isa)
  })

  it('with an age, nothing changes: not accessible stays not accessible, with its access', () => {
    const r = at(40)
    expect(r.legs.pension.status).toBe('not-accessible')
    expect(shared(r.legs.pension).access?.accessible).toBe(false)
  })

  it('gives no transitional age warning without an age', () => {
    expect(at(null).warnings.some((w) => w.source === 'next-pound' && w.code === 'transitionalAgeRules')).toBe(false)
  })

  it('an age that is not a whole number in range is still refused by field', () => {
    const r = nextPound(inputs({ pension: pensionInputs({ ageNow: -1 }) }), config, DEFAULT_POLICY)
    if (!r.ok) throw new Error('refused')
    expect(r.legs.pension).toMatchObject({ status: 'refused', engine: 'next-pound', problems: [{ field: 'pension.ageNow' }] })
  })
})

describe('nextPound(): horizon and the access age (CP4, NP-3, NP-5)', () => {
  it('horizon before the access age: not accessible, no number, no break-even against it; the other legs shown', () => {
    const r = run(inputs({ horizonYears: 10, pension: pensionInputs({ ageNow: 40 }) }))
    expect(r.legs.pension.status).toBe('not-accessible')
    expect('rates' in r.legs.pension).toBe(false)
    expect(r.breakEven.pension).toBeNull()
    expect(r.legs.mortgage.status).toBe('ok')
    expect(r.legs.isa.status).toBe('ok')
    expect(r.breakEven.mortgage).not.toBeNull()
  })

  it('exactly at the access age: accessible; a year short: not', () => {
    const years = 20
    const exact = run(inputs({ horizonYears: years, pension: pensionInputs({ ageNow: own.announced - years }) }))
    expect(exact.legs.pension.status).toBe('accessible')
    expect(shared(exact.legs.pension).access.ageAtHorizon).toBe(own.announced)
    const short = run(inputs({ horizonYears: years, pension: pensionInputs({ ageNow: own.announced - years - 1 }) }))
    expect(short.legs.pension.status).toBe('not-accessible')
  })

  it('a horizon across the date the age rises uses the announced age; before it, the age now', () => {
    const before = addMonths(own.announcedFrom, -1)
    // A horizon one year on landing a month before the date: the age now.
    const asOf = addMonths(before, -12)
    const early = accessAt(asOf, 1, own.current - 1, null, own)
    expect(early.minimumAge).toBe(own.current)
    expect(early.accessible).toBe(true)
    // Two years on, past the date: the announced age.
    const late = accessAt(asOf, 2, own.current - 2, null, own)
    expect(late.minimumAge).toBe(own.announced)
    expect(late.accessible).toBe(false)
    // On the date itself the announced age applies; the day before, the age now.
    expect(accessAt(addMonths(own.announcedFrom, -24), 2, 0, null, own).minimumAge).toBe(own.announced)
    const dayBefore = `${own.announcedFrom.slice(0, 8)}${String(Number(own.announcedFrom.slice(8)) - 1).padStart(2, '0')}` as IsoDate
    expect(accessAt(addMonths(dayBefore, -24), 2, 0, null, own).minimumAge).toBe(own.current)
  })

  it('a scheme’s later age wins; an earlier one does not lower the minimum', () => {
    expect(accessAt('2026-10-23', 30, 30, own.announced + 3, own).accessAge).toBe(own.announced + 3)
    expect(accessAt('2026-10-23', 30, 30, own.current - 5, own).accessAge).toBe(own.announced)
  })

  it('warns that the transitional rules are not modelled when they may matter (NP-1), and not otherwise', () => {
    // Close to the age now on the date it rises, a horizon after it, short of the announced age then.
    const asOf = addMonths(own.announcedFrom, -18)
    const close = run(inputs({ asOf, horizonYears: 2, pension: pensionInputs({ ageNow: own.current - 1 }) }))
    expect(close.legs.pension.status).toBe('not-accessible')
    expect(close.warnings.some((w) => w.source === 'next-pound' && w.code === 'transitionalAgeRules')).toBe(true)
    // Far younger: the rules cannot matter.
    const young = run(inputs({ asOf, horizonYears: 2, pension: pensionInputs({ ageNow: 30 }) }))
    expect(young.warnings.some((w) => w.source === 'next-pound' && w.code === 'transitionalAgeRules')).toBe(false)
  })
})

describe('nextPound(): the pension leg (CP3)', () => {
  it('reproduces the pension cost from two optimiser points, and E is the most within X', () => {
    expectPensionFromOptimiser(inputs())
    for (const method of ['salarySacrifice', 'reliefAtSource'] as const)
      expectPensionFromOptimiser(inputs({ pension: pensionWith({ pension: { method, contribution: fromPounds(2_000) } }) }))
  })

  it('X above the pay headroom stops at the maximum contribution; the rest is cash, with a warning', () => {
    const i = inputs({ lumpSum: fromPounds(20_000), pension: pensionWith({ grossPay: fromPounds(8_000) }) })
    const { leg, base } = expectPensionFromOptimiser(i)
    expect(leg.contribution.atMaximum).toBe(true)
    expect(leg.contribution.after).toBe(base.maximumContribution)
    expect(compare(leg.contribution.leftoverCash, ZERO)).toBe(1)
    expect(leg.warnings.some((w) => w.source === 'next-pound' && w.code === 'pensionAtMaximum')).toBe(true)
    const pot = accessible(run(i).legs.pension).rates.mid
    expect(pot.value.nominal).toBe(add(pot.afterTax.nominal, leg.contribution.leftoverCash))
  })

  it('X above the annual allowance: the charge lowers spendable, so X buys less; the optimiser’s warnings pass through', () => {
    const i = inputs({
      lumpSum: fromPounds(40_000),
      pension: pensionWith({
        grossPay: fromPounds(150_000),
        savings: { employerContribution: fromPounds(5_000), carryForward: [], moneyPurchaseAnnualAllowance: true },
      }),
    })
    const { leg, after } = expectPensionFromOptimiser(i)
    expect(compare(after.point.annualAllowanceCharge, ZERO)).toBe(1)
    expect(leg.warnings.map((w) => (w.source === 'optimiser' ? w.warning.code : null))).toContain('overMoneyPurchaseAllowance')
    const tapered = inputs({
      lumpSum: fromPounds(60_000),
      pension: pensionWith({
        grossPay: fromPounds(300_000),
        savings: {
          employerContribution: ZERO,
          carryForward: [{ yearsAgo: 1, amount: fromPounds(5_000) }],
          moneyPurchaseAnnualAllowance: false,
        },
      }),
    })
    const t = expectPensionFromOptimiser(tapered).leg
    const codes = t.warnings.flatMap((w) => (w.source === 'optimiser' ? [w.warning.code] : []))
    expect(codes).toEqual(expect.arrayContaining(['tapered', 'carryForwardUsed', 'overAllowance']))
  })

  it('the employer match joins the pot, not spendable income', () => {
    const match = fromPounds(2_000)
    const plain = shared(run(inputs()).legs.pension).contribution
    const matched = expectPensionFromOptimiser(inputs({ pension: pensionInputs({ employerMatch: match }) })).leg.contribution
    expect(matched.employerMatch).toBe(match)
    expect(matched.extra).toBe(plain.extra)
    expect(matched.pensionAdded).toBe(add(plain.pensionAdded, match))
  })

  it.each([
    ['taper start, a penny under', 'start', -1],
    ['taper start, a penny over', 'start', 1],
    ['taper end, a penny under', 'end', -1],
    ['taper end, a penny over', 'end', 1],
  ] as const)('%s: the cost moves as the optimiser’s points say', (_name, where, side) => {
    // With no contribution now, net pay: adjusted net income is the pay.
    const end = add(v.taperStart, mulRound(v.personalAllowance, ratio(v.taperRate.denominator, v.taperRate.numerator), 'nearest'))
    const grossPay = add(where === 'start' ? v.taperStart : end, fromPence(side))
    const i = inputs({ lumpSum: fromPounds(5_000), pension: pensionWith({ grossPay, pension: { method: 'netPay', contribution: ZERO } }) })
    expectPensionFromOptimiser(i)
  })

  it('inside the taper zone a pound of cost buys more pension than just under it (the cost per pound is the optimiser’s)', () => {
    const end = add(v.taperStart, mulRound(v.personalAllowance, ratio(v.taperRate.denominator, v.taperRate.numerator), 'nearest'))
    const leg = (grossPay: Money) =>
      shared(
        run(inputs({ lumpSum: fromPounds(5_000), pension: pensionWith({ grossPay, pension: { method: 'netPay', contribution: ZERO } }) }))
          .legs.pension,
      ).contribution
    const under = leg(subtract(v.taperStart, penny))
    const inside = leg(subtract(end, penny))
    // pensionAdded / cost, compared exactly.
    expect(
      compareRatio(ratio(toPence(inside.pensionAdded), toPence(inside.cost)), ratio(toPence(under.pensionAdded), toPence(under.cost))),
    ).toBe(1)
  })

  it('HICBC step: the cost is not monotone in the contribution; the composer takes the most pension within X', () => {
    // Two children, pay inside the HICBC zone, net pay from nothing: adjusted net income is pay less the contribution.
    const grossPay = add(v.childBenefit.threshold, mulRound(v.childBenefit.incomePerPercent, ratio(30, 1), 'nearest'))
    const o: OptimiserInputs = {
      ...pensionInputs().optimiser,
      grossPay,
      pension: { method: 'netPay', contribution: ZERO },
      savings: { employerContribution: ZERO, carryForward: [], moneyPurchaseAnnualAllowance: false },
      childBenefit: { children: 2, payments: 'claimed' },
    }
    // A step boundary: adjusted net income exactly ten steps over the threshold.
    const peak = subtract(grossPay, add(v.childBenefit.threshold, mulRound(v.childBenefit.incomePerPercent, ratio(10, 1), 'nearest')))
    const base = at(o, ZERO).point.spendable
    const cost = (c: Money) => subtract(base, at(o, c).point.spendable)
    // Not monotone: a penny more contribution costs less.
    expect(compare(cost(add(peak, penny)), cost(peak))).toBe(-1)
    const X = cost(peak)
    const leg = expectPensionFromOptimiser(inputs({ lumpSum: X, pension: pensionInputs({ optimiser: o }) })).leg
    // The most pension within X lies past the drop, not at the peak.
    expect(compare(leg.contribution.after, add(peak, penny))).toBe(1)
    // And no optimiser sweep point beyond it is within X.
    const sweep = optimise(o, config, DEFAULT_POLICY)
    if (!sweep.ok) throw new Error('refused')
    for (const p of sweep.points)
      if (compare(p.contribution, leg.contribution.after) > 0) expect(compare(subtract(base, p.spendable), X)).toBe(1)
  })
})

describe('nextPound(): the pension at the horizon (CP4)', () => {
  it('grows by project(), splits at the tax-free share, taxes the rest at the "Basic rate" band’s rate by default', () => {
    const r = run(inputs())
    const leg = accessible(r.legs.pension)
    expect(leg.retirementTaxRateFrom).toBe('config')
    expect(compareRatio(leg.retirementTaxRate, basicRate)).toBe(0)
    for (const c of ['low', 'mid', 'high'] as const) {
      const i = inputs()
      const p = project({
        lumpSum: leg.contribution.pensionAdded,
        contribution: ZERO,
        contributionFrequency: 'annual',
        timing: 'start',
        years: i.horizonYears,
        contributionIncrease: ratio(0, 1),
        growthRate: i.growth[c],
        compounding: 'annual',
        feeRate: i.feeRate,
        inflationRate: i.inflationRate,
      })
      if (!p.ok) throw new Error('refused')
      const at = leg.rates[c]
      expect(at.pot).toEqual({ nominal: p.result.withFee.nominal.closing, todaysMoney: p.result.withFee.real.closing })
      const taxFree = mulRound(at.pot.nominal, own.share, 'down')
      expect(at.taxFree).toBe(taxFree)
      expect(at.tax).toBe(mulRound(subtract(at.pot.nominal, taxFree), basicRate, 'nearest'))
      expect(at.afterTax.nominal).toBe(subtract(at.pot.nominal, at.tax))
    }
  })

  it('the tax-free share is capped at the lump sum allowance; nothing is tax-free when other pensions use it', () => {
    const pot = mulRound(own.allowance, ratio(own.share.denominator * 2, own.share.numerator), 'nearest')
    const capped = pensionAfterTax(pot, own.share, own.allowance, basicRate)
    expect(capped.taxFree).toBe(own.allowance)
    expect(compare(mulRound(pot, own.share, 'down'), own.allowance)).toBe(1)
    expect(pensionAfterTax(pot, own.share, ZERO, basicRate).taxFree).toBe(ZERO)
    const leg = accessible(run(inputs({ pension: pensionInputs({ otherPensionsUseAllowance: true }) })).legs.pension)
    expect(leg.allowanceAvailable).toBe(ZERO)
    expect(leg.rates.mid.taxFree).toBe(ZERO)
  })

  it('a rate the person enters replaces the default', () => {
    const rate = percent('31')
    const leg = accessible(run(inputs({ pension: pensionInputs({ retirementTaxRate: rate }) })).legs.pension)
    expect(leg.retirementTaxRateFrom).toBe('input')
    expect(leg.retirementTaxRate).toEqual(rate)
  })

  it('with no band named "Basic rate" the default refuses and asks for a rate; the other legs show', () => {
    const renamed = mapLeaves(config, (path, leaf) =>
      path === 'incomeTax.bands.rUK' && leaf.status === 'verified'
        ? ({ ...leaf, value: (leaf.value as TaxBand[]).map((b) => ({ ...b, name: `${b.name} band` })) } as Sourced<unknown>)
        : leaf,
    )
    const r = run(inputs(), renamed)
    expect(r.legs.pension).toEqual({
      status: 'refused',
      engine: 'next-pound',
      problems: [{ field: 'pension.retirementTaxRate', reason: 'no-default' }],
    })
    expect(r.legs.isa.status).toBe('ok')
    expect(accessible(run(inputs({ pension: pensionInputs({ retirementTaxRate: basicRate }) }), renamed).legs.pension).status).toBe(
      'accessible',
    )
  })
})

describe('nextPound(): the mortgage leg (CP5)', () => {
  /** The leg rebuilt from overpay() rows at the composer's O. */
  function fromRows(i: NextPoundInputs, leg: MortgageOk) {
    const m = i.mortgage!
    const out = overpay({ ...m, effect: 'reduce-term', regular: null, lumpSums: [{ month: 1, amount: leg.overpayment }] })
    if (!out.ok) throw new Error('refused')
    const k = Math.min(i.horizonYears * MONTHS_PER_YEAR + 1, m.termMonths)
    const r = out.result
    let freed = ZERO
    for (let n = 0; n < k; n++) freed = add(freed, subtract(r.baseline.rows[n]!.payment, r.overpaying.rows[n]!.payment))
    const cash = add(subtract(subtract(i.lumpSum, leg.overpayment), r.overpaying.totalErc), r.overpaying.rows[0]!.unused)
    expect(leg.horizonMonth).toBe(k)
    expect(leg.baselineBalance).toBe(r.balances[k]!.baseline)
    expect(leg.overpayingBalance).toBe(r.balances[k]!.overpaying)
    expect(leg.paymentsFreed).toBe(freed)
    expect(leg.leftoverCash).toBe(cash)
    expect(leg.value.nominal).toBe(add(add(subtract(r.balances[k]!.baseline, r.balances[k]!.overpaying), freed), cash))
    return r
  }

  it('reproduces the leg from overpay() rows; it is the only guaranteed leg', () => {
    const i = inputs()
    const r = run(i)
    const leg = mortgageOk(r.legs.mortgage)
    fromRows(i, leg)
    expect(leg.guaranteed).toBe(true)
    expect(accessible(r.legs.pension).guaranteed).toBe(false)
    expect(isaOk(r.legs.isa).guaranteed).toBe(false)
  })

  it('X above the balance: only what clears it is overpaid, the rest is cash, freed payments count', () => {
    const i = inputs({ lumpSum: fromPounds(10_000), mortgage: mortgageInputs({ balance: fromPounds(5_000), termMonths: 60 }) })
    const leg = mortgageOk(run(i).legs.mortgage)
    fromRows(i, leg)
    expect(compare(leg.unused, ZERO)).toBe(1)
    expect(add(leg.overpaymentUsed, leg.unused)).toBe(leg.overpayment)
    expect(compare(leg.paymentsFreed, ZERO)).toBe(1)
    expect(leg.overpayingBalance).toBe(ZERO)
    expect(leg.warnings.some((w) => w.source === 'mortgage' && w.warning.kind === 'unused-overpayment')).toBe(true)
  })

  it('ERC above the allowance: overpayment plus charge within X, a penny more passes it; the warning passes through', () => {
    const erc = { rate: percent('3'), endMonth: 24, allowance: { kind: 'amount' as const, amount: fromPounds(2_000) } }
    const i = inputs({ mortgage: mortgageInputs({ erc }) })
    const leg = mortgageOk(run(i).legs.mortgage)
    fromRows(i, leg)
    expect(compare(add(leg.overpayment, leg.erc), i.lumpSum)).toBeLessThanOrEqual(0)
    const more = overpay({
      ...i.mortgage!,
      effect: 'reduce-term',
      regular: null,
      lumpSums: [{ month: 1, amount: add(leg.overpayment, penny) }],
    })
    if (!more.ok) throw new Error('refused')
    expect(compare(add(add(leg.overpayment, penny), more.result.overpaying.totalErc), i.lumpSum)).toBe(1)
    expect(leg.warnings.some((w) => w.source === 'mortgage' && w.warning.kind === 'over-allowance')).toBe(true)
  })

  it.each([
    ['with an ERC', { rate: percent('3'), endMonth: 24, allowance: { kind: 'amount' as const, amount: fromPounds(2_000) } }],
    ['without one', null],
  ])('a horizon at or past the term: the leg less X is the engine’s net saving (%s)', (_name, erc) => {
    const m = mortgageInputs({ termMonths: 120, erc })
    for (const horizonYears of [10, 15]) {
      const i = inputs({ horizonYears, mortgage: m })
      const leg = mortgageOk(run(i).legs.mortgage)
      const r = fromRows(i, leg)
      const saving = r.charge === null ? r.interestSaved : r.charge.netSaving
      expect(subtract(leg.value.nominal, i.lumpSum)).toBe(saving)
    }
  })

  it('zero-rate mortgage: the leg is the overpayment plus any cash; break-even is the return whose growth after the fee is nothing', () => {
    const i = inputs({ mortgage: mortgageInputs({ fixedRate: ratio(0, 1), reversionRate: ratio(0, 1) }) })
    const r = run(i)
    const leg = mortgageOk(r.legs.mortgage)
    expect(leg.value.nominal).toBe(add(leg.overpaymentUsed, leg.leftoverCash))
    expect(leg.value.nominal).toBe(i.lumpSum)
    // (1 + r)(1 − f) = 1: r = f / (1 − f).
    const f = i.feeRate
    const exact = ratio(f.numerator, f.denominator - f.numerator)
    const be = r.breakEven.mortgage!
    if (be.kind !== 'rate') throw new Error(be.kind)
    expect(compareRatio(be.rate, exact)).toBeLessThanOrEqual(0)
    expect(compareRatio(subtractRatio(exact, be.rate), ratio(1, BREAK_EVEN_RATE_DENOMINATOR))).toBe(-1)
  })

  it('interest-only: the effect is ignored, the lower interest payments count as freed', () => {
    const i = inputs({ mortgage: mortgageInputs({ repaymentType: 'interest-only' }) })
    const leg = mortgageOk(run(i).legs.mortgage)
    fromRows(i, leg)
    expect(compare(leg.paymentsFreed, ZERO)).toBe(1)
    expect(subtract(leg.baselineBalance, leg.overpayingBalance)).toBe(leg.overpaymentUsed)
    expect(leg.warnings.some((w) => w.source === 'mortgage' && w.warning.kind === 'effect-not-applicable')).toBe(true)
  })

  it('no ERC, monthly interest, horizon inside the fixed period, no payoff: break-even is the fixed period’s effective return', () => {
    const i = inputs({ horizonYears: 2, feeRate: ratio(0, 1), mortgage: mortgageInputs({ fixedEndMonth: 36 }) })
    const r = run(i)
    const be = r.breakEven.mortgage!
    if (be.kind !== 'rate') throw new Error(be.kind)
    const out = overpay({ ...i.mortgage!, effect: 'reduce-term', regular: null, lumpSums: [] })
    if (!out.ok) throw new Error('refused')
    const effective = out.result.returns.find((p) => p.period === 'fixed')!.effective
    const gap = subtractRatio(effective, be.rate)
    expect(compareRatio(gap, ratio(-1, BREAK_EVEN_RATE_DENOMINATOR))).toBeGreaterThanOrEqual(0)
    expect(compareRatio(gap, ratio(1, BREAK_EVEN_RATE_DENOMINATOR))).toBeLessThanOrEqual(0)
    expect(mortgageOk(r.legs.mortgage).paymentsFreed).toBe(ZERO)
  })

  it('no mortgage: the leg is none and there is no break-even against it', () => {
    const r = run(inputs({ mortgage: null }))
    expect(r.legs.mortgage).toEqual({ status: 'none' })
    expect(r.breakEven.mortgage).toBeNull()
  })
})

describe('nextPound(): the ISA leg (CP6)', () => {
  it('reproduces the ISA from project() at each rate, with the fee', () => {
    const i = inputs()
    const leg = isaOk(run(i).legs.isa)
    for (const c of ['low', 'mid', 'high'] as const) {
      const p = project({
        lumpSum: i.lumpSum,
        contribution: ZERO,
        contributionFrequency: 'annual',
        timing: 'start',
        years: i.horizonYears,
        contributionIncrease: ratio(0, 1),
        growthRate: i.growth[c],
        compounding: 'annual',
        feeRate: i.feeRate,
        inflationRate: i.inflationRate,
      })
      if (!p.ok) throw new Error('refused')
      expect(leg.rates[c].value).toEqual({ nominal: p.result.withFee.nominal.closing, todaysMoney: p.result.withFee.real.closing })
    }
  })

  it('zero growth: the ISA is X less fees; the pension is its own pot less fees, split and taxed', () => {
    const zero = { low: ratio(0, 1), mid: ratio(0, 1), high: ratio(0, 1) }
    const i = inputs({ growth: zero })
    const r = run(i)
    const isa = isaOk(r.legs.isa)
    const p = project({
      lumpSum: i.lumpSum,
      contribution: ZERO,
      contributionFrequency: 'annual',
      timing: 'start',
      years: i.horizonYears,
      contributionIncrease: ratio(0, 1),
      growthRate: ratio(0, 1),
      compounding: 'annual',
      feeRate: i.feeRate,
      inflationRate: i.inflationRate,
    })
    if (!p.ok) throw new Error('refused')
    expect(isa.rates.mid.value.nominal).toBe(subtract(i.lumpSum, p.result.withFee.nominal.fees))
    const pension = accessible(r.legs.pension)
    expect(pension.rates.low).toEqual(pension.rates.high)
    expect(compare(pension.rates.mid.pot.nominal, pension.contribution.pensionAdded)).toBeLessThanOrEqual(0)
  })

  it('warns when what is paid this tax year plus X passes the annual limit; it does not cap', () => {
    const X = fromPounds(10_000)
    const under = run(inputs({ lumpSum: X, isa: { paidThisYear: subtract(own.isaLimit, X) } }))
    expect(under.warnings.some((w) => w.source === 'next-pound' && w.code === 'isaOverAllowance')).toBe(false)
    const over = run(inputs({ lumpSum: X, isa: { paidThisYear: add(subtract(own.isaLimit, X), penny) } }))
    expect(over.warnings.some((w) => w.source === 'next-pound' && w.code === 'isaOverAllowance')).toBe(true)
    expect(isaOk(over.legs.isa).rates).toEqual(isaOk(under.legs.isa).rates)
  })
})

describe('nextPound(): break-even (CP7)', () => {
  it('the ISA at the break-even rate is at most the leg, a step higher passes it', () => {
    const i = inputs()
    const r = run(i)
    for (const [target, be] of [
      [mortgageOk(r.legs.mortgage).value.nominal, r.breakEven.mortgage],
      [accessible(r.legs.pension).rates.mid.value.nominal, r.breakEven.pension],
    ] as const) {
      if (be?.kind !== 'rate') throw new Error('no rate')
      const isa = (rate: Ratio) => {
        const p = project({
          lumpSum: i.lumpSum,
          contribution: ZERO,
          contributionFrequency: 'annual',
          timing: 'start',
          years: i.horizonYears,
          contributionIncrease: ratio(0, 1),
          growthRate: rate,
          compounding: 'annual',
          feeRate: i.feeRate,
          inflationRate: i.inflationRate,
        })
        if (!p.ok) throw new Error('refused')
        return p.result.withFee.nominal.closing
      }
      expect(compare(isa(be.rate), target)).toBeLessThanOrEqual(0)
      expect(compare(isa(be.upTo), target)).toBe(1)
      expect(compareRatio(subtractRatio(be.upTo, be.rate), ratio(1, BREAK_EVEN_RATE_DENOMINATOR))).toBe(0)
    }
  })

  it('no solution within the bound: above the highest rate modelled, or below the lowest, never a number', () => {
    // A pension leg far above anything the ISA reaches in a year: a large match, no tax on withdrawal.
    const above = run(
      inputs({
        horizonYears: 1,
        pension: pensionInputs({ ageNow: 70, employerMatch: fromPounds(40_000), retirementTaxRate: ratio(0, 1) }),
      }),
    )
    expect(above.breakEven.pension).toEqual({ kind: 'above-highest' })
    // Nothing tax-free and everything taxed: below the lowest.
    const below = run(
      inputs({
        horizonYears: 1,
        pension: pensionInputs({ ageNow: 70, retirementTaxRate: ratio(1, 1), otherPensionsUseAllowance: true }),
      }),
    )
    expect(below.breakEven.pension).toEqual({ kind: 'below-lowest' })
    // At the bound itself, a rate.
    const X = fromPounds(1_000)
    const top = project({
      lumpSum: X,
      contribution: ZERO,
      contributionFrequency: 'annual',
      timing: 'start',
      years: 1,
      contributionIncrease: ratio(0, 1),
      growthRate: GROWTH_RATE_BOUND,
      compounding: 'annual',
      feeRate: ratio(0, 1),
      inflationRate: ratio(0, 1),
    })
    if (!top.ok) throw new Error('refused')
    const atBound = breakEvenRate(X, ratio(0, 1), 1, ratio(0, 1), top.result.withFee.nominal.closing)
    expect(atBound.kind).toBe('rate')
    expect(breakEvenRate(X, ratio(0, 1), 1, ratio(0, 1), add(top.result.withFee.nominal.closing, penny))).toEqual({ kind: 'above-highest' })
  })
})

describe('nextPound(): X of nothing, today’s money, refusals', () => {
  it('X of nothing: every leg nothing, no break-even, no warnings; not a refusal', () => {
    // Even with a pension already over the allowance and an ISA already full.
    const r = run(
      inputs({
        lumpSum: ZERO,
        pension: pensionWith({
          savings: { employerContribution: fromPounds(80_000), carryForward: [], moneyPurchaseAnnualAllowance: false },
        }),
        isa: { paidThisYear: add(own.isaLimit, penny) },
      }),
    )
    expect(r.legs).toEqual({ pension: { status: 'nothing' }, mortgage: { status: 'nothing' }, isa: { status: 'nothing' } })
    expect(r.breakEven).toEqual({ mortgage: null, pension: null })
    expect(r.warnings).toEqual([])
  })

  it('today’s money is never above nominal with positive inflation, and equals it with none', () => {
    for (const inflationRate of [percent('2'), ratio(0, 1)]) {
      const r = run(inputs({ inflationRate }))
      const all = [
        ...Object.values(accessible(r.legs.pension).rates).flatMap((a) => [a.pot, a.afterTax, a.value]),
        mortgageOk(r.legs.mortgage).value,
        ...Object.values(isaOk(r.legs.isa).rates).map((a) => a.value),
      ]
      for (const a of all) {
        if (inflationRate.numerator > 0) expect(compare(a.todaysMoney, a.nominal)).toBeLessThanOrEqual(0)
        else expect(a.todaysMoney).toBe(a.nominal)
      }
    }
  })

  it('a refusal from one engine refuses that leg only, by field', () => {
    const bad = run(inputs({ mortgage: { ...mortgageInputs(), termMonths: 0 } as MortgageLegInputs }))
    expect(bad.legs.mortgage).toMatchObject({ status: 'refused', engine: 'mortgage', problems: [{ field: 'termMonths' }] })
    expect(bad.legs.pension.status).toBe('accessible')
    expect(bad.legs.isa.status).toBe('ok')
    // An optimiser-only leaf unverified: the pension leg refuses with it named.
    const noTaper = mapLeaves(config, (path, leaf) => (path === 'incomeTax.taperRate' ? { status: 'todo' } : leaf))
    const r = run(inputs(), noTaper)
    expect(r.legs.pension).toEqual({ status: 'refused', engine: 'optimiser', unverified: ['incomeTax.taperRate'] })
    expect(r.legs.mortgage.status).toBe('ok')
    // The composer's own field on a leg.
    const age = run(inputs({ pension: pensionInputs({ ageNow: -1 }) }))
    expect(age.legs.pension).toEqual({
      status: 'refused',
      engine: 'next-pound',
      problems: [{ field: 'pension.ageNow', reason: 'below-minimum' }],
    })
    // The engine itself not accepting its inputs.
    const method = run(inputs({ pension: pensionWith({ pension: { method: 'other' as 'netPay', contribution: ZERO } }) }))
    expect(method.legs.pension).toEqual({
      status: 'refused',
      engine: 'next-pound',
      problems: [{ field: 'pension.optimiser', reason: 'not-accepted' }],
    })
    // Too large for the compound engine to hold: the ISA leg refuses.
    const huge = run(
      inputs({
        lumpSum: MAX_INPUT_AMOUNT,
        horizonYears: MAX_PROJECTION_YEARS,
        growth: { low: GROWTH_RATE_BOUND, mid: GROWTH_RATE_BOUND, high: GROWTH_RATE_BOUND },
        mortgage: null,
      }),
    )
    expect(huge.legs.isa).toMatchObject({
      status: 'refused',
      engine: 'compound-interest',
      problems: [{ field: 'result', reason: 'too-large' }],
    })
  })

  it('an unverified leaf the composer reads gives the typed Refusal, naming it', () => {
    const noLimit = mapLeaves(config, (path, leaf) =>
      path === 'isa.annualLimit' || path === 'incomeTax.bands.rUK' ? { status: 'todo' } : leaf,
    )
    const r = nextPound(inputs(), noLimit, DEFAULT_POLICY) as Refusal
    expect(r).toEqual({ ok: false, taxYear: config.id, unverified: ['isa.annualLimit', 'incomeTax.bands.rUK'] })
    // With the rate entered, the bands are not read by the composer.
    const entered = nextPound(inputs({ pension: pensionInputs({ retirementTaxRate: basicRate }) }), noLimit, DEFAULT_POLICY) as Refusal
    expect(entered.unverified).toEqual(['isa.annualLimit'])
  })

  it('shared inputs refused by field give no legs', () => {
    const r = nextPound(
      inputs({ horizonYears: 0, asOf: '2026-02-30' as IsoDate, growth: { low: percent('6'), mid: percent('5'), high: percent('8') } }),
      config,
      DEFAULT_POLICY,
    ) as NextPoundProblems
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([
      { field: 'horizonYears', reason: 'below-minimum' },
      { field: 'asOf', reason: 'not-a-date' },
      { field: 'growth.mid', reason: 'out-of-order' },
    ])
  })

  it('reads no clock: the same inputs give the same result', () => {
    expect(run(inputs())).toEqual(run(inputs()))
  })
})

describe('nextPound(): words (G13, CP2)', () => {
  const words = /best|recommend/i

  it('nothing is labelled best or recommended in the types, the results or the assumptions', () => {
    // Names in the code (comments and strings blanked); the comments say only that nothing is.
    for (const f of ['types.ts', 'calc.ts']) expect(split(readFileSync(join(import.meta.dirname, f), 'utf8')).code).not.toMatch(words)
    for (const i of [
      inputs(),
      inputs({ horizonYears: 10 }),
      inputs({ lumpSum: fromPounds(20_000), pension: pensionWith({ grossPay: fromPounds(8_000) }) }),
    ])
      expect(JSON.stringify(run(i))).not.toMatch(words)
  })

  it('every result carries assumptions with no figures, naming each proposed reading', () => {
    const r = run(inputs())
    expect(r.assumptions.length).toBeGreaterThan(0)
    for (const a of r.assumptions) expect(a).not.toMatch(FIGURE)
    const named = r.assumptions.filter((a) => a.startsWith('Proposed reading, for the owner'))
    for (const cp of ['CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'CP7'])
      expect(
        named.some((a) => a.includes(`(${cp})`)),
        cp,
      ).toBe(true)
    expect(run(inputs({ lumpSum: ZERO })).assumptions).toEqual(r.assumptions)
    for (const w of [...run(inputs({ lumpSum: fromPounds(20_000), pension: pensionWith({ grossPay: fromPounds(8_000) }) })).warnings])
      if (w.source === 'next-pound') expect(w.message).not.toMatch(FIGURE)
  })
})
