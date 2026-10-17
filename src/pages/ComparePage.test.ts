import { describe, expect, it } from 'vitest'
import { fromPence, ratio } from '@/lib/money'
import { formatDelta, formatRowValue } from './ComparePage'

/* Made-up values. */

describe('compare deltas', () => {
  const money = (pence: number) => ({ kind: 'money' as const, amount: fromPence(pence) })
  it('money: signed difference from the baseline, in the Settings style', () => {
    expect(formatDelta(money(150_000), money(100_000), 'pounds')).toBe('+£500')
    expect(formatDelta(money(99_950), money(100_000), 'pence')).toBe('-£0.50')
    expect(formatDelta(money(100_000), money(100_000), 'pounds')).toBe('£0')
  })

  it('rates: percentage points', () => {
    expect(formatDelta({ kind: 'ratio', ratio: ratio(5, 100) }, { kind: 'ratio', ratio: ratio(3, 100) }, 'pounds')).toBe(
      '+2 percentage points',
    )
  })

  it('counts and text', () => {
    expect(formatDelta({ kind: 'count', count: 4 }, { kind: 'count', count: 10 }, 'pounds')).toBe('-6')
    expect(formatDelta({ kind: 'text', text: 'Up' }, { kind: 'text', text: 'Up' }, 'pounds')).toBe('Same')
    expect(formatDelta({ kind: 'text', text: 'Up' }, money(1), 'pounds')).toBeNull()
  })

  it('formats values', () => {
    expect(formatRowValue(money(123_456), 'pence')).toBe('£1,234.56')
    expect(formatRowValue({ kind: 'ratio', ratio: ratio(75, 1000) }, 'pence')).toBe('7.5%')
  })
})
