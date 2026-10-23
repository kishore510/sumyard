import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { formatGBP, formatPercent, formatPercentFixed } from '@/lib/format'
import { MAX_AGE_YEARS } from '@/lib/inputLimits'
import { compare, fromPounds, type Money, mulRound, percent, ratio, roundRatio, ZERO } from '@/lib/money'
import { mortgageCalculator } from '../mortgage/definition'
import { optimiserCalculator } from '../optimiser/definition'
import { calculate, type NextPoundPageInputs, nextPoundCalculator, type PageOutcome } from './definition'
import {
  BANNED_WORDS,
  barRows,
  breakEvenBox,
  CAUSE_CLAUSE,
  calloutFacts,
  calloutText,
  headlineParts,
  headlineText,
  LEG_ORDER,
  legLine,
  stickyLines,
  wordingProblems,
} from './screen'
import type { BreakEven } from './types'

/*
 * The next pound screen's words and geometry (the C2 page rebuild), worked
 * out from the composer's output and never from a figure typed here: each
 * test reads the composer's numbers through calculate and checks the
 * sentence's structure. Pay, balances and rates are made up for tests.
 */

const gbp = (amount: Money) => formatGBP(amount, 'pence')

const pension = {
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(60_000),
  pensionMethod: 'netPay' as const,
  employeeContribution: { mode: 'amount' as const, amount: fromPounds(3_000), percentOfPay: '0' },
  employerContribution: { mode: 'amount' as const, amount: fromPounds(3_000), percentOfPay: '0' },
}
const mortgage = {
  ...mortgageCalculator.defaultInputs(),
  startDate: '2026-11-01' as const,
  balance: fromPounds(200_000),
  termYears: 25,
  fixedRate: '4.5',
  fixedEndDate: '2028-11-30' as const,
  reversionRate: '7',
}
const example: NextPoundPageInputs = {
  ...nextPoundCalculator.defaultInputs(),
  lumpSum: fromPounds(10_000),
  horizonYears: 20,
  asOf: '2026-10-23',
  ageNow: 40,
  pay: pension,
  mortgage,
  feeRate: '0.5',
  inflationRate: '2',
}

type Ok = Extract<PageOutcome, { kind: 'ok' }>
function ok(patch: Partial<NextPoundPageInputs> = {}): Ok {
  const out = calculate({ ...example, ...patch }, taxYear)
  if (out.kind !== 'ok') throw new Error(out.kind)
  return out
}
const shownPension = (out: Ok) => (out.pension.kind === 'shown' ? out.pension.leg : null)
const isaMid = (out: Ok) => (out.isa.kind === 'shown' ? out.isa.leg.rates.mid.value.todaysMoney : null)

