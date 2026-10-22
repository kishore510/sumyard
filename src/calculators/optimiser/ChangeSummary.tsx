import { formatGBPChange, formatPercent, formatPercentChange, formatPointsChange } from '@/lib/format'
import type { Money } from '@/lib/money'
import type { AmountStyle } from '@/settings/settings'
import type { ContributionComparison, MeasureComparison } from './compare'

/*
 * The main result of the compare redesign (U23): the one-sentence summary
 * and three cards (your contribution, the total paid into your pension,
 * take-home), each with Now, New and Change for a month and a year, the %
 * change on the figure now, and for your contribution its share of
 * pensionable pay with the change in percentage points (pts). Signs are
 * written with the true minus sign; colours stay neutral; nothing is called
 * better or worse. No figure is written here.
 */

type Measure = 'ownContribution' | 'totalIntoPension' | 'takeHome'

const CARDS: readonly { readonly id: Measure; readonly title: string; readonly subline: string }[] = [
  { id: 'ownContribution', title: 'Your pension contribution', subline: 'What comes out of your pay (a salary sacrifice counts here).' },
  {
    id: 'totalIntoPension',
    title: 'Total paid into your pension',
    subline: 'Your contribution plus any tax relief your provider adds and your employer’s own contribution.',
  },
  { id: 'takeHome', title: 'Your take-home pay', subline: 'Pay after tax, National Insurance, student loan, pension and deductions.' },
]

const NO_PERCENT = '–'

function Row({ id, label, now, next, change }: { id: string; label: string; now: string; next: string; change: string }) {
  return (
    <tr data-row={id} className="border-t border-border">
      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-text-muted">
        {label}
      </th>
      <td data-col="now" className="py-1.5 pl-2 text-right tabular-nums [overflow-wrap:anywhere]">
        {now}
      </td>
      <td data-col="new" className="py-1.5 pl-2 text-right tabular-nums [overflow-wrap:anywhere]">
        {next}
      </td>
      <td data-col="change" className="py-1.5 pl-2 text-right font-medium tabular-nums [overflow-wrap:anywhere]">
        {change}
      </td>
    </tr>
  )
}

function Card({
  id,
  title,
  subline,
  measure,
  share,
  gbp,
  style,
}: {
  id: Measure
  title: string
  subline: string
  measure: MeasureComparison
  share: ContributionComparison['ownContribution']['shareOfPay'] | undefined
  gbp: (amount: Money) => string
  style: AmountStyle
}) {
  const change = (amount: Money) => formatGBPChange(amount, style)
  const { annual, monthly } = measure
  return (
    <section
      data-compare-card={id}
      aria-labelledby={`opt-card-${id}`}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <h3 id={`opt-card-${id}`} className="text-sm font-semibold text-text">
        {title}
      </h3>
      <p className="text-xs text-text-muted">{subline}</p>
      <table className="mt-1 w-full table-fixed border-collapse text-sm text-text">
        <thead>
          <tr className="text-xs text-text-muted">
            <th scope="col" className="w-2/7 pb-1 text-left font-normal">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Now
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              New
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          <Row id="month" label="Per month" now={gbp(monthly.now)} next={gbp(monthly.new)} change={change(monthly.change)} />
          <Row id="year" label="Per year" now={gbp(annual.now)} next={gbp(annual.new)} change={change(annual.change)} />
          <Row
            id="percentChange"
            label="% change"
            now=""
            next=""
            change={annual.percentChange === null ? NO_PERCENT : formatPercentChange(annual.percentChange)}
          />
          {share && (
            <Row
              id="share"
              label="Share of pay"
              now={formatPercent(share.now)}
              next={formatPercent(share.new)}
              change={formatPointsChange(share.changeInPoints)}
            />
          )}
        </tbody>
      </table>
      {annual.percentChange === null && (
        <p className="text-xs text-text-muted">
          {NO_PERCENT} No % change: the figure now is nothing (or below), so there is nothing to measure it on.
        </p>
      )}
    </section>
  )
}

export function ChangeSummary({
  comparison,
  sentence,
  gbp,
  style,
}: {
  comparison: ContributionComparison
  sentence: string
  gbp: (amount: Money) => string
  style: AmountStyle
}) {
  return (
    <div data-change-summary className="flex min-w-0 flex-col gap-3">
      <p data-change-sentence className="text-base text-text [overflow-wrap:anywhere]">
        {sentence}
      </p>
      {CARDS.map((card) => (
        <Card
          key={card.id}
          {...card}
          measure={comparison[card.id]}
          share={card.id === 'ownContribution' ? comparison.ownContribution.shareOfPay : undefined}
          gbp={gbp}
          style={style}
        />
      ))}
      <p className="text-xs text-text-muted">
        “% change” is the change on the figure now. “pts” (percentage points) is the change in your share of pensionable pay.
      </p>
    </div>
  )
}
