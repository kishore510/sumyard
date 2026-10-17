/*
 * FAKE TAX YEARS, FOR TESTS ONLY.
 *
 * Every value, source URL and date in this file is made up. None is a real
 * tax rate, threshold, allowance or date, and none may be copied into a real
 * config. The years (2096-97 to 2098-99) are far in the future so they can
 * never be mistaken for a real one. The app never imports this file:
 * src/config/tax/configs.test.ts fails if anything but a test does, and the
 * build check fails if its marker reaches dist/.
 */

import { fromPounds, ratio, ZERO } from '@/lib/money'
import { taxYear as skeleton } from '../2026-27'
import { type FieldKind, TAX_FIELDS, type TaxYearConfig, type TaxYearId } from '../schema'
import { mapLeaves, type Sourced } from '../sourced'

/** In every fake source URL, so the build check can prove none reached the bundle. */
export const FAKE_MARKER = 'sumyard-fake-fixture'

export const FAKE_VERIFIED_ON = '2098-01-02'

const kindOf = new Map<string, FieldKind>(TAX_FIELDS.map((f) => [f.path, f.kind]))

/** A made-up value of the right kind for each field. */
export function fakeValue(path: string, index: number): unknown {
  switch (kindOf.get(path)) {
    case 'money':
      return fromPounds(1111 * (index + 1))
    case 'ratio':
      return ratio(index + 1, 1000)
    case 'count':
      return 3
    case 'date':
      return path.endsWith('start') ? '2098-01-01' : '2098-12-31'
    case 'bands':
      return [
        { name: 'Fake band A', from: ZERO, rate: ratio(11, 100) },
        { name: 'Fake band B', from: fromPounds(4321), rate: ratio(33, 100) },
      ]
    default:
      throw new Error(`fakeValue: unknown field ${path}`)
  }
}

export function fakeVerified(path: string, index: number): Sourced<unknown> {
  return {
    status: 'verified',
    value: fakeValue(path, index),
    sourceUrl: `https://www.gov.uk/${FAKE_MARKER}/${path}`,
    verifiedOn: FAKE_VERIFIED_ON,
  }
}

/** The skeleton's structure with a new id, each leaf chosen by `leaf`. */
export function fakeYear(id: TaxYearId, leaf: (path: string, index: number) => Sourced<unknown>): TaxYearConfig {
  let index = 0
  return { ...mapLeaves(skeleton, (path) => leaf(path, index++)), id }
}

/** Every value verified (with fake values). */
export const FAKE_VERIFIED_YEAR = fakeYear('2098-99', fakeVerified)

/** Only the personal allowance group verified. */
export const FAKE_PARTIAL_YEAR = fakeYear('2097-98', (path, index) =>
  path.startsWith('incomeTax.') && !path.startsWith('incomeTax.bands') ? fakeVerified(path, index) : { status: 'todo' },
)

/** Nothing verified, like the skeleton. */
export const FAKE_TODO_YEAR = fakeYear('2096-97', () => ({ status: 'todo' }))
