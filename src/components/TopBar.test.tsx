// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@/test/dom'
import { TopBar } from './TopBar'

let view: ReturnType<typeof mount>
beforeEach(() => {
  view = mount(<TopBar />)
})
afterEach(() => view.unmount())

describe('TopBar', () => {
  it('the wordmark links to the home page, with every calculator, by a name that starts with what it shows', () => {
    const link = view.host.querySelector('header a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#/')
    expect(link.textContent).toBe('Sumyard')
    expect(link.getAttribute('aria-label')).toBe('Sumyard: all calculators')
    expect(link.className).toMatch(/min-h-touch/)
  })
})
