import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 部署基路径：
 *  - 本地 / 根域名部署：默认 '/'
 *  - GitHub Pages 子路径部署：构建时传入 BASE_PATH=/<repo>/
 */
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      // 单测环境不启用（避免 vitest 解析 virtual:pwa-register）
      disable: !!process.env.VITEST,
      registerType: 'prompt', // 有新版本时提示，避免编辑中被强制刷新
      injectRegister: false, // 由 src/pwa.js 手动注册，便于接管更新/离线提示
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: '组子细工绘图助手',
        short_name: '组子细工',
        description: '面向组子细工爱好者的 2D 精确制图与算料工具，支持完全离线使用',
        lang: 'zh-CN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1f4e9c',
        background_color: '#f7f8fa',
        categories: ['design', 'productivity', 'utilities'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // 全量预缓存 → 断网也能冷启动（本工具纯本地计算，适用完全离线）
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Naive UI 全量引入导致单 chunk 偏大，放宽预缓存单文件上限
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      },
      devOptions: {
        // 开发期不注册 SW（避免缓存干扰 HMR）；离线验证请用 build + preview
        enabled: false
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.js'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.js', 'src/ai/*.js'],
      exclude: ['src/**/*.spec.js', 'src/core/**/index.js']
    }
  }
})
