import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
