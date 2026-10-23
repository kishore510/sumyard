import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { taxYearLabel } from '@/config/tax/index'
import type { TaxYearConfig } from '@/config/tax/schema'
import { yearStatus } from '@/config/tax/sourced'
import { formatIsoDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SheetLink } from './SheetLink'

/**
 * A tax year's label and whether its figures are verified: "Not yet verified"
 * while any value is unverified, or "Last verified <date>" (the most recent
 * check) once every value is. Links to the Tax data screen, except on that
 * screen (`linked={false}`), named by its visible text and then "(see tax
 * data)". Calculators show it next to their results.
 */
export function VerifiedBadge({ config, linked = true }: { config: TaxYearConfig; linked?: boolean }) {
  const status = yearStatus(config)
  const year = `${taxYearLabel(config.id)} tax year`
  const state = status.complete && status.lastVerified ? `Last verified ${formatIsoDate(status.lastVerified)}` : 'Not yet verified'
  const Icon = status.complete ? ShieldCheck : ShieldAlert
  const className = cn(
    'inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1 text-xs font-medium text-text',
    status.complete ? 'border-border bg-surface' : 'border-dashed border-border-strong bg-surface-muted',
  )
  // The spaces keep the words apart in the accessible name; a flex container doesn't draw them.
  const body = (
    <>
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', status.complete ? 'text-accent' : 'text-text-muted')} />
      <span>{year}</span>{' '}
      <span aria-hidden="true" className="text-text-muted">
        ·
      </span>{' '}
      <span>{state}</span>
    </>
  )
  if (!linked) {
    return (
      <span className={className} data-verified={status.complete}>
        {body}
      </span>
    )
  }
  return (
    <SheetLink
      route={{ kind: 'tax-data' }}
      data-verified={status.complete}
      className={cn(className, 'min-h-touch no-underline transition-colors hover:border-accent')}
    >
      {body}
      {/* Named by its visible text first (label in name), then where it goes. */}
      <span className="sr-only"> (see tax data)</span>
    </SheetLink>
  )
}
