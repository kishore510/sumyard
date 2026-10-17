import { useMemo, useSyncExternalStore } from 'react'
import { type PageRoute, parsePage } from '@/pages/route'
import { createSheetNavigator, parseHash, type SheetNavigator, type SheetRoute } from './route'

/*
 * The app's sheet navigator over the real window, and the hook that reads
 * the current route. Also remembers who opened the sheet, so focus can go
 * back there on close (a menu item is gone by then, so the menu passes its
 * button).
 */

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of [...listeners]) listener()
}

let navigator: SheetNavigator | undefined
export function sheets(): SheetNavigator {
  navigator ??= createSheetNavigator(window, notify)
  return navigator
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onPop = () => sheets().handlePopState()
  window.addEventListener('popstate', onPop)
  window.addEventListener('hashchange', onPop)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', onPop)
    window.removeEventListener('hashchange', onPop)
  }
}

/** The sheet the URL asks for, or null. */
export function useSheetRoute(): SheetRoute | null {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  return useMemo(() => parseHash(hash), [hash])
}

/** The sheet the URL asks for (or null) and the page showing, under the sheet if one is open. */
export function useLocation(): { sheet: SheetRoute | null; page: PageRoute; pageHash: string } {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${window.location.hash}\n${sheets().page()}`,
    () => '\n',
  )
  return useMemo(() => {
    const [hash = '', pageHash = ''] = snapshot.split('\n')
    return { sheet: parseHash(hash), page: parsePage(pageHash) ?? { kind: 'home' }, pageHash }
  }, [snapshot])
}

/** Goes to a page (a calculator, compare or home): closes any sheet first, then a new history entry. */
export function goToPage(hash: string) {
  if (sheets().current()) return sheets().close(hash)
  if (window.location.hash === hash || (hash === '' && !window.location.hash)) return
  window.history.pushState(null, '', hash || `${window.location.pathname}${window.location.search}`)
  notify()
}

let opener: HTMLElement | null = null

/** Opens a sheet. From the page (no sheet open yet), `from` or the focused element becomes the opener. */
export function openSheet(route: SheetRoute, from?: HTMLElement | null) {
  if (!sheets().current()) opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  sheets().open(route)
}

export const MENU_BUTTON_ID = 'sy-menu-button'

/** Where focus goes when the sheet closes: its opener if still there, else the menu button (e.g. after a deep link). */
export function focusTargetOnClose(): HTMLElement | null {
  const target = opener?.isConnected ? opener : document.getElementById(MENU_BUTTON_ID)
  opener = null
  return target
}
