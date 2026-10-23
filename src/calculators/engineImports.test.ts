import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The engine import guard (CP9, docs/modelling-decisions.md). For each
 * folder under src/calculators/ with a calc.ts, every relative and @/ import
 * is followed from calc.ts, transitively, through the engine's own files
 * (tests, fixtures/ and pages are never part of an engine). Each file reached
 * must be in that folder, in src/lib/, or in src/config/tax/ (not its
 * fixtures/), or be one of the named entry points of another calculator
 * allowed for that folder. An allowed entry point is checked by its own
 * folder's rule, not followed further from here. The guard fails on a new
 * cross-calculator import, on an allow-list entry no import uses, and on a
 * page module (definition.ts, a .tsx file) reached from an engine. Folders
 * without a calc.ts (car-decision/) are pages and outside it.
 */

const SRC = resolve(import.meta.dirname, '..')
const CALCULATORS = join(SRC, 'calculators')

/** CLAUDE.md, Architecture rules: the two named exceptions. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  'car-ownership': ['car-finance/calc.ts', 'car-finance/types.ts'],
  'next-pound': [
    'optimiser/calc.ts',
    'optimiser/types.ts',
    'mortgage/calc.ts',
    'mortgage/types.ts',
    'compound-interest/calc.ts',
    'compound-interest/types.ts',
  ],
}

/** Source text by path relative to src/; a test can add or change files without touching the disk. */
type Sources = ReadonlyMap<string, string>

function readSources(): Sources {
  const files = new Map<string, string>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(name)) files.set(relative(SRC, full), readFileSync(full, 'utf8'))
    }
  }
  walk(SRC)
  return files
}

const IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g

/** The local files a source imports, as paths relative to src/ (packages are not followed). */
function importsOf(path: string, sources: Sources): string[] {
  const out: string[] = []
  for (const match of sources.get(path)!.matchAll(IMPORT)) {
    const spec = match[1]!
    const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? relative(SRC, resolve(SRC, dirname(path), spec)) : null
    if (base === null) continue
    const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => sources.has(candidate))
    if (found === undefined) throw new Error(`${path}: cannot resolve ${spec}`)
    out.push(found)
  }
  return out
}

const isPage = (path: string) => path.endsWith('.tsx') || path.endsWith('/definition.ts')
const isTestOnly = (path: string) => path.endsWith('.test.ts') || path.split('/').includes('fixtures')

interface GuardResult {
  readonly violations: readonly string[]
  /** Allowed entry points each engine's files import. */
  readonly used: Readonly<Record<string, readonly string[]>>
}

/** Every engine folder's imports, against its rule. */
function checkEngineImports(sources: Sources, allowList: Readonly<Record<string, readonly string[]>> = ALLOWED): GuardResult {
  const engines = [...sources.keys()]
    .filter((p) => /^calculators\/[^/]+\/calc\.ts$/.test(p))
    .map((p) => p.split('/')[1]!)
    .sort()
  const violations: string[] = []
  const used: Record<string, string[]> = {}
  for (const engine of engines) {
    const allowed = new Set((allowList[engine] ?? []).map((entry) => `calculators/${entry}`))
    const seen = new Set<string>()
    const queue = [`calculators/${engine}/calc.ts`]
    used[engine] = []
    while (queue.length > 0) {
      const file = queue.shift()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const target of importsOf(file, sources)) {
        const where = `${engine}: ${file} imports ${target}`
        if (isPage(target)) violations.push(`${where} (a page module)`)
        else if (isTestOnly(target)) violations.push(`${where} (test-only)`)
        else if (allowed.has(target)) {
          if (!used[engine].includes(target)) used[engine].push(target)
        } else if (target.startsWith(`calculators/${engine}/`) || target.startsWith('lib/') || target.startsWith('config/tax/'))
          queue.push(target)
        else violations.push(where)
      }
    }
    for (const entry of allowed) if (!used[engine].includes(entry)) violations.push(`${engine}: allowed ${entry} is not imported`)
  }
  for (const engine of Object.keys(allowList)) if (!engines.includes(engine)) violations.push(`${engine}: allowed, but has no calc.ts`)
  return { violations, used }
}

const SOURCES = readSources()

describe('engine import guard (CP9)', () => {
  it('no engine imports another calculator, a page module or test code, beyond the two named exceptions', () => {
    expect(checkEngineImports(SOURCES).violations).toEqual([])
  })

  it('checks every folder with a calc.ts, and only those', () => {
    const engines = readdirSync(CALCULATORS).filter((d) => existsSync(join(CALCULATORS, d, 'calc.ts')))
    expect(Object.keys(checkEngineImports(SOURCES).used).sort()).toEqual(engines.sort())
    expect(engines).not.toContain('car-decision')
  })

  it('every allow-list entry is used', () => {
    const { used } = checkEngineImports(SOURCES)
    for (const [engine, entries] of Object.entries(ALLOWED))
      expect([...(used[engine] ?? [])].sort()).toEqual(entries.map((e) => `calculators/${e}`).sort())
  })

  it('fails on a new cross-calculator import', () => {
    const changed = new Map(SOURCES)
    changed.set('calculators/budget/calc.ts', `import { overpay } from '../mortgage/calc'\n${SOURCES.get('calculators/budget/calc.ts')!}`)
    expect(checkEngineImports(changed).violations).toEqual(['budget: calculators/budget/calc.ts imports calculators/mortgage/calc.ts'])
  })

  it('fails on an import reached through an engine’s own file, and on a page module', () => {
    const changed = new Map(SOURCES)
    changed.set(
      'calculators/next-pound/types.ts',
      `${SOURCES.get('calculators/next-pound/types.ts')!}\nimport type { X } from '../budget/types'\n`,
    )
    changed.set(
      'calculators/mortgage/calc.ts',
      `import { mortgageCalculator } from './definition'\n${SOURCES.get('calculators/mortgage/calc.ts')!}`,
    )
    expect(checkEngineImports(changed).violations).toEqual([
      'mortgage: calculators/mortgage/calc.ts imports calculators/mortgage/definition.ts (a page module)',
      'next-pound: calculators/next-pound/types.ts imports calculators/budget/types.ts',
    ])
  })

  it('fails on an allow-list entry nothing uses', () => {
    const wider = { ...ALLOWED, 'next-pound': [...ALLOWED['next-pound']!, 'budget/calc.ts'], ghost: ['budget/calc.ts'] }
    expect(checkEngineImports(SOURCES, wider).violations).toEqual([
      'next-pound: allowed calculators/budget/calc.ts is not imported',
      'ghost: allowed, but has no calc.ts',
    ])
  })
})
