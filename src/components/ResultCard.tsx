import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

/*
 * Results: a card with an optional headline figure and rows of label and
 * value (StatRow). Values are passed already formatted (src/lib/format.ts).
 */

export function ResultCard({
  title,
  headline,
  headlineLabel,
  children,
  className,
}: {
  title: string
  /** The main figure, shown large. */
  headline?: string
  /** What the headline is, read with it. */
  headlineLabel?: string
  children?: ReactNode
  className?: string
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm', className)}
    >
      <h2 id={titleId} className="text-base font-semibold text-text">
        {title}
      </h2>
      {headline !== undefined && (
        <p className="flex flex-col">
          {headlineLabel && <span className="text-sm text-text-muted">{headlineLabel}</span>}
          <span className="text-2xl font-semibold tracking-tight text-text tabular-nums">{headline}</span>
        </p>
      )}
      {children && <dl className="flex flex-col">{children}</dl>}
    </section>
  )
}

export function StatRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border py-2 first:border-t-0 first:pt-0">
      <dt className="min-w-0 text-sm text-text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-text tabular-nums">
        {value}
        {detail && <span className="block text-xs font-normal text-text-muted">{detail}</span>}
      </dd>
    </div>
  )
}
