import { useEffect } from 'react'
import { ErrorState } from '@/components/states'
import { parseChangelogItem } from '@/help/changelog'
import { CHANGELOG } from '@/help/content'
import { InlineMarkdown } from '@/help/Markdown'
import { markThisVersionSeen } from '@/help/whatsNew'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/version'

/* What's new, from CHANGELOG.md (lifted from Chalkline's HelpSheet). Opening it clears the "New" marker. */

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function WhatsNewPage() {
  useEffect(() => {
    markThisVersionSeen()
  }, [])

  if (CHANGELOG.length === 0)
    return <ErrorState title="No release notes in this build">The list of changes is missing. Reloading may help.</ErrorState>

  return (
    <ol className="flex flex-col gap-5 pb-4">
      {CHANGELOG.map((release) => {
        const current = release.version === APP_VERSION
        return (
          <li
            key={release.version}
            className={cn('flex flex-col gap-2', current && 'rounded-lg border border-accent p-3')}
            aria-current={current ? 'true' : undefined}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-base font-semibold text-text">{release.version}</h3>
              {release.date && <span className="text-xs text-text-muted">{formatDate(release.date)}</span>}
              {current && <span className="rounded-full bg-accent px-2 text-xs font-semibold text-on-accent">This version</span>}
            </div>
            {release.sections.map((section) => (
              <section key={section.title} aria-label={`${release.version} ${section.title}`} className="flex flex-col gap-1">
                <h4 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{section.title}</h4>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text">
                  {section.items.map((item) => (
                    <li key={item}>
                      <InlineMarkdown nodes={parseChangelogItem(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </li>
        )
      })}
    </ol>
  )
}
