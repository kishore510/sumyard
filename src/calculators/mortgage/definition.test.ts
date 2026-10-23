import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import { MAX_INPUT_AMOUNT, MAX_LIST_ITEMS, MAX_MORTGAGE_TERM_MONTHS } from '@/lib/inputLimits'
import { fromPence, fromPounds, percent, toPence, ZERO } from '@/lib/money'
import { formatDelta } from '@/pages/ComparePage'
import { readScenario } from '@/scenarios/scenario'
import { CALCULATORS } from '../index'
import { isInputRefusal } from '../registry'
import { scenarioTaxYear } from '../session'
import { overpay } from './calc'
import {
  calculate,
  type MortgagePageInputs,
  mortgageCalculator,
  paymentMonthOnOrAfter,
  paymentsOnOrBefore,
  sectionNeeded,
  sectionSet,
  sectionSummary,
  toEngineInputs,
  withWhatIf,
} from './definition'

/*
 * The mortgage overpayment page's registry entry (M2, inputs version 1).
 * Inputs from storage or an imported file are untrusted, so validateInputs
 * checks every field and builds a fresh object. Contract figures are made up.
 */

const defaults = () => mortgageCalculator.defaultInputs()
const check = (raw: unknown) => mortgageCalculator.validateInputs(raw)
const errorsOf = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? [] : result.errors
}

const example: MortgagePageInputs = {
  startDate: '2026-01-15',
  balance: fromPounds(200_000),
  termYears: 25,
  termExtraMonths: 0,
  repaymentType: 'repayment',
  fixed: true,
  fixedRate: '4.5',
  fixedEndDate: '2028-01-31',
  reversionRate: '7',
  monthly: fromPounds(200),
  effect: 'reduce-term',
  lumpSums: [{ date: '2026-06-01', amount: fromPounds(5_000) }],
  erc: true,
  ercRate: '3',
  ercEndDate: null,
  allowanceKind: 'rate',
  allowanceRate: '10',
  allowanceAmount: null,
  allowanceUsed: fromPounds(1_000),
  paymentsToReset: 4,
  interestMethod: 'monthly',
  dayCount: 'actual/365',
}

describe('registration', () => {
  it('is registered as mortgage, inputs version 1, with no tax rules, last on the home page', () => {
    expect(CALCULATORS.get('mortgage')).toBe(mortgageCalculator)
    expect(mortgageCalculator.inputsVersion).toBe(1)
    expect(mortgageCalculator.taxRules).toBe('none')
    expect(mortgageCalculator.name).toBe('Mortgage overpayment')
    expect(CALCULATORS.list().at(-1)).toBe(mortgageCalculator)
  })

  it('a scenario carries no tax year and round-trips its inputs', () => {
    expect(scenarioTaxYear(mortgageCalculator, { taxYear: '2026-27' })).toBeUndefined()
    const raw = {
      id: 'm1',
      calculatorId: 'mortgage',
      name: 'Mine',
      inputs: example,
      inputsVersion: 1,
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    }
    const read = readScenario(raw, CALCULATORS)
    expect(read.ok && Object.hasOwn(read.scenario, 'taxYear')).toBe(false)
    expect(read.ok && read.scenario.inputs).toEqual(example)
  })

  it('a migration has nothing to migrate from', () => {
    expect(() => mortgageCalculator.migrateInputs(0, {})).toThrow()
  })
})

describe('defaults', () => {
  it('are valid, with no made-up figures: the contract boxes start empty', () => {
    const d = defaults()
    expect(check(d)).toEqual({ ok: true, inputs: d })
    expect([d.startDate, d.balance, d.termYears, d.fixedRate, d.fixedEndDate, d.reversionRate]).toEqual([null, null, null, null, null, null])
    expect(d.monthly).toBe(ZERO)
    expect(d.lumpSums).toEqual([])
    expect(d.erc).toBe(false)
    expect([d.ercRate, d.allowanceRate, d.allowanceAmount]).toEqual([null, null, null])
    expect(d.allowanceUsed).toBe(ZERO)
    expect(d.paymentsToReset).toBe(0)
    expect([d.interestMethod, d.dayCount]).toEqual(['monthly', 'actual/365'])
  })

  it('a fresh copy each time', () => {
    expect(defaults()).not.toBe(defaults())
    expect(defaults().lumpSums).not.toBe(defaults().lumpSums)
  })

  it('no section is set on a fresh page; the loan and fixed-rate sections are needed', () => {
    const d = defaults()
    for (const id of ['loan', 'fixed', 'overpay', 'erc', 'advanced'] as const) expect(sectionSet(id, d)).toBe(false)
    expect(sectionNeeded('loan', d)).toBe(true)
    expect(sectionNeeded('fixed', d)).toBe(true)
    expect(sectionNeeded('overpay', d)).toBe(false)
    for (const id of ['loan', 'fixed', 'overpay', 'erc'] as const) expect(sectionSet(id, example)).toBe(true)
    expect(sectionSet('advanced', example)).toBe(false)
    expect(sectionSet('advanced', { ...example, interestMethod: 'daily' })).toBe(true)
  })
})

