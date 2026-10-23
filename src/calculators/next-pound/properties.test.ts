import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { requireVerified } from '@/config/tax/sourced'
import { BREAK_EVEN_RATE_DENOMINATOR, GROWTH_RATE_BOUND } from '@/lib/inputLimits'
import { add, compare, fromPence, type Money, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { DEFAULT_POLICY } from '../optimiser/types'
import { nextPound } from './calc'
import { between, generator, randomInputs } from './fixtures/inputs'
import {
  exactGrowth,
  referenceAccess,
  referenceBreakEven,
  referenceDeflate,
  referenceGrowth,
  referenceMortgage,
  referencePensionCost,
  referenceSplit,
} from './fixtures/reference'
import { type Amounts, GROWTH_CASES, type NextPoundInputs, type NextPoundResult } from './types'

/*
 * Properties over seeded random cases (Mulberry32, no new dependency): legs
 * never below nothing where defined; more X never lowers the guaranteed leg;
 * today's money never above nominal with positive inflation; and the
 * composer against the independent reference (fixtures/reference.ts) on 300
 * random cases, leg by leg.
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

const run = (i: NextPoundInputs): NextPoundResult => {
  const r = nextPound(i, config, DEFAULT_POLICY)
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r)}`)
  return r
}

/** Every amount a result defines, with where it came from. */
function amountsOf(r: NextPoundResult): [string, Amounts][] {
  const out: [string, Amounts][] = []
  const { pension, mortgage, isa } = r.legs
  if (pension.status === 'accessible')
    for (const c of GROWTH_CASES) {
      out.push([`pension ${c} pot`, pension.rates[c].pot], [`pension ${c} after tax`, pension.rates[c].afterTax])
      out.push([`pension ${c} value`, pension.rates[c].value])
    }
  if (mortgage.status === 'ok') out.push(['mortgage', mortgage.value])
  if (isa.status === 'ok') for (const c of GROWTH_CASES) out.push([`isa ${c}`, isa.rates[c].value])
  return out
}

const CASES = (() => {
  const random = generator(9301)
  return Array.from({ length: 300 }, () => randomInputs(random))
})()
const RESULTS = CASES.map(run)

// Seeded cases run the whole composer many times; CI runners are slower than the default timeout allows.
describe('properties', { timeout: 60_000 }, () => {
  it('legs are never below nothing where defined, and neither is any leftover cash', () => {
    RESULTS.forEach((r, n) => {
      for (const [where, a] of amountsOf(r)) {
        expect(toPence(a.nominal), `${n} ${where}`).toBeGreaterThanOrEqual(0)
        expect(toPence(a.todaysMoney), `${n} ${where}`).toBeGreaterThanOrEqual(0)
      }
      const { pension, mortgage } = r.legs
      if (pension.status === 'accessible' || pension.status === 'not-accessible')
        expect(toPence(pension.contribution.leftoverCash), `${n}`).toBeGreaterThanOrEqual(0)
      if (mortgage.status === 'ok') expect(toPence(mortgage.leftoverCash), `${n}`).toBeGreaterThanOrEqual(0)
    })
  })

  it('today’s money is never above nominal with positive inflation', () => {
    let positive = 0
    RESULTS.forEach((r, n) => {
      if (CASES[n]!.inflationRate.numerator <= 0) return
      positive++
      for (const [where, a] of amountsOf(r)) expect(compare(a.todaysMoney, a.nominal), `${n} ${where}`).toBeLessThanOrEqual(0)
    })
    expect(positive).toBeGreaterThan(100)
  })

  it('more X never lowers the guaranteed leg', () => {
    const random = generator(9302)
    let compared = 0
    for (let n = 0; n < 60; n++) {
      const i = randomInputs(random)
      if (i.mortgage === null) continue
      const more = { ...i, lumpSum: add(i.lumpSum, fromPence(between(random, 1, 2_000_000))) }
      const a = run(i).legs.mortgage
      const b = run(more).legs.mortgage
      if (a.status === 'nothing') continue
      if (a.status !== 'ok' || b.status !== 'ok') throw new Error('mortgage refused')
      expect(compare(b.value.nominal, a.value.nominal), `${n}`).toBeGreaterThanOrEqual(0)
      compared++
    }
    expect(compared).toBeGreaterThan(30)
  })
})

describe('the composer against the independent reference, 300 random cases', { timeout: 60_000 }, () => {
  it('pension leg: cost and pension added from the optimiser’s reference, the most within X; access, pot, split and today’s money', () => {
    let accessibleCount = 0
    RESULTS.forEach((r, n) => {
      const i = CASES[n]!
      const leg = r.legs.pension
      if (compare(i.lumpSum, ZERO) === 0) {
        expect(leg.status).toBe('nothing')
        return
      }
      if (leg.status !== 'accessible' && leg.status !== 'not-accessible') throw new Error(`${n}: ${JSON.stringify(leg)}`)
      const c = leg.contribution
      const X = toPence(i.lumpSum)
      const match = toPence(i.pension.employerMatch)
      const ref = referencePensionCost(i.pension.optimiser, toPence(c.extra), match, config, DEFAULT_POLICY)
      expect({ cost: toPence(c.cost), pensionAdded: toPence(c.pensionAdded) }, `${n}`).toEqual(ref)
      expect(ref.cost, `${n}`).toBeLessThanOrEqual(X)
      expect(toPence(c.leftoverCash)).toBe(X - ref.cost)
      if (!c.atMaximum)
        expect(referencePensionCost(i.pension.optimiser, toPence(c.extra) + 1, match, config, DEFAULT_POLICY).cost, `${n}`).toBeGreaterThan(
          X,
        )

      const access = referenceAccess(i.asOf, i.horizonYears, i.pension.ageNow!, i.pension.schemeAccessAge, ages)
      expect(
        {
          horizonDate: leg.access!.horizonDate,
          minimumAge: leg.access!.minimumAge,
          accessAge: leg.access!.accessAge,
          accessible: leg.access!.accessible,
        },
        `${n}`,
      ).toEqual(access)
      if (leg.status !== 'accessible') return
      accessibleCount++
      for (const g of GROWTH_CASES) {
        const at = leg.rates[g]
        const pot = toPence(at.pot.nominal)
        expect(
          Math.abs(pot - referenceGrowth(toPence(c.pensionAdded), i.growth[g], i.feeRate, i.horizonYears)),
          `${n} ${g}`,
        ).toBeLessThanOrEqual(1)
        const split = referenceSplit(pot, own['pension.lumpSum.taxFreeShare'], toPence(leg.allowanceAvailable), leg.retirementTaxRate)
        expect({ taxFree: toPence(at.taxFree), tax: toPence(at.tax), afterTax: toPence(at.afterTax.nominal) }, `${n} ${g}`).toEqual(split)
        expect(toPence(at.value.nominal)).toBe(split.afterTax + toPence(c.leftoverCash))
        expect(toPence(at.value.todaysMoney), `${n} ${g}`).toBe(
          referenceDeflate(toPence(at.value.nominal), i.inflationRate, i.horizonYears),
        )
      }
    })
    expect(accessibleCount).toBeGreaterThan(50)
  })

  it('mortgage leg: the reference replay, field by field', () => {
    let checked = 0
    RESULTS.forEach((r, n) => {
      const i = CASES[n]!
      const leg = r.legs.mortgage
      if (i.mortgage === null) {
        expect(leg.status).toBe(compare(i.lumpSum, ZERO) === 0 ? 'nothing' : 'none')
        return
      }
      if (compare(i.lumpSum, ZERO) === 0) return
      if (leg.status !== 'ok') throw new Error(`${n}: ${JSON.stringify(leg)}`)
      const m = i.mortgage
      const k = Math.min(i.horizonYears * MONTHS_PER_YEAR + 1, m.termMonths)
      const charge = m.erc && m.erc.allowance.kind === 'amount' ? { rate: m.erc.rate, allowance: toPence(m.erc.allowance.amount) } : null
      const { closedFormBaseline: _c, ...ref } = referenceMortgage(
        toPence(i.lumpSum),
        toPence(m.balance),
        m.fixedRate,
        m.termMonths,
        k,
        charge,
      )
      expect(
        {
          overpayment: toPence(leg.overpayment),
          used: toPence(leg.overpaymentUsed),
          unused: toPence(leg.unused),
          erc: toPence(leg.erc),
          leftoverCash: toPence(leg.leftoverCash),
          baselineBalance: toPence(leg.baselineBalance),
          overpayingBalance: toPence(leg.overpayingBalance),
          paymentsFreed: toPence(leg.paymentsFreed),
          nominal: toPence(leg.value.nominal),
        },
        `${n}`,
      ).toEqual(ref)
      expect(toPence(leg.value.todaysMoney)).toBe(referenceDeflate(ref.nominal, i.inflationRate, i.horizonYears))
      checked++
    })
    expect(checked).toBeGreaterThan(200)
  })

  it('ISA leg: exact growth and today’s money to the penny', () => {
    RESULTS.forEach((r, n) => {
      const i = CASES[n]!
      const leg = r.legs.isa
      if (compare(i.lumpSum, ZERO) === 0) {
        expect(leg.status).toBe('nothing')
        return
      }
      if (leg.status !== 'ok') throw new Error(`${n}: ${JSON.stringify(leg)}`)
      for (const g of GROWTH_CASES) {
        const exact = exactGrowth(toPence(i.lumpSum), i.growth[g], i.feeRate, i.horizonYears)
        const got = leg.rates[g].value
        expect(
          Math.abs(toPence(got.nominal) - referenceGrowth(toPence(i.lumpSum), i.growth[g], i.feeRate, i.horizonYears)),
          `${n} ${g}`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(toPence(got.todaysMoney) - referenceDeflate(exact, i.inflationRate, i.horizonYears)),
          `${n} ${g}`,
        ).toBeLessThanOrEqual(1)
      }
    })
  })

  it('break-even: the reference’s own bisection, against the mortgage and against the pension at the mid rate', () => {
    let rates = 0
    RESULTS.forEach((r, n) => {
      const i = CASES[n]!
      const X = toPence(i.lumpSum)
      const { mortgage, pension } = r.legs
      const pairs: [Money | null, (typeof r.breakEven)['mortgage']][] = [
        [mortgage.status === 'ok' ? mortgage.value.nominal : null, r.breakEven.mortgage],
        [pension.status === 'accessible' ? pension.rates.mid.value.nominal : null, r.breakEven.pension],
      ]
      for (const [target, got] of pairs) {
        if (target === null) {
          expect(got, `${n}`).toBeNull()
          continue
        }
        const want = referenceBreakEven(X, i.feeRate, i.horizonYears, toPence(target), BOUND, BREAK_EVEN_RATE_DENOMINATOR)
        if (got === null) throw new Error(`${n}: no break-even`)
        if (want.kind !== 'rate') {
          // A closing a hair from a half penny can round apart at the bound itself.
          if (got.kind === 'rate') expect(Math.abs(Math.abs(got.rate.numerator) - BOUND), `${n}`).toBeLessThanOrEqual(1)
          else expect(got.kind, `${n}`).toBe(want.kind)
          continue
        }
        if (got.kind !== 'rate') {
          expect(Math.abs(Math.abs(want.k) - BOUND), `${n} ${got.kind}`).toBeLessThanOrEqual(1)
          continue
        }
        expect(got.rate.denominator).toBe(BREAK_EVEN_RATE_DENOMINATOR)
        expect(Math.abs(got.rate.numerator - want.k), `${n}`).toBeLessThanOrEqual(1)
        rates++
      }
    })
    expect(rates).toBeGreaterThan(200)
  })
})
