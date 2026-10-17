import { ChevronDown, CircleCheck, ExternalLink, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/states'
import { VerifiedBadge } from '@/components/VerifiedBadge'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import { type FieldKind, TAX_FIELDS, TAX_GROUPS, type TaxBand, type TaxGroup, type TaxYearConfig } from '@/config/tax/schema'
import { groupStatus, type LeafStatus, type Verified, yearStatus } from '@/config/tax/sourced'
import { formatGBP, formatIsoDate, formatPercent } from '@/lib/format'
import type { IsoDate } from '@/lib/isoDate'
import type { Money, Ratio } from '@/lib/money'
import { cn } from '@/lib/utils'
import { DISCLAIMER } from './parts'

/*
 * Tax data (#/tax-data): every loaded tax year, each value group with how
 * many of its values are verified, and for each verified value its figure,
 * its GOV.UK source (a plain link, opened in a new tab, never fetched) and the
 * date it was checked. Unverified groups are flagged in words and with an
 * icon, not by colour alone. For the 2026-27 skeleton everything is
 * unverified, which is correct until slice 1a.
 */

const KIND = new Map<string, FieldKind>(TAX_FIELDS.map((f) => [f.path, f.kind]))

function Value({ kind, value }: { kind: FieldKind | undefined; value: unknown }) {
  switch (kind) {
    case 'money':
      return <>{formatGBP(value as Money, 'pence')}</>
    case 'ratio':
      return <>{formatPercent(value as Ratio, 4)}</>
    case 'date':
      return <>{formatIsoDate(value as IsoDate)}</>
    case 'count':
      return <>{String(value)}</>
    case 'bands':
      return (
        <ul className="flex flex-col gap-0.5">
          {(value as readonly TaxBand[]).map((band) => (
            <li key={band.name}>
              {band.name}: from {formatGBP(band.from, 'pence')} at {formatPercent(band.rate, 4)}
            </li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

function Field({ status }: { status: LeafStatus }) {
  const leaf = status.verified ? (status.leaf as Verified<unknown>) : null
  return (
    <li data-tax-field={status.path} data-verified={status.verified} className="flex flex-col gap-0.5 py-2">
      <span className="text-text">{status.label}</span>
      {leaf ? (
        <>
          <span className="font-medium tabular-nums text-text">
            <Value kind={KIND.get(status.path)} value={leaf.value} />
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            <span>Verified {formatIsoDate(leaf.verifiedOn)}</span>
            <a
              href={leaf.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source for ${status.label}: GOV.UK (opens in a new tab)`}
              className="inline-flex min-h-touch items-center gap-1 font-medium text-accent underline underline-offset-2"
            >
              Source: GOV.UK
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </span>
        </>
      ) : (
        <span className="text-xs text-text-muted">Not yet verified</span>
      )}
    </li>
  )
}

function Group({ config, group }: { config: TaxYearConfig; group: TaxGroup }) {
  const status = groupStatus(config, group)
  const state = status.complete ? 'all' : status.verified > 0 ? 'some' : 'none'
  const summary =
    state === 'all'
      ? `All ${status.total} verified`
      : state === 'some'
        ? `${status.verified} of ${status.total} verified. Some not yet verified`
        : `Not yet verified (0 of ${status.total} verified)`
  return (
    <details data-tax-group={group.id} data-status={state} className="group rounded-md border border-border">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
        {state === 'all' ? (
          <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-accent" />
        ) : (
          <ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-text">{group.title}</span>
          <span className={cn('text-xs', state === 'all' ? 'text-text-muted' : 'font-medium text-text')}>{summary}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y divide-border border-t border-border px-3 text-sm">
        {status.leaves.map((leaf) => (
          <Field key={leaf.path} status={leaf} />
        ))}
      </ul>
    </details>
  )
}

function Year({ config }: { config: TaxYearConfig }) {
  const status = yearStatus(config)
  const headingId = `tax-year-${config.id}`
  return (
    <section data-tax-year={config.id} aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-2">
        <h3 id={headingId} className="text-base font-semibold text-text">
          {taxYearLabel(config.id)}
        </h3>
        <VerifiedBadge config={config} linked={false} />
        <p className="text-xs text-text-muted">
          {status.verified} of {status.total} values verified.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {TAX_GROUPS.map((group) => (
          <Group key={group.id} config={config} group={group} />
        ))}
      </div>
    </section>
  )
}

export function TaxDataPage({ years = listTaxYears() }: { years?: readonly TaxYearConfig[] }) {
  return (
    <div className="flex flex-col gap-5 pb-4 text-sm text-text">
      <p>
        Every tax figure Sumyard uses, where it came from on GOV.UK and when it was checked. A calculator shows no results while any figure
        it needs is not yet verified, rather than guess.
      </p>
      {years.length === 0 ? (
        <EmptyState title="No tax years are loaded">
          This build has no tax data. Reload Sumyard; if it keeps happening, report it from About.
        </EmptyState>
      ) : (
        years.map((config) => <Year key={config.id} config={config} />)
      )}
      <p className="text-xs text-text-muted">Illustrative only, not financial advice. {DISCLAIMER}</p>
    </div>
  )
}
