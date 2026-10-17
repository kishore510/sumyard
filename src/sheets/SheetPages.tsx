import { useEffect, useRef } from 'react'
import { topicById } from '@/help/content'
import { AboutPage } from './AboutPage'
import { HelpPage, TopicPage } from './HelpPage'
import type { SheetRoute } from './route'
import { SettingsPage } from './SettingsPage'
import { SheetHeader } from './Sheet'
import { WhatsNewPage } from './WhatsNewPage'

/* The sheet's pages, loaded on first open (Sheet.tsx). */

function titleOf(route: SheetRoute): string {
  switch (route.kind) {
    case 'help':
      return 'Help'
    case 'topic':
      return topicById(route.id)?.title ?? 'Help'
    case 'whats-new':
      return 'What’s new'
    case 'about':
      return 'About Sumyard'
    case 'settings':
      return 'Settings'
  }
}

export default function SheetPages({ route, titleId }: { route: SheetRoute; titleId: string }) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLElement>(null)
  const page = JSON.stringify(route)

  // Each page (including the first): back to the top, and focus on its title so screen readers announce it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page changes.
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 })
    titleRef.current?.focus()
  }, [page])

  return (
    <>
      <SheetHeader route={route} title={titleOf(route)} titleId={titleId} titleRef={titleRef} />
      {/* Focusable, so keyboard users can scroll pages that have no controls (What's new, topics). */}
      <section
        ref={bodyRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable (WCAG 2.1.1; axe scrollable-region-focusable).
        tabIndex={0}
        aria-labelledby={titleId}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sy-safe-bottom"
      >
        {route.kind === 'help' && <HelpPage />}
        {route.kind === 'topic' && <TopicPage id={route.id} />}
        {route.kind === 'whats-new' && <WhatsNewPage />}
        {route.kind === 'about' && <AboutPage />}
        {route.kind === 'settings' && <SettingsPage />}
      </section>
    </>
  )
}
