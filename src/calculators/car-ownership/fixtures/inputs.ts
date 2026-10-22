import { fromPence, fromPounds, type Money, type Ratio, ratio } from '@/lib/money'
import { atRate } from '../../car-finance/fixtures/inputs'
import type { Acquisition, Car, CarOption, FuelCost, RunningCosts, Shared } from '../types'

/*
 * Inputs for the car ownership tests (test-only). Every figure is made up to
 * exercise the arithmetic; none is a market or tax figure.
 */

export const NONE = ratio(0, 1)
export const NO_RUNNING: RunningCosts = { insurance: fromPence(0), maintenance: fromPence(0), ved: fromPence(0), other: fromPence(0) }
export const FREE_FUEL: FuelCost = { kind: 'per-mile', pencePerMile: NONE }

export function car(overrides: Partial<Car> = {}): Car {
  const value = overrides.value ?? fromPounds(20_000)
  return {
    value,
    horizonValue: { low: fromPounds(8_000), expected: fromPounds(10_000), high: fromPounds(12_000) },
    annualMileage: 8_000,
    fuel: FREE_FUEL,
    fuelPriceChange: NONE,
    running: NO_RUNNING,
    generalIncrease: NONE,
    ...overrides,
  }
}

/** The same horizon value in every case. */
export const flat = (amount: Money) => ({ low: amount, expected: amount, high: amount })

export const option = (acquisition: Acquisition, carOverrides: Partial<Car> = {}): CarOption => ({ car: car(carOverrides), acquisition })

export const shared = (overrides: Partial<Shared> = {}): Shared => ({ horizonMonths: 48, savingsReturn: NONE, ...overrides })

export const KEEP: Acquisition = { kind: 'keep' }
export const CASH: Acquisition = { kind: 'cash' }

export function loanOf(
  amount: Money,
  term: number,
  rate: Ratio,
  overrides: Partial<Extract<Acquisition, { kind: 'loan' }>['finance']> = {},
): Acquisition {
  return {
    kind: 'loan',
    finance: { amount, term, pricing: atRate(rate), arrangementFee: fromPence(0), arrangementFeeTiming: 'start', ...overrides },
  }
}

export function hpOf(
  deposit: Money,
  term: number,
  rate: Ratio,
  overrides: Partial<Extract<Acquisition, { kind: 'hire-purchase' }>['finance']> = {},
): Acquisition {
  return {
    kind: 'hire-purchase',
    finance: {
      deposit,
      term,
      pricing: atRate(rate),
      arrangementFee: fromPence(0),
      arrangementFeeTiming: 'start',
      balloon: fromPence(0),
      optionFee: fromPence(0),
      ...overrides,
    },
  }
}

export function pcpOf(
  end: 'buy' | 'hand-back',
  deposit: Money,
  term: number,
  rate: Ratio,
  finalPayment: Money,
  overrides: Partial<Extract<Acquisition, { kind: 'pcp' }>['finance']> = {},
): Acquisition {
  return {
    kind: 'pcp',
    end,
    finance: {
      deposit,
      term,
      pricing: atRate(rate),
      arrangementFee: fromPence(0),
      arrangementFeeTiming: 'start',
      finalPayment,
      purchaseFee: fromPence(0),
      mileageAllowance: 30_000,
      excessPerMile: fromPence(0),
      ...overrides,
    },
  }
}

/** Mulberry32, as the finance tests. */
export { generator } from '../../car-finance/fixtures/inputs'

const whole = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

export type Kind = 'keep' | 'cash' | 'loan' | 'hire-purchase' | 'pcp-buy' | 'pcp-hand-back'
export const KINDS: readonly Kind[] = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp-buy', 'pcp-hand-back']

function randomFuel(random: () => number): FuelCost {
  const pick = random()
  if (pick < 1 / 3)
    return { kind: 'fuel', milesPerGallon: ratio(whole(random, 200, 800), 10), pencePerLitre: ratio(whole(random, 1_000, 2_000), 10) }
  if (pick < 2 / 3) {
    return {
      kind: 'electric',
      milesPerKwh: ratio(whole(random, 20, 50), 10),
      homeShare: ratio(whole(random, 0, 100), 100),
      homePencePerKwh: ratio(whole(random, 50, 400), 10),
      publicPencePerKwh: ratio(whole(random, 300, 900), 10),
    }
  }
  return { kind: 'per-mile', pencePerMile: ratio(whole(random, 0, 300), 10) }
}

const change = (random: () => number) => ratio(whole(random, -500, 1_500), 10_000)

/** A random option of the given kind and a horizon: amounts from a few hundred pounds to fifty thousand, terms to five years, horizons to eight. */
export function randomCase(random: () => number, kind: Kind): { option: CarOption; shared: Shared } {
  const value = fromPence(whole(random, 50_000, 5_000_000))
  const ends = [0, 0, 0].map(() => whole(random, 0, Math.floor((value * 3) / 2)))
  ends.sort((a, b) => a - b)
  const term = whole(random, 6, 60)
  const horizonMonths = random() < 0.2 ? term : whole(random, 1, 96)
  const rate = ratio(whole(random, 0, 1_500), 10_000)
  const fee = fromPence(random() < 0.5 ? 0 : whole(random, 1, 30_000))
  const timing = random() < 0.5 ? 'start' : 'added'
  const deposit = fromPence(whole(random, 0, Math.floor(value / 3)))
  const financed = value - deposit
  const finalPayment = fromPence(whole(random, 0, Math.floor((financed * 3) / 5)))
  let acquisition: Acquisition
  if (kind === 'keep') acquisition = KEEP
  else if (kind === 'cash') acquisition = CASH
  else if (kind === 'loan')
    acquisition = loanOf(fromPence(whole(random, Math.floor(value / 2), value)), term, rate, {
      arrangementFee: fee,
      arrangementFeeTiming: timing,
    })
  else if (kind === 'hire-purchase')
    acquisition = hpOf(deposit, term, rate, {
      arrangementFee: fee,
      arrangementFeeTiming: timing,
      balloon: random() < 0.5 ? fromPence(0) : finalPayment,
      optionFee: fromPence(whole(random, 0, 20_000)),
    })
  else
    acquisition = pcpOf(kind === 'pcp-buy' ? 'buy' : 'hand-back', deposit, term, rate, finalPayment, {
      arrangementFee: fee,
      arrangementFeeTiming: timing,
      purchaseFee: fromPence(whole(random, 0, 20_000)),
      mileageAllowance: whole(random, 0, 60_000),
      excessPerMile: fromPence(whole(random, 0, 30)),
    })
  const running: RunningCosts = {
    insurance: fromPence(random() < 0.2 ? 0 : whole(random, 0, 200_000)),
    maintenance: fromPence(whole(random, 0, 150_000)),
    ved: fromPence(whole(random, 0, 60_000)),
    other: fromPence(random() < 0.5 ? 0 : whole(random, 0, 100_000)),
  }
  return {
    option: {
      car: {
        value,
        horizonValue: { low: fromPence(ends[0]!), expected: fromPence(ends[1]!), high: fromPence(ends[2]!) },
        annualMileage: random() < 0.1 ? 0 : whole(random, 0, 30_000),
        fuel: randomFuel(random),
        fuelPriceChange: change(random),
        running,
        generalIncrease: change(random),
      },
      acquisition,
    },
    shared: { horizonMonths, savingsReturn: random() < 0.15 ? NONE : ratio(whole(random, 0, 1_000), 10_000) },
  }
}
