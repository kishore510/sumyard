import type { Money } from '@/lib/money'
import type { Comparison, ValueCase } from '../car-ownership/types'
import { CASE_LABELS, VALUE_CASES } from './definition'
import { bottomLine, scenarioTable, switchCosts, type Verdict } from './narrative'

/*
 * The answer first (session 3d-1), at the top of the results column (sticky
 * from md): the verdict sentence and the switch cost, the bottom line, and
 * each option in the low, expected and high cases. Every sentence comes from
 * ./narrative.ts on the engine's comparison; nothing here is worked out.
 */

type Gbp = (amount: Money) => string

const PANEL =
  'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-sm text-text shadow-sm [overflow-wrap:anywhere]'

/** The verdict (lowest net cost, by how much, the savings return used) and, with a Keep option, what switching costs. */
export function VerdictPanel({
  verdict,
  comparison,
  valueCase,
  names,
  gbp,
}: {
  verdict: Verdict
  comparison: Comparison
  valueCase: ValueCase
  names: readonly string[]
  gbp: Gbp
}) {
  const switches = switchCosts(comparison, valueCase, names, gbp)
  return (
    <section data-verdict-panel aria-labelledby="cd-verdict-title" className={PANEL}>
      <h2 id="cd-verdict-title" className="text-base font-semibold">
        Lowest net cost, {CASE_LABELS[valueCase].toLowerCase()} end value
      </h2>
      <p data-verdict data-verdict-kind={verdict.kind} className="text-base">
        {verdict.text}
      </p>
      {switches.length > 0 && (
        <ul data-switch-costs className="flex list-disc flex-col gap-1 pl-5">
          {switches.map((s) => (
            <li key={s.option} data-switch-cost>
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The bottom line: the lowest net cost, running cost and depreciation per month owned, and the cost of the alternative, each defined. */
export function BottomLine({
  comparison,
  valueCase,
  names,
  gbp,
}: {
  comparison: Comparison
  valueCase: ValueCase
  names: readonly string[]
  gbp: Gbp
}) {
  const rows = bottomLine(comparison, valueCase, names, gbp)
  return (
    <section data-bottom-line aria-labelledby="cd-bottom-title" className={PANEL}>
      <h2 id="cd-bottom-title" className="text-base font-semibold">
        Bottom line
      </h2>
      {rows.length === 0 ? (
        <p>No option covers the whole horizon, so there is no bottom line to compare.</p>
      ) : (
        <>
          <p className="text-text-muted">Options that cover the whole horizon only, per month owned.</p>
          <dl className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.id}
                data-bottom-row={row.id}
                className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0 first:pt-0"
              >
                <dt className="text-text-muted">{row.label}</dt>
                <dd className="font-medium">{row.text}</dd>
                <dd className="text-xs text-text-muted">{row.definition}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}

/** Each option's average cost per month owned in the low, expected and high cases, and whether the lowest changes. */
export function ScenarioTable({
  comparison,
  valueCase,
  names,
  gbp,
}: {
  comparison: Comparison
  valueCase: ValueCase
  names: readonly string[]
  gbp: Gbp
}) {
  const table = scenarioTable(comparison, names)
  const cell = 'px-3 py-2 text-right tabular-nums whitespace-nowrap'
  return (
    <section data-scenarios aria-labelledby="cd-scenarios-title" className={PANEL}>
      <h2 id="cd-scenarios-title" className="text-base font-semibold">
        Low, expected and high end values
      </h2>
      <p data-scenario-sentence>{table.sentence}</p>
      <section
        aria-labelledby="cd-scenarios-title"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border border-border outline-offset-2"
      >
        <table data-scenario-table className="w-full border-collapse">
          <caption className="sr-only">Average cost per month owned for each option in each end-value case</caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Option
              </th>
              {VALUE_CASES.map((c) => (
                <th key={c} scope="col" className={`${cell} font-medium`}>
                  {CASE_LABELS[c]}
                  {c === valueCase && <span className="sr-only"> (shown)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.option} className="border-t border-border">
                <th scope="row" className="max-w-40 px-3 py-2 text-left font-normal [overflow-wrap:anywhere]">
                  {row.name}
                  {!row.fullCoverage && (
                    <span className="block text-xs text-text-muted">
                      Covers {row.coverageMonths} of {comparison.horizonMonths} months: not compared
                    </span>
                  )}
                </th>
                {VALUE_CASES.map((c) => (
                  <td key={c} className={`${cell} ${c === valueCase ? 'font-semibold' : ''}`}>
                    {gbp(row.perMonth[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-text-muted">Average cost per month owned. The case the cards show is in bold.</p>
    </section>
  )
}
