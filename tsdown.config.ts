import { defineConfig } from 'tsdown'

// Bundles the CLI and server. The UI is built separately by Vite into dist/ui, which the
// server serves at runtime.
export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node20.19',
  outDir: 'dist',
  clean: false,
  dts: false,
  // Everything is bundled, so the published package has no dependencies at all. A CLI
  // gains nothing from resolving its own tree in someone else's repo, and it costs them:
  // pnpm's release-age guard fires on any transitive dependency published in the last day.
  deps: {
    // A wildcard rather than a list that rots as dependencies change.
    onlyBundle: ['*', '@*/*'],
  },
})
