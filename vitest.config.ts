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
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/{lib,store,server}/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.tsx'],
          setupFiles: ['./src/ui/test-setup.ts'],
        },
      },
    ],
  },
})