describe('validateInputs', () => {
  it('accepts valid inputs and builds a fresh object', () => {
    const result = check(example)
    expect(result).toEqual({ ok: true, inputs: example })
    expect(result.ok && result.inputs).not.toBe(example)
    expect(result.ok && result.inputs.lumpSums[0]).not.toBe(example.lumpSums[0])
  })

  it('drops unknown fields', () => {
    const result = check({ ...example, extra: 1, lumpSums: [{ ...example.lumpSums[0], note: 'x' }] })
    expect(result.ok && result.inputs).toEqual(example)
  })

  it.each([
    ['not an object', null],
    ['an array', []],
    ['a string', 'mortgage'],
  ])('refuses %s', (_, raw) => {
    expect(check(raw).ok).toBe(false)
  })

  it('refuses hostile keys', () => {
    const hostile = JSON.parse(`{"lumpSums":[{"__proto__":{"x":1},"date":"2026-06-01","amount":1}]}`)
    expect(errorsOf({ ...example, ...hostile }).join(' ')).toMatch(/not safe/)
    expect(check({ ...example, constructor: 1 }).ok).toBe(false)
  })

  it.each([
    ['no balance owed', { balance: 0 }, /Balance owed/],
    ['a balance past the input limit', { balance: toPence(MAX_INPUT_AMOUNT) + 1 }, /Balance owed/],
    ['a balance as a decimal', { balance: 1.5 }, /Balance owed/],
    ['a date that does not exist', { startDate: '2026-02-30' }, /Start date/],
    ['a date in another form', { startDate: '15/01/2026' }, /Start date/],
    ['a fixed-rate end that is not a date', { fixedEndDate: 'soon' }, /Fixed rate ends/],
    ['a term past the longest', { termYears: MAX_MORTGAGE_TERM_MONTHS / 12 + 1 }, /Years left/],
    ['a term in part-years', { termYears: 2.5 }, /Years left/],
    ['twelve extra months', { termExtraMonths: 12 }, /Months left/],
    ['a rate past the most', { fixedRate: '101' }, /Fixed rate/],
    ['a rate with three decimals', { reversionRate: '4.125' }, /rate after/],
    ['a rate that is not canonical', { ercRate: '3%' }, /Early repayment charge/],
    ['payments to the reset past a year', { paymentsToReset: 13 }, /Payments until/],
    ['allowance used below nothing', { allowanceUsed: -1 }, /Allowance used/],
    ['an unknown allowance kind', { allowanceKind: 'both' }, /Penalty-free limit as/],
    ['an unknown interest method', { interestMethod: 'annual' }, /Interest worked out/],
    ['an unknown day count', { dayCount: '30/360' }, /Day count/],
    ['an unknown repayment type', { repaymentType: 'part-and-part' }, /Repayment type/],
    ['an unknown effect', { effect: 'both' }, /Overpaying/],
    ['a switch that is not on or off', { erc: 'yes' }, /Early repayment charge applies/],
    ['lump sums that are not a list', { lumpSums: {} }, /Lump sums/],
    ['a lump sum with no amount', { lumpSums: [{ date: '2026-06-01' }] }, /Lump sum 1/],
    ['a lump sum dated wrongly', { lumpSums: [{ date: '2026-13-01', amount: 1 }] }, /Lump sum 1/],
    ['a lump sum that is not an object', { lumpSums: [null] }, /Lump sum 1/],
  ])('refuses %s', (_, patch, message) => {
    expect(errorsOf({ ...example, ...patch }).join(' ')).toMatch(message)
  })

  it('refuses more lump sums than a list holds (MAX_LIST_ITEMS)', () => {
    const lump = example.lumpSums[0]!
    expect(check({ ...example, lumpSums: Array.from({ length: MAX_LIST_ITEMS }, () => lump) }).ok).toBe(true)
    expect(errorsOf({ ...example, lumpSums: Array.from({ length: MAX_LIST_ITEMS + 1 }, () => lump) }).join(' ')).toMatch(/at most/)
  })
})

