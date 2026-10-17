import { describe, expect, it } from 'vitest'
import { bandScale, linearScale, niceDomain, niceStep } from './scale'

const MAX = Number.MAX_SAFE_INTEGER

describe('niceStep', () => {
  it.each<[number, number]>([
    [0.7, 1],
    [1, 1],
    [1.4, 2],
    [2.6, 5],
    [7.5, 10],
    [13, 20],
    [380, 500],
    [0.023, 0.05],
  ])('%d rounds up to %d (1, 2 or 5 times a power of ten)', (rough, step) => {
    expect(niceStep(rough)).toBeCloseTo(step, 10)
  })

  it('never goes below 1 for whole-number (pence) axes', () => {
    expect(niceStep(0.2, true)).toBe(1)
  })
})

describe('niceDomain', () => {
  it('covers the data with round ticks', () => {
    expect(niceDomain([0, 9.5])).toEqual({ min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] })
    expect(niceDomain([110_000, 259_374], { includeZero: true, integer: true })).toEqual({
      min: 0,
      max: 300_000,
      ticks: [0, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000],
    })
  })

  it('keeps zero in view when asked (bars), and not otherwise', () => {
    expect(niceDomain([40, 60]).min).toBeGreaterThan(0)
    expect(niceDomain([40, 60], { includeZero: true }).min).toBe(0)
  })

  it('handles empty data', () => {
    expect(niceDomain([])).toEqual({ min: 0, max: 1, ticks: [0, 1] })
  })

  it('ignores values that are not finite numbers', () => {
    expect(niceDomain([Number.NaN, 5, Number.POSITIVE_INFINITY, 1])).toEqual(niceDomain([5, 1]))
  })

  it('handles a single point', () => {
    expect(niceDomain([5], { includeZero: true })).toEqual({ min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5] })
    expect(niceDomain([0])).toEqual({ min: 0, max: 1, ticks: [0, 1] })
    const alone = niceDomain([500])
    expect(alone.min).toBeLessThan(500)
    expect(alone.max).toBeGreaterThan(500)
  })

  it('handles negative values on both sides of zero', () => {
    expect(niceDomain([-3, 7])).toEqual({ min: -4, max: 8, ticks: [-4, -2, 0, 2, 4, 6, 8] })
    expect(niceDomain([-50, -10], { includeZero: true })).toEqual({ min: -50, max: 0, ticks: [-50, -40, -30, -20, -10, 0] })
  })

  it('handles large ranges and keeps whole-number ticks exact and within the safe range', () => {
    const { min, max, ticks } = niceDomain([0, MAX], { integer: true, includeZero: true })
    expect(min).toBe(0)
    expect(max).toBeLessThanOrEqual(MAX)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    for (const tick of ticks) expect(Number.isSafeInteger(tick), String(tick)).toBe(true)
    expect(ticks.at(-1)).toBeLessThanOrEqual(MAX)
    const negative = niceDomain([-MAX, MAX], { integer: true })
    for (const tick of negative.ticks) expect(Number.isSafeInteger(tick), String(tick)).toBe(true)
  })

  it('keeps tick counts small', () => {
    for (const values of [
      [0, 1],
      [0, 123_456_789],
      [-1, 1],
      [3, 3.0001],
      [1e-9, 2e-9],
    ]) {
      const { ticks } = niceDomain(values)
      expect(ticks.length, String(values)).toBeLessThanOrEqual(12)
      expect(ticks.length, String(values)).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('linearScale', () => {
  it('maps the domain onto the range (inverted for SVG y)', () => {
    const y = linearScale([0, 100], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(50)).toBe(100)
    expect(y(100)).toBe(0)
  })

  it('puts everything in the middle when the domain is a single value', () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50)
  })
})

describe('bandScale', () => {
  it('splits the range into equal bands with padding', () => {
    const band = bandScale(4, [0, 400], 0.2)
    expect(band.bandwidth).toBeCloseTo(80)
    expect(band.start(0)).toBeCloseTo(10)
    expect(band.center(3)).toBeCloseTo(350)
  })

  it('copes with no bands', () => {
    expect(bandScale(0, [0, 100], 0.2).bandwidth).toBe(0)
  })
})
