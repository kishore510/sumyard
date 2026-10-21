import { Calculator } from 'lucide-react'

/** Said wherever a tax year would be, for a calculator that uses no tax rules (`taxRules: 'none'`). */
export const NO_TAX_RULES = 'Uses no tax rules'

/**
 * Shown in place of the VerifiedBadge on a calculator page that reads no tax
 * config: there is no tax year to verify, so none is shown. Same look as the
 * badge's verified state, not a link.
 */
export function NoTaxRulesBadge() {
  return (
    <span
      data-no-tax-rules
      className="inline-flex max-w-full items-center gap-x-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text"
    >
      <Calculator aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      <span>{NO_TAX_RULES}</span>
    </span>
  )
}
