import { type Block, parseMarkdown } from './markdown'

/*
 * Help topics: one Markdown file per topic in content/help/, each starting
 * with a small front matter block:
 *
 *   ---
 *   title: Quick start
 *   order: 1
 *   summary: What Sumyard is and what works today.
 *   ---
 *
 * The file name (without .md) is the topic id, used in `help:` links and in
 * the #/help/<id> route. Generalised from Chalkline's src/help/topics.ts
 * (summary instead of search keywords; no Zod).
 */

export interface FrontMatter {
  title: string
  order: number
  summary: string
}

export interface HelpTopic extends FrontMatter {
  id: string
  blocks: Block[]
}

const FIELDS = ['title', 'order', 'summary'] as const

/** Splits off and checks the front matter. Throws with the reason if it's missing or invalid. */
export function parseFrontMatter(source: string): { meta: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) throw new Error('missing front matter')
  const fields: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue
    const field = /^(\w+):\s*(.*)$/.exec(line)
    if (!field) throw new Error(`bad front matter line: ${line}`)
    if (!FIELDS.includes(field[1] as (typeof FIELDS)[number])) throw new Error(`unknown front matter field: ${field[1]}`)
    fields[field[1]!] = field[2]!.trim()
  }
  const order = Number(fields.order)
  if (!fields.title) throw new Error('front matter needs a title')
  if (!fields.summary) throw new Error('front matter needs a summary')
  if (!Number.isInteger(order)) throw new Error('front matter needs a whole-number order')
  return { meta: { title: fields.title, order, summary: fields.summary }, body: match[2]! }
}

const TOPIC_ID = /^[a-z0-9-]+$/

/** Builds topics from `{ path: raw markdown }`, sorted by `order`. Throws (failing the build) on a bad file. */
export function buildTopics(files: Record<string, string>): HelpTopic[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const id = path.split('/').at(-1)!.replace(/\.md$/, '')
      if (!TOPIC_ID.test(id)) throw new Error(`${path}: topic file names must be lower-case-with-hyphens`)
      try {
        const { meta, body } = parseFrontMatter(raw)
        return { id, ...meta, blocks: parseMarkdown(body) }
      } catch (error) {
        throw new Error(`${path}: ${(error as Error).message}`)
      }
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}
