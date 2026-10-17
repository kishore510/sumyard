/*
 * Hash routes for the sheet stack: #/help, #/help/<topic>, #/whats-new,
 * #/about, #/settings, #/tax-data, #/scenarios, #/import and #/restore. Any
 * other hash shows no sheet (it is a page: see src/pages/route.ts).
 *
 * Every sheet a person opens is a history entry, so the browser Back button
 * steps back through them. Parents are fixed (topics, What's new and About
 * sit under Help; Tax data sits under About), so a deep link has the same back arrow as a page reached
 * by tapping. The back arrow goes to the parent: through history when the
 * parent is the previous entry, otherwise by replacing the current entry.
 * Close removes every sheet entry Sumyard added, landing on the page.
 *
 * The page under a sheet: each sheet entry remembers the hash of the page it
 * was opened over (a calculator, or home), carried through the stack, so
 * the page stays put behind the sheet and Close, Esc and Back land on it.
 * A deep-linked sheet has no page underneath, so it closes to home.
 */

export type SheetRoute =
  | { kind: 'help' }
  | { kind: 'topic'; id: string }
  | { kind: 'whats-new' }
  | { kind: 'about' }
  | { kind: 'settings' }
  | { kind: 'tax-data' }
  | { kind: 'scenarios' }
  | { kind: 'import' }
  | { kind: 'restore' }

const TOPIC_ID = /^[a-z0-9-]+$/
const PLAIN_SHEETS = new Set(['whats-new', 'about', 'settings', 'tax-data', 'scenarios', 'import', 'restore'])

export function parseHash(hash: string): SheetRoute | null {
  const match = /^#\/([a-z-]+)(?:\/([^/]*))?\/?$/.exec(hash)
  if (!match) return null
  const [, name, rest] = match
  if (name === 'help') {
    if (!rest) return { kind: 'help' }
    return TOPIC_ID.test(rest) ? { kind: 'topic', id: rest } : null
  }
  if (rest) return null
  return PLAIN_SHEETS.has(name!) ? ({ kind: name } as SheetRoute) : null
}

export function formatHash(route: SheetRoute): string {
  return route.kind === 'topic' ? `#/help/${route.id}` : `#/${route.kind}`
}

export function parentOf(route: SheetRoute): SheetRoute | null {
  if (route.kind === 'tax-data') return { kind: 'about' }
  if (route.kind === 'import') return { kind: 'scenarios' }
  if (route.kind === 'restore') return { kind: 'settings' }
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
  /** The hash of the page under the sheet stack ('' for home). */
  page: string
}

function entryOf(state: unknown): SheetEntry | null {
  const entry = (state as { sumyardSheet?: unknown } | null)?.sumyardSheet as Partial<SheetEntry> | undefined
  if (!entry || typeof entry.depth !== 'number' || typeof entry.from !== 'string') return null
  return { depth: entry.depth, from: entry.from, page: typeof entry.page === 'string' ? entry.page : '' }
}

export function createSheetNavigator(win: WindowLike, notify: () => void) {
  /** Set while close() waits for history.go to land on the page. */
  let closing = false
  /** Where to go once close() lands, if not the page underneath. */
  let closingTo: string | null = null

  const current = () => parseHash(win.location.hash)
  const pageUrl = (hash = '') => `${win.location.pathname}${win.location.search}${hash}`
  /** The hash of the page showing: under the sheet if one is open, else the current hash. */
  const page = () => (current() ? (entryOf(win.history.state)?.page ?? '') : win.location.hash)

  /** Closes every sheet, landing on the page underneath, or on `to` (another page's hash) as a new entry. */
  function close(to?: string) {
    const entry = entryOf(win.history.state)
    const depth = entry?.depth ?? 0
    if (depth > 0) {
      closing = true
      closingTo = to !== undefined && to !== entry!.page ? to : null
      win.history.go(-depth)
      return
    }
    win.history.replaceState(null, '', pageUrl(to ?? entry?.page ?? ''))
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
    page,
    open(route: SheetRoute) {
      const hash = formatHash(route)
      if (win.location.hash === hash) return
      const onSheet = current() !== null
      const depth = onSheet ? (entryOf(win.history.state)?.depth ?? 0) : 0
      const entry: SheetEntry = { depth: depth + 1, from: win.location.hash, page: page() }
      win.history.pushState({ sumyardSheet: entry }, '', hash)
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
        const to = closingTo
        closingTo = null
        // Landed on a deep-linked sheet that Sumyard didn't push: clear it too.
        if (current()) win.history.replaceState(null, '', pageUrl(to ?? ''))
        else if (to !== null) win.history.pushState(null, '', to)
      }
      notify()
    },
  }
}

export type SheetNavigator = ReturnType<typeof createSheetNavigator>
