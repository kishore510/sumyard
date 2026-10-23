import { describe, expect, it } from 'vitest'
import { taxYear } from '@/config/tax/2026-27'
import {
  MAX_AGE_YEARS,
  MAX_INPUT_AMOUNT,
  MAX_PROJECTION_YEARS,
  NEXT_POUND_GROWTH_HIGH,
  NEXT_POUND_GROWTH_LOW,
  NEXT_POUND_GROWTH_MID,
} from '@/lib/inputLimits'
import { add, fromPounds, percent, ratio, subtract, ZERO } from '@/lib/money'
import { readScenario } from '@/scenarios/scenario'
import { CALCULATORS } from '../index'
import { mortgageCalculator } from '../mortgage/definition'
import { thresholdContributions } from '../optimiser/calc'
import { optimiserCalculator } from '../optimiser/definition'
import { toOptimiserInputs } from '../optimiser/optimiserInputs'
import { DEFAULT_POLICY } from '../optimiser/types'
import { isInputRefusal } from '../registry'
import { scenarioTaxYear } from '../session'
import { nextPound } from './calc'
import {
  breakEvenWords,
  calculate,
  midValue,
  mortgageEntered,
  type NextPoundPageInputs,
  nextPoundCalculator,
  noBreakEvenWords,
  percentText,
  sectionForField,
  sectionSet,
  sectionSummary,
  toEngineInputs,
} from './definition'
import { unverifiedConfig } from './fixtures/pageInputs'

/*
 * C2 and its rebuild: the next pound page's registry entry (inputs version
 * 2: version 1 plus which take-home and mortgage scenarios were picked). Inputs from
 * storage or an imported file are untrusted, so validateInputs checks every
 * field and builds a fresh object; the pay is the take-home page's inputs and
 * the mortgage the mortgage page's, checked by their own definitions. Every
 * expected figure comes from the composer; pay, balances and rates here are
 * made up for tests.
 */

const defaults = () => nextPoundCalculator.defaultInputs()
const check = (raw: unknown) => nextPoundCalculator.validateInputs(raw)
const errorsOf = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? [] : result.errors
}

const pay = { ...optimiserCalculator.defaultInputs(), salary: fromPounds(60_000) }
const pension = {
  ...pay,
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
  ...defaults(),
  lumpSum: fromPounds(10_000),
  horizonYears: 20,
  asOf: '2026-10-23',
  ageNow: 40,
  pay: pension,
  mortgage,
  paySource: { kind: 'kept' },
  mortgageSource: { kind: 'kept' },
  feeRate: '0.5',
  inflationRate: '2',
}

const ok = (inputs: NextPoundPageInputs = example) => {
  const out = calculate(inputs, taxYear)
  if (out.kind !== 'ok') throw new Error(out.kind)
  return out
}

describe('registration', () => {
  it('is registered as next-pound, inputs version 2, a tax calculator, last on the home page', () => {
    expect(CALCULATORS.get('next-pound')).toBe(nextPoundCalculator)
    expect(nextPoundCalculator.inputsVersion).toBe(2)
    expect(nextPoundCalculator.taxRules).toBeUndefined()
    expect(CALCULATORS.list().at(-1)).toBe(nextPoundCalculator)
  })

  it('a scenario carries the tax year and round-trips its inputs', () => {
    expect(scenarioTaxYear(nextPoundCalculator, { taxYear: '2026-27' })).toBe('2026-27')
    const raw = {
      id: 'n1',
      calculatorId: 'next-pound',
      name: 'Mine',
      inputs: example,
      inputsVersion: 2,
      taxYear: '2026-27',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    }
    const read = readScenario(raw, CALCULATORS)
    expect(read.ok && read.scenario.taxYear).toBe('2026-27')
    expect(read.ok && read.scenario.inputs).toEqual(example)
  })

  it('a newer version is refused; version 2 reads as it is', () => {
    expect(() => nextPoundCalculator.migrateInputs(0, {})).toThrow()
    expect(CALCULATORS.readInputs('next-pound', 3, example)).toMatchObject({ ok: false, reason: 'newer-inputs' })
    expect(CALCULATORS.readInputs('next-pound', 2, example)).toMatchObject({ ok: true, migrated: false, inputs: example })
  })
})

