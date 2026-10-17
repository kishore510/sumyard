/*
 * Hash routes for the sheet stack: #/help, #/help/<topic>, #/whats-new,
 * #/about and #/settings. Any other hash shows no sheet.
 *
 * Every sheet a person opens is a history entry, so the browser Back button
 * steps back through them. Parents are fixed (topics, What's new and About
 * sit under Help), so a deep link has the same back arrow as a page reached
 * by tapping. The back arrow goes to the parent: through history when the
 * parent is the previous entry, otherwise by replacing the current entry.
 * Close removes every sheet entry Sumyard added, landing on the page.
 */

export type SheetRoute = { kind: 'help' } | { kind: 'topic'; id: string } | { kind: 'whats-new' } | { kind: 'about' } | { kind: 'settings' }

const TOPIC_ID = /^[a-z0-9-]+$/

export function parseHash(hash: string): SheetRoute | null {
  const match = /^#\/([a-z-]+)(?:\/([^/]*))?\/?$/.exec(hash)
  if (!match) return null
  const [, name, rest] = match
  if (name === 'help') {
    if (!rest) return { kind: 'help' }
    return TOPIC_ID.test(rest) ? { kind: 'topic', id: rest } : null
  }
  if (rest) return null
  if (name === 'whats-new' || name === 'about' || name === 'settings') return { kind: name }
  return null
}

export function formatHash(route: SheetRoute): string {
  return route.kind === 'topic' ? `#/help/${route.id}` : `#/${route.kind}`
}

export function parentOf(route: SheetRoute): SheetRoute | null {
  return route.kind === 'topic' || route.kind === 'whats-new' || route.kind === 'about' ? { kind: 'help' } : null
}

export interface HistoryLike {
  readonly state: unknown
  pushState(data: unknown, unused: string, url?: string | URL | null): void
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
  back(): void
  go(delta: number): void
}

export interface WindowLike {
  history: HistoryLike
  location: { readonly hash: string; readonly pathname: string; readonly search: string }
}

/** What Sumyard keeps in history.state for a sheet entry. */
interface SheetEntry {
  /** How many sheet entries Sumyard has pushed, up to and including this one. */
  depth: number
  /** The hash of the entry before this one. */
  from: string
}

function entryOf(state: unknown): SheetEntry | null {
  const entry = (state as { sumyardSheet?: unknown } | null)?.sumyardSheet as Partial<SheetEntry> | undefined
  return entry && typeof entry.depth === 'number' && typeof entry.from === 'string' ? (entry as SheetEntry) : null
}

export function createSheetNavigator(win: WindowLike, notify: () => void) {
  /** Set while close() waits for history.go to land on the page. */
  let closing = false

  const current = () => parseHash(win.location.hash)
  const pageUrl = () => `${win.location.pathname}${win.location.search}`
  const clearHash = () => win.history.replaceState(null, '', pageUrl())

  function close() {
    const depth = entryOf(win.history.state)?.depth ?? 0
    if (depth > 0) {
      closing = true
      win.history.go(-depth)
      return
    }
    clearHash()
    notify()
  }

  function back() {
    const route = current()
    const parent = route && parentOf(route)
    if (!parent) return close()
    const entry = entryOf(win.history.state)
    if (entry && entry.depth > 1 && entry.from === formatHash(parent)) return win.history.back()
    win.history.replaceState(win.history.state, '', formatHash(parent))
    notify()
  }

  return {
    current,
    open(route: SheetRoute) {
      const hash = formatHash(route)
      if (win.location.hash === hash) return
      const depth = current() ? (entryOf(win.history.state)?.depth ?? 0) : 0
      win.history.pushState({ sumyardSheet: { depth: depth + 1, from: win.location.hash } satisfies SheetEntry }, '', hash)
      notify()
    },
    back,
    close,
    /** Escape: step back to the parent, or close at the top. */
    escape: () => back(),
    /** Call on popstate and hashchange. */
    handlePopState() {
      if (closing) {
        closing = false
        // Landed on a deep-linked sheet that Sumyard didn't push: clear it too.
        if (current()) clearHash()
      }
      notify()
    },
  }
}

export type SheetNavigator = ReturnType<typeof createSheetNavigator>
