import { describe, expect, it } from 'vitest'
import { MAX_FINANCE_TERM_MONTHS, MAX_INPUT_AMOUNT } from '@/lib/inputLimits'
import { fromPence, fromPounds, type Money, ratio, toPence } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { closedFormBalance, compareFraction, frac, presentValue } from '../car-finance/fixtures/reference'
import { compareOptions, flipPoints, ownershipCost } from './calc'
import { CASH, flat, generator, keepOwing, NONE, option, randomOwingCase, shared } from './fixtures/inputs'
import { reference } from './fixtures/reference'
import type { Acquisition, Breakdown, CarOption, OwnershipResult, Shared } from './types'

/*
 * Keeping a car with finance still owed (session 3e, decisions F43 to F52 in
 * docs/modelling-decisions-car.md). Fixtures (a) to (f) from the brief, the
 * refusals, the independent reference (fixtures/reference.ts, own arithmetic
 * for the cash flows and the sale given up) and properties on seeded random
 * cases. Every figure is made up to exercise the arithmetic.
 */

const pence = (amount: Money) => toPence(amount)
const RUNNING: readonly (keyof Breakdown)[] = ['fuel', 'insurance', 'maintenance', 'ved', 'other']
const running = (b: Breakdown) => RUNNING.reduce((a, k) => a + pence(b[k]), 0)
const sumBreakdown = (b: Breakdown) =>
  [b.depreciation, b.interestAndFees, b.equityHandedBack, b.fuel, b.insurance, b.maintenance, b.ved, b.other, b.opportunityCost].reduce(
    (a, x) => a + pence(x),
    0,
  )

function cost(acquisition: Acquisition, value: Money, end: Money, horizonMonths: number, savings = NONE): OwnershipResult {
  const outcome = ownershipCost(option(acquisition, { value, horizonValue: flat(end) }), shared({ horizonMonths, savingsReturn: savings }))
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const problems = (acquisition: Acquisition, value = fromPounds(12_000)) => {
  const outcome = ownershipCost(option(acquisition, { value }), shared())
  return outcome.ok ? [] : outcome.problems
}

describe('(a) zero interest: value 12,000, settlement 10,800, 24 payments of 450, no final payment', () => {
  const r = cost(keepOwing(fromPounds(10_800), fromPounds(450), 24), fromPounds(12_000), fromPounds(6_000), 48)
  const c = r.cases.expected

  it('implies a rate of nothing', () => {
    expect(r.finance).not.toBeNull()
    expect(r.finance!.monthlyRate).toEqual(ratio(0, 1))
    expect(r.finance!.effectiveRate).toMatchObject({ ok: true, annual: ratio(0, 1) })
  })

  it('gives up a sale of the value less the settlement, and pays nothing upfront', () => {
    expect(pence(r.forgoneSale)).toBe(pence(fromPounds(1_200)))
    expect(pence(r.timeline[0]!.acquisition)).toBe(0)
  })

  it('net cost is depreciation only: no finance cost', () => {
    expect(pence(c.breakdown.interestAndFees)).toBe(0)
    expect(pence(c.breakdown.depreciation)).toBe(pence(fromPounds(6_000)))
    expect(pence(c.netCost)).toBe(pence(fromPounds(6_000)))
    expect(pence(c.cashOut)).toBe(pence(fromPounds(10_800)))
  })

  it('the balance falls by each payment, nothing after the last; net cost at month 0 is nothing', () => {
    c.months.forEach((m) => {
      expect(pence(m.balance)).toBe(m.month < 24 ? pence(fromPounds(10_800)) - m.month * pence(fromPounds(450)) : 0)
    })
    expect(pence(c.months[0]!.netCost)).toBe(0)
    expect(pence(c.months[0]!.equity)).toBe(pence(fromPounds(1_200)))
  })
})

describe('(b) payments below the settlement: refused, naming the monthly payment', () => {
  it('24 x 400 against 10,000', () => {
    expect(problems(keepOwing(fromPounds(10_000), fromPounds(400), 24))).toEqual([
      { field: 'monthlyPayment', reason: 'below-minimum', option: 0 },
    ])
  })

  it('in a comparison, under the option', () => {
    const outcome = compareOptions([option(CASH), option(keepOwing(fromPounds(10_000), fromPounds(400), 24))], shared())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.problems).toEqual([{ field: 'monthlyPayment', reason: 'below-minimum', option: 1 }])
  })
})

