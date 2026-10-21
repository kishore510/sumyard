// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@/test/dom'
import { PageLoadingState } from './states'

/*
 * 1b-ii-a, the layout-shift fix: while a calculator page loads, its place
 * holds at least the screen's height, so the footer starts below the fold
 * and is not pushed down when the page arrives (Lighthouse CLS).
 */

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

describe('PageLoadingState', () => {
  it('is a loading status that reserves the screen’s height', () => {
    view = mount(<PageLoadingState />)
    const holder = view.host.firstElementChild!
    expect(holder.getAttribute('data-page-loading')).not.toBeNull()
    expect(holder.className).toMatch(/\bmin-h-svh\b/)
    expect(holder.querySelector('[role="status"]')!.textContent).toMatch(/Loading/)
  })
})
