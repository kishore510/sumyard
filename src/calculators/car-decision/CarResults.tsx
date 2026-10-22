import type { ReactNode } from 'react'
import { RefusalNotice } from '@/components/RefusalNotice'
import { ResultCard, StatRow } from '@/components/ResultCard'
import { SplitBar } from '@/components/SplitBar'
import { InlineNotice } from '@/components/states'
import { formatPercent } from '@/lib/format'
import { fromPence, type Money, toPence } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { AcquisitionKind, Comparison, FlipPoints, ValueCase } from '../car-ownership/types'
import { ACQUISITION_LABELS, CASE_LABELS, type CarDecisionInputs, coverageText, fieldList, type OptionStatus } from './definition'
import { type RateShown, rateShown } from './rates'
import {
  breakdownParts,
  equityAtHorizon,
  type FlipSentence,
  flipSentences,
  isNegative,
  orderingRule,
  pageIndexes,
  pairNames,
  tiesText,
} from './results'

/*
 * The car decision's results (slice 3c-1), every figure the engine's:
 *
 * - the order under these assumptions (the engine's ranking, the rule and
 *   ties in words), in the sticky results column;
 * - "What changes the answer": the flip points between the two lowest
 *   options as threshold sentences;
 * - a card per option in the order, in columns from md and a row that
 *   scrolls sideways (snapping) on a phone, focusable by keyboard;
 * - the comparison table below, the same figures as an accessible table.
 *
 * The words are "lowest net cost under these assumptions": no option is
 * called anything stronger, and nothing tells anyone what to do.
 */

type Gbp = (amount: Money) => string

export interface CardData {
  readonly index: number
  readonly name: string
  readonly kind: AcquisitionKind
  readonly status: OptionStatus
}

const RATE_TEST: Record<RateShown['kind'], string> = { apr: 'apr', effective: 'effective', none: 'none' }

/** The rate an ok option shows, from its engine option and result. */
function rateFor(status: Extract<OptionStatus, { kind: 'ok' }>): RateShown | null {
  return rateShown(status.option.acquisition, status.result.finance)
}

function Rate({ shown }: { shown: RateShown }) {
  return (
    <p data-rate data-rate-kind={RATE_TEST[shown.kind]} className="flex flex-col text-sm text-text">
      {shown.kind === 'none' ? (
        <span>{shown.why}</span>
      ) : (
        <>
          <span>
            <span className="text-text-muted">{shown.label}:</span>{' '}
            <span className="font-medium tabular-nums">{formatPercent(shown.rate, shown.kind === 'apr' ? 1 : 2)}</span>
          </span>
          {shown.kind === 'effective' && <span className="text-xs text-text-muted">{shown.why}</span>}
        </>
      )}
    </p>
  )
}

/** One option's card (U16): the headline net cost per month of coverage, the total, coverage, equity, cash out, opportunity cost, the breakdown. */
function OptionCard({
  card,
  valueCase,
  position,
  gbp,
}: {
  card: CardData
  valueCase: ValueCase
  /** Its place in the order, or why it has none. */
  position: string
  gbp: Gbp
}) {
  const { status, name, index } = card
  const props = {
    title: name,
    heading: 'h3' as const,
    tabIndex: 0,
    'data-option-card': '',
    'data-option-index': index,
    className: 'min-w-0 shrink-0 basis-11/12 snap-start p-4 sm:basis-2/3 md:basis-auto',
  }
  if (status.kind !== 'ok') {
    return (
      <ResultCard
        {...props}
        footer={
          status.kind === 'missing' ? (
            <div data-card-missing>
              <InlineNotice title="Needs inputs">
                <p>Enter these to see this option: {fieldList(status.missing, card.kind)}.</p>
              </InlineNotice>
            </div>
          ) : status.kind === 'held' ? (
            <div data-card-invalid>
              <InlineNotice tone="warning">
                <p>Fix the highlighted input in this option to see its figures.</p>
              </InlineNotice>
            </div>
          ) : (
            <RefusalNotice refusal={status.refusal} heading="h3" />
          )
        }
      >
        <StatRow label="Order" value={position} />
      </ResultCard>
    )
  }
  return <OkCard status={status} valueCase={valueCase} position={position} gbp={gbp} props={props} />
}

