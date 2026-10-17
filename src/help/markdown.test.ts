import { describe, expect, it } from 'vitest'
import { inlineText, linksIn, parseInline, parseMarkdown } from './markdown'

describe('parseInline', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('Press `Esc` to **close**, see _tips_ and [settings](help:settings).')).toEqual([
      { type: 'text', text: 'Press ' },
      { type: 'code', text: 'Esc' },
      { type: 'text', text: ' to ' },
      { type: 'strong', children: [{ type: 'text', text: 'close' }] },
      { type: 'text', text: ', see ' },
      { type: 'em', children: [{ type: 'text', text: 'tips' }] },
      { type: 'text', text: ' and ' },
      { type: 'link', href: 'help:settings', children: [{ type: 'text', text: 'settings' }] },
      { type: 'text', text: '.' },
    ])
  })

  it('keeps underscores inside words as text', () => {
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }])
  })

  it('drops unsafe and non-GOV.UK link targets but keeps their text', () => {
    expect(
      parseInline('[click](javascript:alert(1)) [x](http://insecure.example) [y](https://example.com) [ok](https://www.gov.uk/x)'),
    ).toEqual([
      { type: 'text', text: 'click) x y ' },
      { type: 'link', href: 'https://www.gov.uk/x', children: [{ type: 'text', text: 'ok' }] },
    ])
    expect(parseInline('[no](https://www.gov.uk.example.com/x)')).toEqual([{ type: 'text', text: 'no' }])
  })

  it('treats HTML as plain text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)>' }])
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists and tips', () => {
    const blocks = parseMarkdown(`## Title

First line
continues here.

- one
- two
  wraps

1. first
2. second

> A tip
> over two lines.

### Sub`)
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'tip', 'heading'])
    expect(inlineText((blocks[1] as Extract<(typeof blocks)[number], { type: 'paragraph' }>).children)).toBe('First line continues here.')
    const bullets = blocks[2] as Extract<(typeof blocks)[number], { type: 'list' }>
    expect(bullets.ordered).toBe(false)
    expect(bullets.items.map(inlineText)).toEqual(['one', 'two wraps'])
    expect((blocks[3] as typeof bullets).ordered).toBe(true)
    expect(inlineText((blocks[4] as Extract<(typeof blocks)[number], { type: 'tip' }>).children)).toBe('A tip over two lines.')
  })

  it('collects link targets', () => {
    expect(linksIn(parseMarkdown('See [a](help:a).\n\n- **[b](help:b)**\n\n> [c](https://www.gov.uk/c)'))).toEqual([
      'help:a',
      'help:b',
      'https://www.gov.uk/c',
    ])
  })
})
