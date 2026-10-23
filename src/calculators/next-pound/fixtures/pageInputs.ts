import { taxYear } from '@/config/tax/2026-27'
import type { TaxYearConfig } from '@/config/tax/schema'
import { mapLeaves } from '@/config/tax/sourced'

/* Test-only: the 2026-27 config with the named leaves marked to do, for the page's refusals. */
export const unverifiedConfig = (...paths: string[]): TaxYearConfig =>
  mapLeaves(taxYear, (path, leaf) => (paths.includes(path) ? { status: 'todo' } : leaf))
