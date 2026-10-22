import { fromPounds, type Money } from '@/lib/money'
import type { CarDecisionInputs, OptionInputs } from '../definition'

/*
 * Page inputs for the car decision tests (test-only; not scanned by the
 * literal guard). Every figure is made up to exercise the page; none is a
 * market, tax or VED figure.
 */

/** An option as inputs version 1 stored it: optional costs and fees could be empty (null). */
export type V1Option = Omit<
  OptionInputs,
  'insurance' | 'maintenance' | 'ved' | 'other' | 'deposit' | 'arrangementFee' | 'balloon' | 'optionFee' | 'purchaseFee' | 'excessPerMile'
> & {
  readonly insurance: Money | null
  readonly maintenance: Money | null
  readonly ved: Money | null
  readonly other: Money | null
  readonly deposit: Money | null
  readonly arrangementFee: Money | null
  readonly balloon: Money | null
  readonly optionFee: Money | null
  readonly purchaseFee: Money | null
  readonly excessPerMile: number | null
}

/** A fresh option (inputs version 2): every required box empty; optional costs and fees 0, as an empty box reads. */
export const blank = (acquisition: OptionInputs['acquisition'] = 'cash'): OptionInputs => ({
  ...blankV1(acquisition),
  insurance: fromPounds(0),
  maintenance: fromPounds(0),
  ved: fromPounds(0),
  other: fromPounds(0),
  deposit: fromPounds(0),
  arrangementFee: fromPounds(0),
  balloon: fromPounds(0),
  optionFee: fromPounds(0),
  purchaseFee: fromPounds(0),
  excessPerMile: 0,
})

/** Every field empty, as a fresh option started in inputs version 1 (3c-1), optional costs and fees included. */
export const blankV1 = (acquisition: OptionInputs['acquisition'] = 'cash'): V1Option => ({
  name: '',
  acquisition,
  value: null,
  endLow: null,
  endExpected: null,
  endHigh: null,
  annualMileage: null,
  fuelMode: 'fuel',
  milesPerGallon: null,
  pencePerLitre: null,
  milesPerKwh: null,
  homeShare: null,
  homePencePerKwh: null,
  publicPencePerKwh: null,
  pencePerMile: null,
  fuelPriceChange: null,
  insurance: null,
  maintenance: null,
  ved: null,
  other: null,
  loanAmount: null,
  deposit: null,
  term: null,
  pricing: 'rate',
  rate: null,
  basis: 'annual',
  payment: null,
  arrangementFee: null,
  arrangementFeeTiming: 'start',
  balloon: null,
  optionFee: null,
  finalPayment: null,
  purchaseFee: null,
  pcpEnd: 'buy',
  mileageAllowance: null,
  excessPerMile: null,
})

/** A complete car with petrol costs and running costs; acquisition fields empty. */
export const car = (patch: Partial<OptionInputs> = {}): OptionInputs => ({
  ...blank(),
  name: 'Car',
  value: fromPounds(18_000),
  endLow: fromPounds(8_000),
  endExpected: fromPounds(9_500),
  endHigh: fromPounds(11_000),
  annualMileage: 8_000,
  milesPerGallon: '45.5',
  pencePerLitre: '149.9',
  fuelPriceChange: '2',
  insurance: fromPounds(550),
  maintenance: fromPounds(400),
  ved: fromPounds(190),
  other: fromPounds(60),
  ...patch,
})

export const keep = (patch: Partial<OptionInputs> = {}) =>
  car({
    name: 'Keep the old car',
    acquisition: 'keep',
    value: fromPounds(6_000),
    endLow: fromPounds(1_500),
    endExpected: fromPounds(2_500),
    endHigh: fromPounds(3_200),
    milesPerGallon: '38',
    maintenance: fromPounds(900),
    ...patch,
  })

export const cash = (patch: Partial<OptionInputs> = {}) => car({ name: 'Buy outright', acquisition: 'cash', ...patch })

export const loan = (patch: Partial<OptionInputs> = {}) =>
  car({
    name: 'Personal loan',
    acquisition: 'loan',
    loanAmount: fromPounds(15_000),
    term: 48,
    rate: '7.9',
    arrangementFee: fromPounds(0),
    ...patch,
  })

export const hp = (patch: Partial<OptionInputs> = {}) =>
  car({
    name: 'Hire purchase',
    acquisition: 'hire-purchase',
    deposit: fromPounds(2_000),
    term: 48,
    rate: '8.9',
    arrangementFee: fromPounds(0),
    balloon: fromPounds(0),
    optionFee: fromPounds(0),
    ...patch,
  })

export const pcp = (patch: Partial<OptionInputs> = {}) =>
  car({
    name: 'PCP',
    acquisition: 'pcp',
    deposit: fromPounds(2_000),
    term: 36,
    rate: '9.9',
    arrangementFee: fromPounds(0),
    finalPayment: fromPounds(8_500),
    purchaseFee: fromPounds(10),
    mileageAllowance: 10_000,
    excessPerMile: 8,
    ...patch,
  })

export const electric = (patch: Partial<OptionInputs> = {}) =>
  car({
    fuelMode: 'electric',
    milesPerGallon: null,
    pencePerLitre: null,
    milesPerKwh: '3.6',
    homeShare: '80',
    homePencePerKwh: '7.5',
    publicPencePerKwh: '65',
    ...patch,
  })

export const perMile = (patch: Partial<OptionInputs> = {}) =>
  car({ fuelMode: 'per-mile', milesPerGallon: null, pencePerLitre: null, pencePerMile: '12.4', ...patch })

export const inputs = (options: OptionInputs[], patch: Partial<CarDecisionInputs> = {}): CarDecisionInputs => ({
  horizonMonths: 48,
  valueCase: 'expected',
  savingsReturn: '4',
  generalIncrease: '3',
  options,
  ...patch,
})

/** Inputs as version 1 stored them. */
export type V1Inputs = Omit<CarDecisionInputs, 'options'> & { readonly options: readonly V1Option[] }