describe('dates to payment months (MO1, MO6)', () => {
  it('a lump sum goes with the first payment on or after its date', () => {
    // Payments on the 31st fall on a shorter month's last day: 28 February 2026, then 31 March.
    expect(paymentMonthOnOrAfter('2026-01-31', '2026-02-28', 12)).toBe(1)
    expect(paymentMonthOnOrAfter('2026-01-31', '2026-03-01', 12)).toBe(2)
    expect(paymentMonthOnOrAfter('2026-01-31', '2026-02-01', 12)).toBe(1)
    expect(paymentMonthOnOrAfter('2026-01-31', '2027-01-31', 12)).toBe(12)
  })

  it('a date after the last payment has no month', () => {
    expect(paymentMonthOnOrAfter('2026-01-31', '2027-02-01', 12)).toBeNull()
  })

  it('the fixed rate covers every payment on or before its end date', () => {
    expect(paymentsOnOrBefore('2026-01-15', '2028-01-31', 300)).toBe(24)
    expect(paymentsOnOrBefore('2026-01-15', '2028-01-15', 300)).toBe(24)
    expect(paymentsOnOrBefore('2026-01-15', '2028-01-14', 300)).toBe(23)
    expect(paymentsOnOrBefore('2026-01-15', '2026-01-15', 300)).toBe(0)
    expect(paymentsOnOrBefore('2026-01-15', '2060-01-01', 300)).toBe(300)
  })
})

describe('the engine’s inputs', () => {
  it('maps dates to months, the charge and the allowance already used', () => {
    const engine = toEngineInputs(example)
    expect(engine.ok && engine.inputs).toEqual({
      startDate: '2026-01-15',
      balance: fromPounds(200_000),
      termMonths: 300,
      repaymentType: 'repayment',
      fixedRate: percent('4.5'),
      fixedEndMonth: 24,
      reversionRate: percent('7'),
      effect: 'reduce-term',
      regular: { amount: fromPounds(200), fromMonth: 1, toMonth: 300 },
      lumpSums: [{ month: 5, amount: fromPounds(5_000) }],
      erc: {
        rate: percent('3'),
        endMonth: 24,
        allowance: { kind: 'rate', rate: percent('10') },
        usedThisYear: fromPounds(1_000),
        paymentsToReset: 4,
      },
      policy: { interestMethod: 'monthly', dayCount: 'actual/365' },
    })
  })

  it('no fixed rate: the reversion rate is the rate from the start', () => {
    const engine = toEngineInputs({ ...example, fixed: false, fixedRate: null, fixedEndDate: null })
    expect(engine.ok && [engine.inputs.fixedEndMonth, engine.inputs.fixedRate]).toEqual([0, percent('7')])
  })

  it('a charge with its own end date, as an amount; none when switched off; no regular overpayment at nothing', () => {
    const own = toEngineInputs({ ...example, ercEndDate: '2027-01-15', allowanceKind: 'amount', allowanceAmount: fromPounds(5_000) })
    expect(own.ok && own.inputs.erc).toMatchObject({ endMonth: 12, allowance: { kind: 'amount', amount: fromPounds(5_000) } })
    const off = toEngineInputs({ ...example, erc: false, monthly: ZERO })
    expect(off.ok && [off.inputs.erc, off.inputs.regular]).toEqual([null, null])
  })

  it('names what is still needed, by field', () => {
    const d = toEngineInputs(defaults())
    expect(!d.ok && d.kind === 'missing' && d.fields).toEqual(['startDate', 'balance', 'termYears', 'fixedRate', 'fixedEndDate', 'reversionRate'])
    const erc = toEngineInputs({ ...example, ercRate: null, allowanceRate: null })
    expect(!erc.ok && erc.kind === 'missing' && erc.fields).toEqual(['ercRate', 'allowanceRate'])
    const lump = toEngineInputs({ ...example, lumpSums: [{ date: null, amount: fromPounds(1) }] })
    expect(!lump.ok && lump.kind === 'missing' && lump.fields).toEqual(['lumpSums.0.date'])
  })

  it('the reversion rate is not needed when the fixed rate lasts the term', () => {
    const engine = toEngineInputs({ ...example, reversionRate: null, fixedEndDate: '2060-01-01' })
    expect(engine.ok && [engine.inputs.fixedEndMonth, engine.inputs.reversionRate]).toEqual([300, percent('4.5')])
  })

  it('refuses a lump sum dated on or before the start, or after the last payment, by field', () => {
    for (const date of ['2026-01-15', '2051-02-01'] as const) {
      const out = calculate({ ...example, lumpSums: [{ date, amount: fromPounds(1) }] })
      expect(out.kind).toBe('refused')
      expect(out.kind === 'refused' && out.refusal.problems.map((p) => p.label)).toEqual(['Lump sum 1 date'])
    }
  })

  it('passes the engine’s refusals on with the page’s labels', () => {
    const out = calculate({ ...example, termYears: 0, termExtraMonths: 0 })
    expect(out.kind === 'refused' && out.refusal.problems.map((p) => p.label)).toContain('Term left')
  })

  it('the result is the engine’s, on the mapped inputs', () => {
    const out = calculate(example)
    const engine = toEngineInputs(example)
    expect(out.kind === 'ok' && engine.ok && out.result).toEqual((overpay(engine.inputs) as { result: unknown }).result)
  })

  it('a what-if replaces only the monthly overpayment', () => {
    expect(withWhatIf(example, fromPounds(350))).toEqual({ ...example, monthly: fromPounds(350) })
  })
})

