// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { VERSION_INFO } from '@/version'
import { AboutPage } from './AboutPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLElement

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = () => act(() => root.render(<AboutPage />))
const section = (name: string) => host.querySelector(`section[aria-label="${name}"]`)

describe('About', () => {
  it('lists every storage key under Privacy (guard: keys shown in About > Privacy)', () => {
    render()
    const privacy = section('Privacy')
    expect(privacy).not.toBeNull()
    for (const { key, what } of Object.values(STORAGE_KEYS)) {
      expect(privacy!.textContent).toContain(key)
      expect(privacy!.textContent).toContain(what)
    }
  })

  it('states no analytics, no tracking, no network requests, and the disclaimer', () => {
    render()
    expect(section('Privacy')!.textContent).toMatch(/No analytics, no tracking and no network requests/)
    expect(host.textContent).toMatch(/not financial advice/)
  })

  it('shows version and build, and storage used from sumyard: keys only', () => {
    localStorage.setItem('sumyard:v1:settings', 'x'.repeat(100))
    localStorage.setItem('someone-else', 'y'.repeat(10_000))
    render()
    expect(host.textContent).toContain(VERSION_INFO.version)
    expect(host.textContent).toContain(VERSION_INFO.commit)
    const used = host.querySelector('[data-storage-used]')!.textContent!
    expect(used).toMatch(/bytes/)
    expect(used).not.toMatch(/KB/)
  })

  it('lists credits as name, version and licence, with no links', () => {
    render()
    const credits = section('Credits')!
    expect(credits.querySelector('a')).toBeNull()
    expect(credits.textContent).not.toMatch(/:\/\//)
  })
})
