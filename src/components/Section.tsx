import type { ReactNode } from 'react'

/* Stub (red commit): the disclosure section arrives in the green commit. */
export function Section({ children }: { id: string; title: string; summary: string; defaultOpen?: boolean; children: ReactNode }) {
  return <div>{children}</div>
}
