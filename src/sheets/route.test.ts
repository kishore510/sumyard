import { describe, expect, it } from 'vitest'
import { createSheetNavigator, formatHash, parentOf, parseHash, type SheetRoute, type WindowLike } from './route'

describe('parseHash', () => {
  it.each<[string, SheetRoute]>([
    ['#/help', { kind: 'help' }],
    ['#/help/', { kind: 'help' }],
    ['#/help/quick-start', { kind: 'topic', id: 'quick-start' }],
    ['#/help/quick-start/', { kind: 'topic', id: 'quick-start' }],
    ['#/whats-new', { kind: 'whats-new' }],
    ['#/about', { kind: 'about' }],
    ['#/settings', { kind: 'settings' }],
    ['#/tax-data', { kind: 'tax-data' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route)
  })

  it.each([
    '',
    '#',
    '#/',
    '#main',
    '#/nope',
    '#/help/Quick Start',
    '#/help/a/b',
    '#/about/x',
    '#/settings/x',
    '#/tax-data/x',
    '#/taxdata',
    '#//help',
    'help',
  ])('no sheet for %j', (hash) => {
    expect(parseHash(hash)).toBeNull()
  })
})

describe('formatHash and parentOf', () => {
  const routes: SheetRoute[] = [
    { kind: 'help' },
    { kind: 'topic', id: 'troubleshooting' },
    { kind: 'whats-new' },
    { kind: 'about' },
    { kind: 'settings' },
    { kind: 'tax-data' },
  ]

  it.each(routes)('round-trips %o', (route) => {
    expect(parseHash(formatHash(route))).toEqual(route)
  })

  it('puts topics, What’s new and About under Help; Help and Settings have no parent', () => {
    expect(parentOf({ kind: 'topic', id: 'x' })).toEqual({ kind: 'help' })
    expect(parentOf({ kind: 'whats-new' })).toEqual({ kind: 'help' })
    expect(parentOf({ kind: 'about' })).toEqual({ kind: 'help' })
    expect(parentOf({ kind: 'help' })).toBeNull()
    expect(parentOf({ kind: 'settings' })).toBeNull()
  })

  it('puts Tax data under About (About links to it; so will each calculator’s verified badge)', () => {
    expect(parentOf({ kind: 'tax-data' })).toEqual({ kind: 'about' })
  })
})

/** A browser history with entries, where back/go fire popstate synchronously. */
function fakeWindow(initialHash = '') {
  const entries: { state: unknown; hash: string }[] = [{ state: null, hash: initialHash }]
  let index = 0
  let onPop: () => void = () => {}
  const hashOf = (url: string) => (url.includes('#') ? `#${url.split('#')[1]}` : '')
  const win: WindowLike = {
    location: {
      get hash() {
        return entries[index]!.hash
      },
      pathname: '/sumyard/',
      search: '',
    },
    history: {
      get state() {
        return entries[index]!.state
      },
      pushState(state, _unused, url) {
        entries.splice(index + 1)
        entries.push({ state, hash: hashOf(String(url)) })
        index++
      },
      replaceState(state, _unused, url) {
        entries[index] = { state, hash: hashOf(String(url)) }
      },
      back() {
        this.go(-1)
      },
      go(delta) {
        index = Math.max(0, Math.min(entries.length - 1, index + delta))
        onPop()
      },
    },
  }
  let notified = 0
  const nav = createSheetNavigator(win, () => notified++)
  onPop = () => nav.handlePopState()
  return { win, nav, entries: () => entries.map((e) => e.hash), at: () => index, notified: () => notified }
}

describe('createSheetNavigator', () => {
  it('opens a sheet as a new history entry, so the browser Back button closes it', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'settings' })
    expect(t.nav.current()).toEqual({ kind: 'settings' })
    expect(t.entries()).toEqual(['', '#/settings'])
    expect(t.notified()).toBeGreaterThan(0)
    t.win.history.back()
    expect(t.nav.current()).toBeNull()
  })

  it('Help > What’s new > back arrow returns to Help through history', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'whats-new' })
    expect(t.entries()).toEqual(['', '#/help', '#/whats-new'])
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'help' })
    expect(t.at()).toBe(1)
  })

  it('Help > About > Tax data: the back arrow steps to About, then Help, through history', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'about' })
    t.nav.open({ kind: 'tax-data' })
    expect(t.entries()).toEqual(['', '#/help', '#/about', '#/tax-data'])
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'about' })
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'help' })
    expect(t.at()).toBe(1)
  })

  it('Tax data deep link: back arrow goes to About, and close lands on the page', () => {
    const t = fakeWindow('#/tax-data')
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'about' })
    t.nav.close()
    expect(t.nav.current()).toBeNull()
  })

  it('opening the sheet that is already showing does nothing', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'help' })
    expect(t.entries()).toEqual(['', '#/help'])
  })

  it('back arrow on a page opened without its parent replaces it with the parent', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'about' })
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'help' })
    expect(t.entries()).toEqual(['', '#/help'])
  })

  it('back arrow after a topic-to-topic link goes to Help, not the previous topic', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'topic', id: 'a' })
    t.nav.open({ kind: 'topic', id: 'b' })
    t.nav.back()
    expect(t.nav.current()).toEqual({ kind: 'help' })
  })

  it('back on a page with no parent closes the sheet', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'settings' })
    t.nav.back()
    expect(t.nav.current()).toBeNull()
    expect(t.at()).toBe(0)
  })

  it('close removes every sheet entry it added', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'topic', id: 'quick-start' })
    t.nav.open({ kind: 'about' })
    t.nav.close()
    expect(t.nav.current()).toBeNull()
    expect(t.at()).toBe(0)
  })

  it('a deep link opens directly, and close clears the hash without leaving the page', () => {
    const t = fakeWindow('#/help/troubleshooting')
    expect(t.nav.current()).toEqual({ kind: 'topic', id: 'troubleshooting' })
    t.nav.close()
    expect(t.nav.current()).toBeNull()
    expect(t.entries()).toEqual([''])
  })

  it('close after moving on from a deep link lands on the page, not the deep-linked sheet', () => {
    const t = fakeWindow('#/help')
    t.nav.open({ kind: 'whats-new' })
    t.nav.close()
    expect(t.nav.current()).toBeNull()
  })

  it('Escape steps back to the parent, or closes at the top', () => {
    const t = fakeWindow()
    t.nav.open({ kind: 'help' })
    t.nav.open({ kind: 'topic', id: 'quick-start' })
    t.nav.escape()
    expect(t.nav.current()).toEqual({ kind: 'help' })
    t.nav.escape()
    expect(t.nav.current()).toBeNull()
  })

  it('an unknown hash shows no sheet', () => {
    expect(fakeWindow('#/nope').nav.current()).toBeNull()
  })
})
