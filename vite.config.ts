/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { collectCredits, readCommit } from './scripts/build/credits.ts'
import { assertDocs } from './scripts/checks/docs.ts'
import { parseChangelog, releasedOnly } from './src/help/changelog.ts'

// GitHub Pages serves the app from /<repo>/, so the base path is injected at
// build time. Defaults to '/' for local dev and any root-hosted deploy.
const base = process.env.VITE_BASE || '/'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const readJson = (path: string) => JSON.parse(read(path))
const pkg = readJson('./package.json')
const installed = (name: string) => {
  const path = `./node_modules/${name}/package.json`
  return existsSync(fileURLToPath(new URL(path, import.meta.url))) ? readJson(path) : undefined
}

// What's new: CHANGELOG.md parsed here and injected as data, so the file (whose intro links to keepachangelog.com) isn't bundled.
const changelog = parseChangelog(read('./CHANGELOG.md'))
if (!changelog) throw new Error('CHANGELOG.md could not be parsed for What’s new (see src/help/changelog.ts)')

// Build details shown in About (see src/version.ts). Read once per build; no runtime requests.
const buildInfo = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_COMMIT__: JSON.stringify(readCommit((command) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())),
  __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  __APP_CREDITS__: JSON.stringify(collectCredits(pkg, installed)),
  __APP_CHANGELOG__: JSON.stringify(releasedOnly(changelog)),
}

/** Fails `vite build` when PLAN.md, CHANGELOG.md and package.json drift apart (scripts/checks/docs.ts). */
const docsGuard: Plugin = {
  name: 'sumyard-docs-guard',
  apply: 'build',
  buildStart() {
    assertDocs({
      plan: read('./PLAN.md'),
      changelog: read('./CHANGELOG.md'),
      packageJson: read('./package.json'),
      packageLock: read('./package-lock.json'),
    })
  },
}

export default defineConfig({
  base,
  plugins: [docsGuard, react(), tailwindcss()],
  define: buildInfo,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // .test.tsx files render components (with happy-dom, declared per file).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    exclude: ['scripts/checks/build-output.test.ts'],
  },
})