describe('the headline', () => {
  it('names each leg’s mid figure in today’s money, in the fixed order, with the years, X and the mid rate', () => {
    const out = ok()
    const parts = headlineParts(out)
    expect(parts.clauses.map((c) => c.leg)).toEqual(['pension', 'mortgage', 'isa'])
    expect(parts.clauses.every((c) => c.kind === 'value')).toBe(true)
    const [p, m, i] = parts.clauses.map((c) => (c.kind === 'value' ? c.value : null))
    expect(p).toBe(
      shownPension(out)?.status === 'accessible'
        ? (shownPension(out) as { rates: { mid: { value: { todaysMoney: Money } } } }).rates.mid.value.todaysMoney
        : null,
    )
    expect(m).toBe(out.mortgage.kind === 'shown' ? out.mortgage.leg.value.todaysMoney : null)
    expect(i).toBe(isaMid(out))
    expect(headlineText(parts, gbp)).toBe(
      `In 20 years, in today’s money, ${gbp(example.lumpSum)} of take-home is worth ${gbp(p!)} in a pension, ${gbp(m!)} overpaying the mortgage, or ${gbp(i!)} in an ISA, all at a 5% mid rate. Not ranked, and not advice.`,
    )
  })

  it('keeps the fixed order whatever the values', () => {
    const big = ok({ growthLow: '0', growthMid: '0', growthHigh: '0' })
    expect(headlineParts(big).clauses.map((c) => c.leg)).toEqual([...LEG_ORDER])
  })

  it('a leg with no result swaps its clause for its state', () => {
    const text = (out: Ok) => headlineText(headlineParts(out), gbp)
    expect(text(ok({ schemeAccessAge: MAX_AGE_YEARS }))).toMatch(/ a pension is not accessible at that horizon, /)
    expect(text(ok({ mortgage: mortgageCalculator.defaultInputs() }))).toMatch(/, no mortgage is set up, or /)
    expect(text(ok({ pay: optimiserCalculator.defaultInputs() }))).toMatch(/ a pension needs your pay, /)
    expect(text(ok({ mortgage: { ...mortgage, termYears: 0, termExtraMonths: 0 } }))).toMatch(
      /, the mortgage has no result for these inputs, or /,
    )
  })

  it('one year is singular; the mid rate leaves the sentence when neither growth leg has a number', () => {
    expect(headlineText(headlineParts(ok({ horizonYears: 1 })), gbp)).toMatch(/^In 1 year, /)
    const out = ok({ schemeAccessAge: MAX_AGE_YEARS })
    const noGrowth: Ok = { ...out, isa: { kind: 'none' } }
    expect(headlineParts(noGrowth).midRate).toBeNull()
    expect(headlineText(headlineParts(noGrowth), gbp)).not.toMatch(/mid rate/)
  })

  it('X of nothing: each leg nothing, said as nothing', () => {
    const parts = headlineParts(ok({ lumpSum: ZERO }))
    expect(parts.clauses.filter((c) => c.kind === 'value').every((c) => c.kind === 'value' && c.value === ZERO)).toBe(true)
  })

  it('the sticky lines: one a leg, in the same order, shortened', () => {
    const out = ok()
    const lines = stickyLines(out, gbp)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^Pension £/)
    expect(lines[1]).toMatch(/^Mortgage £/)
    expect(lines[2]).toBe(`ISA ${gbp(isaMid(out)!)}`)
    expect(stickyLines(ok({ mortgage: mortgageCalculator.defaultInputs() }), gbp)[1]).toBe('Mortgage: not set up')
  })
})

describe('the bars', () => {
  it('fixed order, one shared scale: the largest high case among the legs shown, so every range fits', () => {
    const out = ok()
    const { rows, scale } = barRows(out)
    expect(rows.map((r) => r.leg)).toEqual(['pension', 'mortgage', 'isa'])
    const highs = rows.flatMap((r) => (r.high ? [r.high.todaysMoney] : []))
    expect(highs.every((h) => compare(h, scale) <= 0)).toBe(true)
    expect(highs).toContain(scale)
    for (const r of rows) {
      if (!r.mid) continue
      expect(r.midShare).toBeGreaterThan(0)
      expect(r.midShare).toBeLessThanOrEqual(1)
      if (r.low && r.high) expect(r.lowShare! <= r.midShare && r.midShare <= r.highShare!).toBe(true)
    }
  })

  it('the mortgage alone carries the guaranteed badge, and has no range', () => {
    const { rows } = barRows(ok())
    expect(rows.map((r) => r.badge)).toEqual([null, 'guaranteed', null])
    expect(rows[1]!.low).toBeNull()
    expect(rows[1]!.high).toBe(rows[1]!.mid)
  })

  it('a leg with no number has no bar and says why', () => {
    const { rows } = barRows(ok({ schemeAccessAge: MAX_AGE_YEARS }))
    expect(rows[0]).toMatchObject({ mid: null, midShare: 0 })
    expect(rows[0]!.state).toMatch(/^Not accessible at that horizon/)
    expect(barRows(ok({ mortgage: mortgageCalculator.defaultInputs() })).rows[1]!.state).toBe('No mortgage is set up')
  })

  it('X of nothing: no bar is drawn and nothing divides by nothing', () => {
    const { rows, scale } = barRows(ok({ lumpSum: ZERO }))
    expect(scale).toBe(ZERO)
    expect(rows.every((r) => r.midShare === 0)).toBe(true)
  })

  it('the lines under the bars: the range and rates, the mortgage balances, extras only when not nothing', () => {
    const out = ok()
    const isa = out.isa.kind === 'shown' ? out.isa.leg : null
    expect(legLine(out, 'isa', gbp)).toBe(
      `${gbp(isa!.rates.low.value.todaysMoney)} to ${gbp(isa!.rates.high.value.todaysMoney)} at 2% to 8%, tax-free`,
    )
    expect(legLine(out, 'pension', gbp)).toMatch(/ at 2% to 8%, after tax$/)
    const m = out.mortgage.kind === 'shown' ? out.mortgage.leg : null
    expect(legLine(out, 'mortgage', gbp)).toBe(
      `Balance ${gbp(m!.overpayingBalance)} instead of ${gbp(m!.baselineBalance)}, plus ${gbp(m!.paymentsFreed)} of payments freed`,
    )
    const charged = ok({ mortgage: { ...mortgage, erc: true, ercRate: '3', allowanceRate: '1' } })
    const c = charged.mortgage.kind === 'shown' ? charged.mortgage.leg : null
    expect(c!.erc).toBeGreaterThan(0)
    expect(legLine(charged, 'mortgage', gbp)).toContain(`; an early repayment charge of ${gbp(c!.erc)} is paid from the lump sum`)
    expect(compare(c!.leftoverCash, ZERO) > 0).toBe(legLine(charged, 'mortgage', gbp)!.includes('is held as cash'))
    expect(legLine(out, 'mortgage', gbp)).not.toMatch(/charge|cash/)
    // A balance below the lump sum: what isn't needed is held as cash.
    const small = ok({ mortgage: { ...mortgage, balance: fromPounds(4_000) } })
    const s = small.mortgage.kind === 'shown' ? small.mortgage.leg : null
    expect(compare(s!.leftoverCash, ZERO)).toBe(1)
    expect(legLine(small, 'mortgage', gbp)).toMatch(new RegExp(`; ${gbp(s!.leftoverCash).replace(/[$£.]/g, '\\$&')} is held as cash$`))
  })

  it('without an age, the pension line says the access age was not checked', () => {
    expect(legLine(ok({ ageNow: null }), 'pension', gbp)).toMatch(/\. Access age not checked: add your age$/)
  })

  it('a mortgage paid off before the horizon: the balance is nothing, the line still reads', () => {
    const out = ok({ lumpSum: fromPounds(500_000), horizonYears: 30 })
    const m = out.mortgage.kind === 'shown' ? out.mortgage.leg : null
    expect(m!.overpayingBalance).toBe(ZERO)
    expect(legLine(out, 'mortgage', gbp)).toMatch(/^Balance £0\.00 instead of /)
  })
})

