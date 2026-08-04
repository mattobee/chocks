import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

/**
 * Two projects, one command.
 *
 * The store, server and pure logic run in node, where they belong. Components need a DOM,
 * but running everything in jsdom would slow the majority down and let a browser global
 * mask a bug in code that never runs in a browser.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/ui/routeTree.gen.ts'],
      thresholds: {
        'src/store/**': {
          statements: 90,
          branches: 85,
          functions: 95,
          lines: 90,
        },
        'src/server/**': {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/*.test.ts', 'src/{lib,store,server}/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          // `.ts` as well, so UI logic with no JSX in it doesn't have to pretend otherwise.
          include: ['src/ui/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/ui/test-setup.ts'],
        },
      },
    ],
  },
})
