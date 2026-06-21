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
      includeAssets: ['app-logo.svg', 'icon.svg', 'icon-maskable.svg', 'push-sw.js'],
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
        icons: [
          {
            src: 'app-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'app-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
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
