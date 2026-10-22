import { Plus } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { Field } from '@/components/inputs/Field'
import { NumberInput } from '@/components/inputs/NumberInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { Segmented } from '@/components/inputs/Segmented'
import { NoTaxRulesBadge } from '@/components/NoTaxRulesBadge'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { SETTLE_MS, StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useItemKeys } from '@/hooks/useItemKeys'
import { formatGBP, formatPercent } from '@/lib/format'
import { MAX_CAR_OPTIONS, MAX_HORIZON_MONTHS, MAX_ITEM_NAME_LENGTH } from '@/lib/inputLimits'
import type { Money } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { useStore } from '@/lib/store'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { toasts } from '@/toast/toasts'
import type { FlipPoints, ValueCase } from '../car-ownership/types'
import { sessionFor } from '../session'
import { type CardData, CompareTable, OptionCards, OrderSummary, positions, WhatChanges } from './CarResults'
import {
  blankOption,
  CASE_LABELS,
  type CarDecisionInputs,
  calculate,
  carDecisionCalculator,
  DECIMALS,
  type OptionField,
  type OptionInputs,
  type OptionStatus,
  optionName,
  SHARED_LABELS,
  SHARED_LIMITS,
  type SharedField,
  sectionFields,
  VALUE_CASES,
} from './definition'
import { fieldName, OptionEditor } from './OptionEditor'
import { cardOrder, flipsFor, lowest } from './results'

/*
 * The car decision page (slice 3c-1) at #/c/car-decision, on the 3a and 3b
 * engines, laid out as docs/ui-patterns.md: the horizon and the end-value
 * case always visible, the shared assumptions in a section, then each
 * option's editor (add, duplicate, remove with Undo; up to the most
 * compared). Results first (StickyResult): the lowest net cost per month of
 * coverage under these assumptions in the phone bar, the order and "What
 * changes the answer" in the results column; below the columns, a card per
 * option (columns from md, a snapping row on a phone) and the comparison
 * table. Uses no tax rules. Every figure is the engine's (compareOptions,
 * flipPoints, costPerMile, apr) through ./definition.ts, ./results.ts and
 * ./rates.ts; the page writes none and does no arithmetic on money.
 */

const session = sessionFor(carDecisionCalculator)

type Gbp = (amount: Money) => string
type Unit = 'months' | 'years'

const CASE_OPTIONS = VALUE_CASES.map((value) => ({ value, label: CASE_LABELS[value] }))
const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]
const MAX_YEARS = Math.floor(MAX_HORIZON_MONTHS / MONTHS_PER_YEAR)

const SHARED_HINTS = {
  horizon: 'Every option is costed over this same stretch of time.',
  valueCase: 'Which of each car’s three end values the cards use. Switch to see the others.',
  savingsReturn:
    'What your money would earn a year if it weren’t spent on the car, after any tax on it: your own assumption. It gives the opportunity cost.',
  generalIncrease: 'How much insurance, maintenance, VED and other costs rise each year, for every option. It can be negative.',
} as const

/** What the page adds to the engines' assumptions. No figures. */
const PAGE_ASSUMPTIONS = [
  'Each car’s value falls (or rises) by the same percentage every year between today’s value and the end value: an illustrative shape, not a forecast.',
  'The low, expected and high end values are your own inputs. What a car is worth at the end is the most uncertain figure here and usually moves the answer most: try all three cases.',
  'The savings return is your own after-tax assumption, the same for every option.',
  'VED, insurance and the other running costs are the amounts you enter. Sumyard holds no VED figures and models no tax rules or electric car benefit rules.',
  'No replacement car is modelled: a car handed back at the end of a PCP leaves the rest of the horizon uncovered, so it is shown per month of coverage and not ordered against options that cover the whole horizon.',
  'A loan’s APR, and HP’s when there is no option to purchase fee, is worked out from the agreement’s payments under the APR rules. For a PCP, and HP with an option fee, the card shows the effective interest rate instead, which is not the lender’s APR.',
  'Uses no tax rules: nothing here depends on the tax rules of any year.',
  'Illustrative only, not financial advice.',
]

