import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, engineFiles, FIGURE, numbersIn, split } from '../fixtures/literalGuard'

/*
 * Literal guard, as the other engines': the next pound composer holds no
 * figure of its own. Tax values come from config through requireVerified,
 * starting rates and bounds from src/lib/inputLimits.ts, the scan step from
 * src/lib/sweep.ts and calendar figures from src/lib/periods.ts, so its code
 * may use only the numbers 0, 1, 2 and 100, and its comments and strings
 * hold nothing that looks like a money amount, a percentage or a large
 * number (decision names such as CP3 are not figures).
 */

/*
 * The page (the C2 page rebuild): its headline, callout and break-even lines
 * are templates on the composer's numbers (screen.ts, above), so no string
 * or comment in the page component holds a figure either.
 */

const HERE = import.meta.dirname
const FILES = engineFiles(HERE)

describe('literal guard: the next pound composer', () => {
  it('finds the engine files', () => {
    expect(FILES).toEqual(['calc.ts', 'definition.ts', 'screen.ts', 'sources.ts', 'types.ts'])
  })

  it.each(FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})

describe('literal guard: the next pound page component', () => {
  it('has no figure in its comments or strings', () => {
    const { prose } = split(readFileSync(join(HERE, 'NextPoundPage.tsx'), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})
