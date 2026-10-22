import { fromPence, fromPounds, type Money } from '@/lib/money'
import type { CarDecisionInputs, OptionInputs } from '../definition'

/*
 * Page inputs for the car decision tests (test-only; not scanned by the
 * literal guard). Every figure is made up to exercise the page; none is a
 * market, tax or VED figure.
 */

/** The fields inputs version 3 added (3e): finance still owed on a kept car. */
export type V3Field = 'owesFinance' | 'settlement' | 'owedPayment' | 'paymentsLeft' | 'owedFinalPayment'

/** An option as inputs version 2 stored it: no finance on a kept car. */
export type V2Option = Omit<OptionInputs, V3Field>

/** An option as inputs version 1 stored it: optional costs and fees could be empty (null). */
export type V1Option = Omit<
  V2Option,
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

/** A fresh option (inputs version 3): as version 2, the switch off, the settlement, payment and payments left empty, no final payment. */
export const blank = (acquisition: OptionInputs['acquisition'] = 'cash'): OptionInputs => ({
  ...blankV2(acquisition),
  owesFinance: false,
  settlement: null,
  owedPayment: null,
  paymentsLeft: null,
  owedFinalPayment: fromPounds(0),
})

/** A fresh option as inputs version 2 stored it: every required box empty; optional costs and fees 0, as an empty box reads. */
export const blankV2 = (acquisition: OptionInputs['acquisition'] = 'cash'): V2Option => ({
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

/** Keep with finance still owed: a settlement below the value, payments with some interest, a final payment. */
export const keepOwing = (patch: Partial<OptionInputs> = {}) =>
  keep({
    name: 'Keep, still paying',
    value: fromPounds(9_000),
    endLow: fromPounds(3_500),
    endExpected: fromPounds(4_500),
    endHigh: fromPounds(5_500),
    owesFinance: true,
    settlement: fromPounds(7_200),
    owedPayment: fromPounds(260),
    paymentsLeft: 24,
    owedFinalPayment: fromPounds(1_500),
    ...patch,
  })

/** An option as version 2 stored it: the version 3 fields dropped. */
export function asV2(option: OptionInputs): V2Option {
  const { owesFinance: _a, settlement: _b, owedPayment: _c, paymentsLeft: _d, owedFinalPayment: _e, ...rest } = option
  return rest
}

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

/** Inputs as version 2 stored them. */
export type V2Inputs = Omit<CarDecisionInputs, 'options'> & { readonly options: readonly V2Option[] }

/** Inputs as version 1 stored them. */
export type V1Inputs = Omit<CarDecisionInputs, 'options'> & { readonly options: readonly V1Option[] }

/*
 * The owner's page as reported for session 3d-1: Keep current car at £6,000
 * now (ends £0 / £1,000 / £2,000) against a 48-month 0% PCP at £43,000 with
 * a £13,000 deposit, a £20,000 final payment and a £10 purchase fee (ends
 * £20,000 / £22,000 / £25,000), a 0% savings return. The brief gives no
 * running costs: these are made up so the totals reproduce the owner's
 * figures (Keep £379.85 and PCP £562.11 a month, £8,748.56 apart over 48
 * months), insurance £400 and maintenance £500 a year on the kept car
 * giving the £1,599.84 and £2,000.16 the owner saw.
 */
export const OWNER_KEEP = keep({
  name: 'Current car',
  value: fromPounds(6_000),
  endLow: fromPounds(0),
  endExpected: fromPounds(1_000),
  endHigh: fromPounds(2_000),
  annualMileage: 10_000,
  fuelMode: 'per-mile',
  milesPerGallon: null,
  pencePerLitre: null,
  pencePerMile: '20',
  fuelPriceChange: '0',
  insurance: fromPounds(400),
  maintenance: fromPounds(500),
  ved: fromPounds(0),
  other: fromPounds('408.12'),
})

export const OWNER_PCP = pcp({
  name: 'New car PCP',
  value: fromPounds(43_000),
  endLow: fromPounds(20_000),
  endExpected: fromPounds(22_000),
  endHigh: fromPounds(25_000),
  annualMileage: 10_000,
  fuelMode: 'per-mile',
  milesPerGallon: null,
  pencePerLitre: null,
  pencePerMile: '8',
  fuelPriceChange: '0',
  insurance: fromPounds(600),
  maintenance: fromPounds(0),
  ved: fromPounds(0),
  other: fromPounds('92.76'),
  deposit: fromPounds(13_000),
  term: 48,
  rate: '0',
  arrangementFee: fromPounds(0),
  finalPayment: fromPounds(20_000),
  purchaseFee: fromPounds(10),
  pcpEnd: 'buy',
  mileageAllowance: 10_000,
  excessPerMile: 0,
})

export const ownerPage = (patch: Partial<CarDecisionInputs> = {}): CarDecisionInputs =>
  inputs([OWNER_KEEP, OWNER_PCP], { horizonMonths: 48, savingsReturn: '0', generalIncrease: '0', ...patch })

/** Mulberry32: a small seeded generator, so a random run is the same every time. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random valid page inputs (one to `most` options of any kind), as the page property test makes them. */
export function randomInputs(random: () => number, n: number, most: number): CarDecisionInputs {
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
  const pounds = (lo: number, hi: number) => fromPence(int(lo * 100, hi * 100))
  const pctText = (lo: number, hi: number) => String(int(lo * 100, hi * 100) / 100)
  const kinds = ['keep', 'cash', 'loan', 'hire-purchase', 'pcp'] as const
  const cases = ['low', 'expected', 'high'] as const
  const options = Array.from({ length: int(1, most) }, (): OptionInputs => {
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
  return inputs(options, {
    horizonMonths: int(1, 60),
    valueCase: cases[int(0, 2)]!,
    savingsReturn: random() < 0.2 ? '0' : pctText(0, 8),
    generalIncrease: pctText(-3, 8),
  })
}
