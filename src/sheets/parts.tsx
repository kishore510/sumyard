import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/* Building blocks for sheet pages (lifted from Chalkline's HelpSheet). */

/** A full-width row that opens another page. */
export function NavRow({
  icon,
  title,
  detail,
  onClick,
  badge,
}: {
  icon?: ReactNode
  title: string
  detail?: string
  onClick: () => void
  badge?: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted active:bg-surface-muted"
      >
        {icon && (
          <span aria-hidden="true" className="shrink-0 text-text-muted [&_svg]:size-5">
            {icon}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-text">{title}</span>
          {detail && <span className="line-clamp-2 text-xs text-text-muted">{detail}</span>}
        </span>
        {badge && <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-on-accent">{badge}</span>}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      </button>
    </li>
  )
}

export const SectionTitle = ({ children, id }: { children: ReactNode; id?: string }) => (
  <h3 id={id} className="px-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
    {children}
  </h3>
)

/** The illustrative-not-advice wording, shared by the footer, the first-run notice and About. */
export const DISCLAIMER =
  'Sumyard’s results are estimates based on the assumptions each calculator shows. Check anything important against an official source before you act on it.'