function OkCard({
  status,
  valueCase,
  position,
  gbp,
  props,
}: {
  status: Extract<OptionStatus, { kind: 'ok' }>
  valueCase: ValueCase
  position: string
  gbp: Gbp
  props: Record<string, unknown> & { title: string; heading: 'h3' }
}) {
  const { result } = status
  const c = result.cases[valueCase]
  const equity = equityAtHorizon(result, valueCase)
  const shown = rateFor(status)
  const parts = breakdownParts(c.breakdown)
  return (
    <ResultCard
      {...props}
      headline={gbp(c.netCostPerCoverageMonth)}
      headlineLabel="Net cost per month of coverage"
      footer={
        <>
          {!result.fullCoverage && (
            <div data-coverage-flag>
              <InlineNotice tone="warning" title={`Covers only ${coverageText(result)}`}>
                <p>
                  The car is handed back at the end of the term and no replacement is modelled, so the months after are not covered. It is
                  not ordered against options that cover the whole horizon.
                </p>
              </InlineNotice>
            </div>
          )}
          {equity !== null && isNegative(equity) && (
            <div data-negative-equity>
              <InlineNotice tone="warning" title="Negative equity at the horizon">
                <p>More is still owed on the car than it is worth then, in this case.</p>
              </InlineNotice>
            </div>
          )}
          {shown && <Rate shown={shown} />}
          <SplitBar
            title="Where the net cost goes"
            segments={parts.map((p) => ({ id: p.id, label: p.label, value: toPence(p.value) }))}
            total={toPence(c.netCost)}
            totalLabel="Net cost"
            formatValue={(v) => gbp(fromPence(v))}
            emptyText="The net cost is nothing or below, so there is nothing to split. The figures are below."
          />
        </>
      }
    >
      <StatRow label="Order" value={position} />
      <StatRow label="Total net cost" value={gbp(c.netCost)} marker="total" />
      <StatRow label="Coverage" value={`Covers ${coverageText(result)}`} marker="coverage" />
      <StatRow
        label="Equity at the horizon"
        value={equity === null ? 'None: handed back before the horizon' : gbp(equity)}
        detail="What the car is worth less anything still owed on it"
        marker="equity"
      />
      <StatRow label="Cash out" value={gbp(c.cashOut)} detail="Everything paid over the months covered" marker="cash-out" />
      <StatRow
        label="Opportunity cost"
        value={gbp(c.breakdown.opportunityCost)}
        detail="What that cash could have earned at your savings return"
        marker="opportunity"
      />
    </ResultCard>
  )
}

const ordinalPosition = (pos: number, count: number) => `${pos} of ${count} under these assumptions`

/** Each card's place in the order, in words: ranked, not ordered (partial coverage), or no results. */
export function positions(comparison: Comparison | null, statuses: readonly OptionStatus[], valueCase: ValueCase): Map<number, string> {
  const out = new Map<number, string>()
  statuses.forEach((status, index) => {
    if (status.kind === 'missing') out.set(index, 'Not ordered: inputs missing')
    if (status.kind === 'held') out.set(index, 'Not ordered: an input to fix')
    if (status.kind === 'refused') out.set(index, 'Not ordered: no results')
  })
  if (!comparison) return out
  const byEngine = pageIndexes(statuses)
  const ranking = comparison.ranking[valueCase]
  let place = 0
  ranking.full.forEach((entry, k) => {
    if (!entry.tiedWithPrevious) place = k + 1
    out.set(byEngine[entry.option]!, ordinalPosition(place, ranking.full.length) + (entry.tiedWithPrevious ? ', tied' : ''))
  })
  for (const entry of ranking.partial) out.set(byEngine[entry.option]!, 'Not ordered: covers less than the horizon')
  return out
}

