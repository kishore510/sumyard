import { describe, expect, it } from 'vitest'
import { fromPence, type Money, ratio, toPence } from '@/lib/money'
import type { FlipPoints } from '../car-ownership/types'
import { calculate } from './definition'
import { cash, inputs, keep } from './fixtures/inputs'
import { flipSentences, flipsFor } from './results'

/*
 * Session 3d-1.1: "What changes the answer" in words when the engine's
 * search stops on a tie. The engine reports the first change of order
 * (F29); with the opportunity cost rounded to the penny, the two options can
 * be level over a narrow band of savings returns around a crossing, and the
 * first change found is into that band. Amounts are made up.
 */

const gbp = (amount: Money) => `£${(toPence(amount) / 100).toFixed(2)}`
const names = ['A', 'B'] as const

const flips = (savingsReturn: FlipPoints['savingsReturn'], annualMileage: FlipPoints['annualMileage'] = noCrossing): FlipPoints => ({
  valueCase: 'expected',
  horizonValue: [noCrossingValue, noCrossingValue],
  savingsReturn,
  annualMileage,
})
const noCrossing = { kind: 'no-crossing-in-range', lowerThroughout: 0 } as const
const noCrossingValue = { kind: 'no-crossing-in-range', lowerThroughout: 0 } as const

const sentence = (f: FlipPoints, id: string) => flipSentences(f, names, gbp).find((s) => s.id === id)!.text

describe('a crossing past a band where the two are level (3d-2, F53)', () => {
  it('names the option lower on each side; neighbours that show the same read as one threshold, level there', () => {
    const f = flips({
      kind: 'crossing',
      below: ratio(48_000_408, 1_000_000_000),
      above: ratio(48_000_609, 1_000_000_000),
      lowerBelow: 1,
      lowerAbove: 0,
      level: { from: ratio(48_000_409, 1_000_000_000), to: ratio(48_000_608, 1_000_000_000) },
    })
    expect(sentence(f, 'savings')).toBe(
      'Savings return: below about 4.8% a year, B has the lower average cost per month owned; at about 4.8% a year, the two are level or pennies apart; ' +
        'above it, A has the lower average cost per month owned. With everything else as entered.',
    )
  })

  it('a band that shows as a range is said as a range, from and to', () => {
    const f = flips(noCrossing, {
      kind: 'crossing',
      below: 12_000,
      above: 12_004,
      lowerBelow: 0,
      lowerAbove: 1,
      level: { from: 12_001, to: 12_003 },
    })
    expect(sentence(f, 'mileage')).toBe(
      'If both cars are driven the same distance, as one driver: annual mileage: up to about 12,000 miles a year, A has the lower average cost per month owned; ' +
        'from about 12,001 miles a year to about 12,003 miles a year, the two are level or pennies apart; from about 12,004 miles a year, B has the lower average cost per month owned. ' +
        'With everything else as entered.',
    )
  })

  it('a clean crossing still names the option lower on each side', () => {
    const f = flips({ kind: 'crossing', below: ratio(3, 100), above: ratio(3, 100), lowerBelow: 0, lowerAbove: 1 })
    expect(sentence(f, 'savings')).toBe(
      'Savings return: below about 3% a year, A has the lower average cost per month owned; above it, B has the lower average cost per month owned. With everything else as entered.',
    )
  })

  it('a pair level from the start of the range, then one lower: said as it is', () => {
    const f = flips({ kind: 'crossing', below: ratio(0, 1), above: ratio(1, 1_000_000_000), lowerBelow: 'tie', lowerAbove: 0 })
    expect(sentence(f, 'savings')).toMatch(/the two are level; above it, A has the lower/)
  })
})

/*
 * OQ-flip-tie (closed in 3d-2, F53): the engine's search used to stop at the
 * first change of order, which near a crossing is often into a band of
 * savings returns where the two penny-rounded totals are level. It now
 * carries on past the band to the option lower above it.
 */
describe('the engine’s savings return search past a tie', () => {
  // Found by a seeded random search (seed 7, case 6); the order is B lower up to about 4.8% and A lower from 5%.
  const i = inputs(
    [
      cash({
        name: 'A',
        value: fromPence(513_000),
        endLow: fromPence(43_800),
        endExpected: fromPence(195_500),
        endHigh: fromPence(404_900),
        annualMileage: 9_951,
        fuelPriceChange: '-3.62',
        insurance: fromPence(72_402),
        maintenance: fromPence(65_573),
        ved: fromPence(32_656),
        other: fromPence(5_040),
      }),
      keep({
        name: 'B',
        value: fromPence(605_600),
        endLow: fromPence(156_100),
        endExpected: fromPence(420_000),
        endHigh: fromPence(598_600),
        annualMileage: 10_319,
        milesPerGallon: '45.5',
        fuelPriceChange: '0.54',
        insurance: fromPence(116_880),
        maintenance: fromPence(24_340),
        ved: fromPence(44_469),
        other: fromPence(5_113),
      }),
    ],
    { horizonMonths: 36, valueCase: 'high', savingsReturn: '0.55', generalIncrease: '3.27' },
  )

  it('OQ-flip-tie: a reported crossing names the option lower above it, not a tie on the way', () => {
    const found = flipsFor(calculate(i), i, [0, 1])!.flips.savingsReturn
    expect(found).toMatchObject({ kind: 'crossing', lowerBelow: 1, lowerAbove: 0 })
  })
})
