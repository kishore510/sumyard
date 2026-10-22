import type { Money } from '@/lib/money'
import type { CarOption, OwnershipResult, Shared, ValueCase } from '../car-ownership/types'

/* Stub (3c-2 red): the sensitivity rows. */

export type Driver = 'endValue' | 'savingsReturn' | 'annualMileage' | 'fuelPrice'
export const DRIVERS: readonly Driver[] = ['endValue', 'savingsReturn', 'annualMileage', 'fuelPrice']

export function shiftOption(option: CarOption, shared: Shared, _driver: Driver, _shift: number, _valueCase: ValueCase) {
  return { option, shared }
}

export interface Cell {
  readonly shift: number
  readonly change: Money | null
}

export interface DriverRow {
  readonly driver: Driver
  readonly cells: readonly Cell[]
  readonly effect: Money
}

export function sensitivityOf(_option: CarOption, _shared: Shared, _valueCase: ValueCase, _base: OwnershipResult): DriverRow[] {
  return []
}
