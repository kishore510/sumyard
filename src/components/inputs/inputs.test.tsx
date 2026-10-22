// @vitest-environment happy-dom
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromPence, type Money, ratio } from '@/lib/money'
import { click, mount, type } from '@/test/dom'
import { CurrencyInput } from './CurrencyInput'
import { DecimalInput } from './DecimalInput'
import { NumberInput } from './NumberInput'
import { PercentInput } from './PercentInput'
import { Segmented } from './Segmented'
import { Select } from './Select'
import { TextInput } from './TextInput'
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

describe('TextInput', () => {
  it('passes tidy text and refuses more than maxLength characters with a tied error', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    view = mount(<TextInput id="t" label="Name" value="" maxLength={5} onChange={onChange} onValidityChange={onValidityChange} />)
    expect(input().getAttribute('inputmode')).toBe('text')
    expect(view.host.querySelector('label[for="t"]')!.textContent).toBe('Name')
    type(input(), '  a\u0007  b ')
    expect(onChange).toHaveBeenLastCalledWith('a b')
    type(input(), 'abcdef')
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    expect(view.host.querySelector('#t-error')!.textContent).toBe('Use at most 5 characters.')
    expect(input().getAttribute('aria-describedby')).toBe('t-error')
    type(input(), '😀😀😀😀😀')
    expect(onChange).toHaveBeenLastCalledWith('😀😀😀😀😀')
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

describe('an empty box read as a value (emptyValue, slice 3c-2)', () => {
  it('CurrencyInput: an empty box is the empty value (shown empty, with a placeholder), and the empty value shows empty', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState<Money>(fromPence(1_250))
      return (
        <CurrencyInput
          id="a"
          label="A"
          emptyValue={fromPence(0)}
          placeholder="0"
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
          onValidityChange={onValidityChange}
        />
      )
    }
    view = mount(<Harness />)
    expect(input().getAttribute('placeholder')).toBe('0')
    type(input(), '')
    expect(onChange).toHaveBeenLastCalledWith(fromPence(0))
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
    act(() => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(input().value).toBe('')
    view.unmount()
    view = mount(<CurrencyInput id="a" label="A" emptyValue={fromPence(0)} value={fromPence(0)} onChange={onChange} />)
    expect(input().value).toBe('')
    type(input(), '3')
    expect(onChange).toHaveBeenLastCalledWith(fromPence(300))
  })

  it('NumberInput takes emptyValue too', () => {
    const onNumber = vi.fn()
    view = mount(<NumberInput id="n" label="N" emptyValue={0} placeholder="0" value={5} min={0} onChange={onNumber} />)
    type(input(), '')
    expect(onNumber).toHaveBeenLastCalledWith(0)
  })
})

describe('inputs that may be left empty (allowEmpty, slice 3c-1)', () => {
  it('CurrencyInput: an empty box is a valid null, shown empty, and a typed amount still parses', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    view = mount(
      <CurrencyInput id="a" label="A" allowEmpty value={null} min={fromPence(0)} onChange={onChange} onValidityChange={onValidityChange} />,
    )
    expect(input().value).toBe('')
    type(input(), '12.50')
    expect(onChange).toHaveBeenLastCalledWith(fromPence(1_250))
    view.unmount()
    view = mount(
      <CurrencyInput id="a" label="A" allowEmpty value={fromPence(1_250)} onChange={onChange} onValidityChange={onValidityChange} />,
    )
    type(input(), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
    expect(view.host.textContent).not.toContain('Enter an amount.')
  })

  it('without allowEmpty an empty box is still an error', () => {
    const onValidityChange = vi.fn()
    view = mount(<CurrencyInput id="a" label="A" value={fromPence(100)} onChange={() => {}} onValidityChange={onValidityChange} />)
    type(input(), '')
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    expect(view.host.textContent).toContain('Enter an amount.')
  })

  it('PercentInput and NumberInput take allowEmpty too', () => {
    const onPercent = vi.fn()
    view = mount(<PercentInput id="p" label="P" allowEmpty value={'1'} onChange={onPercent} />)
    type(input(), '4.5')
    expect(onPercent).toHaveBeenLastCalledWith('4.5')
    type(input(), ' ')
    expect(onPercent).toHaveBeenLastCalledWith(null)
    view.unmount()
    const onNumber = vi.fn()
    view = mount(<NumberInput id="n" label="N" allowEmpty value={5} min={1} onChange={onNumber} />)
    type(input(), '12')
    expect(onNumber).toHaveBeenLastCalledWith(12)
    type(input(), '')
    expect(onNumber).toHaveBeenLastCalledWith(null)
  })

  it('follows a value set to null from outside (a scenario loaded)', () => {
    function Harness() {
      const [value, setValue] = useState<Money | null>(fromPence(500))
      return (
        <>
          <CurrencyInput id="a" label="A" allowEmpty value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue(null)}>
            clear
          </button>
        </>
      )
    }
    view = mount(<Harness />)
    expect(input().value).toBe('5')
    click(view.host.querySelector('button'))
    expect(input().value).toBe('')
  })
})

describe('DecimalInput (slice 3c-1)', () => {
  it('holds canonical decimal text, with its unit beside the box and the decimal keypad', () => {
    const onChange = vi.fn()
    view = mount(<DecimalInput id="d" label="Miles per gallon" suffix="mpg" value="45.5" max={ratio(1_000, 1)} onChange={onChange} />)
    expect(input().value).toBe('45.5')
    expect(input().inputMode).toBe('decimal')
    expect(view.host.textContent).toContain('mpg')
    type(input(), '052.10')
    expect(onChange).toHaveBeenLastCalledWith('52.1')
    type(input(), '1000.01')
    expect(view.host.textContent).toContain('Enter no more than 1,000.')
  })

  it('refuses nothing when the minimum is exclusive, and can be left empty', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    view = mount(
      <DecimalInput
        id="d"
        label="Miles per kWh"
        allowEmpty
        value="1"
        min={ratio(0, 1)}
        minExclusive
        onChange={onChange}
        onValidityChange={onValidityChange}
      />,
    )
    type(input(), '0')
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    expect(view.host.textContent).toContain('Enter more than 0.')
    type(input(), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
  })
})
