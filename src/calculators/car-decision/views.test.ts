import { describe, expect, it } from 'vitest'
import { MAX_CAR_OPTIONS, SENSITIVITY_SHIFTS } from '@/lib/inputLimits'
import { compare, divideRound, fromPence, fromPounds, mulRound, ratio, subtract, toPence, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { ownershipCost } from '../car-ownership/calc'
import type { CarOption, Shared, ValueCase } from '../car-ownership/types'
import { crossover, readout, SERIES_STYLES } from './chart'
import { type CarDecisionInputs, calculate, type OptionInputs, type PageOutcome, toEngineShared, uniqueNames } from './definition'
import { cash, electric, inputs, keep, loan, pcp, perMile } from './fixtures/inputs'
import { cardOrder } from './results'
import { DRIVERS, sensitivityOf, shiftOption } from './sensitivity'

/*
 * Slice 3c-2: the crossover chart's data, the readout at a month and the
 * sensitivity rows (chart.ts, sensitivity.ts). Every expected figure is an
 * engine call (ownershipCost); nothing is worked out here but the stated
 * shifts. Amounts and rates are made up.
 */

type Ok = Extract<PageOutcome, { kind: 'ok' }>

const ok = (i: CarDecisionInputs): Ok => {
  const outcome = calculate(i)
  if (outcome.kind !== 'ok') throw new Error(outcome.kind)
  return outcome
}

const costed = (outcome: Ok, index: number) => {
  const status = outcome.statuses[index]!
  if (status.kind !== 'ok') throw new Error(status.kind)
  return status
}

/** The engine's own run of one option, as the page costs it. */
const alone = (option: CarOption, shared: Shared) => {
  const run = ownershipCost(option, shared)
  if (!run.ok) throw new Error(JSON.stringify(run.problems))
  return run.result
}

describe('crossover data', () => {
  it('has a distinct style for each of the most options a page holds, none of them the danger colour', () => {
    expect(SERIES_STYLES.length).toBeGreaterThanOrEqual(MAX_CAR_OPTIONS)
    expect(new Set(SERIES_STYLES).size).toBe(SERIES_STYLES.length)
    expect(SERIES_STYLES).not.toContain('danger')
  })

  const example = inputs([keep(), loan(), pcp({ pcpEnd: 'hand-back', term: 36 })], { horizonMonths: 48 })

  it('months 0 to the horizon; one line per costed option in the cards’ order, named as compare names them', () => {
    const outcome = ok(example)
    const data = crossover(outcome, example)!
    expect(data.xValues).toEqual(Array.from({ length: 49 }, (_, m) => m))
    expect(data.categories[0]).toBe('Month 0')
    expect(data.categories[48]).toBe('Month 48')
    const order = cardOrder(outcome, example.valueCase, example.options.length)
    expect(data.series.map((s) => s.id)).toEqual(order.map((i) => `o${i}`))
    expect(data.series.map((s) => s.label)).toEqual(order.map((i) => uniqueNames(example.options)[i]))
    expect(data.series.map((s) => s.style)).toEqual(order.map((i) => SERIES_STYLES[i]))
    expect(data.series.every((s) => s.kind === 'line')).toBe(true)
  })

  it('each point is the engine’s cumulative net cost at that month, in the case selected', () => {
    for (const valueCase of ['low', 'expected', 'high'] as const) {
      const i = { ...example, valueCase }
      const outcome = ok(i)
      const data = crossover(outcome, i)!
      for (const s of data.series) {
        const index = Number(s.id.slice(1))
        const months = costed(outcome, index).result.cases[valueCase].months
        months.forEach((point, m) => {
          expect(point.month).toBe(m)
          expect(s.values[m]).toBe(toPence(point.netCost))
        })
      }
    }
  })

  it('a line stops at its coverage end: a PCP handed back has no point after its term, and an end marker says so', () => {
    const outcome = ok(example)
    const data = crossover(outcome, example)!
    const handed = data.series.find((s) => s.id === 'o2')!
    expect(handed.values.slice(0, 37).every((v) => v !== null)).toBe(true)
    expect(handed.values.slice(37)).toEqual(Array.from({ length: 12 }, () => null))
    expect(data.markers).toContainEqual({ x: 36, label: 'PCP: handed back at month 36' })
  })

  it('marks the horizon and each finance term inside it, in order of month', () => {
    const outcome = ok(example)
    const data = crossover(outcome, example)!
    expect(data.markers).toEqual([
      { x: 36, label: 'PCP: handed back at month 36' },
      { x: 48, label: 'Personal loan: finance term ends at month 48' },
      { x: 48, label: 'Horizon: month 48' },
    ])
    // A term past the horizon is not marked.
    const short = { ...example, horizonMonths: 24 }
    expect(crossover(ok(short), short)!.markers).toEqual([{ x: 24, label: 'Horizon: month 24' }])
  })

  it('options without results have no line; none costed, no chart', () => {
    const i = inputs([cash(), { ...cash(), value: null }])
    expect(crossover(ok(i), i)!.series.map((s) => s.id)).toEqual(['o0'])
    const none = inputs([{ ...cash(), value: null }])
    expect(crossover(ok(none), none)).toBeNull()
  })
})

describe('readout at a month', () => {
  const example = inputs([keep(), loan(), pcp({ pcpEnd: 'hand-back', term: 36 })], { horizonMonths: 48 })

  it('each option’s engine point at the month, in the cards’ order', () => {
    const outcome = ok(example)
    for (const month of [0, 1, 20, 36, 48]) {
      const rows = readout(outcome, example, month)
      expect(rows.map((r) => r.index)).toEqual(cardOrder(outcome, example.valueCase, example.options.length))
      for (const row of rows) {
        expect(row.month).toBe(month)
        const months = costed(outcome, row.index).result.cases.expected.months
        expect(row.point).toEqual(months[month] ?? null)
      }
    }
  })

  it('after a car is handed back there is no point, and the month it went back', () => {
    const rows = readout(ok(example), example, 40)
    const handed = rows.find((r) => r.index === 2)!
    expect(handed.point).toBeNull()
    expect(handed.handedBackAt).toBe(36)
    expect(rows.find((r) => r.index === 0)!.handedBackAt).toBeNull()
  })

  it('a month past the horizon reads as the horizon', () => {
    const outcome = ok(example)
    expect(readout(outcome, example, 99)).toEqual(readout(outcome, example, 48))
  })
})

describe('sensitivity', () => {
  const shared: Shared = { horizonMonths: 48, savingsReturn: percentRatio('4') }
  const engineOf = (o: OptionInputs) => ok(inputs([o])).statuses[0] as Extract<Ok['statuses'][number], { kind: 'ok' }>

  it('shifts are the brief’s: minus twenty, minus ten, plus ten and plus twenty percent', () => {
    expect(SENSITIVITY_SHIFTS).toEqual([-20, -10, 10, 20])
  })

  it('moves only its own input, by the percentage given', () => {
    const e = electric()
    const { option } = engineOf({
      ...pcp(),
      fuelMode: 'electric',
      milesPerKwh: e.milesPerKwh,
      homeShare: e.homeShare,
      homePencePerKwh: e.homePencePerKwh,
      publicPencePerKwh: e.publicPencePerKwh,
    })
    const by = (p: number) => ratio(100 + p, 100)
    for (const p of SENSITIVITY_SHIFTS) {
      // The end value in the case shown only: the other cases are not read.
      const end = shiftOption(option, shared, 'endValue', p, 'low')
      expect(end.shared).toEqual(shared)
      expect(end.option.car.horizonValue).toEqual({
        ...option.car.horizonValue,
        low: mulRound(option.car.horizonValue.low, by(p), 'nearest'),
      })
      expect({ ...end.option, car: { ...end.option.car, horizonValue: option.car.horizonValue } }).toEqual(option)

      const savings = shiftOption(option, shared, 'savingsReturn', p, 'low')
      expect(savings.option).toEqual(option)
      expect(savings.shared).toEqual({
        ...shared,
        savingsReturn: ratio(shared.savingsReturn.numerator * (100 + p), shared.savingsReturn.denominator * 100),
      })

      const miles = shiftOption(option, shared, 'annualMileage', p, 'low')
      expect(miles.shared).toEqual(shared)
      expect(miles.option.car.annualMileage).toBe(Number(divideRound(BigInt(option.car.annualMileage * (100 + p)), 100n, 'nearest')))
      expect({ ...miles.option, car: { ...miles.option.car, annualMileage: option.car.annualMileage } }).toEqual(option)

      const fuel = shiftOption(option, shared, 'fuelPrice', p, 'low')
      expect(fuel.shared).toEqual(shared)
      const scaled = (r: { numerator: number; denominator: number }) => ratio(r.numerator * (100 + p), r.denominator * 100)
      if (option.car.fuel.kind !== 'electric') throw new Error('electric expected')
      expect(fuel.option.car.fuel).toEqual({
        ...option.car.fuel,
        homePencePerKwh: scaled(option.car.fuel.homePencePerKwh),
        publicPencePerKwh: scaled(option.car.fuel.publicPencePerKwh),
      })
      expect({ ...fuel.option, car: { ...fuel.option.car, fuel: option.car.fuel } }).toEqual(option)
    }
  })

  it('the fuel price moves the price per litre for petrol or diesel and the cost per mile for that pricing', () => {
    const petrol = engineOf(cash()).option
    const own = engineOf(perMile()).option
    const moved = (o: CarOption) => shiftOption(o, shared, 'fuelPrice', 10, 'expected').option.car.fuel
    if (petrol.car.fuel.kind !== 'fuel' || own.car.fuel.kind !== 'per-mile') throw new Error('fuel kinds')
    expect(moved(petrol)).toEqual({
      ...petrol.car.fuel,
      pencePerLitre: ratio(petrol.car.fuel.pencePerLitre.numerator * 110, petrol.car.fuel.pencePerLitre.denominator * 100),
    })
    expect(moved(own)).toEqual({
      kind: 'per-mile',
      pencePerMile: ratio(own.car.fuel.pencePerMile.numerator * 110, own.car.fuel.pencePerMile.denominator * 100),
    })
  })

  it('each cell is the engine’s net cost per month of coverage with the shift, less without it; rows largest effect first', () => {
    const i = inputs([loan()])
    const status = ok(i).statuses[0]!
    if (status.kind !== 'ok') throw new Error(status.kind)
    const rows = sensitivityOf(status.option, toEngineShared(i), 'expected', status.result)
    expect(rows.map((r) => r.driver).sort()).toEqual([...DRIVERS].sort())
    for (const row of rows) {
      expect(row.cells.map((c) => c.shift)).toEqual(SENSITIVITY_SHIFTS)
      for (const cell of row.cells) {
        const moved = shiftOption(status.option, toEngineShared(i), row.driver, cell.shift, 'expected')
        const expected = subtract(
          alone(moved.option, moved.shared).cases.expected.netCostPerCoverageMonth,
          status.result.cases.expected.netCostPerCoverageMonth,
        )
        expect(cell.change).toBe(expected)
      }
    }
    const effects = rows.map((r) => r.effect)
    for (let k = 1; k < effects.length; k++) expect(compare(effects[k - 1]!, effects[k]!)).toBeGreaterThanOrEqual(0)
    for (const row of rows) {
      const sizes = row.cells.flatMap((c) => (c.change === null ? [] : [Math.abs(toPence(c.change))]))
      expect(toPence(row.effect)).toBe(Math.max(0, ...sizes))
    }
  })

  it('an end value raised past the most Sumyard models is a cell with no figure, not a guess', () => {
    // An end value at the most allowed for its price (made up: half as much again): raising it goes past the bound.
    const top = cash({ endExpected: fromPounds(27_000), endHigh: fromPounds(27_000) })
    const i = inputs([top])
    const status = ok(i).statuses[0]!
    if (status.kind !== 'ok') throw new Error(status.kind)
    const row = sensitivityOf(status.option, toEngineShared(i), 'expected', status.result).find((r) => r.driver === 'endValue')!
    expect(row.cells.find((c) => c.shift === 20)!.change).toBeNull()
    expect(row.cells.find((c) => c.shift === -20)!.change).not.toBeNull()
  })

  it('a savings return of nothing moves nothing', () => {
    const i = inputs([cash()], { savingsReturn: '0' })
    const status = ok(i).statuses[0]!
    if (status.kind !== 'ok') throw new Error(status.kind)
    const row = sensitivityOf(status.option, toEngineShared(i), 'expected', status.result).find((r) => r.driver === 'savingsReturn')!
    expect(row.cells.every((c) => c.change === ZERO)).toBe(true)
  })
})

/** A small seeded generator (mulberry32), so the property run is the same every time. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('property', () => {
  it('over 100 random valid inputs every chart point, readout row and sensitivity cell equals an engine call', () => {
    const random = seeded(3_032)
    const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
    const pounds = (lo: number, hi: number) => fromPence(int(lo * 100, hi * 100))
    const pctText = (lo: number, hi: number) => String(int(lo * 100, hi * 100) / 100)
    const kinds = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp'] as const
    const cases: ValueCase[] = ['low', 'expected', 'high']
    let checked = 0
    for (let n = 0; n < 100; n++) {
      const options = Array.from({ length: int(1, MAX_CAR_OPTIONS) }, (): OptionInputs => {
        const price = int(2_000, 40_000)
        const ends = [int(0, price), int(0, price), int(0, price)].sort((a, b) => a - b)
        const deposit = int(0, Math.floor(price / 2))
        return {
          ...cash(),
          name: `Car ${n}`,
          acquisition: kinds[int(0, kinds.length - 1)]!,
          value: fromPounds(price),
          endLow: fromPounds(ends[0]!),
          endExpected: fromPounds(ends[1]!),
          endHigh: fromPounds(ends[2]!),
          annualMileage: int(0, 20_000),
          fuelPriceChange: pctText(-5, 8),
          insurance: pounds(0, 1_500),
          maintenance: pounds(0, 1_500),
          ved: pounds(0, 600),
          other: pounds(0, 300),
          loanAmount: fromPounds(int(1, price)),
          deposit: fromPounds(deposit),
          term: int(6, 72),
          rate: pctText(0, 15),
          basis: random() < 0.5 ? 'annual' : 'monthly',
          arrangementFee: pounds(0, 300),
          arrangementFeeTiming: random() < 0.5 ? 'start' : 'added',
          balloon: fromPounds(int(0, Math.floor((price - deposit) / 3))),
          optionFee: pounds(0, 20),
          finalPayment: fromPounds(int(0, Math.floor((price - deposit) / 2))),
          purchaseFee: pounds(0, 20),
          pcpEnd: random() < 0.5 ? 'buy' : 'hand-back',
          mileageAllowance: int(0, 20_000),
          excessPerMile: int(0, 30),
        }
      })
      const i = inputs(options, {
        horizonMonths: int(1, 60),
        valueCase: cases[int(0, 2)]!,
        savingsReturn: pctText(0, 8),
        generalIncrease: pctText(-3, 8),
      })
      const outcome = ok(i)
      const shared = toEngineShared(i)
      const data = crossover(outcome, i)
      const month = int(0, i.horizonMonths)
      const rows = readout(outcome, i, month)
      for (const [index, status] of outcome.statuses.entries()) {
        if (status.kind !== 'ok') continue
        checked++
        const engine = alone(status.option, shared)
        const series = data!.series.find((s) => s.id === `o${index}`)!
        const months = engine.cases[i.valueCase].months
        expect(series.values).toEqual(
          Array.from({ length: i.horizonMonths + 1 }, (_, m) => (months[m] ? toPence(months[m]!.netCost) : null)),
        )
        expect(rows.find((r) => r.index === index)!.point).toEqual(months[month] ?? null)
        for (const row of sensitivityOf(status.option, shared, i.valueCase, engine)) {
          for (const cell of row.cells) {
            const moved = shiftOption(status.option, shared, row.driver, cell.shift, i.valueCase)
            const run = ownershipCost(moved.option, moved.shared)
            expect(cell.change).toBe(
              run.ok
                ? subtract(run.result.cases[i.valueCase].netCostPerCoverageMonth, engine.cases[i.valueCase].netCostPerCoverageMonth)
                : null,
            )
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(150)
  }, 120_000)
})
