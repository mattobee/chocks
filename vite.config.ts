import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export function isSameOrigin(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// Builds only the UI. The server and its entry point are bundled separately by tsdown.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: 'src/ui/routes',
      generatedRouteTree: 'src/ui/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Shipped inside the package next to the compiled server, which serves it.
    outDir: 'dist/ui',
    emptyOutDir: true,
  },
  server: {
    // `pnpm dev:server` runs the API on 2457; this keeps the app on one origin.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2457',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest, request) => {
            const origin = request.headers.origin
            const host = request.headers.host
            if (origin === undefined || host === undefined) return
            if (isSameOrigin(origin, host)) {
              proxyRequest.setHeader('Origin', 'http://127.0.0.1:2457')
            }
          })
        },
        ws: false,
      },
    },
  },
})
