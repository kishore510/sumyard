import { MainMenu } from '@/components/MainMenu'
import { ThemeToggle } from '@/components/ThemeToggle'

/** Header: wordmark (a link to the home page, with every calculator), theme toggle and the main menu (Chalkline's top bar layout, without the diagram tools). */
export function TopBar() {
  return (
    <header className="sy-safe-top shrink-0 border-b border-border bg-surface">
      <div className="sy-safe-x mx-auto flex h-header max-w-content items-center justify-between gap-(--sy-toolbar-gap)">
        <a
          href="#/"
          aria-label="Sumyard: all calculators"
          className="-mx-2 inline-flex min-h-touch items-center rounded-md px-2 text-lg font-semibold tracking-tight text-text"
        >
          Sumyard
        </a>
        <div className="flex items-center gap-(--sy-toolbar-gap)">
          <ThemeToggle />
          <MainMenu />
        </div>
      </div>
    </header>
  )
}
