import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

/*
 * A section of a calculator's inputs that opens and closes (docs/ui-patterns.md,
 * U1 and U2): a native button inside a heading, with aria-expanded and
 * aria-controls, whose name is its visible text: the title, then a one-line
 * summary of what is inside. Closed by default unless `defaultOpen` (the calculator
 * opens sections whose inputs differ from the defaults). The panel stays
 * mounted while closed, so typed text and invalid-input state survive.
 * No motion, so reduced motion needs nothing more. The open state is the
 * page's only, never stored: remount (a new key) to reset it.
 */
export function Section({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string
  title: string
  /** One line about what is inside, kept current by the caller. */
  summary: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div data-section={id} className="min-w-0 rounded-lg border border-border bg-surface shadow-sm">
      <h2 className="text-base">
        <button
          id={`${id}-button`}
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-touch w-full items-center gap-3 rounded-lg px-4 py-2 text-left hover:bg-surface-muted"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={`${id}-title`} className="text-sm font-semibold text-text">
              {title}
            </span>
            <span id={`${id}-summary`} className="text-xs text-text-muted [overflow-wrap:anywhere]">
              {summary}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-text-muted', open && 'rotate-180')} />
        </button>
      </h2>
      <div id={`${id}-panel`} hidden={!open} className="flex flex-col gap-4 border-t border-border px-4 py-4">
        {children}
      </div>
    </div>
  )
}
