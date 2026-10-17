import { Suspense, useEffect, useRef } from 'react'
import { CALCULATORS } from '@/calculators/index'
import { CALCULATOR_PAGES } from '@/calculators/pages'
import { FirstRunBanner } from '@/components/FirstRunBanner'
import { Footer } from '@/components/Footer'
import { ErrorBoundary, ErrorState, LoadingState } from '@/components/states'
import { TopBar } from '@/components/TopBar'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { ComparePage } from '@/pages/ComparePage'
import { HomePage, NotFoundPage } from '@/pages/HomePage'
import type { PageRoute } from '@/pages/route'
import { scenarioStore } from '@/scenarios/index'
import { settingsStore } from '@/settings/settings'
import { useLocation } from '@/sheets/navigation'
import { Sheet } from '@/sheets/Sheet'
import { ToastAnnouncer, ToastView } from '@/toast/Toast'

/*
 * The app shell: top bar, first-run notice, the page (home, a calculator at
 * #/c/<id>, or its compare view), footer, sheets and toasts. A sheet opens
 * over the page, which stays put underneath (src/sheets/route.ts).
 */

/** Set when the page changed and its title should take focus once it has loaded. */
let titleFocusPending = false

function focusTitle(): boolean {
  const title = document.getElementById('main-title')
  title?.focus()
  return !!title
}

/** Rendered after a lazily loaded page, so its title can take focus when it arrives. */
function PageLoaded() {
  useEffect(() => {
    if (titleFocusPending) titleFocusPending = !focusTitle()
  }, [])
  return null
}

function Page({ route }: { route: PageRoute }) {
  if (route.kind === 'home') return <HomePage />
  if (route.kind === 'not-found' || !CALCULATORS.get(route.id)) return <NotFoundPage />
  if (route.kind === 'compare') return <ComparePage calculatorId={route.id} />
  const Calculator = CALCULATOR_PAGES[route.id]
  if (!Calculator) return <NotFoundPage />
  return (
    <ErrorBoundary
      key={route.id}
      fallback={
        <ErrorState title="This calculator couldn’t be shown">Reload Sumyard. If it keeps happening, report it from About.</ErrorState>
      }
    >
      <Suspense fallback={<LoadingState />}>
        <Calculator />
        <PageLoaded />
      </Suspense>
    </ErrorBoundary>
  )
}

export function App() {
  const { sheet, page, pageHash } = useLocation()
  const firstPage = useRef(pageHash)

  // Settings or scenarios changed in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEYS.settings.key) settingsStore.reload()
      if (e.key === null || e.key === STORAGE_KEYS.scenarios.key) scenarioStore.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // A new page: back to the top, and focus its title so screen readers announce it (not on first load).
  useEffect(() => {
    if (pageHash === firstPage.current) return
    firstPage.current = pageHash
    window.scrollTo?.({ top: 0 })
    titleFocusPending = !focusTitle()
  }, [pageHash])

  return (
    <>
      <div className="flex min-h-dvh flex-col">
        <TopBar />
        <FirstRunBanner />
        <main className="sy-safe-x mx-auto flex w-full max-w-content flex-1 flex-col py-10">
          <Page route={page} />
        </main>
        <Footer />
        <ToastView layer="app" active={sheet === null} />
      </div>
      {sheet && <Sheet route={sheet} />}
      <ToastAnnouncer />
    </>
  )
}
