import { describe, expect, it } from 'vitest'
import { MAX_BUDGET_LINES, MAX_INPUT_AMOUNT } from '@/lib/inputLimits'
import { fromPence, fromPounds, type Money, MoneyError, mulRound, ratio, toPence } from '@/lib/money'
import { MONTHS_PER_YEAR, PERIODS_PER_YEAR } from '@/lib/periods'
import { budget } from './calc'
import { inputs, out, PERIODS, pay } from './fixtures/inputs'
import type { BudgetInputs, BudgetResult } from './types'

/*
 * The household budget engine (BD1 to BD9 in docs/modelling-decisions.md).
 * Every amount is made up. Expected figures are worked out here from the
 * calendar divisors in src/lib/periods.ts, never typed in as a tax figure.
 */

function run(i: BudgetInputs): BudgetResult {
  const outcome = budget(i)
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`)
  return outcome.result
}

const p = (m: Money) => toPence(m)
const kind = (r: BudgetResult, k: string) => r.perKind.find((t) => t.kind === k)!

describe('period conversion (BD2)', () => {
  it('a weekly amount is that many weeks a year, exactly', () => {
    const r = run(inputs([], [out(100, 'spending', 'weekly')]))
    expect(p(r.outgoings.year)).toBe(p(fromPounds(100)) * PERIODS_PER_YEAR.weekly)
    expect(p(r.outgoings.year)).toBe(p(fromPounds(5_200)))
  })

  it.each(PERIODS)('a %s amount is the amount times its periods a year', (period) => {
    const r = run(inputs([pay('123.45', period)], [out('67.89', 'debt', period)]))
    expect(p(r.income.year)).toBe(12_345 * PERIODS_PER_YEAR[period])
    expect(p(r.outgoings.year)).toBe(6_789 * PERIODS_PER_YEAR[period])
    expect(p(r.outgoingLines[0]!.year)).toBe(6_789 * PERIODS_PER_YEAR[period])
  })

  it('a month figure is the year divided by the months, to the nearest penny', () => {
    // 10 a week is 520 a year: 43.333... a month, so 43.33.
    const r = run(inputs([pay(10, 'weekly')], [out(10, 'spending', 'weekly')]))
    expect(r.income.month).toBe(mulRound(r.income.year, ratio(1, MONTHS_PER_YEAR), 'nearest'))
    expect(p(r.income.month)).toBe(4_333)
    expect(p(r.outgoingLines[0]!.month)).toBe(4_333)
  })

  it('round trip: a monthly amount comes back as itself, and a yearly one divisible by the months comes back exactly', () => {
    const r = run(inputs([pay('1234.56', 'monthly')], [out(1_200, 'savings', 'annual'), out('25.5', 'joint', 'monthly')]))
    expect(r.incomeLines[0]!.month).toBe(fromPounds('1234.56'))
    expect(r.outgoingLines[0]!.month).toBe(fromPounds(100))
    expect(r.outgoingLines[1]!.month).toBe(fromPounds('25.5'))
  })
})

describe('totals and shares (BD1, BD3)', () => {
  const example = inputs(
    [pay(3_000, 'monthly', 'Your pay'), pay(1_200, 'annual', 'Side work')],
    [
      out(400, 'spending', 'monthly', 'Groceries'),
      out(600, 'spending', 'annual', 'Car insurance'),
      out(500, 'joint', 'monthly', 'Joint account'),
      out(150, 'debt', 'monthly', 'Credit card'),
      out(300, 'savings', 'monthly', 'ISA'),
    ],
  )

  it('adds income, outgoings and each kind for the year', () => {
    const r = run(example)
    expect(r.income.year).toBe(fromPounds(37_200))
    expect(kind(r, 'spending').year).toBe(fromPounds(5_400))
    expect(kind(r, 'joint').year).toBe(fromPounds(6_000))
    expect(kind(r, 'debt').year).toBe(fromPounds(1_800))
    expect(kind(r, 'savings').year).toBe(fromPounds(3_600))
    expect(r.outgoings.year).toBe(fromPounds(16_800))
    expect(r.leftover.year).toBe(fromPounds(20_400))
    expect(r.income.month).toBe(fromPounds(3_100))
    expect(r.leftover.month).toBe(fromPounds(1_700))
  })

  it('every kind is listed in order, with nothing for a kind with no lines', () => {
    const r = run(inputs([pay(1_000)], [out(10, 'debt')]))
    expect(r.perKind.map((t) => t.kind)).toEqual(['spending', 'joint', 'debt', 'savings'])
    expect(p(kind(r, 'spending').year)).toBe(0)
  })

  it('shares are of total income, exact', () => {
    const r = run(example)
    expect(kind(r, 'savings').share).toEqual(ratio(p(fromPounds(3_600)), p(fromPounds(37_200))))
    expect(r.savingsRate).toEqual(kind(r, 'savings').share)
    expect(r.outgoings.share).toEqual(ratio(p(fromPounds(16_800)), p(fromPounds(37_200))))
    expect(r.leftover.share).toEqual(ratio(p(fromPounds(20_400)), p(fromPounds(37_200))))
  })

  it('keeps each line as entered beside its figures', () => {
    const r = run(example)
    expect(r.outgoingLines.map((l) => l.line.name)).toEqual(['Groceries', 'Car insurance', 'Joint account', 'Credit card', 'ISA'])
    expect(r.outgoingLines[1]!.month).toBe(fromPounds(50))
    expect(r.incomeLines[1]!.month).toBe(fromPounds(100))
  })

  it('has no warnings when income covers outgoings', () => {
    expect(run(example).warnings).toEqual([])
  })

  it('states its assumptions in words, with no figures', () => {
    const r = run(example)
    expect(r.assumptions.length).toBeGreaterThan(0)
    for (const a of r.assumptions) expect(a).not.toMatch(/\d/)
  })
})

describe('blank, zero and negative leftover (BD4, BD5)', () => {
  it('a blank amount is nothing, with no warning', () => {
    const r = run(inputs([pay(1_000)], [out(0, 'spending'), out(0, 'savings', 'weekly')]))
    expect(p(r.outgoings.year)).toBe(0)
    expect(r.leftover.year).toBe(r.income.year)
    expect(r.warnings).toEqual([])
  })

  it('nothing at all: zero everywhere, shares n/a, a no-income warning, no division', () => {
    const r = run(inputs())
    expect(p(r.income.year)).toBe(0)
    expect(p(r.leftover.year)).toBe(0)
    expect(r.outgoings.share).toBeNull()
    expect(r.leftover.share).toBeNull()
    expect(r.savingsRate).toBeNull()
    for (const t of r.perKind) expect(t.share).toBeNull()
    expect(r.warnings).toEqual(['no-income'])
  })

  it('zero income with outgoings: leftover below nothing, shares n/a, both warnings', () => {
    const r = run(inputs([pay(0)], [out(50)]))
    expect(r.leftover.year).toBe(fromPounds(-600))
    expect(r.leftover.share).toBeNull()
    expect(r.warnings).toEqual(['negative-leftover', 'no-income'])
  })

  it('negative leftover is shown as it is, never capped, with a warning', () => {
    const r = run(inputs([pay(1_000)], [out(1_250)]))
    expect(r.leftover.year).toBe(fromPounds(-3_000))
    expect(r.leftover.month).toBe(fromPounds(-250))
    expect(r.leftover.share).toEqual(ratio(p(fromPounds(-3_000)), p(fromPounds(12_000))))
    expect(r.warnings).toEqual(['negative-leftover'])
  })

  it('a penny below nothing a month is still negative', () => {
    const r = run(inputs([pay('100')], [out('100.01')]))
    expect(p(r.leftover.month)).toBe(-1)
    expect(r.warnings).toContain('negative-leftover')
  })
})

describe('the penny drift between month rows and month totals (BD2)', () => {
  it('is nothing when every line divides evenly', () => {
    const r = run(inputs([pay(1_000)], [out(100), out(1_200, 'spending', 'annual')]))
    expect(p(r.pennyDrift.income)).toBe(0)
    expect(p(r.pennyDrift.kinds)).toBe(0)
    expect(p(r.pennyDrift.lines.spending)).toBe(0)
    expect(p(r.pennyDrift.leftover)).toBe(0)
  })

  it('is stated when rounding each line moves the sum', () => {
    // Three weekly lines of 10: each 43.33 a month; together 1,560 a year is 130.00 a month, so the lines are a penny short.
    const r = run(
      inputs(
        [pay(10, 'weekly'), pay(10, 'weekly'), pay(10, 'weekly')],
        [out(10, 'spending', 'weekly'), out(10, 'spending', 'weekly'), out(10, 'spending', 'weekly')],
      ),
    )
    expect(p(r.income.month)).toBe(13_000)
    expect(p(r.pennyDrift.income)).toBe(-1)
    expect(p(r.pennyDrift.lines.spending)).toBe(-1)
    expect(p(r.pennyDrift.lines.debt)).toBe(0)
  })

  it('is what the rows add up to less the total, for kinds and leftover too', () => {
    const r = run(inputs([pay(10, 'weekly')], [out(10, 'spending', 'weekly'), out(10, 'debt', 'weekly'), out(10, 'savings', 'weekly')]))
    const kinds = r.perKind.reduce((sum, t) => sum + p(t.month), 0)
    expect(p(r.pennyDrift.kinds)).toBe(kinds - p(r.outgoings.month))
    expect(p(r.pennyDrift.leftover)).toBe(p(r.income.month) - p(r.outgoings.month) - p(r.leftover.month))
  })
})

describe('refusals (BD9)', () => {
  const big = fromPence(p(MAX_INPUT_AMOUNT) + 1)

  it('refuses an amount past the input limit, by line, without throwing', () => {
    const outcome = budget(inputs([pay(1)], [out(1), { ...out(1), amount: big }]))
    expect(outcome).toEqual({ ok: false, problems: [{ field: 'outgoings', index: 1, reason: 'above-maximum' }] })
  })

  it('huge amounts hit the safe-integer guard cleanly: a refusal, never a throw or a wrong number', () => {
    const huge = { ...pay(1), amount: Number.MAX_SAFE_INTEGER as Money }
    expect(() => budget(inputs([huge]))).not.toThrow()
    expect(budget(inputs([huge]))).toMatchObject({ ok: false, problems: [{ field: 'income', index: 0, reason: 'above-maximum' }] })
    expect(budget(inputs([{ ...pay(1), amount: 1.5 as Money }]))).toMatchObject({ ok: false, problems: [{ reason: 'not-money' }] })
    expect(budget(inputs([{ ...pay(1), amount: Number.NaN as Money }]))).toMatchObject({ ok: false, problems: [{ reason: 'not-money' }] })
  })

  it('the largest inputs it accepts still work out exactly', () => {
    const full = inputs(
      Array.from({ length: MAX_BUDGET_LINES }, () => ({ ...pay(1, 'weekly'), amount: MAX_INPUT_AMOUNT })),
      Array.from({ length: MAX_BUDGET_LINES }, () => ({ ...out(1, 'savings', 'weekly'), amount: MAX_INPUT_AMOUNT })),
    )
    const r = run(full)
    expect(p(r.income.year)).toBe(p(MAX_INPUT_AMOUNT) * PERIODS_PER_YEAR.weekly * MAX_BUDGET_LINES)
    expect(p(r.leftover.year)).toBe(0)
  })

  it('refuses a negative amount', () => {
    expect(budget(inputs([pay(-1)]))).toEqual({ ok: false, problems: [{ field: 'income', index: 0, reason: 'below-minimum' }] })
  })

  it('refuses an unknown period or kind', () => {
    expect(budget(inputs([], [{ ...out(1), kind: 'fun' as 'debt' }]))).toEqual({
      ok: false,
      problems: [{ field: 'outgoings', index: 0, reason: 'not-a-choice' }],
    })
    expect(budget(inputs([{ ...pay(1), period: 'daily' as 'weekly' }]))).toEqual({
      ok: false,
      problems: [{ field: 'income', index: 0, reason: 'not-a-choice' }],
    })
  })

  it('refuses more than the most lines a list holds (MAX_BUDGET_LINES)', () => {
    const many = Array.from({ length: MAX_BUDGET_LINES + 1 }, () => out(1))
    expect(budget(inputs([], many))).toEqual({ ok: false, problems: [{ field: 'outgoings', reason: 'too-many-lines' }] })
    expect(
      budget(
        inputs(
          Array.from({ length: MAX_BUDGET_LINES + 1 }, () => pay(1)),
          [],
        ),
      ),
    ).toEqual({
      ok: false,
      problems: [{ field: 'income', reason: 'too-many-lines' }],
    })
    expect(budget(inputs([], many.slice(1))).ok).toBe(true)
  })

  it('refuses a list that is not a list', () => {
    expect(budget({ income: null, outgoings: [] } as unknown as BudgetInputs)).toEqual({
      ok: false,
      problems: [{ field: 'income', reason: 'not-a-list' }],
    })
  })

  it('names every problem at once', () => {
    const outcome = budget(inputs([pay(-1)], [out(-1), out(1), { ...out(1), amount: big }]))
    expect(!outcome.ok && outcome.problems.map((x) => `${x.field}${x.index}`)).toEqual(['income0', 'outgoings0', 'outgoings2'])
  })

  it('MoneyError is never thrown to the caller', () => {
    expect(() => budget(inputs([{ ...pay(1), amount: Number.MAX_VALUE as Money }]))).not.toThrow(MoneyError)
  })
})
