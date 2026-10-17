import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prePaintScriptProblems } from '../../src/lib/themeScript'
import { INERT_URLS, scanDir, textFiles } from './externalUrls'

/* Runs after `vite build` (see the build script). Fails the build, and so CI and deploy. */

const DIST = join(import.meta.dirname, '..', '..', 'dist')

describe('built output', () => {
  it('exists', () => {
    expect(existsSync(join(DIST, 'index.html'))).toBe(true)
  })

  it('contains no external URL outside the allowlist', () => {
    expect(scanDir(DIST)).toEqual([])
  })

  it('needs every inert allowlist entry (a stale entry fails, so the list only shrinks)', () => {
    const files = textFiles(DIST).map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    for (const [url, { fileType }] of Object.entries(INERT_URLS)) {
      expect(
        files.some((f) => f.path.endsWith(fileType) && f.text.includes(url)),
        `${url} is no longer in any ${fileType} file: remove it from INERT_URLS`,
      ).toBe(true)
    }
  })

  it('bundles What’s new for this version and no raw CHANGELOG.md (its intro has a link)', () => {
    const js = textFiles(DIST)
      .filter((p) => p.endsWith('.js'))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n')
    const version = JSON.parse(readFileSync(join(DIST, '..', 'package.json'), 'utf8')).version
    expect(js).toContain(`"${version}"`)
    expect(js).not.toContain('keepachangelog.com')
  })

  it('applies the theme before first paint (inline script first in <head>)', () => {
    expect(prePaintScriptProblems(readFileSync(join(DIST, 'index.html'), 'utf8'))).toEqual([])
  })
})
