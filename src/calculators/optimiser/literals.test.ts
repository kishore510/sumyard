import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Literal guard: the engine holds no tax figure of its own. Every rate,
 * threshold and allowance comes from the config through requireVerified, so
 * the engine's code may use only the numbers 0, 1, 2 and 100. Comments and
 * strings are checked separately for anything that looks like a money amount,
 * a percentage or a large number.
 */

const ALLOWED = new Set(['0', '1', '2', '100'])
const HERE = import.meta.dirname

/** The engine: every TypeScript file in this folder except tests (fixtures/ is test-only and not scanned). */
const ENGINE_FILES = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .sort()

interface Split {
  /** Code with comments and string contents blanked out (template expressions kept). */
  readonly code: string
  /** The text of every comment and string. */
  readonly prose: readonly string[]
}

/** Splits TypeScript source into code and prose. Handles comments, quoted strings and template literals with ${} expressions. */
function split(source: string): Split {
  let code = ''
  const prose: string[] = []
  const templateDepth: number[] = []
  let braces = 0
  let i = 0
  const readQuoted = (quote: string) => {
    let text = ''
    i++
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') text += source[i++]
      text += source[i++] ?? ''
    }
    i++
    prose.push(text)
    code += `${quote}${quote}`
  }
  const readTemplate = () => {
    // Reads template text up to the closing backtick or a ${, which hands back to code.
    let text = ''
    while (i < source.length) {
      const c = source[i]
      if (c === '\\') {
        text += source.slice(i, i + 2)
        i += 2
      } else if (c === '`') {
        i++
        code += '`'
        break
      } else if (c === '$' && source[i + 1] === '{') {
        i += 2
        code += '${'
        templateDepth.push(braces)
        braces++
        break
      } else {
        text += c
        i++
      }
    }
    prose.push(text)
  }
  while (i < source.length) {
    const c = source[i]!
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      prose.push(source.slice(i + 2, end < 0 ? undefined : end))
      i = end < 0 ? source.length : end
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      prose.push(source.slice(i + 2, end < 0 ? undefined : end))
      i = end < 0 ? source.length : end + 2
      code += ' '
    } else if (c === "'" || c === '"') {
      readQuoted(c)
    } else if (c === '`') {
      code += '`'
      i++
      readTemplate()
    } else if (c === '{') {
      braces++
      code += c
      i++
    } else if (c === '}') {
      braces--
      code += c
      i++
      if (templateDepth.length > 0 && templateDepth.at(-1) === braces) {
        templateDepth.pop()
        readTemplate()
      }
    } else {
      code += c
      i++
    }
  }
  return { code, prose }
}

const NUMBER = /(?<![\w$.])(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)n?(?![\w$])/g

/** Numeric literals in code, normalised (underscores and the BigInt suffix dropped). */
const numbersIn = (code: string) => [...code.matchAll(NUMBER)].map((m) => m[0].replace(/_/g, '').replace(/n$/, ''))

/** Prose that reads like a figure: a pound amount, a percentage, a decimal, or a number of three or more digits other than 100. */
const FIGURE = /£\s*\d|\d\s*%|\d+\s*per\s*cent|\d\.\d|(?<![\w.])(?!100(?![\d.,]))\d[\d,_]{2,}(?:\.\d+)?/i

describe('literal guard: the engine source', () => {
  it('finds the engine files', () => {
    expect(ENGINE_FILES).toEqual(expect.arrayContaining(['calc.ts', 'types.ts']))
  })

  it.each(ENGINE_FILES)('%s uses no numeric literal other than 0, 1, 2 and 100', (name) => {
    const { code } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(numbersIn(code).filter((n) => !ALLOWED.has(n))).toEqual([])
  })

  it.each(ENGINE_FILES)('%s has no figure in its comments or strings', (name) => {
    const { prose } = split(readFileSync(join(HERE, name), 'utf8'))
    expect(prose.filter((text) => FIGURE.test(text))).toEqual([])
  })
})

describe('literal guard: the scanner itself', () => {
  it('finds literals in code, including inside template expressions', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the sample source holds a template literal on purpose
    const { code } = split('const a = 3 + 0.5 * 1_000 + 12n + 0x10 + .25 + 1e3; const t = `x ${a * 7} y`; x.y2(z[4])')
    expect(numbersIn(code)).toEqual(['3', '0.5', '1000', '12', '0x10', '.25', '1e3', '7', '4'])
  })

  it('ignores identifiers and the allowed numbers, and keeps comments and strings out of code', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the sample source holds a template literal on purpose
    const { code, prose } = split("const plan2 = f(0, 1, 2, 100) // 37 here\n/* 42 */ const s = '12,570' + \"9%\" + `£5 ${'x'}`")
    expect(numbersIn(code)).toEqual(['0', '1', '2', '100'])
    expect(prose).toEqual([' 37 here', ' 42 ', '12,570', '9%', '£5 ', 'x', ''])
  })

  it('flags figures in prose but not ordinary words or small labels', () => {
    for (const text of ['£12', '20%', '45 per cent', '12,570', '1000', '3.141']) expect(FIGURE.test(text)).toBe(true)
    for (const text of ['slice 1a, session F', 'plan 2', 'between 100 and', 'a twelfth', 'O5']) expect(FIGURE.test(text)).toBe(false)
  })
})
