import type { ExactPence, FinePence, Money, Ratio } from '@/lib/money'
import type { DatedPayment } from '../car-finance/types'
import type { CarOption, ComparisonOutcome, FlipOutcome, FuelCost, OwnershipOutcome, Shared, ValueCase, ValueCurve } from './types'

/* Stubs (slice 3b, red): the tests fail on these. */

export class EngineInputError extends RangeError {
  override name = 'EngineInputError'
}

const todo = (): never => {
  throw new Error('not built')
}

export function valueCurve(_start: Money, _end: Money, _horizonMonths: number): ValueCurve {
  return todo()
}

export function costPerMile(_fuel: FuelCost): ExactPence {
  return todo()
}

export function futureValueOfFlows(_flows: readonly DatedPayment[], _annualRate: Ratio, _atMonth: number): FinePence {
  return todo()
}

export function ownershipCost(_option: CarOption, _shared: Shared): OwnershipOutcome {
  return todo()
}

export function compareOptions(_options: readonly CarOption[], _shared: Shared): ComparisonOutcome {
  return todo()
}

export function flipPoints(_options: readonly [CarOption, CarOption], _shared: Shared, _valueCase: ValueCase): FlipOutcome {
  return todo()
}