const SHARED_FIELDS: readonly SharedField[] = ['horizonMonths', 'savingsReturn', 'generalIncrease']

const set = (patch: Partial<CarDecisionInputs>) => session.setInputs(patch)
const forget = (...fields: string[]) => {
  for (const field of fields) session.setFieldValid(field, true)
}

/** A duplicate's name: the name and "(copy)", kept within the longest name. */
const copyName = (name: string) => (name ? Array.from(`${name} (copy)`).slice(0, MAX_ITEM_NAME_LENGTH).join('') : '')

export default function CarDecisionPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)
  const { keys, inserted, removed } = useItemKeys(inputs.options.length)
  const sharedInvalid = state.invalid.some((field) => (SHARED_FIELDS as readonly string[]).includes(field))
  const invalidFor = (key: number) =>
    state.invalid.flatMap((field) => (field.startsWith(`o${key}.`) ? [field.slice(`o${key}.`.length) as OptionField] : []))
  const heldKey = keys.map((key) => invalidFor(key).length > 0).join()
  // The engine's comparison: redo it only when the inputs or which options are held back change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: heldKey stands for the held options.
  const outcome = useMemo(() => {
    if (sharedInvalid) return null
    const held = new Set(keys.flatMap((key, index) => (invalidFor(key).length > 0 ? [index] : [])))
    return calculate(inputs, held)
  }, [sharedInvalid, inputs, heldKey])
  const flips = useFlips(outcome, inputs)

  const ok = outcome?.kind === 'ok' ? outcome : null
  const names = inputs.options.map(optionName)
  const order = ok ? cardOrder(ok, inputs.valueCase, inputs.options.length) : []
  const cards: CardData[] = ok
    ? order.map((index) => ({ index, name: names[index]!, kind: inputs.options[index]!.acquisition, status: ok.statuses[index]! }))
    : []
  const low = ok?.comparison ? lowest(ok.comparison, inputs.valueCase) : null
  const lowNames = (() => {
    if (!low || !ok) return ''
    const pageOf: number[] = []
    ok.statuses.forEach((s, i) => {
      if (s.kind === 'ok') pageOf[s.engineIndex] = i
    })
    return low.options.map((o) => names[pageOf[o]!]).join(' and ')
  })()
  const value = low ? `${lowNames}: ${gbp(low.perMonth)} a month` : null
  const label = 'Lowest net cost under these assumptions'
  const emptyText =
    outcome === null
      ? 'Fix the highlighted inputs'
      : outcome.kind === 'missing-shared'
        ? 'Enter the shared assumptions'
        : 'No option covers the whole horizon yet'

  const assumptions = [
    ...new Set([
      ...(ok?.comparison
        ? [
            ...ok.comparison.assumptions,
            ...ok.comparison.options.flatMap((o) => o.assumptions),
            ...ok.comparison.options.flatMap((o) => (o.finance ? o.finance.assumptions.map((line) => `Finance agreements: ${line}`) : [])),
          ]
        : []),
      ...PAGE_ASSUMPTIONS,
    ]),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {carDecisionCalculator.name}
        </h1>
        <p className="text-text-muted">{carDecisionCalculator.summary}</p>
        {/* On a phone the badge is in the sticky bar instead. */}
        <div className="hidden md:flex">
          <NoTaxRulesBadge />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={emptyText}
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <>
            <Segmented
              id="cd-case-bar"
              label="End value"
              value={inputs.valueCase}
              options={CASE_OPTIONS}
              onChange={(valueCase: ValueCase) => set({ valueCase })}
            />
            <div className="flex">
              <NoTaxRulesBadge />
            </div>
          </>
        }
        results={
          outcome === null ? (
            <Waiting>Fix the highlighted inputs to see results.</Waiting>
          ) : outcome.kind === 'missing-shared' ? (
            <Waiting>
              Enter the {outcome.missing.map((f) => SHARED_LABELS[f].toLowerCase()).join(' and the ')} under Shared assumptions to see
              results.
            </Waiting>
          ) : outcome.kind === 'refused' ? (
            <RefusalNotice refusal={outcome.refusal} />
          ) : (
            <>
              <OrderSummary comparison={outcome.comparison} cards={cards} valueCase={inputs.valueCase} gbp={gbp} />
              <WhatChanges state={flips} inputs={inputs} gbp={gbp} />
            </>
          )
        }
      >
        <ScenarioBar calculator={carDecisionCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <SharedControls key={`shared-${state.revision}`} inputs={inputs} invalid={state.invalid} />
        <Options
          key={`options-${state.revision}`}
          inputs={inputs}
          keys={keys}
          inserted={inserted}
          removed={removed}
          invalidFor={invalidFor}
          statuses={ok?.statuses ?? null}
          gbp={gbp}
        />
      </StickyResult>

      {ok && cards.length > 0 && (
        <>
          <OptionCards
            cards={cards}
            valueCase={inputs.valueCase}
            positions={positions(ok.comparison, ok.statuses, inputs.valueCase)}
            gbp={gbp}
          />
          <CompareTable cards={cards} valueCase={inputs.valueCase} gbp={gbp} />
        </>
      )}

      <AssumptionsPanel items={assumptions}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div data-results-waiting>
      <InlineNotice tone="warning" title="No results yet">
        <p>{children}</p>
      </InlineNotice>
    </div>
  )
}

