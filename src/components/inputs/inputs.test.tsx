// @vitest-environment happy-dom
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromPence, ratio } from '@/lib/money'
import { click, mount, type } from '@/test/dom'
import { CurrencyInput } from './CurrencyInput'
import { NumberInput } from './NumberInput'
import { PercentInput } from './PercentInput'
import { Segmented } from './Segmented'
import { Select } from './Select'
import { Toggle } from './Toggle'

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const input = () => view!.host.querySelector('input')!

describe('CurrencyInput', () => {
  const setup = (value = 100_000) => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    view = mount(
      <CurrencyInput
        id="amount"
        label="Amount"
        hint="Any amount."
        value={fromPence(value)}
        min={fromPence(0)}
        max={fromPence(10_000_000)}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    )
    return { onChange, onValidityChange }
  }

  it('has a visible label tied to the box, the hint described, and a decimal keypad', () => {
    setup()
    const label = view!.host.querySelector('label')!
    expect(label.textContent).toBe('Amount')
    expect(label.htmlFor).toBe(input().id)
    expect(input().getAttribute('inputmode')).toBe('decimal')
    expect(input().getAttribute('aria-describedby')).toBe('amount-hint')
    expect(input().value).toBe('1,000')
  })

  it('accepts a pasted "£1,234.56" as pence', () => {
    const { onChange, onValidityChange } = setup()
    type(input(), '£1,234.56')
    expect(onChange).toHaveBeenLastCalledWith(123_456)
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
    expect(input().getAttribute('aria-invalid')).toBeNull()
  })

  it('shows an inline error for more than two decimals, tied with aria-describedby, and does not pass it on', () => {
    const { onChange, onValidityChange } = setup()
    type(input(), '12.345')
    expect(onChange).not.toHaveBeenCalled()
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    expect(input().getAttribute('aria-invalid')).toBe('true')
    expect(input().getAttribute('aria-describedby')).toBe('amount-error amount-hint')
    expect(view!.host.querySelector('#amount-error')!.textContent).toBe('Use at most two decimal places.')
  })

  it('checks min and max, and empty', () => {
    setup()
    type(input(), '-1')
    expect(view!.host.querySelector('#amount-error')!.textContent).toBe('Enter at least £0.00.')
    type(input(), '100,000.01')
    expect(view!.host.querySelector('#amount-error')!.textContent).toBe('Enter no more than £100,000.00.')
    type(input(), '')
    expect(view!.host.querySelector('#amount-error')!.textContent).toBe('Enter an amount.')
  })

  it('tidies the text on blur', () => {
    function Stateful() {
      const [value, setValue] = useState(fromPence(0))
      return <CurrencyInput id="amount" label="Amount" value={value} onChange={setValue} />
    }
    view = mount(<Stateful />)
    type(input(), '0001234.5')
    act(() => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(input().value).toBe('1,234.50')
  })

  it('follows a value set from outside (a scenario loaded)', () => {
    setup()
    type(input(), 'oops')
    view!.rerender(<CurrencyInput id="amount" label="Amount" value={fromPence(250)} onChange={() => {}} />)
    expect(input().value).toBe('2.50')
    expect(view!.host.querySelector('#amount-error')).toBeNull()
  })
})

describe('PercentInput and NumberInput', () => {
  it('PercentInput passes the canonical text and refuses out-of-range values', () => {
    const onChange = vi.fn()
    view = mount(<PercentInput id="p" label="Percentage" value="3" min={ratio(0, 1)} max={ratio(1, 1)} onChange={onChange} />)
    type(input(), '7.50%')
    expect(onChange).toHaveBeenLastCalledWith('7.5')
    type(input(), '101')
    expect(view.host.querySelector('#p-error')!.textContent).toBe('Enter no more than 100%.')
  })

  it('NumberInput takes whole numbers within limits, with a numeric keypad', () => {
    const onChange = vi.fn()
    view = mount(<NumberInput id="n" label="Steps" value={10} min={2} max={10} onChange={onChange} />)
    expect(input().getAttribute('inputmode')).toBe('numeric')
    type(input(), '4')
    expect(onChange).toHaveBeenLastCalledWith(4)
    type(input(), '2.5')
    expect(view.host.querySelector('#n-error')!.textContent).toBe('Enter a whole number.')
  })
})

describe('Select, Toggle and Segmented', () => {
  it('Select is a labelled native select', () => {
    const onChange = vi.fn()
    view = mount(
      <Select
        id="s"
        label="Rounding"
        value="up"
        options={[
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
        ]}
        onChange={onChange}
      />,
    )
    const select = view.host.querySelector('select')!
    expect(view.host.querySelector('label')!.htmlFor).toBe(select.id)
    act(() => {
      select.value = 'down'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('down')
  })

  it('Toggle is a switch named by its label', () => {
    const onChange = vi.fn()
    view = mount(<Toggle id="t" label="Show the line" hint="A hint." checked={false} onChange={onChange} />)
    const button = view.host.querySelector('[role="switch"]')!
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(button.textContent).toContain('Show the line')
    expect(button.getAttribute('aria-describedby')).toBe('t-hint')
    click(button)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('Segmented is a group of native radios with a legend', () => {
    const onChange = vi.fn()
    view = mount(
      <Segmented
        id="g"
        label="Chart style"
        value="line"
        options={[
          { value: 'line', label: 'Line' },
          { value: 'bar', label: 'Bars' },
        ]}
        onChange={onChange}
      />,
    )
    expect(view.host.querySelector('legend')!.textContent).toBe('Chart style')
    const radios = [...view.host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map((r) => r.checked)).toEqual([true, false])
    click(radios[1]!)
    expect(onChange).toHaveBeenCalledWith('bar')
  })
})
