import { Info, Rocket, Settings, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { HELP_TOPICS, topicById } from '@/help/content'
import { Markdown } from '@/help/Markdown'
import { unseenStore } from '@/help/whatsNew'
import { useStore } from '@/lib/store'
import { APP_VERSION } from '@/version'
import { sheets } from './navigation'
import { NavRow, SectionTitle } from './parts'
import { parseHash } from './route'

const QUICK_START = 'quick-start'

/** Help home: a Quick start card, the topic list, and More (What's new, Settings, About). No search in slice 0. */
export function HelpPage() {
  const unseen = useStore(unseenStore)
  const nav = sheets()
  const quickStart = topicById(QUICK_START)
  const others = HELP_TOPICS.filter((t) => t.id !== QUICK_START)

  return (
    <div className="flex flex-col gap-5 pb-4">
      {HELP_TOPICS.length === 0 ? (
        <EmptyState title="No help topics found">
          The help pages are missing from this build. What’s new, Settings and About still work.
        </EmptyState>
      ) : (
        <>
          {quickStart && (
            <button
              type="button"
              onClick={() => nav.open({ kind: 'topic', id: quickStart.id })}
              className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-accent-subtle p-4 text-left transition-colors hover:border-accent"
            >
              <Rocket aria-hidden="true" className="size-6 shrink-0 text-accent" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-text">{quickStart.title}</span>
                <span className="text-xs text-text-muted">{quickStart.summary}</span>
              </span>
            </button>
          )}
          <section aria-labelledby="help-topics" className="flex flex-col gap-1">
            <SectionTitle id="help-topics">Topics</SectionTitle>
            <ul className="flex flex-col">
              {others.map((t) => (
                <NavRow key={t.id} title={t.title} detail={t.summary} onClick={() => nav.open({ kind: 'topic', id: t.id })} />
              ))}
            </ul>
          </section>
        </>
      )}
      <section aria-labelledby="help-more" className="flex flex-col gap-1">
        <SectionTitle id="help-more">More</SectionTitle>
        <ul className="flex flex-col">
          <NavRow
            icon={<Sparkles />}
            title="What’s new"
            detail={`Version ${APP_VERSION}`}
            badge={unseen ? 'New' : undefined}
            onClick={() => nav.open({ kind: 'whats-new' })}
          />
          <NavRow
            icon={<Settings />}
            title="Settings"
            detail="Theme, region, tax year and how amounts are shown"
            onClick={() => nav.open({ kind: 'settings' })}
          />
          <NavRow
            icon={<Info />}
            title="About Sumyard"
            detail="Version, storage, privacy and credits"
            onClick={() => nav.open({ kind: 'about' })}
          />
        </ul>
      </section>
    </div>
  )
}

export function TopicPage({ id }: { id: string }) {
  const topic = topicById(id)
  const nav = sheets()
  if (!topic) {
    return (
      <EmptyState
        title="This topic isn’t available"
        action={
          <Button variant="secondary" onClick={nav.back}>
            All help topics
          </Button>
        }
      >
        The link may be from an older version of Sumyard.
      </EmptyState>
    )
  }
  return (
    <div className="pb-4">
      <Markdown
        blocks={topic.blocks}
        onTopic={(next) => {
          const sheet = next.startsWith('sheet:') ? parseHash(`#/${next.slice(6)}`) : null
          nav.open(sheet ?? { kind: 'topic', id: next })
        }}
      />
    </div>
  )
}
