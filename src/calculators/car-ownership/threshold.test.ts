import { describe, expect, it } from 'vitest'
import { MAX_ANNUAL_MILEAGE, MAX_PENCE_PER_UNIT, MAX_SAVINGS_RETURN } from '@/lib/inputLimits'
import { compareExact, type ExactPence, exact, exactMul, FLIP_RATE_DENOMINATOR, fromPence, type Ratio, ratio, toPence } from '@/lib/money'
import { costPerMile, flipPoints, fuelPriceFlip, ownershipCost, pencePerLitreFor } from './calc'
import { CASH, flat, generator, KINDS, option, randomCase, randomOwingCase, shared } from './fixtures/inputs'
import type { CarOption, Flip, Lower, Shared, ValueCase } from './types'

/*
 * Session 3d-2: a flip search carries on past a tie (F53, closes
 * OQ-flip-tie), and the fuel or energy price threshold (F54). Each result is
 * checked by costing both options again with the engine at the values it
 * reports. Every figure is made up.
 */

type Pair = { a: CarOption; b: CarOption; s: Shared }

/** Which option is lower per month of coverage, exactly. */
function lower(a: CarOption, b: CarOption, s: Shared, valueCase: ValueCase): Lower {
  const ra = ownershipCost(a, s)
  const rb = ownershipCost(b, s)
  if (!ra.ok || !rb.ok) throw new Error('refused')
  const left = BigInt(toPence(ra.result.cases[valueCase].netCost)) * BigInt(rb.result.coverageMonths)
  const right = BigInt(toPence(rb.result.cases[valueCase].netCost)) * BigInt(ra.result.coverageMonths)
  return left < right ? 0 : left > right ? 1 : 'tie'
}

/** Each option's average cost per month owned, as the engine rounds it. */
function averages(a: CarOption, b: CarOption, s: Shared, valueCase: ValueCase): [number, number] {
  const ra = ownershipCost(a, s)
  const rb = ownershipCost(b, s)
  if (!ra.ok || !rb.ok) throw new Error('refused')
  return [toPence(ra.result.cases[valueCase].netCostPerCoverageMonth), toPence(rb.result.cases[valueCase].netCostPerCoverageMonth)]
}

const withMileage = (o: CarOption, miles: number): CarOption => ({ ...o, car: { ...o.car, annualMileage: miles } })
/** The option on a direct cost per mile (F21 (c)) of `perMile` pence, everything else as it is. */
const atPerMile = (o: CarOption, perMile: ExactPence): CarOption => ({
  ...o,
  car: { ...o.car, fuel: { kind: 'per-mile', pencePerMile: toRatio(perMile) } },
})
const toRatio = (amount: ExactPence): Ratio => ratio(Number(amount.numerator), Number(amount.denominator))
const rateStep = (r: Ratio, steps: number) => ratio(r.numerator * (FLIP_RATE_DENOMINATOR / r.denominator) + steps, FLIP_RATE_DENOMINATOR)
const perMileStep = (amount: ExactPence, steps: number): ExactPence => {
  const k = (amount.numerator * BigInt(FLIP_RATE_DENOMINATOR)) / amount.denominator + BigInt(steps)
  return exactMul(exact(fromPence(1)), ratio(Number(k), FLIP_RATE_DENOMINATOR))
}

const random = generator(53_053)
/** Seeded pairs over every kind, keep with finance still owed among them, until `count` satisfy `wanted`. */
function pairs(count: number, wanted: (pair: Pair) => boolean): Pair[] {
  const out: Pair[] = []
  let k = 0
  while (out.length < count) {
    const first = k % 7 === 6 ? randomOwingCase(random) : randomCase(random, KINDS[k % KINDS.length]!)
    const second = (k + 3) % 7 === 6 ? randomOwingCase(random) : randomCase(random, KINDS[(k + 3) % KINDS.length]!)
    k++
    const s = { ...first.shared, horizonMonths: Math.max(12, Math.min(first.shared.horizonMonths, 48)) }
    if (!ownershipCost(first.option, s).ok || !ownershipCost(second.option, s).ok) continue
    const pair = { a: first.option, b: second.option, s }
    if (wanted(pair)) out.push(pair)
  }
  return out
}

