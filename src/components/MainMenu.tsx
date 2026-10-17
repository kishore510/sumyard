import { CircleHelp, FolderOpen, Info, Menu, Settings } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { unseenStore } from '@/help/whatsNew'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { MENU_BUTTON_ID, openSheet } from '@/sheets/navigation'
import type { SheetRoute } from '@/sheets/route'

/*
 * The main menu off the top bar (generalised from Chalkline's FileMenu: its
 * diagram file actions are replaced by the app's sheets). A WAI-ARIA menu
 * button: Up, Down, Home and End move between items, Escape closes and
 * returns focus to the button, Tab or a click outside closes.
 */

function Item({
  icon,
  children,
  onSelect,
  hint,
  badge,
  disabled,
}: {
  icon: ReactNode
  children: ReactNode
  onSelect?: () => void
  hint?: string
  badge?: string
  disabled?: boolean
}) {
  return (
    <Button
      role="menuitem"
      variant="ghost"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={cn(
        'h-auto min-h-touch justify-start py-2 text-left whitespace-normal',
        disabled && 'cursor-default text-text-muted hover:bg-transparent active:bg-transparent',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
      {badge && <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-on-accent">{badge}</span>}
    </Button>
  )
}

/** The decorative "unread release notes" dot (from Chalkline). The button's label says it in words. */
function UnseenDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('absolute size-(--sy-badge-dot) rounded-full bg-accent ring-2 ring-surface', className)} />
}

const menuItems = (menu: HTMLElement | null) => Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

export function MainMenu() {
  const [open, setOpen] = useState(false)
  const unseen = useStore(unseenStore)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    menuItems(menuRef.current)[0]?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const list = menuItems(menuRef.current)
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      e.preventDefault()
      list[(to + list.length) % list.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(index + 1)
    else if (e.key === 'ArrowUp') move(index - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(list.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  const go = (route: SheetRoute) => () => {
    setOpen(false)
    openSheet(route, buttonRef.current)
  }

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        id={MENU_BUTTON_ID}
        variant="ghost"
        size="icon"
        aria-label={unseen ? 'Menu (new: what’s changed)' : 'Menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="relative"
      >
        <Menu />
        {unseen && <UnseenDot className="top-2.5 right-2.5" />}
      </Button>
      {open && (
        <Panel
          ref={menuRef}
          className="absolute top-full right-0 z-40 mt-1 flex max-h-(--sy-drawer-max-height) w-72 flex-col overflow-y-auto p-1 shadow-lg"
        >
          <div id={menuId} role="menu" aria-label="Menu" tabIndex={-1} onKeyDown={onMenuKeyDown} className="flex flex-col">
            <Item icon={<Settings />} onSelect={go({ kind: 'settings' })}>
              Settings
            </Item>
            <Item icon={<CircleHelp />} onSelect={go({ kind: 'help' })} badge={unseen ? 'New' : undefined}>
              Help and what’s new
            </Item>
            <Item icon={<Info />} onSelect={go({ kind: 'about' })}>
              About Sumyard
            </Item>
            <hr className="my-1 h-px border-0 bg-border" />
            <Item icon={<FolderOpen />} disabled hint="Coming soon">
              Scenarios
            </Item>
          </div>
          <p className="px-3 pt-1 pb-2 text-xs text-text-muted">Changes are saved in this browser.</p>
        </Panel>
      )}
    </div>
  )
}
