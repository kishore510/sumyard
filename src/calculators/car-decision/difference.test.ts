import { describe, expect, it } from 'vitest'
import { formatPence } from '@/lib/format'
import { type ExactPence, exact, exactMul, fromPence, type Money, ratio, toPence } from '@/lib/money'
import { pencePerLitreFor } from '../car-ownership/calc'
import type { Bridge, BridgePart, Breakdown, Flip, FuelCost } from '../car-ownership/types'
import { calculate } from './definition'
import { cash, electric, hp, inputs, keep, keepOwing, loan, pcp, perMile, randomInputs, seeded } from './fixtures/inputs'
import { bridgeFor, bridgeRows, bridgeSentences, flipSentences, flipsFor, fuelFlipFor, fuelSentence, pairChoices, pairNames } from './results'

/*
 * Session 3d-2: the fuel or energy price threshold in words (F54) and where
 * the difference between two options comes from (F55), every sentence
 * generated from the engine's figures. Amounts are made up.
 */

const gbp = (amount: Money) => `£${(Math.abs(toPence(amount)) / 100).toFixed(2)}`
const names = ['A', 'B'] as const
const pence = (n: number, d = 1): ExactPence => exactMul(exact(fromPence(1)), ratio(n, d))

const PETROL: FuelCost = { kind: 'fuel', milesPerGallon: ratio(40, 1), pencePerLitre: ratio(150, 1) }
const CHARGING: FuelCost = {
  kind: 'electric',
  milesPerKwh: ratio(36, 10),
  homeShare: ratio(8, 10),
  homePencePerKwh: ratio(75, 10),
  publicPencePerKwh: ratio(65, 1),
}
const DIRECT: FuelCost = { kind: 'per-mile', pencePerMile: ratio(124, 10) }

describe('the fuel or energy price threshold in words (F54)', () => {
  const crossing: Flip<ExactPence> = { kind: 'crossing', below: pence(1_250, 100), above: pence(1_250, 100), lowerBelow: 0, lowerAbove: 1 }

  it('petrol or diesel: pence per mile, and the price per litre through the conversion turned round', () => {
    const litre = formatPence(pencePerLitreFor(pence(1_250, 100), PETROL.kind === 'fuel' ? PETROL.milesPerGallon : ratio(1, 1)), 1)
    expect(fuelSentence(crossing, PETROL, names).text).toBe(
      `A’s fuel cost per mile: below about 12.5p a mile (${litre} a litre), A has the lower average cost per month owned; ` +
        'above it, B has the lower average cost per month owned. With everything else as entered, including A’s mileage and yearly fuel price change.',
    )
  })

  it('a direct cost per mile: pence per mile only', () => {
    const text = fuelSentence(crossing, DIRECT, names).text
    expect(text).toMatch(/^A’s cost per mile: below about 12\.5p a mile, A has the lower/)
    expect(text).not.toMatch(/litre/)
  })

  it('electric: pence per mile only, and the home and public split held as entered', () => {
    const text = fuelSentence(crossing, CHARGING, names).text
    expect(text).toMatch(/^A’s energy cost per mile: below about 12\.5p a mile, A has the lower/)
    expect(text).not.toMatch(/litre|kWh/)
    expect(text).toMatch(/home and public charging together, the split held as entered/)
  })

  it('no crossing in range, as the other thresholds say it', () => {
    const text = fuelSentence({ kind: 'no-crossing-in-range', lowerThroughout: 1 }, PETROL, names).text
    expect(text).toBe(
      'A’s fuel cost per mile: no crossing in range over the range Sumyard searches; B has the lower average cost per month owned throughout, ' +
        'with everything else as entered, including A’s mileage and yearly fuel price change.',
    )
  })

  it('a band where the two are level: the option lower on each side', () => {
    const band: Flip<ExactPence> = {
      kind: 'crossing',
      below: pence(1_250_000, 100_000),
      above: pence(1_250_090, 100_000),
      lowerBelow: 1,
      lowerAbove: 0,
      level: { from: pence(1_250_001, 100_000), to: pence(1_250_089, 100_000) },
    }
    expect(fuelSentence(band, DIRECT, names).text).toMatch(
      /below about 12\.5p a mile, B has the lower .*; at about 12\.5p a mile, the two are level or pennies apart; above it, A has the lower/,
    )
  })
})

const part = (id: keyof Breakdown, shown: number): BridgePart => ({ id, exact: exact(fromPence(shown)), shown: fromPence(shown) })
const bridge = (shown: [keyof Breakdown, number][]): Bridge => {
  const ids: (keyof Breakdown)[] = [
    'interestAndFees',
    'depreciation',
    'equityHandedBack',
    'fuel',
    'insurance',
    'maintenance',
    'ved',
    'other',
    'opportunityCost',
  ]
  const parts = ids.map((id) => part(id, shown.find(([k]) => k === id)?.[1] ?? 0))
  const total = parts.reduce((sum, p) => sum + toPence(p.shown), 0)
  return { valueCase: 'expected', months: 48, total: { exact: exact(fromPence(total)), shown: fromPence(total) }, parts }
}

