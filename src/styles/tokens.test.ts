import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..')
const TOKENS_FILE = join(import.meta.dirname, 'tokens.css')
const tokensCss = readFileSync(TOKENS_FILE, 'utf8')

type Theme = 'light' | 'dark'

function block(selector: RegExp, label: string): string {
  const match = tokensCss.match(selector)
  if (!match?.[1]) throw new Error(`No ${label} block in tokens.css`)
  return match[1]
}

const paletteBlock = block(/\/\* ── Raw palette[^\n]*\n:root\s*\{([^}]*)\}/, 'palette')
const themeBlock = (theme: Theme) => block(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`), theme)

function declarations(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [, name, value] of css.matchAll(/--sy-([\w-]+):\s*([^;]+);/g)) out[name!] = value!.trim().toLowerCase()
  return out
}

const palette = declarations(paletteBlock)

/** A theme's semantic colours, resolved through the palette to hex. */
function readColours(theme: Theme): Record<string, string> {
  const colours: Record<string, string> = {}
  for (const [name, value] of Object.entries(declarations(themeBlock(theme)))) {
    const ref = value.match(/^var\(--sy-(palette-[\w-]+)\)$/)
    if (ref) colours[name] = palette[ref[1]!]!
  }
  return colours
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** `top` (#rrggbbaa or #rrggbb) blended over the opaque `base`. */
function composite(top: string, base: string): string {
  const alpha = top.length === 9 ? parseInt(top.slice(7, 9), 16) / 255 : 1
  const channel = (i: number) => Math.round(parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(base.slice(i, i + 2), 16) * (1 - alpha))
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`
}

// WCAG 2.1: 4.5:1 for text, 3:1 for UI components and graphics.
const TEXT = 4.5
const UI = 3

const PAIRS: [foreground: string, background: string, min: number][] = [
  ['text', 'bg', TEXT],
  ['text', 'surface', TEXT],
  ['text', 'surface-muted', TEXT],
  ['text-muted', 'bg', TEXT],
  ['text-muted', 'surface', TEXT],
  ['text-muted', 'surface-muted', TEXT],
  ['accent', 'surface', TEXT],
  ['accent', 'bg', TEXT],
  ['on-accent', 'accent', TEXT],
  ['on-accent', 'accent-hover', TEXT],
  ['danger', 'surface', TEXT],
  ['danger', 'bg', TEXT],
  ['on-danger', 'danger', TEXT],
  ['focus', 'bg', UI],
  ['focus', 'surface', UI],
  ['focus', 'surface-muted', UI],
  ['border-strong', 'surface', UI],
  ['border-strong', 'bg', UI],
  ['border-strong', 'surface-muted', UI],
  // Chart lines (graphics): the secondary line style's colour. Its labels are drawn in text.
  ['swatch-teal', 'surface', UI],
  ['swatch-teal', 'bg', UI],
  ['swatch-teal', 'surface-muted', UI],
]

/** Translucent colours, blended over what they sit on first. */
const COMPOSITES: [foreground: string, overlay: string, base: string, min: number][] = [
  // Selected toggles and list rows: accent icons and text on the subtle accent fill.
  ['accent', 'accent-subtle', 'surface', UI],
  ['text', 'accent-subtle', 'surface', TEXT],
  ['text-muted', 'accent-subtle', 'surface', TEXT],
]

describe('palette', () => {
  it('holds only hex colours', () => {
    expect(Object.keys(palette).length).toBeGreaterThan(0)
    for (const [name, value] of Object.entries(palette)) expect(value, name).toMatch(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/)
  })
})

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const declared = declarations(themeBlock(theme))
  const colours = readColours(theme)

  it('swaps only the semantic layer: every colour points at a palette token', () => {
    for (const [name, value] of Object.entries(declared)) {
      expect(name, 'themes must not redefine palette tokens').not.toMatch(/^palette-/)
      const ref = value.match(/^var\(--sy-(palette-[\w-]+)\)$/)
      expect(ref, `--sy-${name}: ${value}`).not.toBeNull()
      expect(palette[ref![1]!], `--sy-${ref![1]} is not in the palette`).toBeDefined()
    }
  })

  it('defines the same semantic tokens as the other theme', () => {
    const other = declarations(themeBlock(theme === 'light' ? 'dark' : 'light'))
    expect(Object.keys(declared).sort()).toEqual(Object.keys(other).sort())
  })

  it.each(PAIRS)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(colours[fg], `--sy-${fg} missing`).toMatch(/^#[0-9a-f]{6}$/)
    expect(colours[bg], `--sy-${bg} missing`).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrast(colours[fg]!, colours[bg]!)).toBeGreaterThanOrEqual(min)
  })

  it.each(COMPOSITES)('%s over %s (on %s) meets %s:1', (fg, overlay, base, min) => {
    expect(colours[overlay], `--sy-${overlay} missing`).toMatch(/^#[0-9a-f]{6,8}$/)
    const ratio = contrast(colours[fg]!, composite(colours[overlay]!, colours[base]!))
    expect(ratio, `${theme}: ${fg} over ${overlay} on ${base} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
  })
})

describe('no hard-coded design values outside tokens.css', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
    })
  }

  const RULES: [label: string, pattern: RegExp][] = [
    ['hex colour', /#[0-9a-f]{3,8}\b(?![-\w])/i],
    ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i],
    ['named colour', /:\s*(?:white|black|red|blue|green|gray|grey)\s*[;}]/i],
    ['Tailwind arbitrary value', /\b[a-z][\w-]*-\[(?!var\()[^\]]*\]/],
    [
      'Tailwind default palette',
      /\b(?:bg|text|border|fill|stroke|ring|outline)-(?:slate|gray|zinc|neutral|stone|red|blue|green|white|black)\b/,
    ],
    ['palette token outside tokens.css', /--sy-palette-/],
    ['px length in CSS', /:\s*[^;]*\b\d+(?:\.\d+)?px\b/],
  ]

  const files = walk(SRC).filter((file) => file !== TOKENS_FILE)

  it('scans some files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [relative(SRC, file), file]))('%s', (_name, file) => {
    const violations: string[] = []
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return
        for (const [label, pattern] of RULES) {
          if (label === 'px length in CSS' && !file.endsWith('.css')) continue
          if (pattern.test(line)) violations.push(`line ${index + 1}: ${label}: ${line.trim()}`)
        }
      })
    expect(violations).toEqual([])
  })
})
