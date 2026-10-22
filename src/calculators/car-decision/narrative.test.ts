import { describe, expect, it } from 'vitest'
import { MAX_CAR_OPTIONS } from '@/lib/inputLimits'
import { add, compare, exact, exactMul, fromPounds, type Money, ratio, roundExact, subtract, toPence, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import type { Comparison, ValueCase } from '../car-ownership/types'
import { type CarDecisionInputs, calculate, type OptionStatus, type PageOutcome, uniqueNames } from './definition'
import { car, cash, inputs, keep, OWNER_KEEP, OWNER_PCP, ownerPage, pcp, randomInputs, seeded } from './fixtures/inputs'
import { bottomLine, engineNames, largestCost, moneyFlows, scenarioTable, switchCosts, verdict } from './narrative'
import { breakdownParts } from './results'

/*
 * Session 3d-1: the results' narrative (narrative.ts), every sentence
 * generated from the engine's comparison. The owner's page is checked
 * against figures worked out by hand from its inputs (the brief), not by
 * the code under test; random cases are checked against the engine's own
 * fields. Amounts are made up.
 */

type Ok = Extract<PageOutcome, { kind: 'ok' }>

const gbp = (amount: Money) => {
  const pence = toPence(amount)
  const size = Math.abs(pence)
  const pounds = Math.floor(size / 100).toLocaleString('en-GB')
  return `${pence < 0 ? '-' : ''}£${pounds}.${String(size % 100).padStart(2, '0')}`
}

const ok = (i: CarDecisionInputs): Ok & { comparison: Comparison } => {
  const outcome = calculate(i)
  if (outcome.kind !== 'ok' || !outcome.comparison) throw new Error(outcome.kind)
  return outcome as Ok & { comparison: Comparison }
}

const namesOf = (i: CarDecisionInputs, statuses: readonly OptionStatus[]) => engineNames(statuses, uniqueNames(i.options))

const run = (i: CarDecisionInputs) => {
  const outcome = ok(i)
  const names = namesOf(i, outcome.statuses)
  return { outcome, comparison: outcome.comparison, names }
}

const savings = (i: CarDecisionInputs) => percentRatio(i.savingsReturn!)

const BANNED = /\b(best|recommended|cheapest|cheaper|guaranteed|should)\b/i

/** Every sentence the narrative generates for these inputs, in every case. */
function allText(i: CarDecisionInputs): string[] {
  const { outcome, comparison, names } = run(i)
  const out: string[] = []
  for (const valueCase of ['low', 'expected', 'high'] as const) {
    const v = verdict(comparison, valueCase, names, savings(i), gbp)
    out.push(v.text, v.short)
    out.push(...switchCosts(comparison, valueCase, names, gbp).map((s) => s.text))
    for (const row of bottomLine(comparison, valueCase, names, gbp)) out.push(row.label, row.text, row.definition)
    for (const result of comparison.options) {
      const largest = largestCost(result.cases[valueCase].breakdown, result.cases[valueCase].netCost, gbp)
      if (largest) out.push(largest.text)
    }
  }
  out.push(scenarioTable(comparison, names).sentence)
  for (const status of outcome.statuses) if (status.kind === 'ok') moneyFlows(status.option, status.result)
  return out
}

describe('the owner’s page (Keep current car against a 0% PCP, 0% savings return)', () => {
  const i = ownerPage()
  const { outcome, comparison, names } = run(i)
  const [keepResult, pcpResult] = comparison.options as [(typeof comparison.options)[0], (typeof comparison.options)[0]]

  it('the engine’s average cost per month owned: Keep £379.85, PCP £562.11', () => {
    expect(gbp(keepResult.cases.expected.netCostPerCoverageMonth)).toBe('£379.85')
    expect(gbp(pcpResult.cases.expected.netCostPerCoverageMonth)).toBe('£562.11')
  })

  it('the verdict: Keep lowest, £182.26 a month and £8,748.56 over 48 months less than the PCP; the zero savings return said', () => {
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('lowest')
    if (v.kind !== 'lowest') return
    expect(v.lowest).toEqual([0])
    expect(v.next).toBe(1)
    expect(gbp(v.gapPerMonth)).toBe('£182.26')
    expect(gbp(v.gapTotal)).toBe('£8,748.56')
    expect(v.text).toBe(
      'Current car has the lowest net cost under these assumptions: £182.26 a month less than New car PCP, £8,748.56 over 48 months. ' +
        'It uses a savings return of 0% a year, so tying up cash costs nothing in this comparison.',
    )
    expect(v.short).toBe('Current car, £182.26 a month less than New car PCP')
  })

  it('switch cost from keeping the current car', () => {
    const costs = switchCosts(comparison, 'expected', names, gbp)
    expect(costs).toHaveLength(1)
    expect(costs[0]!.text).toBe(
      'Switching to New car PCP costs £182.26 a month more than keeping Current car: £8,748.56 more over 48 months.',
    )
  })

  it('money flows: upfront £13,000, £208.33 a month, a £20,000 final payment (and the £10 fee) for the PCP; nothing for Keep', () => {
    const [k, p] = outcome.statuses as [OptionStatus, OptionStatus]
    if (k.kind !== 'ok' || p.kind !== 'ok') throw new Error('not costed')
    const keepFlows = moneyFlows(k.option, k.result)
    expect(gbp(keepFlows.upfront)).toBe('£0.00')
    expect(keepFlows.monthly).toBeNull()
    expect(keepFlows.final).toBeNull()
    const pcpFlows = moneyFlows(p.option, p.result)
    expect(gbp(pcpFlows.upfront)).toBe('£13,000.00')
    expect(gbp(pcpFlows.monthly!.amount)).toBe('£208.33')
    expect(pcpFlows.monthly!.payments).toBe(48)
    expect(gbp(pcpFlows.final!.amount)).toBe('£20,000.00')
    expect(gbp(pcpFlows.final!.fee)).toBe('£10.00')
    expect(pcpFlows.final!.month).toBe(48)
    expect(pcpFlows.final!.withinHorizon).toBe(true)
  })

  it('the largest part of each cost', () => {
    expect(largestCost(keepResult.cases.expected.breakdown, keepResult.cases.expected.netCost, gbp)!.text).toBe(
      'Largest part of the cost: Fuel or energy (£8,000.16 of £18,232.64)',
    )
    expect(largestCost(pcpResult.cases.expected.breakdown, pcpResult.cases.expected.netCost, gbp)!.text).toBe(
      'Largest part of the cost: Depreciation (£21,000.00 of £26,981.20)',
    )
  })

  it('the bottom line: net cost, running cost, depreciation and the alternative', () => {
    const rows = bottomLine(comparison, 'expected', names, gbp)
    expect(rows.map((r) => r.id)).toEqual(['net', 'running', 'depreciation', 'alternative'])
    const [net, running, depreciation, alternative] = rows as [(typeof rows)[0], (typeof rows)[0], (typeof rows)[0], (typeof rows)[0]]
    expect(net.options).toEqual([0])
    expect(gbp(net.perMonth!)).toBe('£379.85')
    // Running: (8,000.16 + 1,599.84 + 2,000.16 + 1,632.48) ÷ 48 for Keep, (3,200.16 + 2,400.00 + 371.04) ÷ 48 for the PCP.
    expect(running.options).toEqual([1])
    expect(gbp(running.perMonth!)).toBe('£124.40')
    // Depreciation: 5,000 ÷ 48 for Keep, 21,000 ÷ 48 for the PCP.
    expect(depreciation.options).toEqual([0])
    expect(gbp(depreciation.perMonth!)).toBe('£104.17')
    expect(alternative.options).toEqual([1])
    expect(gbp(alternative.perMonth!)).toBe('£182.26')
    expect(alternative.text).toBe('Choosing New car PCP instead of Current car costs £182.26 a month more (£8,748.56 over 48 months).')
    for (const row of rows) expect(row.definition.length).toBeGreaterThan(0)
  })

  it('the scenario table: each option in Low, Expected and High; the lowest does not change', () => {
    const table = scenarioTable(comparison, names)
    expect(table.rows.map((r) => [r.name, gbp(r.perMonth.low), gbp(r.perMonth.expected), gbp(r.perMonth.high)])).toEqual([
      ['Current car', '£400.68', '£379.85', '£359.01'],
      ['New car PCP', '£603.78', '£562.11', '£499.61'],
    ])
    expect(table.changes).toBe(false)
    expect(table.sentence).toBe('Current car has the lowest net cost in all three end-value cases.')
  })
})

describe('verdict cases', () => {
  const same = { annualMileage: 8_000, insurance: ZERO, maintenance: ZERO, ved: ZERO, other: ZERO }

  it('a tie at the lowest is stated, with no gap', () => {
    const i = inputs([cash({ name: 'A' }), cash({ name: 'B' })])
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('tie')
    expect(v.text).toMatch(/^A and B have the same net cost under these assumptions: £[\d,.]+ a month on average, over 48 months\./)
  })

  it('a tie for lowest with a third option: the gap is to the next', () => {
    const i = inputs([cash({ name: 'A' }), cash({ name: 'B' }), cash({ name: 'C', value: add(car().value!, fromPounds(1000)) })])
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('lowest')
    if (v.kind !== 'lowest') return
    expect(v.lowest).toEqual([0, 1])
    expect(v.next).toBe(2)
    expect(v.text).toMatch(/^A and B have the same, lowest net cost under these assumptions: £[\d,.]+ a month less than C/)
  })

  it('one option: no verdict, and why', () => {
    const i = inputs([cash({ name: 'A' })])
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('none')
    if (v.kind === 'none') expect(v.reason).toBe('one-option')
    expect(v.text).toMatch(/^No verdict: there is only one option/)
  })

  it('a partial-coverage option with the lowest cost per month owned: no verdict, never compared by total', () => {
    // A cheap hand-back (no deposit, no interest, a large final payment) against two cars bought outright and worth nothing at the end.
    const handBack = pcp({
      name: 'Hand back',
      pcpEnd: 'hand-back',
      term: 24,
      deposit: ZERO,
      rate: '0',
      finalPayment: fromPounds(12_000),
      excessPerMile: 0,
      ...same,
    })
    const worthless = { endLow: ZERO, endExpected: ZERO, endHigh: ZERO, ...same }
    const i = inputs([
      cash({ name: 'A', ...worthless }),
      cash({ name: 'B', value: add(car().value!, fromPounds(1000)), ...worthless }),
      handBack,
    ])
    const { comparison, names } = run(i)
    const partial = comparison.options[2]!
    expect(partial.fullCoverage).toBe(false)
    const full = comparison.ranking.expected.full[0]!
    // The partial option is lower per month owned (exactly: net × the other's months).
    const left = BigInt(toPence(partial.cases.expected.netCost)) * BigInt(i.horizonMonths)
    const right = BigInt(toPence(comparison.options[full.option]!.cases.expected.netCost)) * BigInt(partial.coverageMonths)
    expect(left < right).toBe(true)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('none')
    if (v.kind === 'none') expect(v.reason).toBe('partial-lower')
    expect(v.text).toMatch(/^No verdict: Hand back has a lower average cost per month owned than A, but covers only 24 of 48 months/)
  })

  it('a partial-coverage option with a lower total but a higher cost per month owned does not stop the verdict', () => {
    // Mutation guard: ranking on the total instead of per month owned would put the partial option first.
    const handBack = pcp({ name: 'Hand back', pcpEnd: 'hand-back', term: 12, value: add(car().value!, fromPounds(4000)), ...same })
    const i = inputs([cash({ name: 'A', ...same }), cash({ name: 'B', value: add(car().value!, fromPounds(1000)), ...same }), handBack])
    const { comparison, names } = run(i)
    const partial = comparison.options[2]!
    const a = comparison.options[0]!
    expect(compare(partial.cases.expected.netCost, a.cases.expected.netCost)).toBe(-1)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('lowest')
    if (v.kind === 'lowest') expect([v.lowest, v.next]).toEqual([[0], 1])
  })

  it('only one option covers the horizon: no verdict', () => {
    const i = inputs([cash({ name: 'A' }), pcp({ name: 'P', pcpEnd: 'hand-back', term: 24, value: add(car().value!, fromPounds(9000)) })])
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('none')
    if (v.kind === 'none') expect(v.reason).toBe('one-full')
    expect(v.text).toMatch(/^No verdict: only A covers all 48 months/)
  })

  it('no option covers the horizon: no verdict', () => {
    const i = inputs([pcp({ name: 'P', pcpEnd: 'hand-back', term: 24 }), pcp({ name: 'Q', pcpEnd: 'hand-back', term: 36 })])
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.kind).toBe('none')
    if (v.kind === 'none') expect(v.reason).toBe('no-full')
    expect(bottomLine(comparison, 'expected', names, gbp)).toEqual([])
  })

  it('a savings return above zero is stated, without the zero-return sentence', () => {
    const i = inputs([cash({ name: 'A' }), cash({ name: 'B', value: add(car().value!, fromPounds(1000)) })], { savingsReturn: '4' })
    const { comparison, names } = run(i)
    const v = verdict(comparison, 'expected', names, savings(i), gbp)
    expect(v.text).toMatch(/It uses a savings return of 4% a year after tax\.$/)
    expect(v.text).not.toMatch(/costs nothing/)
  })
})