describe('(c) settlement above the value: allowed, negative equity now', () => {
  const r = cost(keepOwing(fromPounds(10_000), fromPounds(320), 36), fromPounds(8_000), fromPounds(4_000), 48, ratio(4, 100))
  const c = r.cases.expected

  it('the sale given up is negative; equity at month 0 is negative and the net cost nothing', () => {
    expect(pence(r.forgoneSale)).toBe(-pence(fromPounds(2_000)))
    expect(pence(c.months[0]!.equity)).toBe(-pence(fromPounds(2_000)))
    expect(pence(c.months[0]!.netCost)).toBe(0)
  })

  it('the negative sale given up is compounded like any other flow (the reference agrees)', () => {
    const optionC = option(keepOwing(fromPounds(10_000), fromPounds(320), 36), {
      value: fromPounds(8_000),
      horizonValue: flat(fromPounds(4_000)),
    })
    const ref = reference(optionC, shared({ savingsReturn: ratio(4, 100) }), r.finance)
    expect(BigInt(pence(r.forgoneSale))).toBe(ref.forgone)
    c.months.forEach((m, k) => {
      if (!ref.cases.expected.opportunity[k]!.nearHalf)
        expect(BigInt(pence(m.opportunityCost))).toBe(ref.cases.expected.opportunity[k]!.pence)
    })
  })
})

describe('(d) the term ends inside the horizon', () => {
  const S = fromPounds(9_000)
  const p = fromPounds(600)
  const final = fromPounds(2_000)
  const r = cost(keepOwing(S, p, 12, final), fromPounds(15_000), fromPounds(9_000), 48)
  const c = r.cases.expected

  it('the final payment is paid with the last payment; nothing is owed afterwards', () => {
    expect(pence(r.timeline[12]!.acquisition)).toBe(pence(p) + pence(final))
    expect(r.timeline.slice(13).every((m) => pence(m.acquisition) === 0)).toBe(true)
    expect(c.months.slice(12).every((m) => pence(m.balance) === 0)).toBe(true)
    expect(pence(c.months[11]!.balance)).toBeGreaterThan(pence(final))
  })

  it('zero savings return: net cost less running costs = depreciation + total paid − settlement', () => {
    const paid = 12 * pence(p) + pence(final)
    expect(pence(c.breakdown.interestAndFees)).toBe(paid - pence(S))
    expect(pence(c.netCost) - running(c.breakdown)).toBe(pence(fromPounds(6_000)) + paid - pence(S))
    expect(r.fullCoverage).toBe(true)
  })
})

describe('(e) the horizon ends inside the term, a final payment still owed', () => {
  const S = fromPounds(14_000)
  const p = fromPounds(300)
  const final = fromPounds(5_000)
  const r = cost(keepOwing(S, p, 36, final), fromPounds(16_000), fromPounds(10_000), 24)
  const c = r.cases.expected
  const end = c.months.at(-1)!

  it('payments stop at the horizon; the final payment is not paid', () => {
    expect(r.timeline.slice(1).every((m) => pence(m.acquisition) === pence(p))).toBe(true)
    expect(pence(c.cashOut)).toBe(24 * pence(p))
  })

  it('equity at the horizon is the value less the balance still owed', () => {
    expect(pence(end.balance)).toBeGreaterThan(pence(final))
    expect(pence(end.equity)).toBe(pence(fromPounds(10_000)) - pence(end.balance))
  })

  it('the balance matches the exact amortisation at the implied rate within a penny a month', () => {
    const i = frac(BigInt(r.finance!.monthlyRate.numerator), BigInt(r.finance!.monthlyRate.denominator))
    const exact = closedFormBalance(BigInt(pence(S)), i, 24, BigInt(pence(p)))
    const diff = BigInt(pence(end.balance)) * exact.d - exact.n
    expect(diff < 0n ? -diff : diff).toBeLessThanOrEqual(24n * exact.d)
  })

  it('zero savings return: net cost less running costs = depreciation + paid − settlement + balance still owed', () => {
    expect(pence(c.netCost) - running(c.breakdown)).toBe(pence(fromPounds(6_000)) + 24 * pence(p) - pence(S) + pence(end.balance))
  })
})

