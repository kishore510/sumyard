import { type ChangelogRelease, releasedOnly } from './changelog'
import { buildTopics } from './topics'

/*
 * The help content, bundled at build time. Only the lazily loaded sheet pages
 * import this, so none of it is part of the initial download.
 *
 * Topics come from content/help/*.md (README.md there is for maintainers).
 * What's new comes from CHANGELOG.md, parsed in vite.config.ts and injected
 * as data: the file itself isn't bundled, because its intro links to the
 * Keep a Changelog site and the build may contain no such URL.
 */

const files = import.meta.glob<string>(['../../content/help/*.md', '!../../content/help/README.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const HELP_TOPICS = buildTopics(files)

export const topicById = (id: string) => HELP_TOPICS.find((t) => t.id === id)

/** Released versions, newest first (the build fails if CHANGELOG.md can't be parsed). */
export const CHANGELOG: ChangelogRelease[] = releasedOnly(typeof __APP_CHANGELOG__ === 'undefined' ? [] : __APP_CHANGELOG__)
