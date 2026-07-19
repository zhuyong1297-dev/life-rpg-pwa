import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/life-rpg-pwa/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '地球 Online',
        short_name: '地球Online',
        description: '把现实行动转化为即时成长反馈',
        theme_color: '#176b52',
        background_color: '#f4f6f3',
        display: 'standalone',
        start_url: '/life-rpg-pwa/',
        scope: '/life-rpg-pwa/',
        lang: 'zh-CN',
        icons: [
          { src: 'app-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
