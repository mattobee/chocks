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
  deps: {
    // Resolve these from node_modules at runtime rather than inlining them.
    neverBundle: ['hono', '@hono/node-server', 'chokidar', 'yaml'],
  },
})
