import { defineConfig } from 'vitest/config'

// Checks on the built site in dist/ (run by `npm run build`, after vite build).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/checks/build-output.test.ts'],
  },
})