/** The grid's columns from md for one to four cards, by count. */
const GRID_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-2 lg:grid-cols-3', 'md:grid-cols-2 xl:grid-cols-4']

/** The option cards in order (U16): columns from md, a row that snaps as it scrolls sideways on a phone, reachable by keyboard. */
export function OptionCards({
  cards,
  valueCase,
  positions: places,
  gbp,
}: {
  cards: readonly CardData[]
  valueCase: ValueCase
  positions: Map<number, string>
  gbp: Gbp
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="cd-cards-title" className="text-base font-semibold text-text">
        Each option, {CASE_LABELS[valueCase].toLowerCase()} end value
      </h2>
      {cards.length > 1 && (
        <p data-scroll-hint className="text-xs text-text-muted md:hidden">
          Scroll sideways, or move with Tab, to see all {cards.length} options.
        </p>
      )}
      <section
        data-cards
        aria-labelledby="cd-cards-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls sideways on a phone must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-lg pb-2 outline-offset-2 md:grid md:overflow-visible md:pb-0',
          GRID_COLUMNS[cards.length],
        )}
      >
        {cards.map((card) => (
          <OptionCard key={card.index} card={card} valueCase={valueCase} position={places.get(card.index) ?? ''} gbp={gbp} />
        ))}
      </section>
    </div>
  )
}

