import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ece-gate-mock/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api/local': { target: 'http://127.0.0.1:4001', changeOrigin: true },
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      }
    }
  }
})