describe('(f) with interest, against an independent reference', () => {
  const S = fromPence(1_234_567)
  const p = fromPence(31_999)
  const final = fromPence(250_000)
  const n = 36
  const value = fromPence(1_500_000)
  const end = fromPence(700_000)
  const r = cost(keepOwing(S, p, n, final), value, end, 48)
  const c = r.cases.expected

  it('the implied rate discounts the payments back to the settlement', () => {
    const i = frac(BigInt(r.finance!.monthlyRate.numerator), BigInt(r.finance!.monthlyRate.denominator))
    const flows = Array.from({ length: n }, (_, k) => BigInt(pence(p)) + (k === n - 1 ? BigInt(pence(final)) : 0n))
    const pv = presentValue(flows, i)
    // Within a penny of the settlement: the solver's tolerance is far finer.
    expect(compareFraction(pv, frac(BigInt(pence(S)) + 1n))).toBeLessThan(0)
    expect(compareFraction(pv, frac(BigInt(pence(S)) - 1n))).toBeGreaterThan(0)
    expect(r.finance!.monthlyRate.numerator).toBeGreaterThan(0)
  })

  it('net cost less running costs = depreciation + (payments + final payment − settlement), by own arithmetic', () => {
    const own = pence(value) - pence(end) + (n * pence(p) + pence(final) - pence(S))
    expect(pence(c.netCost) - running(c.breakdown)).toBe(own)
    expect(pence(c.breakdown.depreciation)).toBe(pence(value) - pence(end))
    expect(pence(c.breakdown.interestAndFees)).toBe(n * pence(p) + pence(final) - pence(S))
  })

  it('the engine agrees with the reference month by month', () => {
    const o = option(keepOwing(S, p, n, final), { value, horizonValue: flat(end) })
    const ref = reference(o, shared({ horizonMonths: 48 }), r.finance)
    expect(r.timeline.map((m) => BigInt(pence(m.acquisition)))).toEqual(ref.acquisition)
    expect(c.months.map((m) => BigInt(pence(m.balance)))).toEqual(ref.balance)
    expect(BigInt(pence(r.forgoneSale))).toBe(ref.forgone)
  })
})

describe('refusals (F50): typed, naming the field, no number', () => {
  const S = fromPounds(5_000)
  const p = fromPounds(200)
  it.each([
    ['zero payments left with a monthly payment', keepOwing(S, p, 0), 'paymentsLeft', 'below-minimum'],
    ['zero payments left and no monthly payment', keepOwing(S, fromPence(0), 0, S), 'paymentsLeft', 'below-minimum'],
    ['payments left not whole', keepOwing(S, p, 1.5), 'paymentsLeft', 'not-whole'],
    ['payments left over the bound', keepOwing(S, p, MAX_FINANCE_TERM_MONTHS + 1), 'paymentsLeft', 'above-maximum'],
    ['a negative settlement', keepOwing(fromPence(-1), p, 24), 'settlement', 'below-minimum'],
    ['a settlement over the input limit', keepOwing(fromPence(pence(MAX_INPUT_AMOUNT) + 1), p, 24), 'settlement', 'above-maximum'],
    ['a settlement of nothing', keepOwing(fromPence(0), p, 24), 'settlement', 'below-minimum'],
    ['a monthly payment not in pence', keepOwing(S, 12.5 as Money, 24), 'monthlyPayment', 'not-money'],
    ['a monthly payment over the input limit', keepOwing(S, fromPence(pence(MAX_INPUT_AMOUNT) + 1), 24), 'monthlyPayment', 'above-maximum'],
    ['a negative final payment', keepOwing(S, p, 24, fromPence(-1)), 'finalPayment', 'below-minimum'],
    ['a final payment above the settlement', keepOwing(S, p, 24, fromPence(pence(S) + 1)), 'finalPayment', 'above-maximum'],
    [
      'payments and final payment below the settlement',
      keepOwing(S, fromPounds(100), 24, fromPounds(2_000)),
      'monthlyPayment',
      'below-minimum',
    ],
  ] as const)('%s', (_name, acquisition, field, reason) => {
    expect(problems(acquisition)).toContainEqual({ field, reason, option: 0 })
  })

  it('existing finance that is not a set of figures', () => {
    const acquisition = { kind: 'keep', existingFinance: null } as unknown as Acquisition
    expect(problems(acquisition)).toEqual([{ field: 'existingFinance', reason: 'not-a-choice', option: 0 }])
  })
})

