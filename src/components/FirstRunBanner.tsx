import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { acknowledgedStore } from '@/settings/acknowledged'

/*
 * First-run acknowledgement: a notice under the top bar, never a dialog, so
 * it blocks nothing and traps no one. "Got it" stores it through
 * src/settings/acknowledged.ts (sumyard:v1:acknowledged). If storage is
 * blocked, it stays dismissed for this visit only.
 */

export function FirstRunBanner() {
  const acknowledged = useStore(acknowledgedStore)
  if (acknowledged) return null
  return (
    <section aria-labelledby="first-run-title" className="sy-safe-x border-b border-border bg-accent-subtle py-3">
      <div className="mx-auto flex max-w-(--sy-banner-width) flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <h2 id="first-run-title" className="font-semibold text-text">
            Before you start
          </h2>
          <p className="text-text">
            Sumyard’s results will be illustrative estimates, not financial advice. Check anything important with an official source.
          </p>
        </div>
        <Button
          variant="primary"
          className="self-start sm:self-center"
          onClick={() => {
            acknowledgedStore.set(true)
            // The button is gone: put focus somewhere sensible instead of dropping it.
            document.getElementById('main-title')?.focus()
          }}
        >
          Got it
        </Button>
      </div>
    </section>
  )
}