describe('the callout', () => {
  it('more than £1 in for every £1 out: the multiple to two places, from the composer’s cost and pension added', () => {
    const out = ok()
    const facts = calloutFacts(out)
    const { cost, pensionAdded } = shownPension(out)!.contribution
    expect(compare(pensionAdded, cost)).toBe(1)
    expect(facts).toMatchObject({ kind: 'multiple', cost, pensionAdded })
    const perPound = mulRound(fromPounds(1), ratio(pensionAdded, cost), 'nearest')
    expect(calloutText(facts!, gbp)).toBe(
      `At your pay, ${gbp(cost)} of take-home buys ${gbp(pensionAdded)} of pension: ${formatGBP(perPound, 'pence')} in for every ${formatGBP(fromPounds(1), 'pounds')} out`,
    )
    // Whole pounds in Settings: the multiple still shows its pence.
    const whole = (amount: Money) => formatGBP(amount, 'pounds')
    expect(calloutText(facts!, whole)).toContain(`: ${formatGBP(perPound, 'pence')} in for every `)
  })

  it('states the cause only when the personal allowance taper is in play', () => {
    const plain = calloutFacts({ ...ok(), taperInPlay: false })!
    expect(calloutText(plain, gbp)).not.toContain(CAUSE_CLAUSE)
    const tapered = calloutFacts({ ...ok(), taperInPlay: true })!
    expect(calloutText(tapered, gbp)).toMatch(new RegExp(`, ${CAUSE_CLAUSE}$`))
  })

  it('£1 or less in for every £1 out, or no cost: what the pension costs in spendable income, in neutral words', () => {
    const out = ok()
    const leg = shownPension(out)!
    const even = { ...leg, contribution: { ...leg.contribution, pensionAdded: leg.contribution.cost } }
    const facts = calloutFacts({ ...out, pension: { kind: 'shown', leg: even } })
    expect(facts?.kind).toBe('cost')
    expect(calloutText(facts!, gbp)).toBe(
      `Putting ${gbp(even.contribution.pensionAdded)} into a pension costs ${gbp(even.contribution.cost)} of spendable income now`,
    )
    const free = { ...leg, contribution: { ...leg.contribution, cost: ZERO } }
    expect(calloutFacts({ ...out, pension: { kind: 'shown', leg: free } })?.kind).toBe('cost')
  })

  it('no pension figures (pay needed, X of nothing): no callout', () => {
    expect(calloutFacts(ok({ pay: optimiserCalculator.defaultInputs() }))).toBeNull()
    expect(calloutFacts(ok({ lumpSum: ZERO }))).toBeNull()
  })
})