describe('switch cost', () => {
  it('only when a Keep option exists', () => {
    const i = inputs([cash({ name: 'A' }), cash({ name: 'B', value: add(car().value!, fromPounds(1000)) })])
    const { comparison, names } = run(i)
    expect(switchCosts(comparison, 'expected', names, gbp)).toEqual([])
  })

  it('more and less, against keeping; partial-coverage options left out', () => {
    const i = inputs([
      keep({ name: 'Old' }),
      cash({ name: 'Dear', value: fromPounds(60_000) }),
      cash({ name: 'Low', value: fromPounds(1_000), endLow: ZERO, endExpected: ZERO, endHigh: ZERO }),
      pcp({ name: 'P', pcpEnd: 'hand-back', term: 24 }),
    ])
    const { comparison, names } = run(i)
    const costs = switchCosts(comparison, 'expected', names, gbp)
    expect(costs.map((c) => names[c.option])).not.toContain('P')
    const dear = costs.find((c) => names[c.option] === 'Dear')!
    expect(dear.direction).toBe('more')
    expect(dear.text).toMatch(/^Switching to Dear costs £[\d,.]+ a month more than keeping Old: £[\d,.]+ more over 48 months\.$/)
    for (const c of costs) {
      const d = subtract(comparison.options[c.option]!.cases.expected.netCost, comparison.options[c.keep]!.cases.expected.netCost)
      expect(c.total).toEqual(compare(d, ZERO) < 0 ? subtract(ZERO, d) : d)
      expect(c.direction).toBe(compare(d, ZERO) > 0 ? 'more' : compare(d, ZERO) < 0 ? 'less' : 'same')
    }
  })
})

