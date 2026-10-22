import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useId } from 'react'
import { type InputRefusal, isInputRefusal } from '@/calculators/registry'
import { taxYearLabel } from '@/config/tax/index'
import { TAX_GROUPS } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import { SheetLink } from './SheetLink'

/*
 * Shown instead of results when requireVerified refuses: which groups of tax
 * figures are not verified yet, in plain words, and a link to Tax data. Or,
 * for an input refusal (a calculator's engine refuses the inputs), each
 * refused field and why. It never shows a figure. Each notice names itself
 * by its own heading (a unique id), so a page can show several (one per
 * option card); `heading` sets the heading's level to fit where it sits.
 */

type Heading = 'h2' | 'h3'

/** The Tax data groups that hold the unverified paths, in the screen's order. */
export function refusedGroups(refusal: Pick<Refusal, 'unverified'>): string[] {
  return TAX_GROUPS.filter((group) => group.fields.some((field) => refusal.unverified.includes(field.path))).map((g) => g.title)
}

function InputRefusalNotice({ refusal, heading: H }: { refusal: InputRefusal; heading: Heading }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-refusal="inputs"
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-col gap-2 text-sm text-text">
          <H id={titleId} className="text-base font-semibold">
            No results for these inputs
          </H>
          <p>Sumyard shows no results rather than a wrong number. Change these and the results come back:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {refusal.problems.map((problem) => (
              <li key={problem.field} data-refusal-field={problem.field}>
                <span className="font-medium">{problem.label}:</span> {problem.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function RefusalNotice({ refusal, heading = 'h2' }: { refusal: Refusal | InputRefusal; heading?: Heading }) {
  const titleId = useId()
  if (isInputRefusal(refusal)) return <InputRefusalNotice refusal={refusal} heading={heading} />
  const groups = refusedGroups(refusal)
  const H = heading
  return (
    <section
      aria-labelledby={titleId}
      data-refusal
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
        <div className="flex min-w-0 flex-col gap-2 text-sm text-text">
          <H id={titleId} className="text-base font-semibold">
            No results yet: tax figures not verified
          </H>
          <p>
            This needs figures for the {taxYearLabel(refusal.taxYear)} tax year that haven’t been checked against GOV.UK yet. Sumyard shows
            no results rather than guess.
          </p>
          <p className="font-medium">Not yet verified:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {groups.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
          <SheetLink route={{ kind: 'tax-data' }} className="inline-flex min-h-touch items-center self-start">
            See tax data
          </SheetLink>
        </div>
      </div>
    </section>
  )
}
