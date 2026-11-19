import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// ONNX runtime wasm (>25MB) is fetched from the CDN at runtime by Transformers.js,
// so the bundled copy is dropped to stay within free hosting file-size limits.
const dropBundledWasm = (): Plugin => ({
  name: 'drop-bundled-wasm',
  enforce: 'post',
  generateBundle(_, bundle) {
    for (const [name, file] of Object.entries(bundle)) {
      if (file.type === 'asset' && name.endsWith('.wasm')) delete bundle[name]
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dropBundledWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web/,
            handler: 'CacheFirst',
            options: { cacheName: 'ort-runtime', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      manifest: {
        name: 'Fast Recap AI',
        short_name: 'Recap',
        description: 'Record, transcribe and summarize meetings on-device.',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