describe('the scenario table', () => {
  it('says when the lowest changes between Low, Expected and High (the case is not ignored)', () => {
    const same = { annualMileage: 0, insurance: ZERO, maintenance: ZERO, ved: ZERO, other: ZERO }
    const a = cash({
      name: 'A',
      value: fromPounds(10_000),
      endLow: fromPounds(5_000),
      endExpected: fromPounds(5_000),
      endHigh: fromPounds(5_000),
      ...same,
    })
    const b = cash({
      name: 'B',
      value: fromPounds(12_000),
      endLow: fromPounds(6_000),
      endExpected: fromPounds(7_000),
      endHigh: fromPounds(9_000),
      ...same,
    })
    const i = inputs([a, b], { savingsReturn: '0' })
    const { comparison, names } = run(i)
    const table = scenarioTable(comparison, names)
    expect(table.lowest).toEqual({ low: [0], expected: [0, 1], high: [1] })
    expect(table.changes).toBe(true)
    expect(table.sentence).toBe('The lowest net cost changes with the end value: low, A; expected, A and B (tied); high, B.')
    for (const valueCase of ['low', 'expected', 'high'] as const) {
      const v = verdict(comparison, valueCase, names, savings(i), gbp)
      expect(v.kind).toBe(valueCase === 'expected' ? 'tie' : 'lowest')
      if (v.kind === 'lowest') expect(v.lowest).toEqual(table.lowest[valueCase])
    }
  })
})

