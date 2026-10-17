import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatBytes, sumyardStorageBytes } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { formatVersionDetails, VERSION_INFO } from '@/version'
import { DISCLAIMER } from './parts'

/*
 * About (lifted from Chalkline's HelpSheet About, without the diagram format
 * line): version, build, storage used, Copy details, privacy with every
 * storage key, the disclaimer and credits.
 */

const CREDITS = typeof __APP_CREDITS__ === 'undefined' ? [] : __APP_CREDITS__

function CopyDetails() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const details = formatVersionDetails(VERSION_INFO, navigator.userAgent)
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          const copy = navigator.clipboard?.writeText(details)
          if (!copy) return setState('failed')
          copy.then(
            () => setState('copied'),
            () => setState('failed'),
          )
        }}
      >
        {state === 'copied' ? <Check /> : <Copy />}
        {state === 'copied' ? 'Copied' : 'Copy details'}
      </Button>
      <p className="text-xs text-text-muted" aria-live="polite">
        {state === 'failed'
          ? 'Couldn’t copy. Select the text below and copy it instead.'
          : 'For reporting a problem: version, build and browser.'}
      </p>
      {state === 'failed' && (
        <textarea
          readOnly
          aria-label="Details"
          value={details}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-border-strong bg-surface p-2 font-mono text-xs text-text"
        />
      )}
    </div>
  )
}

export function AboutPage() {
  const bytes = sumyardStorageBytes()
  const built = VERSION_INFO.buildDate ? new Date(VERSION_INFO.buildDate) : null
  const rows: [string, string, string?][] = [
    ['Version', VERSION_INFO.version],
    ['Build', VERSION_INFO.commit],
    ['Built', built && !Number.isNaN(built.getTime()) ? built.toLocaleString('en-GB') : 'unknown'],
    ['Storage used', bytes === null ? 'unavailable (browser storage is blocked)' : `about ${formatBytes(bytes)}`, 'storage'],
  ]

  return (
    <div className="flex flex-col gap-5 pb-4 text-sm text-text">
      <p>
        <span className="font-semibold">Sumyard</span>: personal UK finance calculators in one clean, ad-free place.
      </p>
      <dl className="flex flex-col gap-2">
        {rows.map(([term, value, data]) => (
          <div key={term} className="flex gap-4">
            <dt className="w-28 shrink-0 text-text-muted">{term}</dt>
            <dd className="min-w-0 break-words tabular-nums" data-storage-used={data === 'storage' ? '' : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <CopyDetails />

      <section aria-label="Privacy" className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Privacy</h3>
        <p>
          No analytics, no tracking and no network requests. Your settings stay in this browser until you save or export them. Clearing this
          site’s data in your browser removes them.
        </p>
        <p className="text-text-muted">What Sumyard keeps in this browser:</p>
        <ul className="flex flex-col gap-2">
          {Object.values(STORAGE_KEYS).map(({ key, what }) => (
            <li key={key} className="flex flex-col">
              <span>{what}</span>
              <code className="font-mono text-xs break-all text-text-muted">{key}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Disclaimer" className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Illustrative only, not financial advice</h3>
        <p>{DISCLAIMER}</p>
      </section>

      <section aria-label="Credits" className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Credits</h3>
        <p>Sumyard is built with these open-source packages. Thank you to their authors.</p>
        <details className="rounded-md border border-border">
          <summary className="flex min-h-touch cursor-pointer items-center px-3 font-medium">
            All bundled packages ({CREDITS.length})
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-3 text-xs">
            {CREDITS.map((c) => (
              <li key={c.name} className="flex flex-wrap justify-between gap-x-2">
                <span className="min-w-0 break-all">
                  {c.name} {c.version}
                </span>
                <span className="text-text-muted">{c.license}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}
