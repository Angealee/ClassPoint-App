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
        'studentSpace.ico',
        'studentLounge.ico',
      ],
      workbox: {
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest/, /^\/functions/, /^\/auth/],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion/')) return 'vendor-motion'
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