describe('random cases against the engine', () => {
  const random = seeded(3_301)
  const cases: CarDecisionInputs[] = []
  for (let n = 0; n < 150; n++) cases.push(randomInputs(random, n, MAX_CAR_OPTIONS))
  const usable = cases.filter((i) => {
    const outcome = calculate(i)
    return outcome.kind === 'ok' && outcome.comparison !== null
  })

  it('most random cases compare', () => {
    expect(usable.length).toBeGreaterThanOrEqual(100)
  })

  const perMonth = (amount: Money, months: number) => roundExact(exactMul(exact(amount), ratio(1, months)), 'nearest')

  it('the verdict follows the engine’s full-coverage ranking per month owned, never a partial option, with the exact gap', () => {
    for (const i of usable) {
      const { comparison, names } = run(i)
      for (const valueCase of ['low', 'expected', 'high'] as const) {
        const v = verdict(comparison, valueCase, names, savings(i), gbp)
        const full = comparison.ranking[valueCase].full
        if (v.kind === 'none') continue
        for (const o of v.lowest) expect(comparison.options[o]!.fullCoverage).toBe(true)
        expect(v.lowest[0]).toBe(full[0]!.option)
        if (v.kind === 'lowest') {
          expect(comparison.options[v.next]!.fullCoverage).toBe(true)
          const gap = subtract(
            comparison.options[v.next]!.cases[valueCase].netCost,
            comparison.options[v.lowest[0]!]!.cases[valueCase].netCost,
          )
          expect(v.gapTotal).toEqual(gap)
          expect(v.gapPerMonth).toEqual(perMonth(gap, i.horizonMonths))
        }
      }
    }
  })

  it('the largest part is a part of the engine’s breakdown, the parts add up to the net cost', () => {
    for (const i of usable) {
      const { comparison } = run(i)
      for (const result of comparison.options) {
        for (const valueCase of ['low', 'expected', 'high'] as const) {
          const c = result.cases[valueCase]
          const parts = breakdownParts(c.breakdown)
          expect(parts.map((p) => p.value).reduce(add, ZERO)).toEqual(c.netCost)
          const largest = largestCost(c.breakdown, c.netCost, gbp)
          const top = parts.reduce((m, p) => (compare(p.value, m) > 0 ? p.value : m), parts[0]!.value)
          if (compare(top, ZERO) <= 0) expect(largest).toBeNull()
          else {
            expect(largest!.value).toEqual(top)
            expect(largest!.parts.map((p) => p.id)).toEqual(parts.filter((p) => compare(p.value, top) === 0).map((p) => p.id))
          }
        }
      }
    }
  })

  it('the scenario rows are the engine’s per month owned in each case', () => {
    for (const i of usable) {
      const { comparison, names } = run(i)
      const table = scenarioTable(comparison, names)
      table.rows.forEach((row, k) => {
        for (const valueCase of ['low', 'expected', 'high'] as const)
          expect(row.perMonth[valueCase]).toEqual(comparison.options[k]!.cases[valueCase].netCostPerCoverageMonth)
      })
    }
  })

  it('money flows add up to the engine’s timeline of acquisition payments', () => {
    let finals = 0
    for (const i of usable) {
      const { outcome } = run(i)
      for (const status of outcome.statuses) {
        if (status.kind !== 'ok') continue
        const { option, result } = status
        const flows = moneyFlows(option, result)
        expect(flows.upfront).toEqual(result.timeline[0]!.acquisition)
        if (!result.finance) {
          expect(flows.monthly).toBeNull()
          continue
        }
        const term = result.finance.schedule.rows.length
        if (term >= 2 && term <= result.coverageMonths) expect(flows.monthly!.amount).toEqual(result.timeline[1]!.acquisition)
        if (flows.final?.withinHorizon) {
          finals++
          const paid = result.timeline
            .slice(1, term + 1)
            .map((m) => m.acquisition)
            .reduce(add, ZERO)
          const regular = result.finance.schedule.rows.map((r) => r.payment).reduce(add, ZERO)
          expect(paid).toEqual(add(add(regular, flows.final.amount), flows.final.fee))
        }
      }
    }
    expect(finals).toBeGreaterThan(0)
  })

  it('no generated sentence uses the banned words', () => {
    for (const i of [...usable, ownerPage()]) for (const text of allText(i)) expect(text).not.toMatch(BANNED)
  })
})

describe('the case is used, not ignored', () => {
  it('the verdict’s figures change with the case on the owner’s page', () => {
    const i = ownerPage()
    const { comparison, names } = run(i)
    const texts = (['low', 'expected', 'high'] as ValueCase[]).map((c) => verdict(comparison, c, names, savings(i), gbp).text)
    expect(new Set(texts).size).toBe(3)
  })

  it('keeps the owner fixture’s inputs as given in the brief', () => {
    expect(OWNER_KEEP.acquisition).toBe('keep')
    expect(OWNER_PCP.term).toBe(48)
  })
})