describe('migration from version 1 (sources added)', () => {
  const v1 = (patch: Record<string, unknown> = {}) => {
    const { paySource: _p, mortgageSource: _m, ...rest } = example
    return { ...rest, ...patch }
  }

  it('pay and a mortgage typed in version 1 are kept as saved with the scenario', () => {
    const read = CALCULATORS.readInputs('next-pound', 1, v1())
    expect(read).toMatchObject({ ok: true, migrated: true })
    expect(read.ok && read.inputs).toEqual(example)
  })

  it('no pay in version 1: the pay source is the most recent (auto); no mortgage: none', () => {
    const read = CALCULATORS.readInputs(
      'next-pound',
      1,
      v1({ pay: optimiserCalculator.defaultInputs(), mortgage: mortgageCalculator.defaultInputs() }),
    )
    expect(read.ok && (read.inputs as NextPoundPageInputs).paySource).toEqual({ kind: 'auto' })
    expect(read.ok && (read.inputs as NextPoundPageInputs).mortgageSource).toEqual({ kind: 'none' })
  })

  it('a version 1 record that is not valid stays refused, by field', () => {
    const read = CALCULATORS.readInputs('next-pound', 1, v1({ lumpSum: -1 }))
    expect(read.ok).toBe(false)
    expect(CALCULATORS.readInputs('next-pound', 1, 'x').ok).toBe(false)
  })

  it('a version 1 scenario reads back through readScenario as version 2', () => {
    const raw = {
      id: 'n1',
      calculatorId: 'next-pound',
      name: 'Old',
      inputs: v1(),
      inputsVersion: 1,
      taxYear: '2026-27',
      createdAt: '2026-10-23T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    }
    const read = readScenario(raw, CALCULATORS)
    expect(read.ok && read.migrated).toBe(true)
    expect(read.ok && read.scenario.inputsVersion).toBe(2)
    expect(read.ok && read.scenario.inputs).toEqual(example)
  })

  it('applySettings sets the region of the pay', () => {
    expect(nextPoundCalculator.applySettings!(defaults(), { region: 'scotland' }).pay.region).toBe('scotland')
    expect(nextPoundCalculator.applySettings!(defaults(), { region: 'ruk' }).pay.region).toBe('rUK')
  })
})

describe('defaults', () => {
  it('are valid, with no made-up figures: the date and age start empty, the mortgage not set up, the sources the most recent', () => {
    const d = defaults()
    expect(check(d)).toEqual({ ok: true, inputs: d })
    expect([d.asOf, d.ageNow, d.schemeAccessAge, d.retirementTaxRate]).toEqual([null, null, null, null])
    expect(d.lumpSum).toBe(ZERO)
    expect(d.pay).toEqual(optimiserCalculator.defaultInputs())
    expect(mortgageEntered(d)).toBe(false)
    expect([d.paySource, d.mortgageSource]).toEqual([{ kind: 'auto' }, { kind: 'auto' }])
  })

  it('start the growth rates from the illustrative starting values in inputLimits', () => {
    const d = defaults()
    expect([d.growthLow, d.growthMid, d.growthHigh]).toEqual([
      percentText(NEXT_POUND_GROWTH_LOW),
      percentText(NEXT_POUND_GROWTH_MID),
      percentText(NEXT_POUND_GROWTH_HIGH),
    ])
  })

  it('percentText gives canonical percentage text exactly', () => {
    expect(percentText(percent('2'))).toBe('2')
    expect(percentText(percent('0.5'))).toBe('0.5')
    expect(percentText(ratio(-125, 10_000))).toBe('-1.25')
    expect(percentText(percent('0'))).toBe('0')
  })

  it('a fresh copy each time', () => {
    expect(defaults()).not.toBe(defaults())
    expect(defaults().pay).not.toBe(defaults().pay)
  })
})

describe('validateInputs', () => {
  it('accepts valid inputs and builds a fresh object', () => {
    const result = check(example)
    expect(result).toEqual({ ok: true, inputs: example })
    expect(result.ok && result.inputs).not.toBe(example)
    expect(result.ok && result.inputs.pay).not.toBe(example.pay)
  })

  it('drops unknown fields, and the mortgage’s own overpayments (the composer makes the one)', () => {
    const raw = {
      ...example,
      extra: 1,
      mortgage: { ...mortgage, monthly: fromPounds(100), lumpSums: [{ date: '2027-01-01', amount: 5 }], effect: 'reduce-payment' },
    }
    expect(check(raw)).toEqual({ ok: true, inputs: example })
  })

  it('refuses each field by name', () => {
    const cases: [Partial<Record<keyof NextPoundPageInputs, unknown>>, RegExp][] = [
      [{ lumpSum: -1 }, /Lump sum/],
      [{ lumpSum: MAX_INPUT_AMOUNT + 1 }, /Lump sum/],
      [{ lumpSum: 1.5 }, /Lump sum/],
      [{ horizonYears: 0 }, /Years to the horizon/],
      [{ horizonYears: MAX_PROJECTION_YEARS + 1 }, /Years to the horizon/],
      [{ asOf: '2026-02-30' }, /Date the money goes in/],
      [{ ageNow: MAX_AGE_YEARS + 1 }, /Your age now/],
      [{ ageNow: -1 }, /Your age now/],
      [{ schemeAccessAge: 'sixty' }, /access age/],
      [{ retirementTaxRate: '101' }, /Tax rate on the pension/],
      [{ retirementTaxRate: '20.000' }, /Tax rate on the pension/],
      [{ otherPensionsUseAllowance: 'no' }, /lump sum allowance/],
      [{ growthLow: '7.5%' }, /Low growth rate/],
      [{ growthMid: 7 }, /Mid growth rate/],
      [{ growthHigh: '1000' }, /High growth rate/],
      [{ feeRate: '-1' }, /Annual fee/],
      [{ inflationRate: '1000' }, /Inflation/],
      [{ isaPaidThisYear: null }, /Paid into ISAs/],
      [{ employerMatch: '5' }, /Employer match/],
      [{ paySource: { kind: 'none' } }, /Pay from/],
      [{ paySource: { kind: 'scenario', id: 'bad id!', name: 'x' } }, /Pay from/],
      [{ paySource: { kind: 'scenario', id: 'a1', name: '' } }, /Pay from/],
      [{ mortgageSource: { kind: 'session' } }, /Mortgage from/],
      [{ mortgageSource: 'none' }, /Mortgage from/],
    ]
    for (const [patch, message] of cases) {
      const errors = errorsOf({ ...example, ...patch })
      expect(errors.length, JSON.stringify(patch)).toBeGreaterThan(0)
      expect(errors.join(' '), JSON.stringify(patch)).toMatch(message)
    }
  })

  it('checks the pay with the take-home page’s validation and the mortgage with the mortgage page’s', () => {
    expect(errorsOf({ ...example, pay: { ...pension, salary: -1 } }).join(' ')).toMatch(/^Your pay: Salary/)
    expect(errorsOf({ ...example, pay: { ...pension, pensionMethod: 'cash' } }).join(' ')).toMatch(/Your pay: The pension method/)
    expect(errorsOf({ ...example, mortgage: { ...mortgage, balance: 0 } }).join(' ')).toMatch(/^Mortgage: Balance owed/)
    expect(errorsOf({ ...example, pay: 'x' }).join(' ')).toMatch(/Your pay/)
  })

  it('a picked scenario is kept by id and its name, cleaned', () => {
    const picked = {
      ...example,
      paySource: { kind: 'scenario', id: 'a1', name: '  My pay ' },
      mortgageSource: { kind: 'scenario', id: 'm1', name: 'Home' },
    }
    const result = check(picked)
    expect(result.ok && result.inputs.paySource).toEqual({ kind: 'scenario', id: 'a1', name: 'My pay' })
    expect(result.ok && result.inputs.mortgageSource).toEqual({ kind: 'scenario', id: 'm1', name: 'Home' })
    expect(check({ ...example, paySource: { kind: 'session', extra: 1 } })).toMatchObject({
      ok: true,
      inputs: { paySource: { kind: 'session' } },
    })
  })

  it('refuses hostile keys and things that are not inputs', () => {
    expect(check(JSON.parse('{"__proto__": {"x": 1}}')).ok).toBe(false)
    expect(check({ ...example, pay: JSON.parse('{"constructor": 1}') }).ok).toBe(false)
    for (const raw of [null, [], 'x', 1]) expect(check(raw).ok).toBe(false)
  })
})

describe('calculate', () => {
  it('equals the composer on the mapped inputs', () => {
    const mapped = toEngineInputs(example)
    if (!mapped.ok) throw new Error('needs')
    const out = ok()
    expect(out.result).toEqual(nextPound(mapped.inputs, taxYear, DEFAULT_POLICY))
    expect(mapped.inputs.mortgage).toMatchObject({ balance: mortgage.balance, termMonths: 300 })
    expect(mapped.inputs.pension.optimiser).toMatchObject({
      grossPay: pension.salary,
      pension: { method: 'netPay', contribution: fromPounds(3_000) },
    })
  })

  it('without a date, needs it by name (no legs)', () => {
    const out = calculate({ ...example, asOf: null }, taxYear)
    expect(out.kind).toBe('needs')
    expect(out.kind === 'needs' && out.refusal.problems.map((p) => p.label)).toEqual(['Date the money goes in'])
  })

  it('without pay, the pension leg needs it; the other legs still show', () => {
    const out = ok({ ...example, ageNow: null, pay: optimiserCalculator.defaultInputs() })
    expect(out.pension.kind).toBe('needs')
    expect(out.pension.kind === 'needs' && out.pension.refusal.problems.map((p) => p.label)).toEqual(['Salary'])
    expect(out.mortgage.kind).toBe('shown')
    expect(out.isa.kind).toBe('shown')
    expect(out.breakEven.pension).toBeNull()
    expect(out.warnings.pension).toEqual([])
  })

  it('without an age, the pension is shown with its numbers, the access not checked, and its break-even', () => {
    const out = ok({ ...example, ageNow: null, horizonYears: 5 })
    expect(out.pension.kind === 'shown' && out.pension.leg.status).toBe('accessible')
    expect(out.pension.kind === 'shown' && out.pension.leg.access).toBeNull()
    expect(out.breakEven.pension).not.toBeNull()
    const old = ok({ ...example, ageNow: 40, horizonYears: 5 })
    expect(old.pension.kind === 'shown' && old.pension.leg.status).toBe('not-accessible')
  })

  it('with no mortgage entered, that leg is not set up, even with a lump sum of nothing', () => {
    expect(ok({ ...example, lumpSum: ZERO, mortgage: mortgageCalculator.defaultInputs() }).mortgage).toEqual({ kind: 'none' })
  })

  it('with no mortgage entered, that leg is not set up, not a refusal', () => {
    const out = ok({ ...example, mortgage: mortgageCalculator.defaultInputs() })
    expect(out.mortgage).toEqual({ kind: 'none' })
    expect(out.breakEven.mortgage).toBeNull()
    expect(noBreakEvenWords('mortgage', out)).toMatch(/no mortgage is set up/)
  })

  it('a mortgage part-entered needs its boxes by name, on that leg only', () => {
    const out = ok({ ...example, mortgage: { ...mortgage, reversionRate: null } })
    expect(out.mortgage.kind).toBe('needs')
    expect(out.mortgage.kind === 'needs' && out.mortgage.refusal.problems.map((p) => [p.field, p.label])).toEqual([
      ['mortgage.reversionRate', 'Interest rate after the fixed rate'],
    ])
    expect(out.pension.kind).toBe('shown')
  })

  it('a mortgage the engine refuses is refused on that leg by field', () => {
    const out = ok({ ...example, mortgage: { ...mortgage, termYears: 0, termExtraMonths: 0 } })
    expect(out.mortgage.kind).toBe('refused')
    const refusal = out.mortgage.kind === 'refused' ? out.mortgage.refusal : null
    expect(refusal && isInputRefusal(refusal) && refusal.problems.map((p) => p.label)).toEqual(['Term left'])
  })

  it('growth rates out of order refuse the shared inputs by field', () => {
    const out = calculate({ ...example, growthLow: '6' }, taxYear)
    expect(out.kind).toBe('refused')
    expect(out.kind === 'refused' && out.refusal.problems.map((p) => p.label)).toEqual(['Mid growth rate'])
  })

  it('a retirement rate entered is used; a scheme age past the horizon makes the pension not accessible', () => {
    const entered = ok({ ...example, retirementTaxRate: '30' })
    expect(
      entered.pension.kind === 'shown' && entered.pension.leg.status === 'accessible' && entered.pension.leg.retirementTaxRateFrom,
    ).toBe('input')
    const late = ok({ ...example, schemeAccessAge: MAX_AGE_YEARS })
    expect(late.pension.kind === 'shown' && late.pension.leg.status).toBe('not-accessible')
    expect(midValue(late.pension)).toBeNull()
    expect(late.breakEven.pension).toBeNull()
    expect(noBreakEvenWords('pension', late)).toBe('No break-even: the pension is not accessible at horizon.')
  })

  it('an unverified value the composer reads refuses the whole result with the values', () => {
    const out = calculate(example, unverifiedConfig('isa.annualLimit'))
    expect(out.kind).toBe('unverified')
    expect(out.kind === 'unverified' && out.refusal.unverified).toContain('isa.annualLimit')
  })

  it('an unverified value only the optimiser reads refuses the pension leg only', () => {
    const out = ok({ ...example, retirementTaxRate: '20' })
    expect(out.pension.kind).toBe('shown')
    const refused = calculate({ ...example, retirementTaxRate: '20' }, unverifiedConfig('incomeTax.taperRate'))
    expect(refused.kind).toBe('ok')
    if (refused.kind !== 'ok') return
    expect(refused.pension.kind).toBe('refused')
    expect(refused.pension.kind === 'refused' && !isInputRefusal(refused.pension.refusal) && refused.pension.refusal.unverified).toContain(
      'incomeTax.taperRate',
    )
    expect(refused.isa.kind).toBe('shown')
  })

  it('says when the rate after a fixed period applies before the horizon (from the mortgage inputs and the leg’s month)', () => {
    expect(ok().reversionInHorizon).toBe(true)
    expect(ok({ ...example, horizonYears: 1 }).reversionInHorizon).toBe(false)
    expect(ok({ ...example, mortgage: { ...mortgage, fixed: false, fixedRate: null, fixedEndDate: null } }).reversionInHorizon).toBe(false)
    expect(ok({ ...example, mortgage: mortgageCalculator.defaultInputs() }).reversionInHorizon).toBe(false)
  })

  it('the personal allowance taper is in play only when the extra contribution lowers adjusted net income inside it', () => {
    const limits = (salary: ReturnType<typeof fromPounds>) => {
      const t = thresholdContributions(toOptimiserInputs({ ...pension, salary }), taxYear, DEFAULT_POLICY)
      if (!t.ok) throw new Error('refused')
      const limit = (id: string) => t.thresholds.find((x) => x.threshold === id)!.limit
      return { start: limit('personalAllowanceTaperStart'), end: limit('personalAllowanceTaperEnd') }
    }
    const { start, end } = limits(pension.salary)
    // Pay just above where the taper starts (net pay: adjusted net income is pay less the contribution).
    const inside = add(add(start, pension.employeeContribution.amount), fromPounds(5_000))
    expect(ok({ ...example, pay: { ...pension, salary: inside } }).taperInPlay).toBe(true)
    const below = subtract(start, fromPounds(20_000))
    expect(ok({ ...example, pay: { ...pension, salary: below } }).taperInPlay).toBe(false)
    // Far above where it ends: the lump sum's contribution can't bring income back inside.
    const above = add(add(end, pension.employeeContribution.amount), fromPounds(50_000))
    expect(ok({ ...example, pay: { ...pension, salary: above } }).taperInPlay).toBe(false)
    expect(ok({ ...example, lumpSum: ZERO }).taperInPlay).toBe(false)
  })

  it('a lump sum of nothing is every leg nothing, not a refusal', () => {
    const out = ok({ ...example, lumpSum: ZERO })
    expect([out.pension.kind, out.mortgage.kind, out.isa.kind]).toEqual(['nothing', 'nothing', 'nothing'])
    expect(out.breakEven).toEqual({ mortgage: null, pension: null })
    expect(noBreakEvenWords('mortgage', out)).toMatch(/lump sum is nothing/)
  })

  it('the mid value is the composer’s, for each leg', () => {
    const out = ok()
    const legs = out.result.legs
    expect(midValue(out.isa)).toEqual(legs.isa.status === 'ok' && legs.isa.rates.mid.value)
    expect(midValue(out.mortgage)).toEqual(legs.mortgage.status === 'ok' && legs.mortgage.value)
    expect(midValue(out.pension)).toEqual(legs.pension.status === 'accessible' && legs.pension.rates.mid.value)
  })
})

describe('break-even words', () => {
  it('a rate, a bracket, or above the highest or below the lowest rate modelled, and never a ranking', () => {
    expect(breakEvenWords('mortgage', { kind: 'rate', rate: percent('4.5'), upTo: percent('4.5') })).toBe(
      'The ISA matches the mortgage overpayment at the horizon at a growth rate 4.5% a year, before the fee.',
    )
    expect(breakEvenWords('pension', { kind: 'rate', rate: percent('6.49'), upTo: percent('6.5') })).toBe(
      'The ISA matches the pension at the mid rate at the horizon at a growth rate between 6.49% and 6.5% a year, before the fee.',
    )
    expect(breakEvenWords('mortgage', { kind: 'above-highest' })).toMatch(/above the highest rate modelled/)
    expect(breakEvenWords('pension', { kind: 'below-lowest' })).toMatch(/below the lowest rate modelled/)
  })
})

describe('sections', () => {
  const today = '2026-10-23' as const

  it('none is set on a fresh page (the date today); each opens when its inputs differ', () => {
    const d = { ...defaults(), asOf: today }
    for (const id of ['growth', 'pension', 'isa', 'date'] as const) expect(sectionSet(id, d, today)).toBe(false)
    expect(sectionSet('growth', example, today)).toBe(true)
    expect(sectionSet('pension', { ...d, employerMatch: fromPounds(1) }, today)).toBe(true)
    expect(sectionSet('pension', { ...d, ageNow: 40 }, today)).toBe(false)
    expect(sectionSet('isa', { ...d, isaPaidThisYear: fromPounds(1) }, today)).toBe(true)
    expect(sectionSet('date', { ...d, asOf: '2026-11-01' }, today)).toBe(true)
  })

  it('fields map to their sections; the three essentials to none', () => {
    expect(sectionForField('growthMid')).toBe('growth')
    expect(sectionForField('feeRate')).toBe('growth')
    expect(sectionForField('schemeAccessAge')).toBe('pension')
    expect(sectionForField('isaPaidThisYear')).toBe('isa')
    expect(sectionForField('asOf')).toBe('date')
    for (const field of ['lumpSum', 'horizonYears', 'ageNow']) expect(sectionForField(field)).toBeNull()
  })

  it('summaries say what is set and what needs fixing', () => {
    expect(sectionSummary('growth', example, [], today)).toBe('2%, 5% and 8% a year, illustrative; fee 0.5%; inflation 2%')
    expect(sectionSummary('growth', example, ['feeRate'], today)).toBe('Fix the highlighted input')
    expect(sectionSummary('pension', example, [], today)).toBe('Retirement tax at the Basic rate band; no employer match')
    expect(sectionSummary('pension', { ...example, employerMatch: fromPounds(500), schemeAccessAge: 60 }, [], today)).toBe(
      'Retirement tax at the Basic rate band; employer match £500; scheme age 60',
    )
    expect(sectionSummary('isa', example, [], today)).toBe('Nothing paid in this tax year')
    expect(sectionSummary('date', { ...example, asOf: today }, [], today)).toBe('Today, 23 October 2026')
    expect(sectionSummary('date', example, [], '2026-10-24')).toBe('23 October 2026')
  })
})

describe('summarise (compare)', () => {
  it('rows for the inputs and each leg at the mid rate, today’s money and nominal, and the break-evens', () => {
    const summary = nextPoundCalculator.summarise(example, taxYear)
    const out = ok()
    expect(summary.results.ok).toBe(true)
    if (!summary.results.ok) return
    const rows = Object.fromEntries(summary.results.rows.map((r) => [r.label, r.value]))
    const isa = midValue(out.isa)!
    expect(rows['ISA (mid), today’s money']).toEqual({ kind: 'money', amount: isa.todaysMoney })
    expect(rows['ISA (mid), nominal']).toEqual({ kind: 'money', amount: isa.nominal })
    expect(rows['Mortgage overpayment, today’s money']).toEqual({ kind: 'money', amount: midValue(out.mortgage)!.todaysMoney })
    expect(rows['Pension (mid), today’s money']).toEqual({ kind: 'money', amount: midValue(out.pension)!.todaysMoney })
    expect(rows['Break-even ISA return against the mortgage']).toMatchObject({ kind: expect.stringMatching(/ratio|text/) })
    const inputs = Object.fromEntries(summary.inputs.map((r) => [r.label, r.value]))
    expect(inputs['Lump sum']).toEqual({ kind: 'money', amount: example.lumpSum })
    expect(inputs['Pay from']).toEqual({ kind: 'text', text: 'Saved with this scenario' })
    const picked = nextPoundCalculator.summarise({ ...example, paySource: { kind: 'scenario', id: 'a1', name: 'My pay' } }, taxYear)
    expect(Object.fromEntries(picked.inputs.map((r) => [r.label, r.value]))['Pay from']).toEqual({ kind: 'text', text: 'My pay' })
    expect(inputs['Mortgage balance']).toEqual({ kind: 'money', amount: mortgage.balance })
  })

  it('says not set up and not accessible in words, and passes refusals through', () => {
    const none = nextPoundCalculator.summarise(
      { ...example, mortgage: mortgageCalculator.defaultInputs(), schemeAccessAge: MAX_AGE_YEARS },
      taxYear,
    )
    const rows = none.results.ok ? Object.fromEntries(none.results.rows.map((r) => [r.label, r.value])) : {}
    expect(rows['Mortgage overpayment']).toEqual({ kind: 'text', text: 'Not set up' })
    expect(rows.Pension).toEqual({ kind: 'text', text: 'Not accessible at horizon' })
    expect(nextPoundCalculator.summarise({ ...example, asOf: null }, taxYear).results).toMatchObject({ ok: false, kind: 'inputs' })
    expect(nextPoundCalculator.summarise(example, unverifiedConfig('isa.annualLimit')).results).toMatchObject({
      ok: false,
      unverified: ['isa.annualLimit'],
    })
  })
})
