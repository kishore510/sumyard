import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The danger colour means a warning. A chart line takes it only by naming the
 * `danger` style, so no source that builds chart series may name it unless
 * the line is a genuine warning, listed here with why. None is today.
 */

const SRC = join(import.meta.dirname, '..', '..')

/** File (relative to src/) to why its danger line is a genuine warning. */
const GENUINE_WARNINGS: Record<string, string> = {}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const chartSources = walk(SRC)
  .map((path) => ({ file: relative(SRC, path), source: readFileSync(path, 'utf8') }))
  .filter(({ file, source }) => !file.startsWith('components/Chart/') && /from '@\/components\/Chart(?:\/[\w]+)?'/.test(source))

describe('the danger colour on charts', () => {
  it('finds the chart sources (the scan is not empty)', () => {
    expect(chartSources.map((s) => s.file)).toEqual(
      expect.arrayContaining(['calculators/car-decision/chart.ts', 'calculators/compound-interest/results.ts']),
    )
  })

  it('no series takes the danger style unless it is a listed genuine warning', () => {
    const naming = chartSources.filter(({ source }) => /['"]danger['"]/.test(source)).map((s) => s.file)
    expect(naming.sort()).toEqual(Object.keys(GENUINE_WARNINGS).sort())
  })

  it('every listed warning still names the danger style and says why', () => {
    for (const [file, why] of Object.entries(GENUINE_WARNINGS)) {
      expect(why.trim(), file).not.toBe('')
      expect(chartSources.find((s) => s.file === file)?.source, file).toMatch(/['"]danger['"]/)
    }
  })
})
