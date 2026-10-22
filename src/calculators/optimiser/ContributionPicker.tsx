import { CurrencyInput } from '@/components/inputs/CurrencyInput'
import { PercentInput } from '@/components/inputs/PercentInput'
import { InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { formatPercent } from '@/lib/format'
import { compare, fromPence, type Money, mulRound, ratio, toPence, ZERO } from '@/lib/money'
import { percentRatio } from '@/lib/parse'
import { perPeriod } from './breakdown'
import { INPUT_LIMITS, METHOD_LABELS } from './definition'
import { pickerStops } from './targetWords'
import type { OptimiseResult } from './types'

/*
 * The contribution to compare with now (the compare redesign, U24): a typed
 * amount a year, or a percentage of pensionable pay in the page's
 * percentage mode, kept in step with a native range slider from nothing to
 * the engine's maximum, and pills for now, each threshold still ahead and
 * the maximum. A typed amount past the maximum is clamped with a message.
 * The amount a month and a year and the share of pay are shown under it.
 * The target is the page's state only, never stored, and its box never
 * holds the page's results back. No figure is written here.
 */

/** Pounds and pence on the slider: it moves a pound at a time. A display step, not a figure. */
const SLIDER_STEP = 100

const percentText = (amount: Money, pay: Money) =>
  compare(pay, ZERO) > 0
    ? formatPercent(ratio(toPence(amount), toPence(pay)))
        .replace('%', '')
        .replace(/,/g, '')
    : '0'

export function ContributionPicker({
  sweep,
  requested,
  target,
  clamped,
  onChange,
  mode,
  pensionablePay,
  gbp,
}: {
  sweep: OptimiseResult
  /** What was asked for (typed, slid or a pill); the target is this within the maximum. */
  requested: Money
  target: Money
  clamped: boolean
  onChange: (amount: Money) => void
  mode: 'amount' | 'percentOfPay'
  pensionablePay: Money
  gbp: (amount: Money) => string
}) {
  const max = sweep.maximumContribution
  const stops = pickerStops(sweep)
  const share = compare(pensionablePay, ZERO) > 0 ? formatPercent(ratio(toPence(target), toPence(pensionablePay))) : null
  const amounts = `${gbp(perPeriod(target, 'month'))} a month · ${gbp(target)} a year${share ? ` · ${share} of pensionable pay` : ''}`
  const hint = `Your own contribution, by ${METHOD_LABELS[sweep.method].toLowerCase()}. Now: ${gbp(sweep.currentContribution)} a year.`
  return (
    <div data-picker className="flex min-w-0 flex-col gap-3">
      {mode === 'amount' ? (
        <CurrencyInput
          id="opt-target"
          label="Contribution to compare, a year"
          hint={hint}
          value={requested}
          min={ZERO}
          max={INPUT_LIMITS.maxAmount}
          onChange={onChange}
        />
      ) : (
        <PercentInput
          id="opt-target-pct"
          label="Contribution to compare (percentage of pensionable pay)"
          hint={hint}
          value={percentText(requested, pensionablePay)}
          min={ratio(0, 1)}
          max={INPUT_LIMITS.maxPercent}
          onChange={(text) => onChange(mulRound(pensionablePay, percentRatio(text), 'nearest'))}
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="opt-target-slider" className="text-sm font-medium text-text">
          Slide from nothing to the most modelled
        </label>
        <input
          id="opt-target-slider"
          type="range"
          min={0}
          max={toPence(max)}
          step={SLIDER_STEP}
          value={toPence(target)}
          aria-valuetext={amounts}
          onChange={(e) => onChange(fromPence(Number(e.currentTarget.value)))}
          className="h-touch w-full min-w-0 cursor-pointer accent-accent"
        />
      </div>
      <p data-target-amounts className="text-sm text-text tabular-nums [overflow-wrap:anywhere]">
        {amounts}
      </p>
      {clamped && (
        <div data-clamp>
          <InlineNotice tone="info">
            <p>The most modelled is {gbp(max)} a year (into the pension, gross, that is all of your pay), so that is what is compared.</p>
          </InlineNotice>
        </div>
      )}
      <fieldset className="flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">Jump to</legend>
        {stops.map((stop) => (
          <Button
            key={stop.id}
            data-pill={stop.id}
            variant="ghost"
            aria-pressed={compare(stop.amount, target) === 0}
            onClick={() => onChange(stop.amount)}
            className="h-auto min-h-touch max-w-full flex-col items-start gap-0 border border-border py-1.5 text-left whitespace-normal"
          >
            <span>{stop.label}</span>
            <span className="text-xs font-normal text-text-muted tabular-nums">{gbp(stop.amount)} a year</span>
          </Button>
        ))}
      </fieldset>
    </div>
  )
}
