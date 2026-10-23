import { describe, expect, it } from 'vitest'
import { fromPounds } from '@/lib/money'
import type { Scenario } from '@/scenarios/scenario'
import { mortgageCalculator } from '../mortgage/definition'
import { type OptimiserPageInputs, optimiserCalculator } from '../optimiser/definition'
import { mortgageAsLeg, type NextPoundPageInputs, nextPoundCalculator } from './definition'
import {
  mortgageOptions,
  mortgageRef,
  optionValue,
  payOptions,
  payRef,
  resolveMortgage,
  resolvePay,
  type SourceContext,
  withSources,
} from './sources'

/*
 * Where the next pound page takes pay and the mortgage from (the C2 page
 * rebuild): saved take-home and mortgage scenarios, or the take-home page's
 * inputs this visit, read only. Pay, balances and dates are made up for tests.
 */

const pay = (salary: number, extra: Partial<OptimiserPageInputs> = {}): OptimiserPageInputs => ({
  ...optimiserCalculator.defaultInputs(),
  salary: fromPounds(salary),
  ...extra,
})
const home = (balance: number) => ({
  ...mortgageCalculator.defaultInputs(),
  startDate: '2026-11-01' as const,
  balance: fromPounds(balance),
  termYears: 25,
  fixed: false,
  reversionRate: '5',
  monthly: fromPounds(100),
})

let counter = 0
function scenario(calculatorId: string, name: string, inputs: unknown, updatedAt: string, taxYear = '2026-27'): Scenario {
  counter += 1
  return { id: `s${counter}`, calculatorId, name, inputs, inputsVersion: 1, taxYear, createdAt: updatedAt, updatedAt }
}

const older = scenario('optimiser', 'Last year’s pay', pay(50_000), '2026-01-01T00:00:00Z')
const newer = scenario('optimiser', 'Pay now', pay(70_000, { pensionMethod: 'salarySacrifice' }), '2026-10-01T00:00:00Z')
const flat = scenario('mortgage', 'Flat', home(150_000), '2026-02-01T00:00:00Z')
const house = scenario('mortgage', 'House', home(250_000), '2026-09-01T00:00:00Z')
const other = scenario('budget', 'Budget', {}, '2026-10-20T00:00:00Z')

const fresh = () => nextPoundCalculator.defaultInputs()
const ctx = (scenarios: readonly Scenario[] = [], takeHome: Partial<SourceContext['takeHome']> = {}): SourceContext => ({
  scenarios,
  takeHome: { inputs: optimiserCalculator.defaultInputs(), loadedId: null, taxYear: '2026-27', ...takeHome },
})
const all = ctx([older, flat, other, newer, house])

describe('the pay source', () => {
  it('fresh, with nothing saved or entered: stays the most recent (auto), pay empty, no notice', () => {
    const r = resolvePay(fresh(), ctx())
    expect(r).toMatchObject({ ref: { kind: 'auto' }, state: 'empty', notice: null })
    expect(r.pay).toEqual(fresh().pay)
  })

  it('fresh: the take-home page’s inputs this visit when it has pay, else the latest saved take-home scenario', () => {
    const typed = pay(45_000)
    expect(resolvePay(fresh(), ctx([older, newer], { inputs: typed }))).toMatchObject({ ref: { kind: 'session' }, pay: typed, state: 'live' })
    expect(resolvePay(fresh(), all)).toMatchObject({ ref: { kind: 'scenario', id: newer.id, name: 'Pay now' }, pay: newer.inputs })
  })

  it('fresh, the take-home page showing a saved scenario unchanged: that scenario, by id', () => {
    const r = resolvePay(fresh(), ctx([older, newer], { inputs: older.inputs as OptimiserPageInputs, loadedId: older.id }))
    expect(r.ref).toEqual({ kind: 'scenario', id: older.id, name: older.name })
  })

  it('a picked scenario gives its pay and its tax year; a renamed one its new name', () => {
    const picked = { ...fresh(), paySource: { kind: 'scenario', id: older.id, name: 'Old name' } } as const
    const r = resolvePay(picked, ctx([{ ...older, taxYear: '2026-27' }, newer]))
    expect(r).toMatchObject({ ref: { kind: 'scenario', id: older.id, name: older.name }, pay: older.inputs, taxYear: '2026-27', state: 'live' })
  })

  it('a deleted source: the pay saved with this scenario, with a notice naming it, not a crash', () => {
    const saved = pay(61_000)
    const picked: NextPoundPageInputs = { ...fresh(), pay: saved, paySource: { kind: 'scenario', id: 'gone', name: 'Deleted pay' } }
    const r = resolvePay(picked, all)
    expect(r).toMatchObject({ ref: picked.paySource, pay: saved, state: 'missing' })
    expect(r.notice).toBe('“Deleted pay” is no longer saved, so this uses the pay saved with this scenario.')
  })

  it('the take-home inputs picked, but none this visit: the pay saved with this scenario, with a notice', () => {
    const saved = pay(61_000)
    const r = resolvePay({ ...fresh(), pay: saved, paySource: { kind: 'session' } }, ctx())
    expect(r).toMatchObject({ ref: { kind: 'session' }, pay: saved, state: 'missing' })
    expect(r.notice).toMatch(/no pay entered this visit/)
  })

  it('kept (from version 1): the pay saved with this scenario, no notice', () => {
    const saved = pay(61_000)
    expect(resolvePay({ ...fresh(), pay: saved, paySource: { kind: 'kept' } }, all)).toMatchObject({ pay: saved, state: 'kept', notice: null })
  })

  it('the picker lists take-home scenarios newest first, the inputs this visit when there are some, and what is kept', () => {
    const typed = ctx([older, other, newer], { inputs: pay(45_000) })
    expect(payOptions(fresh(), typed).map((o) => o.label)).toEqual(['Current take-home inputs', 'Pay now', 'Last year’s pay'])
    expect(payOptions(fresh(), ctx([older])).map((o) => o.label)).toEqual(['Last year’s pay'])
    const kept = { ...fresh(), paySource: { kind: 'kept' } } as const
    expect(payOptions(kept, ctx([older])).map((o) => o.label)).toEqual(['Pay saved with this scenario', 'Last year’s pay'])
    const gone = { ...fresh(), paySource: { kind: 'scenario', id: 'gone', name: 'Deleted pay' } } as const
    expect(payOptions(gone, ctx([older])).map((o) => o.label)).toEqual(['Deleted pay (no longer saved)', 'Last year’s pay'])
  })

  it('a picker value maps back to a source, by id with the name', () => {
    expect(payRef('session', all)).toEqual({ kind: 'session' })
    expect(payRef(`scenario:${older.id}`, all)).toEqual({ kind: 'scenario', id: older.id, name: older.name })
    expect(payRef('kept', all)).toEqual({ kind: 'kept' })
    expect(payRef('scenario:unknown', all)).toBeNull()
    expect(optionValue({ kind: 'scenario', id: 'x1', name: 'n' })).toBe('scenario:x1')
  })
})