describe('where the difference comes from, in words (F55)', () => {
  it('the largest part, on the side of the total and more than half of it: “Most of the difference is …”', () => {
    const said = bridgeSentences(
      bridge([
        ['depreciation', 12_000],
        ['fuel', 3_000],
        ['interestAndFees', -1_000],
      ]),
      names,
      'expected',
      gbp,
    )
    expect(said.difference).toBe('A’s average cost per month owned is £140.00 a month above B’s, in the expected case.')
    expect(said.largest).toBe('Most of the difference is depreciation: £120.00 a month.')
  })

  it('below: said as below', () => {
    const said = bridgeSentences(bridge([['fuel', -5_000]]), names, 'low', gbp)
    expect(said.difference).toBe('A’s average cost per month owned is £50.00 a month below B’s, in the low case.')
    expect(said.largest).toBe('Most of the difference is fuel or energy: £50.00 a month.')
  })

  it('the largest part on the other side from the total', () => {
    const said = bridgeSentences(
      bridge([
        ['depreciation', 10_000],
        ['opportunityCost', -12_000],
        ['fuel', 4_000],
      ]),
      names,
      'expected',
      gbp,
    )
    expect(said.largest).toBe('The largest part is opportunity cost: £120.00 a month less for A, on the other side from the total.')
  })

  it('the largest part, less than half of the total', () => {
    const said = bridgeSentences(
      bridge([
        ['depreciation', 4_000],
        ['fuel', 3_000],
        ['insurance', 3_000],
      ]),
      names,
      'expected',
      gbp,
    )
    expect(said.largest).toBe('The largest part is depreciation: £40.00 a month more for A, less than half of the difference.')
  })

  it('tied largest parts are named together', () => {
    const said = bridgeSentences(
      bridge([
        ['insurance', 3_000],
        ['ved', 3_000],
      ]),
      names,
      'expected',
      gbp,
    )
    expect(said.largest).toBe('The largest parts, tied, are insurance and VED: £30.00 a month each, more for A.')
  })

  it('the same average: said as the same; every part the same: said so', () => {
    const same = bridgeSentences(bridge([]), names, 'high', gbp)
    expect(same.difference).toBe('A and B have the same average cost per month owned, in the high case.')
    expect(same.largest).toBe('Every part is the same for both.')
    const balanced = bridgeSentences(
      bridge([
        ['fuel', 2_000],
        ['depreciation', -2_000],
      ]),
      names,
      'high',
      gbp,
    )
    expect(balanced.largest).toBe('The largest parts, tied, are depreciation and fuel or energy: £20.00 a month each, one more and one less for A.')
  })

  it('rows: each part labelled as the cards label it, in the breakdown’s order, the shown figures', () => {
    const rows = bridgeRows(bridge([['ved', 1_234]]))
    expect(rows.map((r) => r.label)).toEqual([
      'Interest and fees',
      'Depreciation',
      'Equity handed back',
      'Fuel or energy',
      'Insurance',
      'Maintenance',
      'VED',
      'Other',
      'Opportunity cost',
    ])
    expect(toPence(rows.find((r) => r.id === 'ved')!.value)).toBe(1_234)
  })
})

describe('bridge and fuel threshold for a pair from the page (F55, F56)', () => {
  const four = inputs([keep({ name: 'Old' }), cash({ name: 'New' }), loan({ name: 'Loan' }), pcp({ name: 'Hand back', pcpEnd: 'hand-back', term: 24 })])

  it('the bridge for two full-coverage options; none when either is handed back before the horizon', () => {
    const outcome = calculate(four)
    const choices = pairChoices(outcome, 'expected')
    expect(choices).toEqual([0, 1, 2])
    const b = bridgeFor(outcome, four, [0, 1])!
    expect(b.parts.reduce((sum, p) => sum + toPence(p.shown), 0)).toBe(toPence(b.total.shown))
    expect(bridgeFor(outcome, four, [0, 3])).toBeNull()
  })

  it('the fuel threshold for the pair', () => {
    const two = inputs([cash({ name: 'New' }), keep({ name: 'Old' })])
    const outcome = calculate(two)
    const fuel = fuelFlipFor(outcome, two, [0, 1])!
    expect(['crossing', 'no-crossing-in-range']).toContain(fuel.kind)
  })
})

const BANNED = /\b(best|recommended|cheapest|cheaper|guaranteed|should)\b/i

describe('banned words: none in any new sentence, over seeded pages of every kind', () => {
  const random = seeded(3_402)
  const pages = Array.from({ length: 12 }, (_, n) => randomInputs(random, n, 4))
  pages.push(
    inputs([keepOwing({ name: 'Old' }), electric({ name: 'EV' }), perMile({ name: 'Per mile' }), hp({ name: 'HP' })]),
    inputs([cash({ name: 'A' }), cash({ name: 'B' })]),
  )

  it.each(pages.map((p, i) => [i, p] as const))(
    'page %i',
    (_i, page) => {
      const outcome = calculate(page)
      const choices = pairChoices(outcome, page.valueCase)
      if (choices.length < 2) return
      const pair: [number, number] = [choices[0]!, choices[1]!]
      const pairName = pairNames(page, pair)
      const texts: string[] = []
      const flips = flipsFor(outcome, page, pair)
      if (flips) texts.push(...flipSentences(flips.flips, pairName, gbp).map((s) => s.text))
      const fuel = fuelFlipFor(outcome, page, pair)
      const status = outcome.kind === 'ok' ? outcome.statuses[pair[0]]! : null
      if (fuel && status?.kind === 'ok') texts.push(fuelSentence(fuel, status.option.car.fuel, pairName).text)
      for (const p of [pair, [pair[1], pair[0]] as [number, number], [pair[0], pair[0]] as [number, number]]) {
        const b = bridgeFor(outcome, page, p)
        if (!b) continue
        const said = bridgeSentences(b, pairNames(page, p), page.valueCase, gbp)
        texts.push(said.difference, said.largest, ...bridgeRows(b).map((r) => r.label))
      }
      expect(texts.length).toBeGreaterThan(0)
      for (const text of texts) expect(text, text).not.toMatch(BANNED)
    },
    30_000,
  )
})
