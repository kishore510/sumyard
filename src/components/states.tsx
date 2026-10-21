import { AlertTriangle, Inbox, Info, LoaderCircle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Shared empty, error and loading states (generalised from Chalkline's
 * EmptyState and errors/ErrorViews; the diagram sketch is replaced by an
 * icon). Use these rather than one-off messages.
 */

function StateLayout({
  icon,
  title,
  children,
  action,
  role,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  role?: 'alert' | 'status'
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden="true" className="text-text-muted [&_svg]:size-8">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {children && <div className="max-w-xs text-sm text-text-muted">{children}</div>}
      {action}
    </div>
  )
}

/** Nothing to show yet. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <StateLayout icon={<Inbox />} title={title} action={action}>
      {children}
    </StateLayout>
  )
}

/** Something couldn't be shown. Says what happened and what to do next. */
export function ErrorState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <StateLayout role="alert" icon={<AlertTriangle className="text-danger" />} title={title} action={action}>
      {children}
    </StateLayout>
  )
}

/** Waiting for something (a page of the sheet loading). The spinner stops under reduced motion. */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-text-muted">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      <span>{label}…</span>
    </div>
  )
}

/**
 * A page's loading state that holds at least the screen's height, so what
 * follows (the footer) starts below the fold and does not jump when the
 * page arrives (layout shift).
 */
export function PageLoadingState() {
  return (
    <div data-page-loading className="min-h-svh">
      <LoadingState />
    </div>
  )
}

/**
 * A notice inside a page: something to know (info), something that needs
 * attention (warning), or something that went wrong (error). Icon and words,
 * never colour alone. Not a live region: changes are announced by toasts.
 */
export function InlineNotice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warning' | 'error'
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div
      data-tone={tone}
      className={cn(
        'flex gap-3 rounded-md border p-3 text-sm text-text',
        tone === 'info' ? 'border-border bg-surface-muted' : 'border-border-strong bg-surface',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('mt-0.5 size-5 shrink-0', tone === 'error' ? 'text-danger' : tone === 'warning' ? 'text-text' : 'text-text-muted')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {title && <p className="font-semibold">{title}</p>}
        <div className="flex flex-col gap-1">{children}</div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

/** Shows `fallback` instead of a blank screen when its children throw while rendering. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Nothing is sent anywhere: Sumyard makes no network requests. The fallback tells the person what to do.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
