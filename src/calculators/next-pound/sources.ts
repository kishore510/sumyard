import { getTaxYear } from '@/config/tax/index'
import { add, compare, ZERO } from '@/lib/money'
import { canonicalJson } from '@/lib/validate'
import type { Scenario } from '@/scenarios/scenario'
import type { MortgagePageInputs } from '../mortgage/definition'
import type { OptimiserPageInputs } from '../optimiser/definition'
import { type MortgageSource, mortgageAsLeg, type NextPoundPageInputs, nextPoundCalculator, type PaySource } from './definition'

/*
 * Where the next pound page takes its pay and mortgage from (the C2 page
 * rebuild). Read only: saved take-home ('optimiser') and mortgage scenarios
 * from the one scenarios key, and the take-home page's inputs this visit
 * (its session); this module never writes to either, and adds no storage.
 *
 * - The most recent ('auto', a fresh page): the take-home inputs this visit
 *   when they have pay (as the saved scenario they were loaded from, when
 *   unchanged), else the latest saved take-home scenario; for the mortgage,
 *   the latest saved mortgage scenario. "Latest" is the last saved
 *   (updatedAt): nothing records when a scenario was last opened. With
 *   nothing to take, the source stays the most recent, so it is picked up
 *   once there is one.
 * - A picked source that has gone (deleted, or no take-home inputs this
 *   visit) falls back to the copy saved with this page's own inputs, with a
 *   notice; never a crash.
 */

export const TAKE_HOME_ID = 'optimiser'
export const MORTGAGE_ID = 'mortgage'

export interface SourceContext {
  /** Every saved scenario this version can read (the store's list). */
  readonly scenarios: readonly Scenario[]
  /** The take-home page's inputs this visit. */
  readonly takeHome: { readonly inputs: OptimiserPageInputs; readonly loadedId: string | null; readonly taxYear: string }
}

/** live: from the source now; empty: nothing to take yet; missing: the source has gone, so the copy saved here; kept: the copy saved here, by choice. */
export type SourceState = 'live' | 'empty' | 'missing' | 'kept'

export interface PayResolved {
  readonly ref: PaySource
  readonly pay: OptimiserPageInputs
  /** The source's tax year, when it has one this version knows; null keeps the page's. */
  readonly taxYear: string | null
  readonly state: SourceState
  readonly notice: string | null
}

export interface MortgageResolved {
  readonly ref: MortgageSource
  readonly mortgage: MortgagePageInputs
  readonly state: SourceState
  readonly notice: string | null
  /** Its place among the saved mortgages, newest first ("Saved: 1 of 2"); null when it isn't one. */
  readonly position: { readonly index: number; readonly count: number } | null
}

export interface PickerOption {
  readonly value: string
  readonly label: string
}

/** One calculator's saved scenarios, the last saved first. */
const savedFor = (ctx: SourceContext, calculatorId: string) =>
  ctx.scenarios.filter((s) => s.calculatorId === calculatorId).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))

const hasPay = (pay: OptimiserPageInputs) => compare(add(pay.salary, pay.bonus), ZERO) > 0
const scenarioRef = (s: Scenario) => ({ kind: 'scenario', id: s.id, name: s.name }) as const
const knownYear = (year: string | undefined) => (year !== undefined && getTaxYear(year) ? year : null)

const gone = (name: string, what: string) => `“${name}” is no longer saved, so this uses the ${what} saved with this scenario.`
const NO_TAKE_HOME = 'The take-home page has no pay entered this visit, so this uses the pay saved with this scenario.'

export function resolvePay(inputs: NextPoundPageInputs, ctx: SourceContext): PayResolved {
  const saved = savedFor(ctx, TAKE_HOME_ID)
  const kept = (state: SourceState, notice: string | null, ref: PaySource = inputs.paySource): PayResolved => ({
    ref,
    pay: inputs.pay,
    taxYear: null,
    state,
    notice,
  })
  const fromScenario = (s: Scenario): PayResolved => ({
    ref: scenarioRef(s),
    pay: s.inputs as OptimiserPageInputs,
    taxYear: knownYear(s.taxYear),
    state: 'live',
    notice: null,
  })
  const fromSession = (): PayResolved => ({
    ref: { kind: 'session' },
    pay: ctx.takeHome.inputs,
    taxYear: knownYear(ctx.takeHome.taxYear),
    state: 'live',
    notice: null,
  })
  const source = inputs.paySource
  switch (source.kind) {
    case 'auto': {
      if (hasPay(ctx.takeHome.inputs)) {
        const loaded = saved.find((s) => s.id === ctx.takeHome.loadedId)
        return loaded && canonicalJson(loaded.inputs) === canonicalJson(ctx.takeHome.inputs) ? fromScenario(loaded) : fromSession()
      }
      const latest = saved[0]
      return latest ? fromScenario(latest) : kept('empty', null)
    }
    case 'session':
      return hasPay(ctx.takeHome.inputs) ? fromSession() : kept('missing', NO_TAKE_HOME)
    case 'scenario': {
      const found = saved.find((s) => s.id === source.id)
      return found ? fromScenario(found) : kept('missing', gone(source.name, 'pay'))
    }
    case 'kept':
      return kept('kept', null)
  }
}

