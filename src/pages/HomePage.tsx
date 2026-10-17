import { ArrowRight } from 'lucide-react'
import { CALCULATORS } from '@/calculators/index'
import { useStore } from '@/lib/store'
import { scenarioStore } from '@/scenarios/index'
import { formatPage } from './route'

/* The home page: what Sumyard is, and every registered calculator. */
export function HomePage() {
  const scenarios = useStore(scenarioStore, (s) => s.scenarios)
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
          Sumyard
        </h1>
        <p className="text-lg text-text-muted">Personal UK finance calculators in one clean, ad-free place.</p>
      </div>

      <section aria-labelledby="calculators-title" className="flex flex-col gap-3">
        <h2 id="calculators-title" className="text-base font-semibold">
          Calculators
        </h2>
        <ul className="flex flex-col gap-3">
          {CALCULATORS.list().map((calculator) => {
            const saved = scenarios.filter((s) => s.calculatorId === calculator.id).length
            return (
              <li key={calculator.id}>
                <a
                  href={formatPage({ kind: 'calculator', id: calculator.id })}
                  className="flex min-h-touch items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base font-semibold text-text">{calculator.name}</span>
                    <span className="text-sm text-text-muted">{calculator.summary}</span>
                    {calculator.placeholder && <span className="text-xs font-medium text-text">{calculator.placeholder}.</span>}
                    <span className="text-xs text-text-muted">
                      {saved === 0 ? 'No saved scenarios' : `${saved} saved scenario${saved === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
                </a>
              </li>
            )
          })}
        </ul>
        <p className="text-sm text-text-muted">
          Real calculators arrive in later releases. Until then, the Hello calculator shows how they will work.
        </p>
      </section>

      <p className="text-sm text-text-muted">Everything you enter stays on this device. Sumyard has no accounts, tracking or ads.</p>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex max-w-prose flex-col gap-4">
      <h1 id="main-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        No calculator here
      </h1>
      <p className="text-text-muted">
        This address doesn’t match a calculator in this version of Sumyard. It may have been renamed or not built yet.
      </p>
      <a href="#/" className="inline-flex min-h-touch items-center self-start font-medium text-accent underline underline-offset-2">
        Go to the home page
      </a>
    </div>
  )
}
