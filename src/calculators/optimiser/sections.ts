import type { Money } from '@/lib/money'
import type { OptimiserPageInputs, ResolvedInputs } from './definition'

/*
 * The take-home page's input sections (0.12.0, docs/ui-patterns.md): which
 * inputs each holds, whether they differ from the defaults (a section with
 * non-default values opens on load), which section a field the session marks
 * invalid belongs to, and each section's one-line summary. Summaries are
 * built from the resolved amounts the engine receives and formatted by the
 * caller's `gbp` (src/lib/format.ts). No tax figure here.
 */

export const SECTION_IDS = ['pension', 'benefits', 'studentLoans', 'childBenefit', 'taxCode'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export const SECTION_TITLES: Record<SectionId, string> = {
  pension: 'Pension',
  benefits: 'Benefits and deductions',
  studentLoans: 'Student loans',
  childBenefit: 'Child Benefit',
  taxCode: 'Tax code',
}

/** The summary of a section whose inputs are all at their defaults. */
export const NOT_SET = 'Not set'

/** The summary of a section holding an input that isn't valid yet. */
export const NEEDS_FIXING = 'An input here needs fixing'

export function isSectionSet(_id: SectionId, _inputs: OptimiserPageInputs): boolean {
  return false
}

export function sectionsSet(_inputs: OptimiserPageInputs): ReadonlySet<SectionId> {
  return new Set()
}

export function sectionForField(_field: string): SectionId | undefined {
  return undefined
}

export function sectionSummary(
  _id: SectionId,
  _inputs: OptimiserPageInputs,
  _resolved: ResolvedInputs,
  _gbp: (amount: Money) => string,
): string {
  return ''
}