/** The cards' figures as a table (U17), the accessible equivalent: a column per option in the cards' order. */
export function CompareTable({ cards, valueCase, gbp }: { cards: readonly CardData[]; valueCase: ValueCase; gbp: Gbp }) {
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap'
  const ok = (card: CardData) => (card.status.kind === 'ok' ? card.status : null)
  const none = (card: CardData) =>
    card.status.kind === 'missing' ? 'Inputs missing' : card.status.kind === 'held' ? 'Input to fix' : 'No results'
  const rows: [string, (card: CardData) => string][] = [
    ['Net cost per month of coverage', (card) => (ok(card) ? gbp(ok(card)!.result.cases[valueCase].netCostPerCoverageMonth) : none(card))],
    ['Total net cost', (card) => (ok(card) ? gbp(ok(card)!.result.cases[valueCase].netCost) : none(card))],
    ['Coverage', (card) => (ok(card) ? coverageText(ok(card)!.result) : none(card))],
    [
      'Equity at the horizon',
      (card) => {
        const status = ok(card)
        if (!status) return none(card)
        const equity = equityAtHorizon(status.result, valueCase)
        return equity === null ? 'None: handed back' : gbp(equity)
      },
    ],
    ['Cash out', (card) => (ok(card) ? gbp(ok(card)!.result.cases[valueCase].cashOut) : none(card))],
    ['Opportunity cost', (card) => (ok(card) ? gbp(ok(card)!.result.cases[valueCase].breakdown.opportunityCost) : none(card))],
    [
      'Rate',
      (card) => {
        const status = ok(card)
        const shown = status ? rateFor(status) : null
        if (!shown) return status ? 'No finance' : none(card)
        return shown.kind === 'none'
          ? 'None'
          : `${formatPercent(shown.rate, shown.kind === 'apr' ? 1 : 2)} ${shown.kind === 'apr' ? 'APR' : 'effective'}`
      },
    ],
  ]
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 id="cd-table-title" className="text-base font-semibold text-text">
        The options side by side
      </h2>
      <section
        aria-labelledby="cd-table-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm"
      >
        <table data-compare-table className="w-full min-w-max border-collapse text-sm text-text">
          <caption className="sr-only">
            Each option’s figures in the {CASE_LABELS[valueCase].toLowerCase()} case, in the cards’ order
          </caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-medium">
                Measure
              </th>
              {cards.map((card) => (
                <th key={card.index} scope="col" className="max-w-48 px-3 py-2 text-right font-medium [overflow-wrap:anywhere]">
                  {card.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                  {label}
                </th>
                {cards.map((card) => (
                  <td key={card.index} className={cell}>
                    {value(card)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/** The order under these assumptions (F27), for the results column: the rule and ties in words, each option in order. */
export function OrderSummary({
  comparison,
  cards,
  valueCase,
  gbp,
}: {
  comparison: Comparison | null
  cards: readonly CardData[]
  valueCase: ValueCase
  gbp: Gbp
}) {
  const engineNames = (statuses: readonly CardData[]) => {
    const out: string[] = []
    for (const card of statuses) if (card.status.kind === 'ok') out[card.status.engineIndex] = card.name
    return out
  }
  const ties = comparison ? tiesText(comparison, valueCase, engineNames(cards)) : []
  const shown = (card: CardData) => (card.status.kind === 'ok' ? card.status : null)
  return (
    <section
      data-order-summary
      aria-labelledby="cd-order-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <h2 id="cd-order-title" className="text-base font-semibold text-text">
        Order under these assumptions
      </h2>
      {comparison ? (
        <p data-ordering-rule className="text-sm text-text-muted">
          {orderingRule(comparison, valueCase)}
        </p>
      ) : (
        <p className="text-sm text-text-muted">No option has results yet: each card says what it needs.</p>
      )}
      <ol className="flex flex-col">
        {cards.map((card) => {
          const status = shown(card)
          return (
            <li
              key={card.index}
              className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-border py-2 text-sm first:border-t-0"
            >
              <span className="min-w-0 text-text [overflow-wrap:anywhere]">
                {card.name} <span className="text-text-muted">({ACQUISITION_LABELS[card.kind]})</span>
              </span>
              <span className="text-right font-medium text-text tabular-nums">
                {status
                  ? `${gbp(status.result.cases[valueCase].netCostPerCoverageMonth)} a month${status.result.fullCoverage ? '' : `, over ${status.result.coverageMonths} months: not ordered`}`
                  : card.status.kind === 'refused'
                    ? 'No results'
                    : card.status.kind === 'held'
                      ? 'Input to fix'
                      : 'Inputs missing'}
              </span>
            </li>
          )
        })}
      </ol>
      {ties.length > 0 && (
        <p data-ties className="text-sm text-text">
          {ties.join(' ')}
        </p>
      )}
    </section>
  )
}

/** "What changes the answer" (F22): the flip points between the two lowest options, once worked out. */
export function WhatChanges({
  state,
  inputs,
  gbp,
}: {
  state:
    | { readonly kind: 'no-pair' }
    | { readonly kind: 'pending' }
    | { readonly kind: 'refused' }
    | { readonly kind: 'ready'; readonly pair: readonly [number, number]; readonly flips: FlipPoints }
  inputs: CarDecisionInputs
  gbp: Gbp
}) {
  let body: ReactNode
  if (state.kind === 'no-pair')
    body = <p>Thresholds need two options that cover the whole horizon with results. Each card says what its option needs.</p>
  else if (state.kind === 'pending') body = <p>Working out the thresholds once the inputs settle…</p>
  else if (state.kind === 'refused') body = <p>The thresholds can’t be worked out for these inputs.</p>
  else {
    const names = pairNames(inputs, state.pair)
    const sentences: FlipSentence[] = flipSentences(state.flips, names, gbp)
    body = (
      <>
        <p>
          Between {names[0]} and {names[1]}, the two lowest net costs per month of coverage in the{' '}
          {CASE_LABELS[inputs.valueCase].toLowerCase()} case. Each line changes one thing.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {sentences.map((s) => (
            <li key={s.id} data-flip={s.id}>
              {s.text}
            </li>
          ))}
        </ul>
      </>
    )
  }
  return (
    <section
      data-flips
      aria-labelledby="cd-flips-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-sm text-text shadow-sm"
    >
      <h2 id="cd-flips-title" className="text-base font-semibold">
        What changes the answer
      </h2>
      {body}
    </section>
  )
}
