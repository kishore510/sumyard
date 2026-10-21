import { describe, expect, it } from 'vitest'
import { parseHash } from '@/sheets/route'
import { HELP_TOPICS, topicById } from './content'
import { linksIn } from './markdown'
import { buildTopics, parseFrontMatter } from './topics'

describe('parseFrontMatter', () => {
  it('reads title, order and summary', () => {
    expect(parseFrontMatter('---\ntitle: Quick start\norder: 1\nsummary: Start here.\n---\nBody')).toEqual({
      meta: { title: 'Quick start', order: 1, summary: 'Start here.' },
      body: 'Body',
    })
  })

  it.each([
    ['no front matter', 'Body'],
    ['no title', '---\norder: 1\nsummary: s\n---\n'],
    ['no summary', '---\ntitle: t\norder: 1\n---\n'],
    ['bad order', '---\ntitle: t\norder: first\nsummary: s\n---\n'],
    ['unknown field', '---\ntitle: t\norder: 1\nsummary: s\nkeywords: a\n---\n'],
    ['bad line', '---\ntitle t\n---\n'],
  ])('rejects %s', (_label, source) => {
    expect(() => parseFrontMatter(source)).toThrow()
  })
})

describe('buildTopics', () => {
  it('sorts by order and names topics after their files', () => {
    const topics = buildTopics({
      'content/help/b.md': '---\ntitle: B\norder: 2\nsummary: s\n---\n',
      'content/help/a.md': '---\ntitle: A\norder: 1\nsummary: s\n---\n',
    })
    expect(topics.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('names the file when one is bad', () => {
    expect(() => buildTopics({ 'content/help/x.md': 'no front matter' })).toThrow(/x\.md/)
  })
})

describe('content/help', () => {
  it('has Quick start first, then the take-home topic (1b-i) and the optimiser topic (1b-ii-b), then the slice 0 topics', () => {
    expect(HELP_TOPICS.map((t) => t.id)).toEqual([
      'quick-start',
      'take-home-pay',
      'pension-optimiser',
      'scenarios-and-saving',
      'tax-data-and-last-verified',
      'troubleshooting',
    ])
  })

  it('the take-home topic covers the payslip caveat, flex cash, benefits and deductions, and links to the optimiser topic', () => {
    const text = JSON.stringify(topicById('take-home-pay')!.blocks)
    for (const word of [/payslip/i, /flex/i, /benefits in kind/i, /post-tax deductions/i, /salary/i]) expect(text).toMatch(word)
    expect(text).not.toMatch(/coming/i)
    expect(linksIn(topicById('take-home-pay')!.blocks)).toContain('help:pension-optimiser')
  })

  it('the optimiser topic covers reading the chart: period, zoom, change, cost, thresholds, warnings, childcare, compare, what is not modelled', () => {
    const text = JSON.stringify(topicById('pension-optimiser')!.blocks)
    for (const word of [
      /Month/,
      /Full range/,
      /Change vs now/,
      /a pound more/i,
      /against no contribution/i,
      /since the previous point/i,
      /already under/i,
      /out of reach/i,
      /a penny below/i,
      /warnings/i,
      /never a cap|not capped|no contribution is stopped/i,
      /childcare/i,
      /not checked/i,
      /compare/i,
      /not modelled/i,
      /no point is called the best/i,
    ])
      expect(text).toMatch(word)
    expect(text).not.toMatch(/coming/i)
  })

  it('no topic mentions the removed Hello calculator', () => {
    for (const topic of HELP_TOPICS) expect(JSON.stringify(topic.blocks), topic.id).not.toMatch(/Hello/)
  })

  it('links only to topics and sheets that exist (no external links)', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id))
    for (const topic of HELP_TOPICS) {
      for (const href of linksIn(topic.blocks)) {
        expect(href, `${topic.id} links to ${href}`).toMatch(/^(?:help|sheet):/)
        if (href.startsWith('help:')) expect(ids.has(href.slice(5)), `${topic.id} links to ${href}`).toBe(true)
        else expect(parseHash(`#/${href.slice(6)}`), `${topic.id} links to ${href}`).not.toBeNull()
      }
    }
  })

  it('the tax data topic links to the Tax data screen', () => {
    expect(linksIn(topicById('tax-data-and-last-verified')!.blocks)).toContain('sheet:tax-data')
  })

  it('describes saving as it is now: scenarios, export, import, backup and restore exist', () => {
    const text = JSON.stringify(topicById('scenarios-and-saving')!.blocks)
    for (const word of [/export/i, /import/i, /backup/i, /restore/i, /compare/i, /undo/i]) expect(text).toMatch(word)
    for (const topic of HELP_TOPICS) expect(JSON.stringify(topic.blocks), topic.id).not.toMatch(/not built yet|Coming soon/i)
  })

  it('states no money amounts or percentages (tax figures belong in config, not Help)', () => {
    for (const topic of HELP_TOPICS) {
      const text = JSON.stringify(topic.blocks)
      expect(text, topic.id).not.toMatch(/£\s?\d|\d\s?%|\d+\s?(?:per ?cent|pence|p\b)/i)
    }
  })
})
