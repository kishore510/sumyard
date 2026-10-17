import { ArrowLeft, X } from 'lucide-react'
import { lazy, type ReactNode, Suspense, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ErrorBoundary, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { trapFocus } from '@/lib/focusTrap'
import { ToastView } from '@/toast/Toast'
import { focusTargetOnClose, sheets } from './navigation'
import { parentOf, type SheetRoute } from './route'

/*
 * The sheet frame (generalised from Chalkline's HelpSheet and SettingsSheet,
 * which each had their own): a full-height bottom sheet on phones, a side
 * panel on the right from tablet width (md) up. Modal: the rest of the app is
 * inert, focus stays inside with Tab, Escape steps back or closes, and focus
 * returns to the opener on close. The pages load on first open.
 */

const SheetPages = lazy(() => import('./SheetPages'))

/** Back arrow (when the page has a parent), title and close. Shared by the pages and the loading state. */
export function SheetHeader({
  route,
  title,
  titleId,
  titleRef,
}: {
  route: SheetRoute
  title: string
  titleId: string
  titleRef?: React.Ref<HTMLHeadingElement>
}) {
  const nav = sheets()
  return (
    <div className="flex min-h-touch shrink-0 items-center gap-1 border-b border-border px-1">
      {parentOf(route) ? (
        <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={nav.back}>
          <ArrowLeft />
        </Button>
      ) : (
        <span aria-hidden="true" className="size-1" />
      )}
      <h2 ref={titleRef} id={titleId} tabIndex={-1} className="min-w-0 flex-1 truncate px-2 text-sm font-semibold outline-none">
        {title}
      </h2>
      <Button variant="ghost" size="icon" aria-label="Close" title="Close (Esc)" onClick={() => nav.close()}>
        <X />
      </Button>
    </div>
  )
}

function Fallback({ route, titleId, children }: { route: SheetRoute; titleId: string; children: ReactNode }) {
  return (
    <>
      <SheetHeader route={route} title="Sumyard" titleId={titleId} />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  )
}

export function Sheet({ route }: { route: SheetRoute }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    const root = document.getElementById('root')
    if (!el) return
    root?.setAttribute('inert', '')
    const release = trapFocus<HTMLElement>(el, document, () => sheets().escape(), focusTargetOnClose)
    return () => {
      // Un-inert first, so focus can return to the opener in the app.
      root?.removeAttribute('inert')
      release()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-overlay md:items-stretch md:justify-end"
      onPointerDown={(e) => e.target === e.currentTarget && sheets().close()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sy-sheet flex h-(--sy-full-sheet-height) w-full flex-col rounded-t-lg border-t border-border bg-surface text-text shadow-lg md:sy-safe-top md:h-full md:max-w-(--sy-help-width) md:rounded-none md:border-t-0 md:border-l"
      >
        <ErrorBoundary
          key={JSON.stringify(route)}
          fallback={
            <Fallback route={route} titleId={titleId}>
              <ErrorState title="This page couldn’t be shown">Close it and try again. If it keeps happening, reload Sumyard.</ErrorState>
            </Fallback>
          }
        >
          <Suspense
            fallback={
              <Fallback route={route} titleId={titleId}>
                <LoadingState />
              </Fallback>
            }
          >
            <SheetPages route={route} titleId={titleId} />
          </Suspense>
        </ErrorBoundary>
        <ToastView layer="sheet" active />
      </div>
    </div>,
    document.body,
  )
}
