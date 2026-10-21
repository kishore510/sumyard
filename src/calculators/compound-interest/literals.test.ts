import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the optimiser's: the compound interest engine holds no
 * figure of its own. Calendar divisors come from src/lib/periods.ts and input
 * bounds from src/lib/inputLimits.ts, so the engine's code may use only the
 * numbers 0, 1, 2 and 100, and its comments and strings hold nothing that
 * looks like a money amount, a percentage or a large number.
 */

const HERE = import.meta.dirname
const ENGINE_FILES = engineFiles(HERE)
/** The page and its definition (slice 2b) are held to the same rule: every figure comes from the engine, lib or Settings. */
const PAGE_FILES = ['CompoundPage.tsx']

describe('literal guard: the compound interest engine', () => {
  it('finds the engine files', () => {
    expect(ENGINE_FILES).toEqual(['calc.ts', 'definition.ts', 'results.ts', 'types.ts'])
  })

  it.each([...ENGINE_FILES, ...PAGE_FILES])('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each([...ENGINE_FILES, ...PAGE_FILES])('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})
