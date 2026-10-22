import { SENSITIVITY_SHIFTS } from '@/lib/inputLimits'
import { compare, divideRound, type Money, mulRound, type Ratio, ratio, subtract, ZERO } from '@/lib/money'
import { ownershipCost } from '../car-ownership/calc'
import type { CarOption, FuelCost, OwnershipResult, Shared, ValueCase } from '../car-ownership/types'

/*
 * The car decision's sensitivity view (slice 3c-2): for one option, how its
 * net cost per month of coverage changes when one input moves by each of
 * SENSITIVITY_SHIFTS percent, one at a time, every other input held at its
 * current value. Each change is the engine's own figure (ownershipCost
 * rerun with the moved input) less the engine's figure without the move:
 * no new formula. A move that takes an input past what the engine models
 * has no figure. No UI.
 */

export type Driver = 'endValue' | 'savingsReturn' | 'annualMileage' | 'fuelPrice'
export const DRIVERS: readonly Driver[] = ['endValue', 'savingsReturn', 'annualMileage', 'fuelPrice']

/** The whole, as a percentage: a shift of p percent multiplies by (this + p) / this. */
const WHOLE = 100

const factorOf = (shift: number) => ratio(WHOLE + shift, WHOLE)
/** A rate or price moved by a percentage, exactly. */
const scaled = (r: Ratio, shift: number) => ratio(r.numerator * (WHOLE + shift), r.denominator * WHOLE)

function movedFuel(fuel: FuelCost, shift: number): FuelCost {
  switch (fuel.kind) {
    case 'fuel':
      return { ...fuel, pencePerLitre: scaled(fuel.pencePerLitre, shift) }
    case 'electric':
      return { ...fuel, homePencePerKwh: scaled(fuel.homePencePerKwh, shift), publicPencePerKwh: scaled(fuel.publicPencePerKwh, shift) }
    case 'per-mile':
      return { ...fuel, pencePerMile: scaled(fuel.pencePerMile, shift) }
  }
}

/**
 * One input moved by `shift` percent, the rest unchanged: the end value in the case shown (to the nearest penny), the
 * savings return, the annual mileage (to the nearest whole mile) or the fuel or energy price (each price the fuel type
 * uses).
 */
export function shiftOption(
  option: CarOption,
  shared: Shared,
  driver: Driver,
  shift: number,
  valueCase: ValueCase,
): { option: CarOption; shared: Shared } {
  const car = option.car
  switch (driver) {
    case 'endValue': {
      const horizonValue = { ...car.horizonValue, [valueCase]: mulRound(car.horizonValue[valueCase], factorOf(shift), 'nearest') }
      return { option: { ...option, car: { ...car, horizonValue } }, shared }
    }
    case 'savingsReturn':
      return { option, shared: { ...shared, savingsReturn: scaled(shared.savingsReturn, shift) } }
    case 'annualMileage': {
      const miles = Number(divideRound(BigInt(car.annualMileage) * BigInt(WHOLE + shift), BigInt(WHOLE), 'nearest'))
      return { option: { ...option, car: { ...car, annualMileage: miles } }, shared }
    }
    case 'fuelPrice':
      return { option: { ...option, car: { ...car, fuel: movedFuel(car.fuel, shift) } }, shared }
  }
}

export interface Cell {
  readonly shift: number
  /** The engine's net cost per month of coverage with the move, less without it; null when the move is past a bound. */
  readonly change: Money | null
}

export interface DriverRow {
  readonly driver: Driver
  readonly cells: readonly Cell[]
  /** The largest size of change in the row (nothing when none has a figure). */
  readonly effect: Money
}

const size = (amount: Money) => (compare(amount, ZERO) < 0 ? subtract(ZERO, amount) : amount)

/** Every driver's row for one option, the largest effect first (ties in the drivers' order). `base` is the engine's result without a move. */
export function sensitivityOf(option: CarOption, shared: Shared, valueCase: ValueCase, base: OwnershipResult): DriverRow[] {
  const before = base.cases[valueCase].netCostPerCoverageMonth
  const rows = DRIVERS.map((driver): DriverRow => {
    const cells = SENSITIVITY_SHIFTS.map((shift): Cell => {
      const moved = shiftOption(option, shared, driver, shift, valueCase)
      const run = ownershipCost(moved.option, moved.shared)
      return { shift, change: run.ok ? subtract(run.result.cases[valueCase].netCostPerCoverageMonth, before) : null }
    })
    const effect = cells.reduce(
      (most, cell) => (cell.change !== null && compare(size(cell.change), most) > 0 ? size(cell.change) : most),
      ZERO,
    )
    return { driver, cells, effect }
  })
  return rows.sort((a, b) => compare(b.effect, a.effect))
}
