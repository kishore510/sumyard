// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MainMenu } from './MainMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<MainMenu />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('MainMenu', () => {
  it('footnote says changes are saved here, and to export a copy (export exists now)', () => {
    act(() => host.querySelector('button')!.click())
    const footnote = host.querySelector('[role="menu"]')!.parentElement!.querySelector('p')!
    expect(footnote.textContent).toBe('Changes are saved in this browser. Export to keep a copy.')
  })

  it('Scenarios is enabled and opens the Scenarios sheet', () => {
    history.replaceState(null, '', '/')
    act(() => host.querySelector('button')!.click())
    const item = [...host.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes('Scenarios'))!
    expect(item.getAttribute('aria-disabled')).toBeNull()
    expect(item.textContent).not.toMatch(/Coming soon/)
    act(() => (item as HTMLElement).click())
    expect(location.hash).toBe('#/scenarios')
  })

  it('All calculators comes first and goes to the home page', () => {
    history.replaceState(null, '', '/#/c/mortgage')
    act(() => host.querySelector('button')!.click())
    const items = [...host.querySelectorAll('[role="menuitem"]')]
    expect(items[0]!.textContent).toContain('All calculators')
    act(() => (items[0] as HTMLElement).click())
    expect(location.hash).toBe('#/')
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })
})
