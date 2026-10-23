import { ChevronDown } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/*
 * A calculator page's layout with its result always in view
 * (docs/ui-patterns.md, U4 and U5):
 *
 * - Phone (below md): a compact sticky bar above the inputs with the
 *   headline figure and `controls` (a period choice, the tax-year badge).
 *   Scrolled past its own height it collapses to one line, a button that
 *   expands it; back at its resting place it is full again. It stays
 *   collapsed until then (hysteresis), so the shift of collapsing can't
 *   make it flicker. Its height sets --sy-sticky-offset, which the page's
 *   scroll-padding uses, so a focused field is never hidden behind it.
 * - md and up: two columns, `children` (the inputs) left and `results`
 *   right, sticky and scrolling on their own when taller than the screen.
 *   The bar is not shown.
 *
 * The figure is not a live region. One polite status region says the
 * `announcement` once it has stopped changing for SETTLE_MS, so nothing is
 * announced while someone types. No motion.
 */

/** How long the announcement must stay the same before it is read out. UI timing, not a figure. */
export const SETTLE_MS = 1200

const OFFSET_VAR = '--sy-sticky-offset'

/** Text for a polite live region, set only once `text` has stayed the same for SETTLE_MS; never on first render. */
function useSettled(text: string | null): string {
  const [said, setSaid] = useState('')
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => setSaid(text ?? ''), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [text])
  return said
}

/** Whether the bar has been scrolled past: collapses beyond its own height, expands only back at its resting place. */
function useStuck(sentinel: React.RefObject<HTMLElement | null>, bar: React.RefObject<HTMLElement | null>) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      const top = sentinel.current?.getBoundingClientRect().top ?? 0
      const height = bar.current?.offsetHeight ?? 0
      setStuck((was) => (was ? top < 0 : top < -height))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sentinel, bar])
  return stuck
}

/** Publishes the bar's height for scroll-padding; nothing (zero) when it isn't shown. */
function useOffset(bar: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = bar.current
    const root = document.documentElement
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => root.style.setProperty(OFFSET_VAR, `${el.offsetHeight}px`))
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [bar])
}

export function StickyResult({
  label,
  value,
  emptyText,
  announcement,
  controls,
  results,
  children,
}: {
  /** What the figure is ("Take-home for the year"). */
  label: string
  /** The figure, formatted; null when there is no result. */
  value: string | null
  /** Shown in the bar instead of a figure. */
  emptyText: string
  /** Read out once settled; null for nothing. */
  announcement: string | null
  /** Shown under the figure in the phone bar while it is full. */
  controls: ReactNode
  results: ReactNode
  children: ReactNode
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const stuck = useStuck(sentinel, bar)
  const [expanded, setExpanded] = useState(false)
  const said = useSettled(announcement)
  const id = useId()
  const controlsId = `${id}-controls`
  useOffset(bar)

  // Back at its resting place, the bar is full; scrolled past again, it starts collapsed.
  if (!stuck && expanded) setExpanded(false)
  const full = !stuck || expanded

  const figure = (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
      <span className="text-sm text-text-muted">{label}</span>
      {value === null ? (
        <span className="text-sm font-medium text-text">{emptyText}</span>
      ) : (
        // A long unbroken option name in a sentence (the car verdict) wraps instead of widening the page; a value with line breaks (the next pound legs) keeps them.
        <span
          data-sticky-value
          className={cn(
            'min-w-0 font-semibold tracking-tight whitespace-pre-line text-text tabular-nums [overflow-wrap:anywhere]',
            full ? 'text-xl' : 'text-base',
          )}
        >
          {value}
        </span>
      )}
    </span>
  )

  return (
    <div className="flex flex-col">
      <div ref={sentinel} data-sticky-sentinel aria-hidden="true" className="md:hidden" />
      <div ref={bar} data-sticky-result className="sy-safe-top sticky top-0 z-20 -mx-(--sy-gutter) bg-bg md:hidden">
        <section aria-label={label} className="mx-(--sy-gutter) my-2 flex flex-col rounded-lg border border-border bg-surface shadow-md">
          {stuck ? (
            <button
              type="button"
              data-sticky-toggle
              aria-expanded={expanded}
              aria-controls={controlsId}
              onClick={() => setExpanded((e) => !e)}
              className="flex min-h-touch w-full items-center gap-3 rounded-lg px-4 py-1 text-left"
            >
              {figure}
              <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-text-muted', expanded && 'rotate-180')} />
            </button>
          ) : (
            <div className="flex min-h-touch items-center px-4 py-1">{figure}</div>
          )}
          {full && (
            <div id={controlsId} className="flex flex-col gap-3 border-t border-border px-4 py-3">
              {controls}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-6 md:mt-0 md:grid-cols-2">
        <div data-inputs className="flex min-w-0 flex-col gap-4">
          {children}
        </div>
        <div
          data-results
          className="flex min-w-0 flex-col gap-6 self-start md:sticky md:top-0 md:-m-1 md:max-h-dvh md:overflow-y-auto md:p-1 md:py-4"
        >
          {results}
        </div>
      </div>

      <div data-sticky-announcer role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {said}
      </div>
    </div>
  )
}