export function resolveMortgage(inputs: NextPoundPageInputs, ctx: SourceContext): MortgageResolved {
  const saved = savedFor(ctx, MORTGAGE_ID)
  const fromScenario = (s: Scenario): MortgageResolved => ({
    ref: scenarioRef(s),
    mortgage: mortgageAsLeg(s.inputs as MortgagePageInputs),
    state: 'live',
    notice: null,
    position: { index: saved.indexOf(s) + 1, count: saved.length },
  })
  const none = (ref: MortgageSource, state: SourceState): MortgageResolved => ({
    ref,
    mortgage: nextPoundCalculator.defaultInputs().mortgage,
    state,
    notice: null,
    position: null,
  })
  const source = inputs.mortgageSource
  switch (source.kind) {
    case 'auto': {
      const latest = saved[0]
      return latest ? fromScenario(latest) : none(source, 'empty')
    }
    case 'none':
      return none(source, 'live')
    case 'scenario': {
      const found = saved.find((s) => s.id === source.id)
      return found
        ? fromScenario(found)
        : { ref: source, mortgage: inputs.mortgage, state: 'missing', notice: gone(source.name, 'mortgage'), position: null }
    }
    case 'kept':
      return { ref: source, mortgage: inputs.mortgage, state: 'kept', notice: null, position: null }
  }
}

/** A source as a picker value: 'session', 'kept', 'none', 'auto' or 'scenario:<id>'. */
export const optionValue = (ref: PaySource | MortgageSource) => (ref.kind === 'scenario' ? `scenario:${ref.id}` : ref.kind)

const KEPT_PAY = 'Pay saved with this scenario'
const KEPT_MORTGAGE = 'Mortgage saved with this scenario'
export const CURRENT_TAKE_HOME = 'Current take-home inputs'
export const NO_MORTGAGE = 'No mortgage'
const noLonger = (name: string) => `${name} (no longer saved)`

/** The pay picker: the take-home inputs this visit (when they have pay), then saved take-home scenarios, newest first. */
export function payOptions(inputs: NextPoundPageInputs, ctx: SourceContext): PickerOption[] {
  const saved = savedFor(ctx, TAKE_HOME_ID)
  const ref = inputs.paySource
  return [
    ...(ref.kind === 'kept' ? [{ value: 'kept', label: KEPT_PAY }] : []),
    ...(ref.kind === 'scenario' && !saved.some((s) => s.id === ref.id) ? [{ value: optionValue(ref), label: noLonger(ref.name) }] : []),
    ...(hasPay(ctx.takeHome.inputs) || ref.kind === 'session' ? [{ value: 'session', label: CURRENT_TAKE_HOME }] : []),
    ...saved.map((s) => ({ value: optionValue(scenarioRef(s)), label: s.name })),
  ]
}

/** The mortgage picker: no mortgage, then saved mortgage scenarios, newest first. */
export function mortgageOptions(inputs: NextPoundPageInputs, ctx: SourceContext): PickerOption[] {
  const saved = savedFor(ctx, MORTGAGE_ID)
  const ref = inputs.mortgageSource
  return [
    ...(ref.kind === 'kept' ? [{ value: 'kept', label: KEPT_MORTGAGE }] : []),
    ...(ref.kind === 'scenario' && !saved.some((s) => s.id === ref.id) ? [{ value: optionValue(ref), label: noLonger(ref.name) }] : []),
    { value: 'none', label: NO_MORTGAGE },
    ...saved.map((s) => ({ value: optionValue(scenarioRef(s)), label: s.name })),
  ]
}

const pickedScenario = (value: string, ctx: SourceContext, calculatorId: string) => {
  const found = value.startsWith('scenario:') ? savedFor(ctx, calculatorId).find((s) => `scenario:${s.id}` === value) : undefined
  return found ? scenarioRef(found) : null
}

/** A pay picker value as a source; null for one not in the list. */
export function payRef(value: string, ctx: SourceContext): PaySource | null {
  if (value === 'session' || value === 'kept') return { kind: value }
  return pickedScenario(value, ctx, TAKE_HOME_ID)
}

/** A mortgage picker value as a source; null for one not in the list. */
export function mortgageRef(value: string, ctx: SourceContext): MortgageSource | null {
  if (value === 'none' || value === 'kept') return { kind: value }
  return pickedScenario(value, ctx, MORTGAGE_ID)
}

/**
 * The inputs the page shows: the sources' inputs in `pay` and `mortgage`,
 * the most recent made concrete when there is one, and the pay source's tax
 * year. Applying it to its own output changes nothing.
 */
export function withSources(inputs: NextPoundPageInputs, ctx: SourceContext) {
  const pay = resolvePay(inputs, ctx)
  const mortgage = resolveMortgage(inputs, ctx)
  return {
    inputs: { ...inputs, pay: pay.pay, paySource: pay.ref, mortgage: mortgage.mortgage, mortgageSource: mortgage.ref },
    taxYear: pay.taxYear,
    pay,
    mortgage,
  }
}