describe('the break-even box', () => {
  it('about the lower bound to one place, against each leg with a number', () => {
    const out = ok()
    const box = breakEvenBox(out)
    const about = (b: BreakEven | null) => (b?.kind === 'rate' ? formatPercentFixed(roundRatio(b.rate, 3, 'down'), 1) : '')
    expect(box.lines).toEqual([
      { against: 'mortgage', text: `${about(out.breakEven.mortgage)} a year to match the mortgage overpayment` },
      { against: 'pension', text: `${about(out.breakEven.pension)} a year to match the pension at ${formatPercent(percent('5'))}` },
    ])
    expect(box.omitted).toEqual([])
  })

  it('above the highest or below the lowest rate modelled, in words', () => {
    const out = ok()
    const box = breakEvenBox({ ...out, breakEven: { mortgage: { kind: 'above-highest' }, pension: { kind: 'below-lowest' } } })
    expect(box.lines.map((l) => l.text)).toEqual([
      'above the highest rate modelled to match the mortgage overpayment',
      'below the lowest rate modelled to match the pension at 5%',
    ])
  })

  it('a line is left out with a one-line reason when its leg has no number', () => {
    const box = breakEvenBox(ok({ schemeAccessAge: MAX_AGE_YEARS, mortgage: mortgageCalculator.defaultInputs() }))
    expect(box.lines).toEqual([])
    expect(box.omitted).toEqual([
      { against: 'mortgage', reason: 'None against the mortgage: no mortgage is set up' },
      { against: 'pension', reason: 'None against the pension: it is not accessible at that horizon' },
    ])
    expect(breakEvenBox(ok({ lumpSum: ZERO })).omitted.map((o) => o.reason)).toEqual([
      'None against the mortgage: the lump sum is nothing',
      'None against the pension: the lump sum is nothing',
    ])
  })

  it('the note on the rate after the fixed period, only when it applies inside the horizon', () => {
    expect(breakEvenBox(ok()).reversionNote).toBe(
      'This depends on the mortgage rate after the fixed period; change it on the mortgage page',
    )
    expect(breakEvenBox(ok({ horizonYears: 1 })).reversionNote).toBeNull()
    expect(breakEvenBox(ok({ mortgage: mortgageCalculator.defaultInputs() })).reversionNote).toBeNull()
  })
})

describe('wording', () => {
  it('no string the screen builds ranks or advises; “wins back” only in the cause clause', () => {
    const states = [
      ok(),
      { ...ok(), taperInPlay: true },
      ok({ schemeAccessAge: MAX_AGE_YEARS }),
      ok({ mortgage: mortgageCalculator.defaultInputs() }),
      ok({ lumpSum: ZERO }),
      ok({ ageNow: null }),
      ok({ growthLow: '-5', growthMid: '-5', growthHigh: '-5', inflationRate: '10' }),
    ]
    for (const out of states) {
      const facts = calloutFacts(out)
      const box = breakEvenBox(out)
      const strings = [
        headlineText(headlineParts(out), gbp),
        ...stickyLines(out, gbp),
        ...LEG_ORDER.map((leg) => legLine(out, leg, gbp) ?? ''),
        ...barRows(out).rows.map((r) => r.state ?? ''),
        facts ? calloutText(facts, gbp) : '',
        ...box.lines.map((l) => l.text),
        ...box.omitted.map((o) => o.reason),
        box.reversionNote ?? '',
      ]
      for (const text of strings) expect(wordingProblems(text), text).toEqual([])
    }
  })

  it('the guard catches each banned word, and “wins back” anywhere but the cause clause', () => {
    for (const word of BANNED_WORDS) expect(wordingProblems(`This is ${word} here`)).not.toEqual([])
    expect(wordingProblems('the pension wins back more')).not.toEqual([])
    expect(wordingProblems(`At your pay, x, ${CAUSE_CLAUSE}`)).toEqual([])
    expect(wordingProblems('Please look')).not.toEqual([])
    expect(wordingProblems('Saved successfully')).not.toEqual([])
  })
})
