import { Plus, RotateCcw } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AssumptionsPanel } from '@/components/AssumptionsPanel'
import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { Segmented } from '@/components/inputs/Segmented'
import { Select } from '@/components/inputs/Select'
import { SliderInput } from '@/components/inputs/SliderInput'
import { TextInput } from '@/components/inputs/TextInput'
import { NoTaxRulesBadge } from '@/components/NoTaxRulesBadge'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { ScenarioBar } from '@/components/ScenarioBar'
import { Section } from '@/components/Section'
import { SplitBar, type SplitBarSegment } from '@/components/SplitBar'
import { StickyResult } from '@/components/StickyResult'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useItemKeys } from '@/hooks/useItemKeys'
import { formatGBP, formatGBPChange, formatPercent, formatPointsChange } from '@/lib/format'
import { MAX_BUDGET_LINES, MAX_INPUT_AMOUNT, MAX_ITEM_NAME_LENGTH } from '@/lib/inputLimits'
import { compare, fromPence, type Money, mulRound, type Ratio, ratio, subtract, subtractRatio, toPence, ZERO } from '@/lib/money'
import { MONTHS_PER_YEAR } from '@/lib/periods'
import { useStore } from '@/lib/store'
import { canonicalJson } from '@/lib/validate'
import { settingsStore } from '@/settings/settings'
import { DISCLAIMER } from '@/sheets/parts'
import { toasts } from '@/toast/toasts'
import { sessionFor } from '../session'
import {
  type BudgetPageInputs,
  budgetCalculator,
  calculate,
  inputRefusal,
  KIND_LABELS,
  NOT_APPLICABLE,
  PAY_LABEL,
  PAY_PERIODS,
  PERIOD_LABELS,
  PERIOD_UNITS,
  PERIODS,
  type SectionId,
  sectionSet,
  type WhatIf,
  withWhatIf,
} from './definition'
import { BUDGET_KINDS, type BudgetKind, type BudgetResult, type IncomeLine, type OutgoingLine, type YearAndMonth } from './types'

/*
 * The household budget page at #/c/budget, laid out as docs/ui-patterns.md:
 * Your pay always visible, extra income, each kind of outgoing (BD1) and
 * What if in sections with live summaries, results always in view
 * (StickyResult): what is left with its share of your income, outgoings, the
 * savings rate, where income goes (SplitBar) and a table by kind, a month or
 * a year. What-ifs (BD7) are page state only, keyed to each line, never
 * stored. Uses no tax rules. Every figure is the engine's (./calc.ts); the
 * page only picks the month or year figure it gives.
 */

const session = sessionFor(budgetCalculator)

type Gbp = (amount: Money) => string
type View = 'month' | 'year'
type ListId = 'income' | 'outgoings'

const VIEW_OPTIONS: readonly { value: View; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]
const PAY_PERIOD_OPTIONS = PAY_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))
const PERIOD_OPTIONS = PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))
const IN_VIEW: Record<View, string> = { month: 'a month', year: 'a year' }
const LIST_PREFIX: Record<ListId, string> = { income: 'bd-in', outgoings: 'bd-out' }

const SECTION_TITLES: Record<SectionId | 'whatif', string> = {
  income: 'Income extras',
  spending: 'Spending',
  joint: 'Joint account',
  debt: 'Debt',
  savings: 'Savings and investing',
  whatif: 'What if',
}

const DOUBLE_COUNTING = 'Enter the card payment or the spending on that card, not both, or it is counted twice.'

const SECTION_HINTS: Record<SectionId, string> = {
  income: 'Money coming in besides your pay, after any tax: rent from a lodger, side work, benefits.',
  spending: 'Day-to-day and regular bills from this account. A blank amount counts as nothing.',
  joint: 'What you move to a joint account counts as going out from this one. Don’t enter what is spent from the joint account again.',
  debt: `Card and loan payments. ${DOUBLE_COUNTING}`,
  savings: 'Cash savings, ISAs, a fixed saver, stocks and shares: name each line for what it is.',
}

