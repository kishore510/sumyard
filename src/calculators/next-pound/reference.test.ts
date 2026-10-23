import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { requireVerified } from '@/config/tax/sourced'
import { BREAK_EVEN_RATE_DENOMINATOR, GROWTH_RATE_BOUND } from '@/lib/inputLimits'
import type { IsoDate } from '@/lib/isoDate'
import { fromPence, fromPounds, ratio, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { roundingBound, twelfth } from '../mortgage/fixtures/reference'
import { DEFAULT_POLICY } from '../optimiser/types'
import { accessAt, breakEvenRate, nextPound, pensionAfterTax } from './calc'
import { generator, inputs, mortgageInputs, pensionInputs, simpleMortgage } from './fixtures/inputs'
import {
  distance,
  exactGrowth,
  lessOrEqual,
  referenceAccess,
  referenceBreakEven,
  referenceDeflate,
  referenceGrowth,
  referenceMortgage,
  referencePensionCost,
  referenceSplit,
} from './fixtures/reference'
import type { NextPoundResult } from './types'

/*
 * The composer against its independent reference (fixtures/reference.ts):
 * exact BigInt fractions for growth, the tax split, today's money and the
 * break-even; the optimiser's own reference for the pension cost; the
 * mortgage reference's replay and closed form for the mortgage leg. The 300
 * random cases are in properties.test.ts; these are targeted ones.
 */

const config = taxYear
const own = (() => {
  const g = requireVerified(config, [
    'pension.minimumAge.current',
    'pension.minimumAge.announced',
    'pension.minimumAge.announcedFrom',
    'pension.lumpSum.taxFreeShare',
    'pension.lumpSum.allowance',
  ])
  if (!g.ok) throw new Error('refused')
  return g.values
})()
const ages = {
  current: own['pension.minimumAge.current'],
  announced: own['pension.minimumAge.announced'],
  announcedFrom: own['pension.minimumAge.announcedFrom'],
}
const BOUND = Math.floor((GROWTH_RATE_BOUND.numerator * BREAK_EVEN_RATE_DENOMINATOR) / GROWTH_RATE_BOUND.denominator)

const run = (i = inputs()): NextPoundResult => {
  const r = nextPound(i, config, DEFAULT_POLICY)
  if (!r.ok) throw new Error('refused')
  return r
}

describe('reference: closed forms', () => {
  it('growth and today’s money: project() through the composer agrees with the exact closed forms to the penny', () => {
    const random = generator(7101)
    for (let n = 0; n < 60; n++) {
      const X = fromPence(1 + Math.floor(random() * 5_000_000))
      const years = 1 + Math.floor(random() * 40)
      const rate = ratio(Math.floor(random() * 2_000) - 500, 10_000)
      const fee = ratio(Math.floor(random() * 200), 10_000)
      const inflation = ratio(Math.floor(random() * 1_000) - 200, 10_000)
      const r = run(
        inputs({
          lumpSum: X,
          horizonYears: years,
          growth: { low: rate, mid: rate, high: rate },
          feeRate: fee,
          inflationRate: inflation,
          mortgage: null,
        }),
      )
      if (r.legs.isa.status !== 'ok') throw new Error('isa refused')
      const isa = r.legs.isa.rates.mid.value
      const exact = exactGrowth(toPence(X), rate, fee, years)
      // The engine's fine fixed point and the exact value round the same way, except within a hair of a half penny.
      expect(Math.abs(toPence(isa.nominal) - referenceGrowth(toPence(X), rate, fee, years))).toBeLessThanOrEqual(1)
      expect(Math.abs(toPence(isa.todaysMoney) - referenceDeflate(exact, inflation, years))).toBeLessThanOrEqual(1)
    }
  })

  it('the tax split: tax-free down to the penny, capped; tax to the nearest penny', () => {
    const share = own['pension.lumpSum.taxFreeShare']
    const allowance = own['pension.lumpSum.allowance']
    const random = generator(7102)
    for (let n = 0; n < 500; n++) {
      const pot = fromPence(Math.floor(random() * 300_000_000))
      const available = random() < 0.2 ? ZERO : random() < 0.5 ? allowance : fromPence(Math.floor(random() * toPence(allowance)))
      const rate = ratio(Math.floor(random() * 10_001), 10_000)
      const got = pensionAfterTax(pot, share, available, rate)
      const want = referenceSplit(toPence(pot), share, toPence(available), rate)
      expect({ taxFree: toPence(got.taxFree), tax: toPence(got.tax), afterTax: toPence(got.afterTax) }).toEqual(want)
    }
  })

  it('the access age against the reference’s own calendar, across the date the age rises', () => {
    const random = generator(7103)
    for (let n = 0; n < 500; n++) {
      const asOf =
        `${2024 + Math.floor(random() * 6)}-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}` as IsoDate
      const years = 1 + Math.floor(random() * 6)
      const ageNow = ages.current - 6 + Math.floor(random() * 10)
      const scheme = random() < 0.3 ? ages.current + Math.floor(random() * 6) : null
      const got = accessAt(asOf, years, ageNow, scheme, ages)
      const want = referenceAccess(asOf, years, ageNow, scheme, ages)
      expect({ horizonDate: got.horizonDate, minimumAge: got.minimumAge, accessAge: got.accessAge, accessible: got.accessible }).toEqual(
        want,
      )
    }
    // A leap day: the horizon falls on the last day of February.
    expect(accessAt('2028-02-29', 1, 50, null, ages).horizonDate).toBe(referenceAccess('2028-02-29', 1, 50, null, ages).horizonDate)
  })

  it('break-even against the reference’s own bisection on exact growth', () => {
    const random = generator(7104)
    for (let n = 0; n < 60; n++) {
      const X = 100_000 + Math.floor(random() * 2_000_000)
      const years = 1 + Math.floor(random() * 30)
      const fee = ratio(Math.floor(random() * 150), 10_000)
      const target = Math.floor(X * (0.3 + random() * 4))
      const got = breakEvenRate(fromPence(X), fee, years, ratio(0, 1), fromPence(target))
      const want = referenceBreakEven(X, fee, years, target, BOUND, BREAK_EVEN_RATE_DENOMINATOR)
      if (want.kind !== 'rate') expect(got).toEqual({ kind: want.kind })
      else {
        if (got.kind !== 'rate') throw new Error(got.kind)
        // A closing a hair from a half penny can round apart: then the step may differ by one.
        expect(Math.abs(got.rate.numerator - want.k)).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('reference: the pension leg', () => {
  it.each(['netPay', 'salarySacrifice', 'reliefAtSource'] as const)(
    '%s: cost and pension added from the optimiser’s own reference',
    (method) => {
      for (const grossPay of [fromPounds(30_000), fromPounds(60_000), fromPounds(110_000), fromPounds(140_000)]) {
        for (const match of [ZERO, fromPounds(1_000)]) {
          const p = pensionInputs({
            optimiser: { ...pensionInputs().optimiser, grossPay, pension: { method, contribution: fromPounds(1_500) } },
            employerMatch: match,
          })
          const i = inputs({ pension: p, lumpSum: fromPounds(7_500) })
          const leg = run(i).legs.pension
          if (leg.status !== 'accessible') throw new Error(leg.status)
          const c = leg.contribution
          const ref = referencePensionCost(p.optimiser, toPence(c.extra), toPence(match), config, DEFAULT_POLICY)
          expect({ cost: toPence(c.cost), pensionAdded: toPence(c.pensionAdded) }).toEqual(ref)
          expect(ref.cost).toBeLessThanOrEqual(toPence(i.lumpSum))
          if (!c.atMaximum) {
            const more = referencePensionCost(p.optimiser, toPence(c.extra) + 1, toPence(match), config, DEFAULT_POLICY)
            expect(more.cost).toBeGreaterThan(toPence(i.lumpSum))
          }
          // The pot at the horizon and its split, from the reference's own closed forms.
          const mid = leg.rates.mid
          expect(
            Math.abs(toPence(mid.pot.nominal) - referenceGrowth(toPence(c.pensionAdded), i.growth.mid, i.feeRate, i.horizonYears)),
          ).toBeLessThanOrEqual(1)
          const split = referenceSplit(
            toPence(mid.pot.nominal),
            own['pension.lumpSum.taxFreeShare'],
            toPence(leg.allowanceAvailable),
            leg.retirementTaxRate,
          )
          expect({ taxFree: toPence(mid.taxFree), tax: toPence(mid.tax), afterTax: toPence(mid.afterTax.nominal) }).toEqual(split)
          expect(toPence(mid.value.todaysMoney)).toBe(referenceDeflate(toPence(mid.value.nominal), i.inflationRate, i.horizonYears))
        }
      }
    },
  )
})

describe('reference: the mortgage leg', () => {
  it('a single-rate, monthly-interest mortgage replayed by the mortgage reference, with and without a charge', () => {
    const random = generator(7105)
    let checked = 0
    for (let n = 0; n < 80; n++) {
      const m = simpleMortgage(random)
      const X = fromPence(1 + Math.floor(random() * 3_000_000))
      const years = 1 + Math.floor(random() * 30)
      const i = inputs({ lumpSum: X, horizonYears: years, mortgage: m })
      const leg = run(i).legs.mortgage
      if (leg.status !== 'ok') throw new Error(leg.status)
      const k = Math.min(years * MONTHS_PER_YEAR + 1, m.termMonths)
      const charge = m.erc && m.erc.allowance.kind === 'amount' ? { rate: m.erc.rate, allowance: toPence(m.erc.allowance.amount) } : null
      const { closedFormBaseline, ...ref } = referenceMortgage(toPence(X), toPence(m.balance), m.fixedRate, m.termMonths, k, charge)
      expect({
        overpayment: toPence(leg.overpayment),
        used: toPence(leg.overpaymentUsed),
        unused: toPence(leg.unused),
        erc: toPence(leg.erc),
        leftoverCash: toPence(leg.leftoverCash),
        baselineBalance: toPence(leg.baselineBalance),
        overpayingBalance: toPence(leg.overpayingBalance),
        paymentsFreed: toPence(leg.paymentsFreed),
        nominal: toPence(leg.value.nominal),
      }).toEqual(ref)
      // The replayed baseline stays within the mortgage reference's rounding bound of its closed form (before a payoff).
      if (ref.baselineBalance > 0) {
        const bound = roundingBound(twelfth(m.fixedRate.numerator, m.fixedRate.denominator), k)
        expect(lessOrEqual(distance(closedFormBaseline, ref.baselineBalance), { n: bound.n, d: bound.d })).toBe(true)
      }
      expect(toPence(leg.value.todaysMoney)).toBe(referenceDeflate(ref.nominal, i.inflationRate, years))
      checked++
    }
    expect(checked).toBe(80)
  })

  it('the leg is the overpayment used plus the interest saved to the horizon, plus the cash', () => {
    const i = inputs({ mortgage: mortgageInputs({ fixedEndMonth: 300 }) })
    const leg = run(i).legs.mortgage
    if (leg.status !== 'ok') throw new Error(leg.status)
    // Balance identity: (Bb − Bo) + freed = used + interest saved; checked through the reference replay.
    const ref = referenceMortgage(
      toPence(i.lumpSum),
      toPence(i.mortgage!.balance),
      i.mortgage!.fixedRate,
      i.mortgage!.termMonths,
      leg.horizonMonth,
      null,
    )
    expect(toPence(leg.value.nominal)).toBe(ref.nominal)
    expect(ref.nominal).toBeGreaterThanOrEqual(ref.used + ref.leftoverCash)
  })
})
