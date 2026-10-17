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

describe('MainMenu footnote', () => {
  it('says only that changes are saved in this browser (export arrives with scenarios)', () => {
    act(() => host.querySelector('button')!.click())
    const footnote = host.querySelector('[role="menu"]')!.parentElement!.querySelector('p')!
    expect(footnote.textContent).toBe('Changes are saved in this browser.')
    expect(host.textContent).not.toMatch(/export/i)
  })
})
