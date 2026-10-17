// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetThemeForTests } from '@/hooks/useTheme'
import { THEME_KEY } from '@/lib/theme'
import { ThemeToggle } from './ThemeToggle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

function render() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<ThemeToggle />))
  return host.querySelector('button')!
}

beforeEach(() => {
  localStorage.clear()
  resetThemeForTests()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ThemeToggle', () => {
  it('starts on System and cycles System -> Light -> Dark -> System, saving each choice', () => {
    const button = render()
    expect(button.getAttribute('aria-label')).toBe('System theme (tap to change)')

    act(() => button.click())
    expect(button.getAttribute('aria-label')).toBe('Light theme (tap to change)')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ schemaVersion: 1, theme: 'light' })

    act(() => button.click())
    expect(button.getAttribute('aria-label')).toBe('Dark theme (tap to change)')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ schemaVersion: 1, theme: 'dark' })

    act(() => button.click())
    expect(button.getAttribute('aria-label')).toBe('System theme (tap to change)')
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toEqual({ schemaVersion: 1, theme: 'system' })
  })

  it('restores the saved choice on the next visit', () => {
    localStorage.setItem(THEME_KEY, JSON.stringify({ schemaVersion: 1, theme: 'dark' }))
    const button = render()
    expect(button.getAttribute('aria-label')).toBe('Dark theme (tap to change)')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('is a 44 px touch target with an icon', () => {
    const button = render()
    expect(button.className).toContain('size-touch')
    expect(button.querySelector('svg')).not.toBeNull()
  })
})