/** The checks every searched crossing passes (F53), with `at` costing the order at a searched value. */
function checkCrossing<T>(flip: Flip<T>, at: (value: T) => Lower, next: (value: T, steps: number) => T) {
  if (flip.kind !== 'crossing') return
  expect(at(flip.below)).toBe(flip.lowerBelow)
  expect(at(flip.above)).toBe(flip.lowerAbove)
  if (flip.lowerBelow === 'tie') return
  // Past a tie: the order above is the other option, strictly, never a tie on the way.
  expect(flip.lowerAbove).not.toBe('tie')
  expect(flip.lowerAbove).not.toBe(flip.lowerBelow)
  expect(at(next(flip.below, 1))).not.toBe(flip.lowerBelow)
  expect(at(next(flip.above, -1))).not.toBe(flip.lowerAbove)
  if (flip.level) {
    expect(flip.level.from).toEqual(next(flip.below, 1))
    expect(flip.level.to).toEqual(next(flip.above, -1))
    expect(at(flip.level.from)).toBe('tie')
    expect(at(flip.level.to)).toBe('tie')
  } else {
    expect(flip.above).toEqual(next(flip.below, 1))
  }
}

describe('a search carries on past a tie (F53)', () => {
  const s = shared({ horizonMonths: 48 })
  // Cash up front against a PCP paid monthly (as flip.test.ts): a higher return makes the cash dearer. The two are level
  // over a band of returns around the crossing, so the old search stopped there.
  const cashOption = option(CASH, { value: fromPence(2_000_000), horizonValue: flat(fromPence(1_100_000)) })
  const pairs3: Pair[] = pairs(6, ({ a, b, s: sh }) => {
    const top = { ...sh, savingsReturn: MAX_SAVINGS_RETURN }
    const zero = { ...sh, savingsReturn: ratio(0, 1) }
    const low = lower(a, b, zero, 'expected')
    const high = lower(a, b, top, 'expected')
    return low !== 'tie' && high !== 'tie' && low !== high
  })
  const banded: number[] = []

  it('the cash and PCP pair: names the option lower above the crossing, and the band where the two are level', async () => {
    const { pcpOf } = await import('./fixtures/inputs')
    const pcp = option(pcpOf('buy', fromPence(100_000), 36, ratio(3, 100), fromPence(900_000)), {
      value: fromPence(2_000_000),
      horizonValue: flat(fromPence(1_100_000)),
    })
    const outcome = flipPoints([cashOption, pcp], s, 'expected')
    if (!outcome.ok) throw new Error('refused')
    const f = outcome.result.savingsReturn
    expect(f.kind).toBe('crossing')
    if (f.kind !== 'crossing') return
    expect(f.lowerBelow).toBe(0)
    expect(f.lowerAbove).toBe(1)
    checkCrossing(f, (r) => lower(cashOption, pcp, { ...s, savingsReturn: r }, 'expected'), rateStep)
  })

  it.each(pairs3.map((pair, i) => [i, pair] as const))(
    'seeded pair %i: the savings return crossing names the option actually lower above it',
    (_i, { a, b, s: sh }) => {
      const outcome = flipPoints([a, b], sh, 'expected')
      if (!outcome.ok) throw new Error('refused')
      const f = outcome.result.savingsReturn
      // The order at the two ends of the range differs, so there is a crossing between them.
      expect(f.kind).toBe('crossing')
      checkCrossing(f, (r) => lower(a, b, { ...sh, savingsReturn: r }, 'expected'), rateStep)
      if (f.kind === 'crossing' && f.level) banded.push(_i)
    },
    20_000,
  )

  it('at least one seeded crossing passes a band where the two are level (the old search stopped in it)', () => {
    expect(banded.length).toBeGreaterThan(0)
  })

  it.each(
    pairs(4, ({ a, b, s: sh }) => {
      const low = lower(withMileage(a, 0), withMileage(b, 0), sh, 'expected')
      const high = lower(withMileage(a, MAX_ANNUAL_MILEAGE), withMileage(b, MAX_ANNUAL_MILEAGE), sh, 'expected')
      return low !== 'tie' && high !== 'tie' && low !== high
    }).map((pair, i) => [i, pair] as const),
  )(
    'seeded pair %i: the mileage crossing names the option actually lower above it',
    (_i, { a, b, s: sh }) => {
      const outcome = flipPoints([a, b], sh, 'expected')
      if (!outcome.ok) throw new Error('refused')
      const f = outcome.result.annualMileage
      expect(f.kind).toBe('crossing')
      checkCrossing(
        f,
        (miles) => lower(withMileage(a, miles), withMileage(b, miles), sh, 'expected'),
        (miles, steps) => miles + steps,
      )
    },
    20_000,
  )

  it('identical options: level throughout, no crossing', () => {
    const outcome = flipPoints([cashOption, cashOption], s, 'expected')
    expect(outcome.ok && outcome.result.savingsReturn).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 'tie' })
  })
})

