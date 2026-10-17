import { ChevronDown, ListChecks } from 'lucide-react'
import type { ReactNode } from 'react'

/*
 * What a calculator assumes, as a disclosure that is always on the page
 * (with or without results), so it can always be reached. Closed by default
 * to keep phones short; `id` lets other text link to it.
 */
export function AssumptionsPanel({
  id = 'assumptions',
  items,
  children,
}: {
  id?: string
  items: readonly ReactNode[]
  children?: ReactNode
}) {
  return (
    <details id={id} className="group rounded-lg border border-border bg-surface shadow-sm">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <ListChecks aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
        <span className="flex-1 text-sm font-semibold text-text">Assumptions ({items.length})</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-text">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list given by the calculator.
            <li key={index}>{item}</li>
          ))}
        </ul>
        {children}
      </div>
    </details>
  )
}