describe('the mortgage source', () => {
  it('fresh: the latest saved mortgage scenario, its own overpayments left out; with none saved, no mortgage', () => {
    const r = resolveMortgage(fresh(), all)
    expect(r).toMatchObject({ ref: { kind: 'scenario', id: house.id, name: 'House' }, state: 'live', position: { index: 1, count: 2 } })
    expect(r.mortgage).toEqual(mortgageAsLeg(house.inputs as ReturnType<typeof home>))
    expect(resolveMortgage(fresh(), ctx([older]))).toMatchObject({ ref: { kind: 'auto' }, state: 'empty', position: null })
    expect(resolveMortgage(fresh(), ctx([older])).mortgage).toEqual(fresh().mortgage)
  })

  it('“No mortgage”: the mortgage page’s defaults, so the leg is not set up', () => {
    const r = resolveMortgage({ ...fresh(), mortgage: mortgageAsLeg(home(1)), mortgageSource: { kind: 'none' } }, all)
    expect(r).toMatchObject({ ref: { kind: 'none' }, state: 'live', position: null })
    expect(r.mortgage).toEqual(fresh().mortgage)
  })

  it('a picked scenario and its place in the list, newest first (“Saved: 2 of 2”)', () => {
    const r = resolveMortgage({ ...fresh(), mortgageSource: { kind: 'scenario', id: flat.id, name: 'Flat' } }, all)
    expect(r.position).toEqual({ index: 2, count: 2 })
  })

  it('a deleted source: the mortgage saved with this scenario, with a notice', () => {
    const saved = mortgageAsLeg(home(99_000))
    const r = resolveMortgage({ ...fresh(), mortgage: saved, mortgageSource: { kind: 'scenario', id: 'gone', name: 'Sold' } }, all)
    expect(r).toMatchObject({ mortgage: saved, state: 'missing' })
    expect(r.notice).toBe('“Sold” is no longer saved, so this uses the mortgage saved with this scenario.')
  })

  it('the picker: no mortgage first, then saved mortgages newest first', () => {
    expect(mortgageOptions(fresh(), all).map((o) => o.label)).toEqual(['No mortgage', 'House', 'Flat'])
    expect(mortgageRef('none', all)).toEqual({ kind: 'none' })
    expect(mortgageRef(`scenario:${flat.id}`, all)).toEqual({ kind: 'scenario', id: flat.id, name: 'Flat' })
  })
})

describe('withSources', () => {
  it('the inputs to show: the sources’ inputs in place, the most recent made concrete, the tax year from the pay', () => {
    const w = withSources(fresh(), all)
    expect(w.inputs.pay).toEqual(newer.inputs)
    expect(w.inputs.paySource).toEqual({ kind: 'scenario', id: newer.id, name: newer.name })
    expect(w.inputs.mortgageSource).toEqual({ kind: 'scenario', id: house.id, name: house.name })
    expect(w.taxYear).toBe('2026-27')
  })

  it('is stable: resolving its own output changes nothing', () => {
    const once = withSources(fresh(), all)
    expect(withSources(once.inputs, all).inputs).toEqual(once.inputs)
  })

  it('reads only: the scenarios and the take-home inputs are not changed', () => {
    const context = ctx([older, newer, house], { inputs: pay(45_000) })
    const before = JSON.stringify(context)
    withSources(fresh(), context)
    resolvePay({ ...fresh(), paySource: { kind: 'scenario', id: older.id, name: 'x' } }, context)
    expect(JSON.stringify(context)).toBe(before)
  })
})