/** What the page adds to the engine's assumptions. No figures. */
const PAGE_ASSUMPTIONS = [
  'Uses no tax rules: enter your pay as it reaches your account, after tax and anything else your employer takes.',
  'What-ifs are tried out on this page only and never saved; Apply puts them into your inputs, which a scenario can then save.',
  'The bar of where your income goes is drawn from the exact yearly figures; with outgoings over your income it shows where your outgoings go instead.',
  'Illustrative only: a budget of what you enter, not a forecast or advice.',
]

const NOT_SET = 'Not set'
const NEEDS_FIXING = 'Fix the highlighted input'

/** What-ifs by line key, tied to the inputs' revision: a load or a fresh start drops them (BD7). */
interface Overlay {
  readonly revision: number
  readonly pay?: Money
  readonly income: ReadonlyMap<number, Money>
  readonly outgoings: ReadonlyMap<number, Money>
}

const emptyOverlay = (revision: number): Overlay => ({ revision, income: new Map(), outgoings: new Map() })

/** Line keys to places in the lists, for withWhatIf; keys no longer there are dropped. */
function byIndex(amounts: ReadonlyMap<number, Money>, keys: readonly number[]): Map<number, Money> {
  const out = new Map<number, Money>()
  for (const [key, amount] of amounts) {
    const index = keys.indexOf(key)
    if (index >= 0) out.set(index, amount)
  }
  return out
}

const pick = (figure: YearAndMonth, view: View) => (view === 'month' ? figure.month : figure.year)
const shareText = (share: Ratio | null) => (share === null ? NOT_APPLICABLE : formatPercent(share))
const capitalised = (text: string) => text.replace(/^./, (c) => c.toUpperCase())
const lineLabel = (line: IncomeLine, list: ListId, kind: BudgetKind | undefined, number: number) =>
  line.name || `${list === 'income' ? 'Income' : KIND_LABELS[kind!]} line ${number}`

type Keys = ReturnType<typeof useItemKeys>

