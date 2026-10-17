import { describe, expect, it } from 'vitest'
import { formatPage, type PageRoute, parsePage } from './route'

describe('parsePage', () => {
  it.each<[string, PageRoute]>([
    ['', { kind: 'home' }],
    ['#', { kind: 'home' }],
    ['#/', { kind: 'home' }],
    ['#main', { kind: 'home' }],
    ['#/c/hello', { kind: 'calculator', id: 'hello' }],
    ['#/c/hello/', { kind: 'calculator', id: 'hello' }],
    ['#/c/hello/compare', { kind: 'compare', id: 'hello' }],
    ['#/c/take-home-pay', { kind: 'calculator', id: 'take-home-pay' }],
    ['#/c/', { kind: 'not-found' }],
    ['#/c/Hello', { kind: 'not-found' }],
    ['#/c/hello/edit', { kind: 'not-found' }],
    ['#/c/__proto__', { kind: 'not-found' }],
  ])('%j is %o', (hash, route) => {
    expect(parsePage(hash)).toEqual(route)
  })

  it('treats sheet hashes as no page of their own (the sheet keeps the page it opened over)', () => {
    for (const hash of ['#/help', '#/settings', '#/help/quick-start', '#/scenarios']) expect(parsePage(hash), hash).toBeNull()
  })

  it.each<PageRoute>([{ kind: 'home' }, { kind: 'calculator', id: 'hello' }, { kind: 'compare', id: 'hello' }])(
    'round-trips %o',
    (route) => {
      expect(parsePage(formatPage(route))).toEqual(route)
    },
  )
})
