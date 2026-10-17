import { TopBar } from '@/components/TopBar'

/** Placeholder home page for slice 0: no calculators or app chrome yet. */
export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="sy-safe-x sy-safe-bottom mx-auto flex w-full max-w-content flex-1 flex-col py-10">
        <div className="flex max-w-prose flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Sumyard</h1>
            <p className="text-lg text-text-muted">Personal UK finance calculators in one clean, ad-free place.</p>
          </div>

          <section aria-labelledby="coming-title" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h2 id="coming-title" className="text-base font-semibold">
              Calculators coming
            </h2>
            <p className="text-sm text-text-muted">
              There is nothing to calculate yet. This first version sets up the app, its look and its light and dark themes. The calculators
              arrive in later releases.
            </p>
          </section>

          <p className="text-sm text-text-muted">Everything you enter stays on this device. Sumyard has no accounts, tracking or ads.</p>

          <aside aria-label="Disclaimer" className="border-t border-border pt-4 text-sm text-text-muted">
            <strong className="font-semibold text-text">Illustrative only, not financial advice.</strong> Sumyard's results will be
            estimates based on the assumptions each calculator shows. Check anything important against an official source before you act on
            it.
          </aside>
        </div>
      </main>
    </div>
  )
}
