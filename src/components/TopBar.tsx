import { ThemeToggle } from '@/components/ThemeToggle'

/** Temporary header for slice 0 session A: app name and theme toggle. Session B replaces it with the full top bar. */
export function TopBar() {
  return (
    <header className="sy-safe-top shrink-0 border-b border-border bg-surface">
      <div className="sy-safe-x mx-auto flex h-header max-w-content items-center justify-between gap-(--sy-toolbar-gap)">
        <span className="text-lg font-semibold tracking-tight">Sumyard</span>
        <ThemeToggle />
      </div>
    </header>
  )
}
