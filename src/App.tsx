import { useEffect } from 'react'
import { FirstRunBanner } from '@/components/FirstRunBanner'
import { Footer } from '@/components/Footer'
import { TopBar } from '@/components/TopBar'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { settingsStore } from '@/settings/settings'
import { useSheetRoute } from '@/sheets/navigation'
import { Sheet } from '@/sheets/Sheet'
import { ToastAnnouncer, ToastView } from '@/toast/Toast'

/** The app shell: top bar, first-run notice, the (placeholder) home page, footer, sheets and toasts. */
export function App() {
  const route = useSheetRoute()

  // Settings changed in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEYS.settings.key) settingsStore.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <>
      <div className="flex min-h-dvh flex-col">
        <TopBar />
        <FirstRunBanner />
        <main className="sy-safe-x mx-auto flex w-full max-w-content flex-1 flex-col py-10">
          <div className="flex max-w-prose flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                Sumyard
              </h1>
              <p className="text-lg text-text-muted">Personal UK finance calculators in one clean, ad-free place.</p>
            </div>

            <section
              aria-labelledby="coming-title"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-sm"
            >
              <h2 id="coming-title" className="text-base font-semibold">
                Calculators coming
              </h2>
              <p className="text-sm text-text-muted">
                There is nothing to calculate yet. This version sets up the app: its look, light and dark themes, Help, Settings and About.
                The calculators arrive in later releases.
              </p>
            </section>

            <p className="text-sm text-text-muted">Everything you enter stays on this device. Sumyard has no accounts, tracking or ads.</p>
          </div>
        </main>
        <Footer />
        <ToastView layer="app" active={route === null} />
      </div>
      {route && <Sheet route={route} />}
      <ToastAnnouncer />
    </>
  )
}