describe('properties on seeded random kept cars with finance owed', () => {
  const random = generator(3_105)
  const cases: { option: CarOption; shared: Shared; result: OwnershipResult; random: number }[] = []
  let refused = 0
  while (cases.length < 120) {
    const { option: o, shared: s } = randomOwingCase(random)
    const outcome = ownershipCost(o, s)
    if (outcome.ok) cases.push({ option: o, shared: s, result: outcome.result, random: random() })
    else refused++
  }
  const each = cases.map((c, i) => [i, c] as const)
  const owingOf = (o: CarOption) => (o.acquisition.kind === 'keep' ? o.acquisition.existingFinance! : null)!

  it('few refusals', () => {
    expect(refused).toBeLessThan(12)
  })

  it.each(each)('net cost at month 0 is nothing; the breakdown adds up; equity is value less balance (case %i)', (_i, { result }) => {
    expect(result.fullCoverage).toBe(true)
    for (const c of Object.values(result.cases)) {
      expect(pence(c.months[0]!.netCost)).toBe(0)
      expect(sumBreakdown(c.breakdown)).toBe(pence(c.netCost))
      for (const m of c.months) {
        expect(pence(m.equity)).toBe(pence(m.value) - pence(m.balance))
        expect(pence(m.netCost)).toBe(pence(m.cashOut) + pence(result.forgoneSale) - pence(m.equity) + pence(m.opportunityCost))
      }
    }
  })

  it.each(each)(
    'zero return: net less running = depreciation + paid − settlement + balance owed (case %i)',
    (_i, { option: o, shared: s }) => {
      const outcome = ownershipCost(o, { ...s, savingsReturn: NONE })
      if (!outcome.ok) throw new Error('refused')
      const owing = owingOf(o)
      const paid = outcome.result.timeline.reduce((a, m) => a + pence(m.acquisition), 0)
      for (const c of Object.values(outcome.result.cases)) {
        const owed = pence(c.months.at(-1)!.balance)
        expect(pence(c.netCost) - running(c.breakdown)).toBe(pence(c.breakdown.depreciation) + paid - pence(owing.settlement) + owed)
        if (owing.paymentsLeft <= s.horizonMonths) expect(owed).toBe(0)
      }
    },
  )

  it.each(each)('the reference agrees (case %i)', (_i, { option: o, shared: s, result }) => {
    const ref = reference(o, s, result.finance)
    expect(result.timeline.map((m) => BigInt(pence(m.acquisition)))).toEqual(ref.acquisition)
    expect(BigInt(pence(result.forgoneSale))).toBe(ref.forgone)
    const c = result.cases.expected
    expect(c.months.map((m) => BigInt(pence(m.balance)))).toEqual(ref.balance)
    expect(BigInt(pence(c.breakdown.interestAndFees))).toBe(
      ref.acquisition.reduce((a, b) => a + b, 0n) + ref.forgone - BigInt(pence(o.car.value)) + ref.endBalance,
    )
  })

  it.each(each)(
    'a higher settlement with the same payments lowers the implied rate (case %i)',
    (_i, { option: o, shared: s, result, random: r }) => {
      const owing = owingOf(o)
      const room = owing.paymentsLeft * pence(owing.monthlyPayment) + pence(owing.finalPayment) - pence(owing.settlement)
      if (room < MONTHS_PER_YEAR || result.finance!.monthlyRate.numerator === 0) return
      const higher = pence(owing.settlement) + 1 + Math.floor(r * (room - 1))
      const again = ownershipCost(
        { ...o, acquisition: keepOwing(fromPence(higher), owing.monthlyPayment, owing.paymentsLeft, owing.finalPayment) },
        s,
      )
      if (!again.ok) throw new Error('refused')
      const before = result.finance!.monthlyRate
      const after = again.result.finance!.monthlyRate
      expect(after.numerator * before.denominator).toBeLessThan(before.numerator * after.denominator)
    },
  )
})

describe('compareOptions and flipPoints work with the new option', () => {
  const owing = option(keepOwing(fromPounds(9_000), fromPounds(420), 24, fromPounds(1_000)), {
    value: fromPounds(11_000),
    horizonValue: { low: fromPounds(3_000), expected: fromPounds(5_000), high: fromPounds(7_000) },
  })
  const cash = option(CASH, { value: fromPounds(20_000) })
  const s = shared({ savingsReturn: ratio(3, 100) })

  it('ranks it with the others, in all three cases', () => {
    const outcome = compareOptions([owing, cash], s)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    for (const key of ['low', 'expected', 'high'] as const)
      expect(outcome.result.ranking[key].full.map((e) => e.option).sort()).toEqual([0, 1])
    const alone = ownershipCost(owing, s)
    expect(alone.ok && alone.result).toEqual(outcome.result.options[0])
  })

  it('finds flip points', () => {
    const outcome = flipPoints([owing, cash], s, 'expected')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const v = outcome.result.horizonValue[0]
    expect(v.kind).toBe('crossing')
    if (v.kind !== 'crossing') return
    // At the crossing value the two are within a penny a month.
    const moved = compareOptions([{ ...owing, car: { ...owing.car, horizonValue: flat(v.below) } }, cash], s)
    if (!moved.ok) throw new Error('refused')
    const [a, b] = moved.result.options.map((o) => pence(o.cases.expected.netCostPerCoverageMonth))
    expect(Math.abs(a! - b!)).toBeLessThanOrEqual(1)
  })
})
