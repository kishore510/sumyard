import type { ReactNode } from 'react'

/* Stub (red commit): the sticky result layout arrives in the green commit. */
export const SETTLE_MS = 0

export function StickyResult({
  results,
  children,
}: {
  label: string
  value: string | null
  emptyText: string
  announcement: string | null
  controls: ReactNode
  results: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      {children}
      {results}
    </div>
  )
}
