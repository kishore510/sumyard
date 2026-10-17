import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastStore } from './toastStore'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const make = () => createToastStore({ duration: () => 5000 })

describe('toast store', () => {
  it('shows one toast and announces it', () => {
    const toasts = make()
    toasts.show({ message: 'Saved.' })
    expect(toasts.get().toast?.message).toBe('Saved.')
    expect(toasts.get().announcement.text).toBe('Saved.')
  })

  it('dismisses itself after the duration', () => {
    const toasts = make()
    toasts.show({ message: 'Saved.' })
    vi.advanceTimersByTime(4999)
    expect(toasts.get().toast).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(toasts.get().toast).toBeNull()
  })

  it('Undo runs the action once, dismisses the toast and confirms', () => {
    const toasts = make()
    const run = vi.fn()
    toasts.show({ message: 'Settings reset.', undo: { run, done: 'Settings restored.' } })
    toasts.undo()
    toasts.undo()
    expect(run).toHaveBeenCalledOnce()
    expect(toasts.get().toast?.message).toBe('Settings restored.')
    expect(toasts.get().toast?.undo).toBeUndefined()
    expect(toasts.get().announcement.text).toBe('Settings restored.')
  })

  it('says when Undo is available, for screen readers', () => {
    const toasts = make()
    toasts.show({ message: 'Settings reset.', undo: { run: () => {} } })
    expect(toasts.get().announcement.text).toMatch(/^Settings reset\. .*Undo/)
  })

  it('cannot undo after the toast has gone', () => {
    const toasts = make()
    const run = vi.fn()
    toasts.show({ message: 'Reset.', undo: { run } })
    vi.advanceTimersByTime(5000)
    toasts.undo()
    expect(run).not.toHaveBeenCalled()
  })

  it('a new toast replaces the old one and restarts the timer', () => {
    const toasts = make()
    toasts.show({ message: 'First.' })
    vi.advanceTimersByTime(4000)
    toasts.show({ message: 'Second.' })
    vi.advanceTimersByTime(4000)
    expect(toasts.get().toast?.message).toBe('Second.')
    vi.advanceTimersByTime(1000)
    expect(toasts.get().toast).toBeNull()
  })

  it('repeating the same message still re-announces it', () => {
    const toasts = make()
    toasts.show({ message: 'Saved.' })
    const first = toasts.get().announcement.id
    toasts.show({ message: 'Saved.' })
    expect(toasts.get().announcement.id).not.toBe(first)
  })

  it('pauses while focused or hovered, and restarts the full time on resume', () => {
    const toasts = make()
    toasts.show({ message: 'Reset.', undo: { run: () => {} } })
    vi.advanceTimersByTime(4000)
    toasts.pause()
    vi.advanceTimersByTime(60_000)
    expect(toasts.get().toast).not.toBeNull()
    toasts.resume()
    vi.advanceTimersByTime(4999)
    expect(toasts.get().toast).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(toasts.get().toast).toBeNull()
  })

  it('dismiss closes it at once; a stale id does nothing', () => {
    const toasts = make()
    const first = toasts.show({ message: 'First.' })
    toasts.show({ message: 'Second.' })
    toasts.dismiss(first)
    expect(toasts.get().toast?.message).toBe('Second.')
    toasts.dismiss()
    expect(toasts.get().toast).toBeNull()
  })

  it('tells subscribers about every change', () => {
    const toasts = make()
    const listener = vi.fn()
    const unsubscribe = toasts.subscribe(listener)
    toasts.show({ message: 'x' })
    vi.advanceTimersByTime(5000)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    toasts.show({ message: 'y' })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
