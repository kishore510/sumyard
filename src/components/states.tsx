import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

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
