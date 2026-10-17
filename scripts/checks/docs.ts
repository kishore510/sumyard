/*
 * Docs drift check (CI guard 8a). Pure: takes the file contents, returns a
 * list of problems (empty when PLAN.md, CHANGELOG.md and package.json agree).
 */

export interface DocsInput {
  plan: string
  changelog: string
  packageJson: string
  packageLock?: string
}

export function checkDocs(_input: DocsInput): string[] {
  throw new Error('not implemented')
}