type FlipState =
  | { readonly kind: 'no-pair' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'ready'; readonly pair: readonly [number, number]; readonly flips: FlipPoints }

/**
 * The flip points, worked out once the inputs have settled (SETTLE_MS, as the announcement): a search costs both options
 * many times, too slow to redo on each keystroke (docs/performance.md).
 */
function useFlips(outcome: ReturnType<typeof calculate> | null, inputs: CarDecisionInputs): FlipState {
  const [ready, setReady] = useState<{ for: unknown; state: FlipState } | null>(null)
  const pairable = outcome?.kind === 'ok' && outcome.comparison !== null && outcome.comparison.ranking[inputs.valueCase].full.length >= 2
  useEffect(() => {
    if (!pairable || !outcome) return
    const timer = setTimeout(() => {
      const found = flipsFor(outcome, inputs)
      setReady({ for: outcome, state: found ? { kind: 'ready', ...found } : { kind: 'refused' } })
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [pairable, outcome, inputs])
  if (!pairable) return { kind: 'no-pair' }
  return ready && ready.for === outcome && ready.state.kind !== 'pending' ? ready.state : { kind: 'pending' }
}

const validShared = (field: SharedField) => (ok: boolean) => session.setFieldValid(field, ok)

/** The horizon and the end-value case (always visible), then the shared assumptions in a section (U1 to U3). */
function SharedControls({ inputs, invalid }: { inputs: CarDecisionInputs; invalid: readonly string[] }) {
  const [unit, setUnit] = useState<Unit>('months')
  const [openOnMount] = useState(() => inputs.savingsReturn !== null || inputs.generalIncrease !== null)
  const months = inputs.horizonMonths
  const years = Math.floor(months / MONTHS_PER_YEAR)
  const rest = months % MONTHS_PER_YEAR
  const inWords = `${months} month${months === 1 ? '' : 's'}${years > 0 ? `: ${years} year${years === 1 ? '' : 's'}${rest > 0 ? ` and ${rest} month${rest === 1 ? '' : 's'}` : ''}` : ''}`
  const changeUnit = (next: Unit) => {
    setUnit(next)
    // Years are whole: the horizon moves to the nearest whole year, at least one.
    if (next === 'years' && rest !== 0) set({ horizonMonths: Math.max(1, Math.round(months / MONTHS_PER_YEAR)) * MONTHS_PER_YEAR })
  }
  const summary = (() => {
    if (invalid.includes('savingsReturn') || invalid.includes('generalIncrease')) return 'Fix the highlighted input'
    const part = (field: 'savingsReturn' | 'generalIncrease', what: string) =>
      inputs[field] === null ? `${what} not entered` : `${what} ${formatPercent(percentRatio(inputs[field]!))} a year`
    if (inputs.savingsReturn === null && inputs.generalIncrease === null) return 'Not set: both are needed for results'
    return `${part('savingsReturn', 'Savings return')}; ${part('generalIncrease', 'costs rise')}`
  })()
  return (
    <>
      <section
        data-shared-controls
        aria-labelledby="cd-shared-title"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="cd-shared-title" className="text-base font-semibold">
          Horizon and end value
        </h2>
        <Segmented id="cd-horizon-unit" label="Horizon in" value={unit} options={UNIT_OPTIONS} onChange={changeUnit} />
        <NumberInput
          id="cd-horizon"
          label={unit === 'months' ? 'Horizon in months' : 'Horizon in years'}
          hint={SHARED_HINTS.horizon}
          value={unit === 'months' ? months : years}
          min={unit === 'months' ? SHARED_LIMITS.horizonMonths.min : 1}
          max={unit === 'months' ? SHARED_LIMITS.horizonMonths.max : MAX_YEARS}
          suffix={unit}
          onChange={(n) => set({ horizonMonths: unit === 'months' ? n : n * MONTHS_PER_YEAR })}
          onValidityChange={validShared('horizonMonths')}
        />
        <Field id="cd-horizon-range" label="Horizon slider">
          <input
            id="cd-horizon-range"
            type="range"
            min={unit === 'months' ? SHARED_LIMITS.horizonMonths.min : MONTHS_PER_YEAR}
            max={unit === 'months' ? SHARED_LIMITS.horizonMonths.max : MAX_YEARS * MONTHS_PER_YEAR}
            step={unit === 'months' ? 1 : MONTHS_PER_YEAR}
            value={months}
            aria-valuetext={inWords}
            aria-describedby="cd-horizon-words"
            onChange={(e) => {
              forget('horizonMonths')
              set({ horizonMonths: Number(e.currentTarget.value) })
            }}
            className="min-h-touch w-full accent-accent"
          />
          <p id="cd-horizon-words" className="text-xs text-text-muted">
            {inWords}
          </p>
        </Field>
        <Segmented
          id="cd-case"
          label="End value"
          hint={SHARED_HINTS.valueCase}
          value={inputs.valueCase}
          options={CASE_OPTIONS}
          onChange={(valueCase) => set({ valueCase })}
        />
      </section>
      <Section id="cd-section-shared" title="Shared assumptions" summary={summary} defaultOpen={openOnMount}>
        <PercentInput
          id="cd-savings"
          label={SHARED_LABELS.savingsReturn}
          hint={SHARED_HINTS.savingsReturn}
          allowEmpty
          value={inputs.savingsReturn}
          min={SHARED_LIMITS.savingsReturn.min}
          max={SHARED_LIMITS.savingsReturn.max}
          maxDecimals={DECIMALS}
          onChange={(savingsReturn) => set({ savingsReturn })}
          onValidityChange={validShared('savingsReturn')}
        />
        <PercentInput
          id="cd-increase"
          label={SHARED_LABELS.generalIncrease}
          hint={SHARED_HINTS.generalIncrease}
          allowEmpty
          value={inputs.generalIncrease}
          min={SHARED_LIMITS.generalIncrease.min}
          max={SHARED_LIMITS.generalIncrease.max}
          maxDecimals={DECIMALS}
          onChange={(generalIncrease) => set({ generalIncrease })}
          onValidityChange={validShared('generalIncrease')}
        />
      </Section>
    </>
  )
}

/** Every field an option shows for its kind, fuel type and pricing. */
const shownFields = (option: OptionInputs): OptionField[] => [
  'name',
  ...sectionFields('car', option),
  ...sectionFields('finance', option),
  ...sectionFields('running', option),
]

/** The option editors with Add, Duplicate and Remove (with Undo), up to the most compared (U9's pattern for a list). */
function Options({
  inputs,
  keys,
  inserted,
  removed,
  invalidFor,
  statuses,
  gbp,
}: {
  inputs: CarDecisionInputs
  keys: readonly number[]
  inserted: (index: number) => number
  removed: (index: number) => void
  invalidFor: (key: number) => OptionField[]
  statuses: readonly OptionStatus[] | null
  gbp: Gbp
}) {
  const options = inputs.options
  const full = options.length >= MAX_CAR_OPTIONS
  // What takes focus after the next render: a new option's name, a restored option's Remove, or Add after a removal.
  const [focus, setFocus] = useState<string | null>(null)
  const latest = useRef({ inserted, setFocus })
  latest.current = { inserted, setFocus }
  useEffect(() => {
    if (focus === null) return
    document.getElementById(focus)?.focus()
    setFocus(null)
  }, [focus])

  const setOptions = (next: readonly OptionInputs[]) => set({ options: next })
  const update = (index: number, key: number, patch: Partial<OptionInputs>) => {
    const next = { ...options[index]!, ...patch }
    // Boxes no longer shown (another kind, fuel type or pricing) can't stay "to fix": they would hold the option back unseen.
    const shown = shownFields(next)
    forget(...invalidFor(key).flatMap((field) => (shown.includes(field) ? [] : [fieldName(key, field)])))
    setOptions(options.map((option, i) => (i === index ? next : option)))
  }
  const add = () => {
    const key = inserted(options.length)
    setOptions([...options, blankOption('cash')])
    setFocus(`cd-o${key}-name`)
  }
  const duplicate = (index: number) => {
    const key = inserted(index + 1)
    const source = options[index]!
    setOptions([...options.slice(0, index + 1), { ...source, name: copyName(source.name) }, ...options.slice(index + 1)])
    setFocus(`cd-o${key}-name`)
  }
  const remove = (index: number, key: number) => {
    const option = options[index]!
    const label = optionName(option, index)
    const revision = session.get().revision
    forget(...invalidFor(key).map((field) => fieldName(key, field)))
    removed(index)
    setOptions(options.filter((_, i) => i !== index))
    setFocus('cd-add')
    toasts.show({
      message: `Removed “${label}”.`,
      undo: {
        blocked: () =>
          session.get().revision !== revision
            ? 'Couldn’t undo: other inputs have been loaded since.'
            : session.get().inputs.options.length >= MAX_CAR_OPTIONS
              ? 'Couldn’t undo: there are already as many options as Sumyard compares.'
              : undefined,
        run: () => {
          const now = session.get().inputs.options
          const at = Math.min(index, now.length)
          const restored = latest.current.inserted(at)
          session.setInputs({ options: [...now.slice(0, at), option, ...now.slice(at)] })
          latest.current.setFocus(`cd-o${restored}-remove`)
        },
        done: `Restored “${label}”.`,
      },
    })
  }

  return (
    <section aria-labelledby="cd-options-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="cd-options-title" className="text-base font-semibold text-text">
        Options
      </h2>
      <p className="-mt-2 text-xs text-text-muted">
        Up to {MAX_CAR_OPTIONS}. Every amount starts empty; an option shows results once its boxes are filled.
      </p>
      {options.map((option, index) => {
        const key = keys[index] ?? index
        return (
          <OptionEditor
            key={key}
            option={option}
            index={index}
            optionKey={key}
            status={statuses?.[index] ?? null}
            invalid={invalidFor(key)}
            full={full}
            only={options.length === 1}
            gbp={gbp}
            update={(patch) => update(index, key, patch)}
            setValid={(field, ok) => session.setFieldValid(fieldName(key, field), ok)}
            duplicate={() => duplicate(index)}
            remove={() => remove(index, key)}
          />
        )
      })}
      <Button id="cd-add" variant="secondary" disabled={full} onClick={add} className="self-start">
        <Plus aria-hidden="true" />
        Add an option
      </Button>
    </section>
  )
}
