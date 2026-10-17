import { MainMenu } from '@/components/MainMenu'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Header: wordmark, theme toggle and the main menu (Chalkline's top bar layout, without the diagram tools). */
export function TopBar() {
  return (
    <header className="sy-safe-top shrink-0 border-b border-border bg-surface">
      <div className="sy-safe-x mx-auto flex h-header max-w-content items-center justify-between gap-(--sy-toolbar-gap)">
        <span className="text-lg font-semibold tracking-tight">Sumyard</span>
        <div className="flex items-center gap-(--sy-toolbar-gap)">
          <ThemeToggle />
          <MainMenu />
        </div>
      </div>
    </header>
  )
}
