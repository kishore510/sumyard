import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { openSheet } from '@/sheets/navigation'
import { formatHash, type SheetRoute } from '@/sheets/route'

/**
 * A link to a sheet page. A real link (its address is the page's hash, so it
 * can be copied or opened in a new tab), but a plain click opens the sheet
 * through the navigator, so the back stack, Esc and focus work as for a tap.
 */
export function SheetLink({ route, className, children, ...props }: { route: SheetRoute } & Omit<ComponentProps<'a'>, 'href' | 'onClick'>) {
  return (
    <a
      {...props}
      href={formatHash(route)}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        openSheet(route, e.currentTarget)
      }}
      className={cn('font-medium text-accent underline underline-offset-2', className)}
    >
      {children}
    </a>
  )
}