export default function BudgetPage() {
  const state = useStore(session)
  const amounts = useStore(settingsStore, (s) => s.amounts)
  const inputs = state.inputs
  const invalid = state.invalid.length > 0
  const incomeKeys = useItemKeys(inputs.income.length)
  const outgoingKeys = useItemKeys(inputs.outgoings.length)
  const [view, setView] = useState<View>('month')
  const [stored, setOverlay] = useState(() => emptyOverlay(state.revision))
  const overlay = stored.revision === state.revision ? stored : emptyOverlay(state.revision)
  const whatIf: WhatIf = {
    ...(overlay.pay !== undefined && { pay: overlay.pay }),
    income: byIndex(overlay.income, incomeKeys.keys),
    outgoings: byIndex(overlay.outgoings, outgoingKeys.keys),
  }
  const whatIfInputs = withWhatIf(inputs, whatIf)
  const active = canonicalJson(whatIfInputs) !== canonicalJson(inputs)
  const baseline = useMemo(() => calculate(inputs), [inputs])
  const whatIfKey = canonicalJson(whatIfInputs)
  // biome-ignore lint/correctness/useExhaustiveDependencies: whatIfKey stands for whatIfInputs, a fresh object each render.
  const alternative = useMemo(() => (active ? calculate(whatIfInputs) : null), [active, whatIfKey])
  const gbp: Gbp = (amount) => formatGBP(amount, amounts)

  const result = !invalid && baseline.ok ? baseline.result : null
  const whatIfResult = result && alternative?.ok ? alternative.result : null
  const shown = whatIfResult ?? result
  const label = `Left over${whatIfResult ? ' with your what-ifs,' : ''} ${IN_VIEW[view]}`
  const value = shown ? `${gbp(pick(shown.leftover, view))} (${shareText(shown.leftover.share)} of your income)` : null

  const apply = () => {
    const before = inputs
    const revision = state.revision
    session.setInputs({ pay: whatIfInputs.pay, income: whatIfInputs.income, outgoings: whatIfInputs.outgoings })
    setOverlay(emptyOverlay(revision))
    toasts.show({
      message: 'Applied your what-ifs to your inputs.',
      undo: {
        blocked: () => (session.get().revision !== revision ? 'Couldn’t undo: other inputs have been loaded since.' : undefined),
        run: () => session.setInputs(before),
        done: 'Your inputs are back as they were.',
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          {budgetCalculator.name}
        </h1>
        <p className="text-text-muted">{budgetCalculator.summary}</p>
        {/* On a phone the badge is in the sticky bar instead. */}
        <div className="hidden md:flex">
          <NoTaxRulesBadge />
        </div>
      </div>

      <StickyResult
        label={label}
        value={value}
        emptyText={invalid ? 'Fix the highlighted inputs' : 'No result for these inputs'}
        announcement={value === null ? null : `${label}: ${value}`}
        controls={
          <>
            <Segmented id="bd-view-bar" label="Show amounts" value={view} options={VIEW_OPTIONS} onChange={setView} />
            <div className="flex">
              <NoTaxRulesBadge />
            </div>
          </>
        }
        results={
          invalid ? (
            <InlineNotice tone="warning" title="No results until the inputs are fixed">
              <p>Fix the highlighted inputs to see results.</p>
            </InlineNotice>
          ) : baseline.ok ? (
            <Results result={baseline.result} whatIf={whatIfResult} view={view} setView={setView} gbp={gbp} />
          ) : (
            <RefusalNotice refusal={inputRefusal(baseline.problems)} />
          )
        }
      >
        <ScenarioBar calculator={budgetCalculator} session={session} />
        {/* Keyed by revision: a loaded scenario or a fresh start resets every box and which sections are open. */}
        <Inputs
          key={state.revision}
          inputs={inputs}
          invalidFields={state.invalid}
          result={baseline.ok ? baseline.result : null}
          incomeKeys={incomeKeys}
          outgoingKeys={outgoingKeys}
          overlay={overlay}
          setOverlay={setOverlay}
          whatIfActive={active}
          apply={apply}
          gbp={gbp}
        />
      </StickyResult>

      <AssumptionsPanel items={[...(result ? result.assumptions : []), ...PAGE_ASSUMPTIONS]}>
        <p className="text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
      </AssumptionsPanel>
    </div>
  )
}

const set = (patch: Partial<BudgetPageInputs>) => session.setInputs(patch)
const forget = (...fields: string[]) => {
  for (const field of fields) session.setFieldValid(field, true)
}

/**
 * The inputs: Your pay always visible, then a section each (U1 to U3), open on mount when its lines differ from a fresh
 * page's. Remounted (by key) on a load or a fresh start; never stored.
 */
function Inputs({
  inputs,
  invalidFields,
  result,
  incomeKeys,
  outgoingKeys,
  overlay,
  setOverlay,
  whatIfActive,
  apply,
  gbp,
}: {
  inputs: BudgetPageInputs
  invalidFields: readonly string[]
  result: BudgetResult | null
  incomeKeys: Keys
  outgoingKeys: Keys
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
  whatIfActive: boolean
  apply: () => void
  gbp: Gbp
}) {
  const [openOnMount] = useState(() =>
    Object.fromEntries((['income', ...BUDGET_KINDS] as SectionId[]).map((id) => [id, sectionSet(id, inputs)])),
  )
  // What takes focus after the next render: a new line's name, a restored line's name, or Add after a removal.
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => {
    if (focus === null) return
    document.getElementById(focus)?.focus()
    setFocus(null)
  }, [focus])
  const latest = useRef({ incomeKeys, outgoingKeys, setFocus })
  latest.current = { incomeKeys, outgoingKeys, setFocus }

  const lists = { income: inputs.income, outgoings: inputs.outgoings } as const
  const keysOf = (list: ListId) => (list === 'income' ? incomeKeys : outgoingKeys)
  const fieldName = (list: ListId, key: number, part: string) => `${LIST_PREFIX[list]}-${key}-${part}`

  const update = (list: ListId, index: number, patch: Partial<OutgoingLine>) =>
    set({ [list]: lists[list].map((l, i) => (i === index ? { ...l, ...patch } : l)) })

  const add = (list: ListId, kind?: BudgetKind) => {
    const lines = lists[list]
    const key = keysOf(list).inserted(lines.length)
    const blank: IncomeLine = { name: '', amount: ZERO, period: 'monthly' }
    set({ [list]: [...lines, kind ? { ...blank, kind } : blank] })
    setFocus(`${LIST_PREFIX[list]}-${key}-name`)
  }

  const remove = (list: ListId, index: number, key: number, label: string, addId: string) => {
    const line = lists[list][index]!
    const revision = session.get().revision
    forget(fieldName(list, key, 'name'), fieldName(list, key, 'amount'))
    keysOf(list).removed(index)
    set({ [list]: lists[list].filter((_, i) => i !== index) })
    setFocus(addId)
    toasts.show({
      message: `Removed “${label}”.`,
      undo: {
        blocked: () =>
          session.get().revision !== revision
            ? 'Couldn’t undo: other inputs have been loaded since.'
            : session.get().inputs[list].length >= MAX_BUDGET_LINES
              ? 'Couldn’t undo: the list is full.'
              : undefined,
        run: () => {
          const now = session.get().inputs[list]
          const at = Math.min(index, now.length)
          const keys = list === 'income' ? latest.current.incomeKeys : latest.current.outgoingKeys
          const restored = keys.inserted(at)
          set({ [list]: [...now.slice(0, at), line, ...now.slice(at)] })
          latest.current.setFocus(`${LIST_PREFIX[list]}-${restored}-name`)
        },
        done: `Restored “${label}”.`,
      },
    })
  }

  const sectionInvalid = (id: SectionId) => {
    const list: ListId = id === 'income' ? 'income' : 'outgoings'
    const keys = keysOf(list).keys
    return lists[list].some(
      (l, i) =>
        (id === 'income' || (l as OutgoingLine).kind === id) && invalidFields.some((f) => f.startsWith(`${LIST_PREFIX[list]}-${keys[i]}-`)),
    )
  }

  const summary = (id: SectionId): string => {
    if (sectionInvalid(id)) return NEEDS_FIXING
    if (!sectionSet(id, inputs)) return NOT_SET
    const lines = id === 'income' ? inputs.income : inputs.outgoings.filter((l) => l.kind === id)
    const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
    if (!result) return count
    const month =
      id === 'income' ? subtract(result.income.month, result.incomeLines[0]!.month) : result.perKind.find((t) => t.kind === id)!.month
    return `${count}, ${gbp(month)} a month`
  }

  const lineList = (list: ListId, kind?: BudgetKind) => {
    const keys = keysOf(list).keys
    const addId = kind ? `bd-add-${kind}` : 'bd-add-income'
    const full = lists[list].length >= MAX_BUDGET_LINES
    const resolved = list === 'income' ? result?.incomeLines.slice(1) : result?.outgoingLines
    let number = 0
    return (
      <>
        {lists[list].map((line, index) => {
          if (kind && (line as OutgoingLine).kind !== kind) return null
          number++
          const key = keys[index] ?? index
          const lineId = `${LIST_PREFIX[list]}-${key}`
          const label = lineLabel(line, list, kind, number)
          const figures = resolved?.[index]
          return (
            <fieldset key={key} id={lineId} data-line className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
              <legend className="sr-only">{label}</legend>
              <TextInput
                id={`${lineId}-name`}
                label="Name"
                value={line.name}
                maxLength={MAX_ITEM_NAME_LENGTH}
                onChange={(name) => update(list, index, { name })}
                onValidityChange={(ok) => session.setFieldValid(fieldName(list, key, 'name'), ok)}
              />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <CurrencyInput
                  id={`${lineId}-amount`}
                  label="Amount"
                  value={line.amount}
                  emptyValue={ZERO}
                  placeholder="0.00"
                  min={ZERO}
                  max={MAX_INPUT_AMOUNT}
                  onChange={(amount) => update(list, index, { amount })}
                  onValidityChange={(ok) => session.setFieldValid(fieldName(list, key, 'amount'), ok)}
                />
                <Select
                  id={`${lineId}-period`}
                  label="How often"
                  value={line.period}
                  options={PERIOD_OPTIONS}
                  onChange={(period) => update(list, index, { period })}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted tabular-nums">
                  {figures ? `${gbp(figures.month)} a month, ${gbp(figures.year)} a year` : ' '}
                </p>
                <Button
                  id={`${lineId}-remove`}
                  variant="ghost"
                  aria-label={`Remove ${label}`}
                  onClick={() => remove(list, index, key, label, addId)}
                >
                  Remove
                </Button>
              </div>
            </fieldset>
          )
        })}
        <div className="flex flex-col gap-1.5">
          <Button
            id={addId}
            disabled={full}
            aria-describedby={full ? `${addId}-full` : undefined}
            onClick={() => add(list, kind)}
            className="h-auto min-h-touch max-w-full self-start py-2 text-left whitespace-normal"
          >
            <Plus />
            Add a line
          </Button>
          {full && (
            <p id={`${addId}-full`} className="text-xs text-text-muted">
              That’s the most this list holds ({MAX_BUDGET_LINES}). Combine lines to add more.
            </p>
          )}
        </div>
      </>
    )
  }

  const section = (id: SectionId, children: ReactNode) => (
    <Section id={`bd-section-${id}`} title={SECTION_TITLES[id]} summary={summary(id)} defaultOpen={openOnMount[id]}>
      <p className="-mt-1 text-xs text-text-muted">{SECTION_HINTS[id]}</p>
      {children}
    </Section>
  )

  return (
    <>
      <section
        aria-labelledby="bd-your-pay"
        className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="bd-your-pay" className="text-base font-semibold">
          {PAY_LABEL}
        </h2>
        <CurrencyInput
          id="bd-pay"
          label="Pay after tax"
          hint="What reaches your account, after tax, National Insurance, pension and anything else taken from your pay."
          value={inputs.pay}
          emptyValue={ZERO}
          placeholder="0.00"
          min={ZERO}
          max={MAX_INPUT_AMOUNT}
          onChange={(pay) => set({ pay })}
          onValidityChange={(ok) => session.setFieldValid('pay', ok)}
        />
        <Segmented
          id="bd-pay-period"
          label="Entered"
          value={inputs.payPeriod}
          options={PAY_PERIOD_OPTIONS}
          onChange={(payPeriod) => set({ payPeriod })}
        />
      </section>
      {section('income', lineList('income'))}
      {BUDGET_KINDS.map((kind) => (
        <div key={kind} className="contents">
          {section(kind, lineList('outgoings', kind))}
        </div>
      ))}
      <WhatIfSection
        inputs={inputs}
        incomeKeys={incomeKeys.keys}
        outgoingKeys={outgoingKeys.keys}
        overlay={overlay}
        setOverlay={setOverlay}
        active={whatIfActive}
        apply={apply}
        gbp={gbp}
      />
    </>
  )
}

/** One slider per line, Your pay first (BD7): page state only. Reset what-ifs and Apply (with Undo). */
function WhatIfSection({
  inputs,
  incomeKeys,
  outgoingKeys,
  overlay,
  setOverlay,
  active,
  apply,
  gbp,
}: {
  inputs: BudgetPageInputs
  incomeKeys: readonly number[]
  outgoingKeys: readonly number[]
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
  active: boolean
  apply: () => void
  gbp: Gbp
}) {
  const [bad, setBad] = useState<ReadonlySet<string>>(() => new Set())
  const validity = (id: string) => (ok: boolean) =>
    setBad((s) => {
      if (ok === !s.has(id)) return s
      const next = new Set(s)
      if (ok) next.delete(id)
      else next.add(id)
      return next
    })
  const changed = (list: ListId, key: number, amount: Money) => {
    const next = new Map(overlay[list])
    next.set(key, amount)
    setOverlay({ ...overlay, [list]: next })
  }
  const count = [overlay.pay !== undefined && compare(overlay.pay, inputs.pay) !== 0]
    .concat(
      inputs.income.map((l, i) => overlay.income.has(incomeKeys[i]!) && compare(overlay.income.get(incomeKeys[i]!)!, l.amount) !== 0),
      inputs.outgoings.map(
        (l, i) => overlay.outgoings.has(outgoingKeys[i]!) && compare(overlay.outgoings.get(outgoingKeys[i]!)!, l.amount) !== 0,
      ),
    )
    .filter(Boolean).length
  const slider = (list: ListId, line: IncomeLine, key: number, label: string) => {
    const id = `bd-wi-${list === 'income' ? 'in' : 'out'}-${key}`
    return (
      <SliderInput
        key={id}
        id={id}
        label={label}
        unit={PERIOD_UNITS[line.period]}
        value={overlay[list].get(key) ?? line.amount}
        scaleFrom={line.amount}
        max={MAX_INPUT_AMOUNT}
        onChange={(amount) => changed(list, key, amount)}
        onValidityChange={validity(id)}
        hint={`${PERIOD_LABELS[line.period]}; your inputs say ${gbp(line.amount)}.`}
      />
    )
  }
  const numbers: Record<string, number> = {}
  const next = (group: string) => {
    numbers[group] = (numbers[group] ?? 0) + 1
    return numbers[group]
  }

  return (
    <Section
      id="bd-section-whatif"
      title={SECTION_TITLES.whatif}
      summary={count === 0 ? NOT_SET : `${count} what-if${count === 1 ? '' : 's'}, not saved`}
    >
      <p className="-mt-1 text-xs text-text-muted">
        Try other amounts: the results show your inputs and the what-ifs side by side. What-ifs are never saved; Apply puts them into your
        inputs.
      </p>
      <SliderInput
        id="bd-wi-pay"
        label={PAY_LABEL}
        unit={PERIOD_UNITS[inputs.payPeriod]}
        value={overlay.pay ?? inputs.pay}
        scaleFrom={inputs.pay}
        max={MAX_INPUT_AMOUNT}
        onChange={(pay) => setOverlay({ ...overlay, pay })}
        onValidityChange={validity('bd-wi-pay')}
        hint={`${PERIOD_LABELS[inputs.payPeriod]}, after tax; your inputs say ${gbp(inputs.pay)}.`}
      />
      {inputs.income.map((line, i) => slider('income', line, incomeKeys[i] ?? i, lineLabel(line, 'income', undefined, next('income'))))}
      {BUDGET_KINDS.flatMap((kind) =>
        inputs.outgoings.flatMap((line, i) =>
          line.kind === kind
            ? [
                slider(
                  'outgoings',
                  line,
                  outgoingKeys[i] ?? i,
                  `${lineLabel(line, 'outgoings', kind, next(kind))} (${KIND_LABELS[kind].toLowerCase()})`,
                ),
              ]
            : [],
        ),
      )}
      {bad.size > 0 && (
        <p className="text-xs font-medium text-danger">
          Fix the highlighted what-if; until then it keeps its last amount and can’t be applied.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          id="bd-wi-reset"
          variant="ghost"
          disabled={!active}
          onClick={() => setOverlay(emptyOverlay(overlay.revision))}
          className="h-auto min-h-touch max-w-full border border-border py-2 text-left whitespace-normal"
        >
          <RotateCcw />
          Reset what-ifs
        </Button>
        <Button
          id="bd-wi-apply"
          disabled={!active || bad.size > 0}
          onClick={apply}
          className="h-auto min-h-touch max-w-full py-2 text-left whitespace-normal"
        >
          Apply to my inputs
        </Button>
      </div>
    </Section>
  )
}

/** A month or year figure from the engine's exact year (BD2): the same rounding the engine uses for its month figures. */
const yearInView = (year: Money, view: View): Money => (view === 'year' ? year : mulRound(year, ratio(1, MONTHS_PER_YEAR), 'nearest'))

/** The results column (U6): the view switch, warnings, the budget card, what-ifs beside it, where income goes, by kind. */
function Results({
  result,
  whatIf,
  view,
  setView,
  gbp,
}: {
  result: BudgetResult
  whatIf: BudgetResult | null
  view: View
  setView: (view: View) => void
  gbp: Gbp
}) {
  const r = whatIf ?? result
  const per = IN_VIEW[view]
  const negative = r.warnings.includes('negative-leftover')
  const drift = r.pennyDrift
  const drifts =
    view === 'month' && [drift.income, drift.kinds, drift.leftover, ...Object.values(drift.lines)].some((amount) => toPence(amount) !== 0)

  const segments: SplitBarSegment[] = [
    ...r.perKind.map((t) => ({ id: t.kind, label: KIND_LABELS[t.kind], value: toPence(t.year) })),
    ...(negative ? [] : [{ id: 'leftover', label: 'Left over', value: toPence(r.leftover.year) }]),
  ]

  return (
    <>
      <div className="flex flex-col gap-3">
        <Segmented id="bd-view" label="Show amounts" value={view} options={VIEW_OPTIONS} onChange={setView} />
        {negative && (
          <div data-warning="negative-leftover">
            <InlineNotice tone="warning" title="More going out than coming in">
              <p>
                Your outgoings are {gbp(subtract(ZERO, pick(r.leftover, view)))} {per} more than your income
                {whatIf ? ' with your what-ifs' : ''}. It is shown as it is, not capped at nothing.
              </p>
            </InlineNotice>
          </div>
        )}
        {r.warnings.includes('no-income') && (
          <div data-warning="no-income">
            <InlineNotice tone="info">
              <p>Enter your pay to see the share of your income each part takes. Until then shares are {NOT_APPLICABLE}.</p>
            </InlineNotice>
          </div>
        )}
        <ResultCard
          data-budget-card
          title={`Your budget, ${per}${whatIf ? ', with your what-ifs' : ''}`}
          headline={gbp(pick(r.leftover, view))}
          headlineLabel={`Left over, ${shareText(r.leftover.share)} of your income`}
        >
          <StatRow label="Income" value={gbp(pick(r.income, view))} detail="Your pay and any extra income" />
          <StatRow label="Outgoings" value={gbp(pick(r.outgoings, view))} detail={`${shareText(r.outgoings.share)} of your income`} />
          <StatRow label="Left over" value={gbp(pick(r.leftover, view))} detail={`${shareText(r.leftover.share)} of your income`} />
          <StatRow label="Savings rate" value={shareText(r.savingsRate)} detail="Savings and investing, of your income" />
        </ResultCard>
      </div>

      {whatIf && <WhatIfResults result={result} whatIf={whatIf} view={view} gbp={gbp} />}

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <SplitBar
          title={negative ? `Where your outgoings go, ${per}` : `Where your income goes, ${per}`}
          segments={segments}
          total={toPence(negative ? r.outgoings.year : r.income.year)}
          totalLabel={negative ? 'Outgoings' : 'Income'}
          formatValue={(v) => gbp(yearInView(fromPence(v), view))}
          highlight="leftover"
          emptyText="Nothing to show yet: enter your pay and outgoings."
        />
      </div>

      <KindTable result={r} view={view} gbp={gbp} drifts={drifts} whatIf={whatIf !== null} />
    </>
  )
}

/** Your inputs beside the what-ifs, with the change (BD7). */
function WhatIfResults({ result, whatIf, view, gbp }: { result: BudgetResult; whatIf: BudgetResult; view: View; gbp: Gbp }) {
  const rows: { label: string; base: string; next: string; change: string }[] = [
    ...(
      [
        ['Income', result.income, whatIf.income],
        ['Outgoings', result.outgoings, whatIf.outgoings],
        ['Left over', result.leftover, whatIf.leftover],
      ] as const
    ).map(([label, a, b]) => ({
      label,
      base: gbp(pick(a, view)),
      next: gbp(pick(b, view)),
      change: formatGBPChange(subtract(pick(b, view), pick(a, view)), 'pence'),
    })),
    {
      label: 'Savings rate',
      base: shareText(result.savingsRate),
      next: shareText(whatIf.savingsRate),
      change:
        result.savingsRate && whatIf.savingsRate
          ? formatPointsChange(subtractRatio(whatIf.savingsRate, result.savingsRate))
          : NOT_APPLICABLE,
    },
  ]
  const cell = 'px-3 py-2 text-right tabular-nums'
  return (
    <section
      data-what-if-results
      aria-labelledby="bd-what-if-title"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="bd-what-if-title" className="text-base font-semibold text-text">
        Your inputs and your what-ifs, {IN_VIEW[view]}
      </h2>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable). */}
      <section tabIndex={0} aria-label="Your inputs and your what-ifs, as a table" className="overflow-x-auto">
        <table className="w-full text-sm text-text">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                <span className="sr-only">Figure</span>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Your inputs
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                What if
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {row.label}
                </th>
                <td className={cell}>{row.base}</td>
                <td className={cell}>{row.next}</td>
                <td className={`${cell} font-medium`}>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}

/** Each kind with its share of your income, then outgoings, left over and income; the penny note in the month view (BD2). */
function KindTable({
  result,
  view,
  gbp,
  drifts,
  whatIf,
}: {
  result: BudgetResult
  view: View
  gbp: Gbp
  drifts: boolean
  whatIf: boolean
}) {
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap'
  const total = (label: string, figure: YearAndMonth & { share?: Ratio | null }) => (
    <tr className="border-t border-border-strong font-medium">
      <th scope="row" className="px-3 py-2 text-left">
        {label}
      </th>
      <td className={cell}>{gbp(pick(figure, view))}</td>
      <td className={cell}>{figure.share === undefined ? '' : shareText(figure.share)}</td>
    </tr>
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="bd-kinds-title" className="text-base font-semibold text-text">
        By kind, {IN_VIEW[view]}
        {whatIf ? ', with your what-ifs' : ''}
      </h2>
      <section
        aria-labelledby="bd-kinds-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
      >
        <table data-kind-table className="w-full border-collapse text-sm text-text">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Kind
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {capitalised(IN_VIEW[view])}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Of your income
              </th>
            </tr>
          </thead>
          <tbody>
            {result.perKind.map((t) => (
              <tr key={t.kind} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {KIND_LABELS[t.kind]}
                </th>
                <td className={cell}>{gbp(pick(t, view))}</td>
                <td className={cell}>{shareText(t.share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {total('Outgoings', result.outgoings)}
            {total('Left over', result.leftover)}
            {total('Income', result.income)}
          </tfoot>
        </table>
      </section>
      {drifts && (
        <p data-penny-note className="text-xs text-text-muted">
          Each month figure is its yearly figure divided by the months, to the nearest penny, so the rows here and in the lines can differ
          from their total by a penny or two. The yearly figures add up exactly.
        </p>
      )}
    </div>
  )
}
