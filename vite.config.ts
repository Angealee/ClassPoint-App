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
        // Pixel art used on the Student Space screens (see AstronautArt).
        'studentSpace.ico',
        'studentLounge.ico',
      ],
      workbox: {
        // Pull the push/notificationclick handlers into the generated SW.
        importScripts: ['push-sw.js'],
        // An OFFLINE navigation to /scan#… (a native camera scan with zero
        // signal on the installed PWA) must still boot the SPA shell so the
        // proof can be captured. Without this, the deep link 404s offline.
        navigateFallback: '/index.html',
        // …but never hijack API calls: let Supabase REST/Functions hit the
        // network (or fail) rather than serving them the app shell.
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
  build: {
    rollupOptions: {
      output: {
        /**
         * Three vendor chunks, split for CACHE LIFETIME rather than first-load size.
         *
         * All three are imported eagerly (App.tsx pulls MotionConfig, main.tsx pulls
         * the router, the api barrel pulls Supabase), so splitting them does NOT make
         * the first visit smaller. What it buys is that a normal app deploy, which
         * changes only our own code, no longer invalidates ~300KB of unchanged
         * dependency bytes. For an installed PWA that updates often, that is the
         * difference between a small update and a full re-download.
         *
         * react and react-dom MUST stay in one chunk together: separating a library
         * from its renderer is the classic way to get an initialisation-order crash.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Match on a path SEGMENT so 'react-is' or 'use-sync-external-store'
          // cannot be swept into the react chunk by a bare substring test.
          // Vite normalises module ids to POSIX separators on every platform.
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