describe('summarise (scenarios and compare)', () => {
  it('lists the inputs and the answers, typed so compare can show changes', () => {
    const { inputs, results } = mortgageCalculator.summarise(example, taxYear)
    expect(inputs.map((r) => r.label)).toEqual([
      'Start date',
      'Balance owed',
      'Term left',
      'Repayment type',
      'Fixed rate',
      'Fixed rate ends',
      'Interest rate after the fixed rate',
      'Monthly overpayment',
      'Lump sums',
      'Overpaying',
      'Early repayment charge',
      'Penalty-free limit',
      'Allowance used this year',
      'Payments until the allowance resets',
      'Interest worked out',
    ])
    expect(results.ok && results.rows.map((r) => r.label)).toEqual([
      'Interest saved',
      'Term cut (months)',
      'New payoff date',
      'Total paid',
      'Early repayment charge paid',
      'Net saving',
      'Break-even',
      'Payment now',
      'Balance when the fixed rate ends',
      'Return while fixed',
      'Return after the fixed rate',
    ])
    const out = calculate(example)
    if (out.kind !== 'ok') throw new Error('expected a result')
    const saved = results.ok && results.rows[0]!.value
    expect(saved).toEqual({ kind: 'money', amount: out.result.interestSaved })
  })

  it('compare shows the change in pounds and months between two scenarios', () => {
    const a = mortgageCalculator.summarise(example, taxYear).results
    const b = mortgageCalculator.summarise({ ...example, monthly: fromPounds(400) }, taxYear).results
    if (!a.ok || !b.ok) throw new Error('expected results')
    expect(formatDelta(b.rows[0]!.value, a.rows[0]!.value, 'pence')).toMatch(/^\+£/)
    expect(formatDelta(b.rows[1]!.value, a.rows[1]!.value, 'pence')).toMatch(/^\+\d/)
  })

  it('with inputs still needed, the results say which, by field', () => {
    const { results } = mortgageCalculator.summarise(defaults(), taxYear)
    expect(!results.ok && isInputRefusal(results) && results.problems.map((p) => p.label)).toEqual([
      'Start date',
      'Balance owed',
      'Years left',
      'Fixed rate',
      'Fixed rate ends',
      'Interest rate after the fixed rate',
    ])
  })

  it('without a charge or a fixed rate, those rows say none', () => {
    const { results } = mortgageCalculator.summarise({ ...example, erc: false, fixed: false }, taxYear)
    const rows = results.ok ? Object.fromEntries(results.rows.map((r) => [r.label, r.value])) : {}
    expect(rows['Early repayment charge paid']).toEqual({ kind: 'money', amount: ZERO })
    expect(rows['Net saving']).toBeUndefined()
    expect(rows['Return while fixed']).toBeUndefined()
  })
})

describe('section summaries (U2)', () => {
  it('say Not set, what is needed, or the inputs in a line', () => {
    const d = defaults()
    expect(sectionSummary('overpay', d, [])).toBe('Not set')
    expect(sectionSummary('loan', d, [])).toBe('Needs start date, balance owed, years left')
    expect(sectionSummary('loan', example, [])).toBe('£200,000 over 25 years, repayment, from 15 January 2026')
    expect(sectionSummary('fixed', example, [])).toBe('4.5% to 31 January 2028, then 7%')
    expect(sectionSummary('fixed', { ...example, fixed: false }, [])).toBe('No fixed rate; 7%')
    expect(sectionSummary('overpay', example, [])).toBe('£200 a month and one lump sum; shorten the term')
    expect(sectionSummary('erc', example, [])).toBe('3% above 10% a year, until the fixed rate ends')
    expect(sectionSummary('erc', d, [])).toBe('Not set')
    expect(sectionSummary('advanced', { ...example, interestMethod: 'daily' }, [])).toBe('Daily, actual/365')
    expect(sectionSummary('loan', example, ['balance'])).toBe('Fix the highlighted input')
    expect(sectionSummary('overpay', example, ['lumpSums.0.amount'])).toBe('Fix the highlighted input')
  })

  it('carry pence only where there are any', () => {
    expect(sectionSummary('overpay', { ...example, monthly: fromPence(20_050), lumpSums: [] }, [])).toBe(
      '£200.50 a month; shorten the term',
    )
  })
})