describe('the fuel or energy price threshold (F54)', () => {
  const s = shared({ horizonMonths: 36 })
  // A car with dear fuel against one with none: the first's fuel cost per mile decides the order.
  const thirsty = option(CASH, {
    value: fromPence(1_000_000),
    horizonValue: flat(fromPence(500_000)),
    annualMileage: 10_000,
    fuel: { kind: 'fuel', milesPerGallon: ratio(40, 1), pencePerLitre: ratio(150, 1) },
    fuelPriceChange: ratio(5, 100),
  })
  const other = option(CASH, {
    value: fromPence(1_200_000),
    horizonValue: flat(fromPence(600_000)),
    annualMileage: 10_000,
    fuel: { kind: 'per-mile', pencePerMile: ratio(5, 1) },
  })

  const flip = (a: CarOption, b: CarOption, sh: Shared, valueCase: ValueCase = 'expected') => {
    const outcome = fuelPriceFlip([a, b], sh, valueCase)
    if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
    return outcome.result
  }
  const check = (a: CarOption, b: CarOption, sh: Shared, f: Flip<ExactPence>, valueCase: ValueCase = 'expected') => {
    checkCrossing(f, (perMile) => lower(atPerMile(a, perMile), b, sh, valueCase), perMileStep)
    if (f.kind !== 'crossing') return
    // Equal at the threshold to the engine's own penny: the two averages per month owned within a penny either side.
    for (const at of [f.below, f.above]) {
      const [x, y] = averages(atPerMile(a, at), b, sh, valueCase)
      expect(Math.abs(x - y)).toBeLessThanOrEqual(1)
    }
  }

  it('a crossing: the first is lower below it, the other above, and the two averages are equal there to the penny', () => {
    const f = flip(thirsty, other, s)
    expect(f.kind).toBe('crossing')
    if (f.kind !== 'crossing') return
    expect(f.lowerBelow).toBe(0)
    expect(f.lowerAbove).toBe(1)
    check(thirsty, other, s, f)
  })

  it('the yearly fuel price change is held as entered: with none, the threshold moves', () => {
    const flat0 = { ...thirsty, car: { ...thirsty.car, fuelPriceChange: ratio(0, 1) } }
    const withChange = flip(thirsty, other, s)
    const without = flip(flat0, other, s)
    if (withChange.kind !== 'crossing' || without.kind !== 'crossing') throw new Error('no crossing')
    expect(compareExact(withChange.above, without.above)).toBeLessThan(0)
    check(flat0, other, s, without)
  })

  it('in pence per litre for petrol or diesel: the conversion turned round, back to the same pence per mile exactly', () => {
    const f = flip(thirsty, other, s)
    if (f.kind !== 'crossing' || thirsty.car.fuel.kind !== 'fuel') throw new Error('no crossing')
    const { milesPerGallon } = thirsty.car.fuel
    const litre = pencePerLitreFor(f.above, milesPerGallon)
    expect(costPerMile({ kind: 'fuel', milesPerGallon, pencePerLitre: toRatio(litre) })).toEqual(f.above)
  })

  it('a first option driven no miles: no crossing', () => {
    const still = withMileage(thirsty, 0)
    expect(flip(still, other, s).kind).toBe('no-crossing-in-range')
  })

  it('no crossing in range when the first is lower even at the most Sumyard accepts', () => {
    const dear = option(CASH, { value: fromPence(5_000_000), horizonValue: flat(fromPence(0)), annualMileage: 10 })
    const f = flip(thirsty, dear, s)
    expect(f).toEqual({ kind: 'no-crossing-in-range', lowerThroughout: 0 })
    expect(lower(atPerMile(thirsty, exactMul(exact(fromPence(1)), MAX_PENCE_PER_UNIT)), dear, s, 'expected')).toBe(0)
  })

  it('passes on problems in either option', () => {
    const bad = option(CASH, { annualMileage: -1 })
    const outcome = fuelPriceFlip([thirsty, bad], s, 'expected')
    expect(outcome.ok ? [] : outcome.problems).toContainEqual({ field: 'annualMileage', reason: 'below-minimum', option: 1 })
  })

  const top = exactMul(exact(fromPence(1)), MAX_PENCE_PER_UNIT)
  const zero = exact(fromPence(0))
  it.each(
    pairs(8, ({ a, b, s: sh }) => {
      if (a.car.annualMileage === 0) return false
      const low = lower(atPerMile(a, zero), b, sh, 'expected')
      const high = lower(atPerMile(a, top), b, sh, 'expected')
      return low !== 'tie' && high !== 'tie' && low !== high
    }).map((pair, i) => [i, pair.a.acquisition.kind, pair] as const),
  )(
    'seeded pair %i (%s): the order changes either side of the threshold',
    (_i, _kind, { a, b, s: sh }) => {
      const f = flip(a, b, sh)
      expect(f.kind).toBe('crossing')
      check(a, b, sh, f)
    },
    20_000,
  )
})
