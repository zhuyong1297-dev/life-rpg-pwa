import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview'
  const base = isPreview ? '/life-rpg-pwa/preview/' : '/life-rpg-pwa/'
  const siteUrl = `https://zhuyong1297-dev.github.io${base}`

  return {
    base,
    plugins: [
      {
        name: 'social-metadata',
        transformIndexHtml: (html) => html
          .replaceAll('__SOCIAL_URL__', siteUrl)
          .replaceAll('__SOCIAL_IMAGE__', `${siteUrl}share-preview.png`),
      },
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: isPreview ? '地球 Online V5 预览版' : '地球 Online',
          short_name: isPreview ? '地球V5预览' : '地球Online',
          description: isPreview ? '使用独立本地数据的地球 Online V5 预览体验' : '把现实行动转化为即时成长反馈',
          theme_color: isPreview ? '#146b50' : '#176b52',
          background_color: '#f4f6f3',
          display: 'standalone',
          start_url: base,
          scope: base,
          lang: 'zh-CN',
          icons: [
            { src: 'app-icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'any' },
            { src: 'app-icon.png', sizes: '1254x1254', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          ...(!isPreview && { navigateFallbackDenylist: [/^\/life-rpg-pwa\/preview(?:\/|$)/] }),
        },
      }),
    ],
  }
})
