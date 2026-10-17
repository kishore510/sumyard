import { DISCLAIMER } from '@/sheets/parts'

/** The illustrative-not-advice disclaimer, at the foot of every page. */
export function Footer() {
  return (
    <footer className="sy-safe-x sy-safe-bottom shrink-0 border-t border-border bg-surface pt-4">
      <p className="mx-auto max-w-content text-sm text-text-muted">
        <strong className="font-semibold text-text">Illustrative only, not financial advice.</strong> {DISCLAIMER}
      </p>
    </footer>
  )
}
