/*
 * Helpers for testing the pre-paint theme script in index.html (CI guard 8c).
 * Node-only: nothing in the app imports this file.
 */

/** The inline theme script's source, from the HTML. */
export function extractPrePaintScript(_html: string): string {
  throw new Error('not implemented')
}

/** Why the script might not run before first paint (empty when it will). */
export function prePaintScriptProblems(_html: string): string[] {
  throw new Error('not implemented')
}
