import { describe, expect, it } from 'vitest'
import { describeChart } from './summary'

const format = (v: number) => `£${v}`

describe('describeChart', () => {
  it('summarises each series: start, end, highest and lowest', () => {
    const text = describeChart({
      categories: ['Step 1', 'Step 2', 'Step 3'],
      series: [{ id: 'a', label: 'Amount', kind: 'line', values: [10, 30, 20] }],
      references: [{ label: 'Start', value: 5 }],
      format,
    })
    expect(text).toBe('Amount: £10 at Step 1 to £20 at Step 3; highest £30 at Step 2, lowest £10 at Step 1. Reference line: Start at £5.')
  })

  it('says when there is nothing to show', () => {
    expect(describeChart({ categories: [], series: [], format })).toBe('No data to show.')
    expect(describeChart({ categories: ['A'], series: [{ id: 'a', label: 'X', kind: 'bar', values: [null] }], format })).toBe(
      'X: no values.',
    )
  })

  it('describes a single point plainly', () => {
    expect(describeChart({ categories: ['Only'], series: [{ id: 'a', label: 'X', kind: 'bar', values: [7] }], format })).toBe(
      'X: £7 at Only.',
    )
  })

  it('adds numbered markers and lettered ranges after the series', () => {
    const text = describeChart({
      categories: ['A', 'B'],
      series: [{ id: 'a', label: 'X', kind: 'line', values: [1, 2] }],
      markers: [{ x: 0, label: 'Start' }],
      spans: [{ from: 0, to: 1, label: 'A step' }],
      format,
    })
    expect(text).toBe('X: £1 at A to £2 at B; highest £2 at B, lowest £1 at A. Marked 1: Start. Range A: A step.')
  })
})
