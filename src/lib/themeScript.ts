/*
 * Helpers for testing the pre-paint theme script in index.html (CI guard 8c).
 * Node-only: nothing in the app imports this file.
 */

const MARKER = 'sumyard:pre-paint-theme'
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

/** The inline theme script's source, from the HTML (found by its marker comment). */
export function extractPrePaintScript(html: string): string {
  for (const [, , body] of html.matchAll(SCRIPT)) if (body!.includes(MARKER)) return body!
  throw new Error(`No inline script marked ${MARKER}`)
}

/**
 * Why the script might not run before first paint (empty when it will). It
 * must be a classic inline script (no src, module, defer or async) inside
 * <head>, ahead of every stylesheet and script, so it sets data-theme before
 * the browser has anything to paint.
 */
export function prePaintScriptProblems(html: string): string[] {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  if (head === undefined) return ['No <head>']
  const match = [...head.matchAll(SCRIPT)].find(([, , body]) => body!.includes(MARKER))
  if (!match) return [`No inline script marked ${MARKER} in <head>`]

  const problems: string[] = []
  const attrs = match[1]!
  if (/\b(?:src|defer|async)\b/i.test(attrs)) problems.push(`The theme script must be inline and blocking, not <script${attrs}>`)
  if (/\btype\s*=\s*["']?(?!text\/javascript)/i.test(attrs))
    problems.push(`The theme script must be a classic script, not <script${attrs}>`)

  const before = head.slice(0, match.index)
  if (/<script\b/i.test(before)) problems.push('Another script runs before the theme script')
  if (/<link\b[^>]*rel\s*=\s*["']?(?:stylesheet|modulepreload)/i.test(before) || /<style\b/i.test(before)) {
    problems.push('A stylesheet loads before the theme script')
  }
  return problems
}
