/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the app from /<repo>/, so the base path is injected at
// build time. Defaults to '/' for local dev and any root-hosted deploy.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
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
