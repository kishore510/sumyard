import { describe, expect, it } from 'vitest'
import { compareOptions, flipPoints, ownershipCost } from './calc'
import * as before from './fixtures/before3e'
import { generator, KINDS, randomCase } from './fixtures/inputs'
import type { CarOption, Shared, ValueCase } from './types'

/*
 * Session 3e adds finance still owed on a kept car. Without it, every result
 * must be bit-identical to the engine before 3e (fixtures/before3e.ts, a
 * frozen copy): one option, a comparison and flip points, on seeded random
 * options of every kind, refusals included.
 */

const random = generator(3_500)
const singles = Array.from({ length: 240 }, (_, i) => randomCase(random, KINDS[i % KINDS.length]!))

describe('one option: identical to the engine before 3e', () => {
  it.each(singles.map((c, i) => [i, c.option.acquisition.kind, c] as const))('case %i (%s)', (_i, _k, { option, shared }) => {
    expect(ownershipCost(option, shared)).toEqual(before.ownershipCost(option, shared))
  })
})

const groups = Array.from({ length: 40 }, () => {
  const count = 2 + Math.floor(random() * 3)
  const first = randomCase(random, KINDS[Math.floor(random() * KINDS.length)]!)
  const options: CarOption[] = [first.option]
  while (options.length < count) options.push(randomCase(random, KINDS[Math.floor(random() * KINDS.length)]!).option)
  return { options, shared: first.shared }
})

describe('a comparison: identical to the engine before 3e', () => {
  it.each(groups.map((g, i) => [i, g] as const))('group %i', (_i, { options, shared }) => {
    expect(compareOptions(options, shared)).toEqual(before.compareOptions(options, shared))
  })
})

const CASES: readonly ValueCase[] = ['low', 'expected', 'high']
const pairs: { options: [CarOption, CarOption]; shared: Shared; valueCase: ValueCase }[] = groups.slice(0, 6).map((g, i) => ({
  options: [g.options[0]!, g.options[1]!],
  shared: { ...g.shared, horizonMonths: Math.min(g.shared.horizonMonths, 36) },
  valueCase: CASES[i % 3]!,
}))

describe('flip points: identical to the engine before 3e', () => {
  it.each(pairs.map((p, i) => [i, p] as const))(
    'pair %i',
    (_i, { options, shared, valueCase }) => {
      expect(flipPoints(options, shared, valueCase)).toEqual(before.flipPoints(options, shared, valueCase))
    },
    20_000,
  )
})
