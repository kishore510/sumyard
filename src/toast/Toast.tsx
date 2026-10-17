import { Undo2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toasts } from './toasts'

/*
 * The toast, drawn in one of two places so it never covers anything that
 * matters on a phone:
 * - layer "app": floating at the bottom of the page, below the menu (which
 *   sits above it) and only while no sheet is open;
 * - layer "sheet": a strip at the foot of the open sheet, part of its layout
 *   (it pushes the content up rather than covering it) and inside its focus
 *   trap, so Undo can be reached with the keyboard.
 * The text is announced by ToastAnnouncer, a single polite live region
 * outside the app root, so it is heard whichever layer shows the toast.
 */

export function ToastView({ layer, active }: { layer: 'app' | 'sheet'; active: boolean }) {
  const toast = useStore(toasts, (s) => s.toast)
  if (!active || !toast) return null
  return (
    <div
      className={cn(
        layer === 'app'
          ? 'sy-safe-x pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-(--sy-gutter)'
          : 'shrink-0 border-t border-border px-4 py-2',
      )}
    >
      <section
        aria-label="Notification"
        onPointerEnter={toasts.pause}
        onPointerLeave={toasts.resume}
        onFocus={toasts.pause}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) toasts.resume()
        }}
        className={cn(
          'pointer-events-auto flex min-h-touch w-full items-center gap-1 text-sm',
          layer === 'app' ? 'max-w-md rounded-lg border border-border bg-surface py-1 pr-1 pl-4 text-text shadow-lg' : 'text-text',
        )}
      >
        <p className="min-w-0 flex-1 py-2">{toast.message}</p>
        {toast.undo && (
          <Button variant="ghost" onClick={toasts.undo} className="px-3 text-accent">
            <Undo2 />
            Undo
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Dismiss notification" title="Dismiss" onClick={() => toasts.dismiss()}>
          <X />
        </Button>
      </section>
    </div>
  )
}

/** The one live region for toasts. Rendered once, outside #root, so an open (modal) sheet never silences it. */
export function ToastAnnouncer() {
  const announcement = useStore(toasts, (s) => s.announcement)
  return createPortal(
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement.text && <span key={announcement.id}>{announcement.text}</span>}
    </div>,
    document.body,
  )
}
