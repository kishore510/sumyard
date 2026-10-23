import type { ReactNode } from 'react'
import { BridgeBar } from '@/components/BridgeBar'
import { formatGBPDelta } from '@/lib/format'
import { fromPence, type Money, toPence } from '@/lib/money'
import type { Bridge, ValueCase } from '../car-ownership/types'
import { CASE_LABELS } from './definition'
import { bridgeRows, bridgeSentences } from './results'

/*
 * "Where the difference comes from" (session 3d-2, F55, F56, U38), in the
 * results under the verdict: for the pair "What changes the answer" uses,
 * the difference in average cost per month owned split by the cards' parts,
 * in words, as bars either way from nothing (BridgeBar) and as a table.
 * Every figure is the engine's (costBridge); nothing here is worked out.
 * Described, never explained.
 */

type Gbp = (amount: Money) => string

export type BridgeState =
  | { readonly kind: 'no-pair'; readonly reason: string }
  | { readonly kind: 'same' }
  | { readonly kind: 'ready'; readonly names: readonly [string, string]; readonly bridge: Bridge }

export function BridgeSection({
  state,
  valueCase,
  gbp,
  picker,
}: {
  state: BridgeState
  valueCase: ValueCase
  gbp: Gbp
  picker?: ReactNode
}) {
  const caseWord = CASE_LABELS[valueCase].toLowerCase()
  let body: ReactNode
  if (state.kind === 'no-pair') body = <p data-bridge-none>{state.reason}</p>
  else if (state.kind === 'same') body = <p>Choose two different options to see where the difference comes from.</p>
  else {
    const [a, b] = state.names
    const said = bridgeSentences(state.bridge, state.names, valueCase, gbp)
    body = (
      <>
        <p data-bridge-difference>{said.difference}</p>
        <p data-bridge-largest>{said.largest}</p>
        <BridgeBar
          title={`${a} less ${b}, a month, by part`}
          rows={bridgeRows(state.bridge).map((row) => ({ id: row.id, label: row.label, value: toPence(row.value) }))}
          total={toPence(state.bridge.total.shown)}
          totalLabel="Difference"
          // Always to the penny, whatever Settings shows: the parts add up to the difference only in pence (F55).
          formatValue={(v) => formatGBPDelta(fromPence(v), 'pence')}
          more={`more for ${a}`}
          less={`less for ${a}`}
        />
        <p className="text-xs text-text-muted">
          Each part is the difference between the two cards’ parts, divided by the months owned, to the penny; the parts add up to the
          difference, which is the verdict’s gap a month.
        </p>
      </>
    )
  }
  return (
    <section
      data-bridge
      aria-labelledby="cd-bridge-title"
      // A long unbroken option name wraps instead of widening the page.
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-sm text-text shadow-sm [overflow-wrap:anywhere]"
    >
      <h2 id="cd-bridge-title" className="text-base font-semibold">
        Where the difference comes from
      </h2>
      {picker}
      <p className="text-text-muted">
        The first option’s average cost per month owned less the second’s, in the {caseWord} case, split into the parts each card shows. The
        same pair as in “What changes the answer”: choosing here changes both.
      </p>
      {body}
    </section>
  )
}
