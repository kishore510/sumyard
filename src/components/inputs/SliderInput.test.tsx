// @vitest-environment happy-dom
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromPence, fromPounds, type Money } from '@/lib/money'
import { mount, type } from '@/test/dom'
import { amountInWords, SLIDER_MIN_MAX, SLIDER_MIN_STEP, SliderInput, sliderScale } from './SliderInput'

/* SliderInput: a native range paired with a CurrencyInput, the number field the source of truth. Amounts are made up. */

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const box = () => view!.host.querySelector<HTMLInputElement>('input[type="text"]')!
const range = () => view!.host.querySelector<HTMLInputElement>('input[type="range"]')!

/** Moves a range as a person would (sets the value, fires input). */
function slide(input: HTMLInputElement, pence: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, String(pence))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const CAP = fromPounds(10_000_000)

function Harness({ start, onChange }: { start: Money; onChange?: (v: Money) => void }) {
  const [value, setValue] = useState(start)
  return (
    <SliderInput
      id="groceries"
      label="Groceries"
      unit="per month"
      value={value}
      max={CAP}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('sliderScale', () => {
  it('runs to twice the value, in about a hundred round steps', () => {
    expect(sliderScale(fromPounds(250), CAP)).toEqual({ max: fromPounds(500), step: fromPounds(5) })
    expect(sliderScale(fromPounds(1_234), CAP)).toEqual({ max: fromPounds(2_500), step: fromPounds(50) })
  })

  it('has a least range for nothing or a small value, and a least step', () => {
    expect(sliderScale(fromPence(0), CAP)).toEqual({ max: SLIDER_MIN_MAX, step: SLIDER_MIN_STEP })
    expect(sliderScale(fromPounds(3), CAP).max).toBe(SLIDER_MIN_MAX)
  })

  it('never runs past the input’s own limit', () => {
    expect(sliderScale(fromPounds(9_000_000), CAP).max).toBe(CAP)
  })

  it('the max is a whole number of steps', () => {
    for (const pounds of [1, 7, 99, 101, 333, 4_321, 98_765]) {
      const { max, step } = sliderScale(fromPounds(pounds), CAP)
      expect(max % step).toBe(0)
      expect(max).toBeGreaterThanOrEqual(fromPounds(pounds))
    }
  })
})

describe('amountInWords', () => {
  it.each([
    [fromPounds(250), '250 pounds per month'],
    [fromPounds(1), '1 pound per month'],
    [fromPounds('1234.5'), '1,234 pounds 50 pence per month'],
    [fromPence(1), '0 pounds 1 penny per month'],
    [fromPence(0), '0 pounds per month'],
  ])('%s', (amount, words) => {
    expect(amountInWords(amount, 'per month')).toBe(words)
  })
})

describe('SliderInput', () => {
  it('pairs a labelled number box with a native range that says its value in words', () => {
    view = mount(<Harness start={fromPounds(250)} />)
    expect(box().value).toBe('250')
    expect(view.host.querySelector('label')!.htmlFor).toBe(box().id)
    expect(range().getAttribute('aria-label')).toBe('Groceries, slider')
    expect(range().getAttribute('aria-valuetext')).toBe('250 pounds per month')
    expect(range().min).toBe('0')
    expect(range().max).toBe(String(fromPounds(500)))
    expect(range().step).toBe(String(fromPounds(5)))
    expect(range().value).toBe(String(fromPounds(250)))
  })

  it('has a 44 px target and no animation', () => {
    view = mount(<Harness start={fromPounds(250)} />)
    expect(range().className).toMatch(/min-h-touch/)
    expect(range().className).not.toMatch(/transition|animate/)
  })

  it('moving the slider sets the amount, shown in the box, and keeps its scale', () => {
    const onChange = vi.fn()
    view = mount(<Harness start={fromPounds(250)} onChange={onChange} />)
    slide(range(), fromPounds(480))
    expect(onChange).toHaveBeenLastCalledWith(fromPounds(480))
    expect(box().value).toBe('480')
    expect(range().getAttribute('aria-valuetext')).toBe('480 pounds per month')
    expect(range().max).toBe(String(fromPounds(500)))
  })

  it('typing in the box is the source of truth: it sets the amount and rescales the slider', () => {
    const onChange = vi.fn()
    view = mount(<Harness start={fromPounds(250)} onChange={onChange} />)
    type(box(), '2,000')
    expect(onChange).toHaveBeenLastCalledWith(fromPounds(2_000))
    expect(range().max).toBe(String(fromPounds(4_000)))
    expect(range().value).toBe(String(fromPounds(2_000)))
  })

  it('an amount past the slider’s end shows at its end while the box keeps it', () => {
    view = mount(
      <SliderInput id="x" label="X" unit="per month" value={fromPounds(900)} max={CAP} scaleFrom={fromPounds(100)} onChange={() => {}} />,
    )
    expect(range().max).toBe(String(fromPounds(200)))
    expect(range().value).toBe(String(fromPounds(200)))
    expect(box().value).toBe('900')
    expect(range().getAttribute('aria-valuetext')).toBe('900 pounds per month')
  })

  it('an invalid box is not passed on and the slider keeps the last valid amount', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    view = mount(
      <SliderInput
        id="x"
        label="X"
        unit="a year"
        value={fromPounds(10)}
        max={CAP}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    )
    type(box(), '-5')
    expect(onChange).not.toHaveBeenCalled()
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    expect(range().value).toBe(String(fromPounds(10)))
  })
})
