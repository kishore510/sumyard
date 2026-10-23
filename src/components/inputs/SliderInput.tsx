import { type ReactNode, useState } from 'react'
import { compare, divideRound, fromPence, fromPounds, type Money, min, mulRound, ratio, toPence, ZERO } from '@/lib/money'
import { CurrencyInput } from './CurrencyInput'

/*
 * An amount with a slider (the household budget's what-ifs): a native range
 * paired with a CurrencyInput. The number box is the source of truth: it
 * holds the amount, its validation and its label; the slider only moves it.
 * The slider runs from nothing to about twice the amount it was scaled from,
 * in round steps; typing (or a change from outside) rescales it, sliding does
 * not, so the range never moves under a finger. An amount past the slider's
 * end shows at its end while the box keeps it. Screen readers hear the amount
 * in words (aria-valuetext). No motion; the range is at least 44 px tall.
 * Constants are UI scale, not figures.
 */

/** The slider runs from nothing to this many times the amount it was scaled from. */
export const SLIDER_RANGE_FACTOR = 2

/** About this many steps across the slider. */
export const SLIDER_STEPS = 100

/** The least a slider runs to, so a blank or small amount can still be slid. */
export const SLIDER_MIN_MAX = fromPounds(100)

/** The smallest step: whole pounds. Pence are typed in the box. */
export const SLIDER_MIN_STEP = fromPounds(1)

/** Steps are one of these times a power of ten (of the least step). */
const ROUND_STEPS = [1, 2, 5]

const TEN = 10

const divideUp = (amount: Money, by: number) => Number(divideRound(BigInt(toPence(amount)), BigInt(by), 'up'))

/** The least round step at or above `pence`. */
function roundStep(pence: number): Money {
  for (let unit = toPence(SLIDER_MIN_STEP); ; unit *= TEN) {
    for (const times of ROUND_STEPS) if (unit * times >= pence) return fromPence(unit * times)
  }
}

/** The slider's end and step when scaled from `from`, never past `cap`. Exact: whole pence, no float. */
export function sliderScale(from: Money, cap: Money): { max: Money; step: Money } {
  const doubled = mulRound(from, ratio(SLIDER_RANGE_FACTOR, 1), 'up')
  const target = compare(doubled, SLIDER_MIN_MAX) > 0 ? doubled : SLIDER_MIN_MAX
  const step = roundStep(divideUp(target, SLIDER_STEPS))
  return { max: min(fromPence(divideUp(target, toPence(step)) * toPence(step)), cap), step }
}

const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0, useGrouping: true })

/** An amount (nothing or more) in words for a screen reader: "1,234 pounds 50 pence per month". */
export function amountInWords(amount: Money, unit: string): string {
  const pence = BigInt(toPence(amount))
  const hundred = BigInt(toPence(fromPounds(1)))
  const pounds = divideRound(pence, hundred, 'down')
  const rest = Number(pence - pounds * hundred)
  const words = `${GROUPED.format(pounds)} ${pounds === 1n ? 'pound' : 'pounds'}`
  return `${words}${rest === 0 ? '' : ` ${rest} ${rest === 1 ? 'penny' : 'pence'}`} ${unit}`
}

export function SliderInput({
  id,
  label,
  hint,
  value,
  onChange,
  onValidityChange,
  max: cap,
  unit,
  scaleFrom,
}: {
  /** The range's id; the number box is `${id}-amount`. */
  id: string
  label: string
  hint?: ReactNode
  value: Money
  onChange: (value: Money) => void
  onValidityChange?: (valid: boolean) => void
  /** The most the box accepts, and the furthest the slider runs. */
  max: Money
  /** How often, in words, for the spoken value ("per month"). */
  unit: string
  /** What to scale the slider from at first; the value if not given. */
  scaleFrom?: Money
}) {
  const [anchor, setAnchor] = useState(scaleFrom ?? value)
  const [seen, setSeen] = useState(value)
  const [slid, setSlid] = useState<Money | null>(null)
  // Typed, or changed from outside (a reset): rescale. Slid: keep the range where it is.
  if (value !== seen) {
    setSeen(value)
    if (value !== slid) setAnchor(value)
  }
  const { max, step } = sliderScale(anchor, cap)

  return (
    <div data-slider className="flex min-w-0 flex-col gap-1">
      <CurrencyInput
        id={`${id}-amount`}
        label={label}
        hint={hint}
        value={value}
        min={ZERO}
        max={cap}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
      <input
        id={id}
        type="range"
        aria-label={`${label}, slider`}
        min={0}
        max={toPence(max)}
        step={toPence(step)}
        value={toPence(min(value, max))}
        aria-valuetext={amountInWords(value, unit)}
        onChange={(e) => {
          const next = fromPence(Number(e.currentTarget.value))
          setSlid(next)
          onChange(next)
        }}
        className="min-h-touch w-full min-w-0 cursor-pointer accent-accent"
      />
    </div>
  )
}
