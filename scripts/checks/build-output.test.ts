import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prePaintScriptProblems } from '../../src/lib/themeScript'
import { scanDir } from './externalUrls'

/* Runs after `vite build` (see the build script). Fails the build, and so CI and deploy. */

const DIST = join(import.meta.dirname, '..', '..', 'dist')

describe('built output', () => {
  it('exists', () => {
    expect(existsSync(join(DIST, 'index.html'))).toBe(true)
  })

  it('contains no external URL outside the allowlist', () => {
    expect(scanDir(DIST)).toEqual([])
  })

  it('applies the theme before first paint (inline script first in <head>)', () => {
    expect(prePaintScriptProblems(readFileSync(join(DIST, 'index.html'), 'utf8'))).toEqual([])
  })
})
