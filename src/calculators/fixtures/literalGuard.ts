import { readdirSync } from 'node:fs'

/*
 * The literal guard's scanner, shared by every engine folder's
 * literals.test.ts (test-only, like the rest of fixtures/). An engine holds no
 * figure of its own, so its code may use only the numbers 0, 1, 2 and 100;
 * comments and strings are checked for anything that looks like a money
 * amount, a percentage or a large number.
 */

export const ALLOWED = new Set(['0', '1', '2', '100'])

/** The engine in a folder: every TypeScript file except tests (its fixtures/ is test-only and not scanned). */
export const engineFiles = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()

export interface Split {
  /** Code with comments and string contents blanked out (template expressions kept). */
  readonly code: string
  /** The text of every comment and string. */
  readonly prose: readonly string[]
}

/** Splits TypeScript source into code and prose. Handles comments, quoted strings and template literals with ${} expressions. */
export function split(source: string): Split {
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
export const numbersIn = (code: string) => [...code.matchAll(NUMBER)].map((m) => m[0].replace(/_/g, '').replace(/n$/, ''))

/** Prose that reads like a figure: a pound amount, a percentage, a decimal, or a number of three or more digits other than 100. */
export const FIGURE = /£\s*\d|\d\s*%|\d+\s*per\s*cent|\d\.\d|(?<![\w.])(?!100(?![\d.,]))\d[\d,_]{2,}(?:\.\d+)?/i
