import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'app-logo.svg',
        'icon.svg',
        'icon-maskable.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
        'apple-touch-icon.png',
        'push-sw.js',
      ],
      workbox: {
        // Pull the push/notificationclick handlers into the generated SW.
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'ClassPoint',
        short_name: 'ClassPoint',
        description: 'Earn points, level up, climb the leaderboard.',
        theme_color: '#e11d2a',
        background_color: '#0d0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // PNGs first — Chromium requires a raster 192 + 512 to consider the app
        // installable (fire beforeinstallprompt) on many devices; the SVG is a
        // bonus for browsers that prefer it.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
